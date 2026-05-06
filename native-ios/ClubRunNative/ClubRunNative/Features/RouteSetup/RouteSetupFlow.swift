import Foundation
import MapKit
import SwiftUI
import UniformTypeIdentifiers

enum RouteSetupError: Error, Equatable {
    case missingStart
    case missingDestination
    case invalidStop
    case routeUnavailable

    var userMessage: String {
        switch self {
        case .missingStart:
            "Add a start point."
        case .missingDestination:
            "Add a destination."
        case .invalidStop:
            "Each stop needs a name and location."
        case .routeUnavailable:
            "Unable to calculate a route."
        }
    }
}

struct RouteCoordinate: Equatable, Sendable {
    let lat: Double
    let lng: Double
}

struct GeneratedRoute: Equatable, Sendable {
    let points: [RouteCoordinate]
    let distanceMetres: Double
    let durationSeconds: Double
}

protocol RouteProviding: Sendable {
    func route(for stops: [RouteStopDraft]) async throws -> GeneratedRoute
}

struct RouteStopSearchResult: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let coordinate: RouteCoordinate
    let placeId: String?

    func routeStop(kind: RouteStopKind) -> RouteStopDraft {
        RouteStopDraft(
            id: UUID().uuidString,
            kind: kind,
            order: nil,
            label: title,
            lat: coordinate.lat,
            lng: coordinate.lng,
            source: .search,
            placeId: placeId
        )
    }
}

protocol RouteStopSearching: Sendable {
    func search(_ query: String) async throws -> [RouteStopSearchResult]
}

enum RouteStopValidator {
    static func validate(_ stops: [RouteStopDraft]) throws -> [RouteStopDraft] {
        guard stops.contains(where: { $0.kind == .start }) else {
            throw RouteSetupError.missingStart
        }
        guard stops.contains(where: { $0.kind == .destination }) else {
            throw RouteSetupError.missingDestination
        }
        guard stops.allSatisfy({ !$0.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.lat != nil && $0.lng != nil }) else {
            throw RouteSetupError.invalidStop
        }

        return stops.sorted { ($0.order ?? 0) < ($1.order ?? 0) }.enumerated().map { index, stop in
            RouteStopDraft(
                id: stop.id,
                kind: stop.kind,
                order: index,
                label: stop.label.trimmingCharacters(in: .whitespacesAndNewlines),
                lat: stop.lat,
                lng: stop.lng,
                source: stop.source,
                placeId: stop.placeId
            )
        }
    }
}

struct RouteStopEditor {
    private(set) var start: RouteStopDraft?
    private(set) var waypoints: [RouteStopDraft] = []
    private(set) var destination: RouteStopDraft?

    var orderedStops: [RouteStopDraft] {
        var stops: [RouteStopDraft] = []
        if let start {
            stops.append(start)
        }
        stops.append(contentsOf: waypoints)
        if let destination {
            stops.append(destination)
        }
        return stops.enumerated().map { index, stop in
            RouteStopDraft(id: stop.id, kind: stop.kind, order: index, label: stop.label, lat: stop.lat, lng: stop.lng, source: stop.source, placeId: stop.placeId)
        }
    }

    mutating func setStart(_ stop: RouteStopDraft) {
        start = normalized(stop, kind: .start)
    }

    mutating func setDestination(_ stop: RouteStopDraft) {
        destination = normalized(stop, kind: .destination)
    }

    mutating func addWaypoint(_ stop: RouteStopDraft) {
        waypoints.append(normalized(stop, kind: .waypoint))
    }

    mutating func removeWaypoint(id: String) {
        waypoints.removeAll { $0.id == id }
    }

    mutating func moveWaypoint(fromOffsets source: IndexSet, toOffset destination: Int) {
        waypoints.move(fromOffsets: source, toOffset: destination)
    }

    private func normalized(_ stop: RouteStopDraft, kind: RouteStopKind) -> RouteStopDraft {
        RouteStopDraft(id: stop.id, kind: kind, order: stop.order, label: stop.label, lat: stop.lat, lng: stop.lng, source: stop.source, placeId: stop.placeId)
    }
}

struct RouteRecalculationPolicy {
    private var lastSignature: String?

    mutating func shouldRecalculate(after stops: [RouteStopDraft]) -> Bool {
        let signature = stops
            .sorted { ($0.order ?? 0) < ($1.order ?? 0) }
            .map { "\($0.kind.rawValue):\($0.label):\($0.lat ?? 0):\($0.lng ?? 0)" }
            .joined(separator: "|")
        defer { lastSignature = signature }
        return lastSignature != signature
    }
}

struct AppleMapsRouteRequest: Equatable {
    enum TransportType: Equatable {
        case automobile
    }

    let source: RouteStopDraft
    let destination: RouteStopDraft
    let waypoints: [RouteStopDraft]
    let transportType: TransportType = .automobile

    init(stops: [RouteStopDraft]) {
        source = stops.first { $0.kind == .start }!
        destination = stops.first { $0.kind == .destination }!
        waypoints = stops.filter { $0.kind == .waypoint }
    }
}

enum RouteResponseNormalizer {
    static func routeData(from response: GeneratedRoute, stops: [RouteStopDraft]) -> RouteData {
        RouteData(
            points: response.points.map { [$0.lat, $0.lng] },
            distanceMetres: response.distanceMetres,
            durationSeconds: response.durationSeconds,
            source: .appleMaps,
            stops: stops
        )
    }
}

struct AppleMapsRouteProvider: RouteProviding {
    func route(for stops: [RouteStopDraft]) async throws -> GeneratedRoute {
        let validated = try RouteStopValidator.validate(stops)
        var points: [RouteCoordinate] = []
        var distance = 0.0
        var duration = 0.0

        for pair in zip(validated.dropLast(), validated.dropFirst()) {
            let route = try await routeLeg(from: pair.0, to: pair.1)
            let legPoints = route.polyline.coordinates.map {
                RouteCoordinate(lat: $0.latitude, lng: $0.longitude)
            }
            if points.isEmpty {
                points.append(contentsOf: legPoints)
            } else {
                points.append(contentsOf: legPoints.dropFirst())
            }
            distance += route.distance
            duration += route.expectedTravelTime
        }

        return GeneratedRoute(points: points, distanceMetres: distance, durationSeconds: duration)
    }

    private func routeLeg(from source: RouteStopDraft, to destination: RouteStopDraft) async throws -> MKRoute {
        let directionsRequest = MKDirections.Request()
        directionsRequest.source = mapItem(for: source)
        directionsRequest.destination = mapItem(for: destination)
        directionsRequest.transportType = .automobile
        directionsRequest.requestsAlternateRoutes = false

        let response = try await MKDirections(request: directionsRequest).calculate()
        guard let route = response.routes.first else {
            throw RouteSetupError.routeUnavailable
        }
        return route
    }

    private func mapItem(for stop: RouteStopDraft) -> MKMapItem {
        MKMapItem(
            location: CLLocation(latitude: stop.lat ?? 0, longitude: stop.lng ?? 0),
            address: nil
        )
    }
}

struct MapKitRouteStopSearchService: RouteStopSearching {
    func search(_ query: String) async throws -> [RouteStopSearchResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return []
        }

        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = trimmed
        let response = try await MKLocalSearch(request: request).start()
        return response.mapItems.prefix(8).map { item in
            let coordinate = item.location.coordinate
            let title = item.name ?? trimmed
            return RouteStopSearchResult(
                id: "\(title).\(coordinate.latitude).\(coordinate.longitude)",
                title: title,
                subtitle: "",
                coordinate: RouteCoordinate(lat: coordinate.latitude, lng: coordinate.longitude),
                placeId: nil
            )
        }
    }
}

@MainActor
final class RouteSetupViewModel: ObservableObject {
    @Published private(set) var stops: [RouteStopDraft] = []
    @Published private(set) var routeData: RouteData?
    @Published private(set) var summaryText = "Add start and destination"
    @Published private(set) var message: String?
    @Published private(set) var isCalculating = false
    @Published private(set) var isSaving = false
    @Published private(set) var isGPXPreview = false
    @Published private(set) var activeStopSelectionKind: RouteStopKind?
    @Published private(set) var pinDropKind: RouteStopKind?

    private let runId: String
    private let routeProvider: RouteProviding
    private let repository: RoutePersisting
    private let router: AppRouter
    private let gpxParser: GPXRouteParser
    private var editor = RouteStopEditor()
    private var recalculationPolicy = RouteRecalculationPolicy()

    init(runId: String, routeProvider: RouteProviding, repository: RoutePersisting, router: AppRouter, gpxParser: GPXRouteParser = GPXRouteParser()) {
        self.runId = runId
        self.routeProvider = routeProvider
        self.repository = repository
        self.router = router
        self.gpxParser = gpxParser
    }

    func setStart(_ stop: RouteStopDraft) {
        clearImportedPreview()
        editor.setStart(stop)
        stops = editor.orderedStops
    }

    func setDestination(_ stop: RouteStopDraft) {
        clearImportedPreview()
        editor.setDestination(stop)
        stops = editor.orderedStops
    }

    func addWaypoint(_ stop: RouteStopDraft) {
        clearImportedPreview()
        editor.addWaypoint(stop)
        stops = editor.orderedStops
    }

    func removeWaypoint(id: String) {
        clearImportedPreview()
        editor.removeWaypoint(id: id)
        stops = editor.orderedStops
    }

    func moveWaypoint(fromOffsets source: IndexSet, toOffset destination: Int) {
        clearImportedPreview()
        editor.moveWaypoint(fromOffsets: source, toOffset: destination)
        stops = editor.orderedStops
    }

    func beginStopSelection(_ kind: RouteStopKind) {
        activeStopSelectionKind = kind
    }

    func cancelStopSelection() {
        activeStopSelectionKind = nil
    }

    func applySearchResult(_ result: RouteStopSearchResult) {
        guard let kind = activeStopSelectionKind else {
            return
        }

        applyStop(result.routeStop(kind: kind), kind: kind)
        activeStopSelectionKind = nil
    }

    func beginPinDrop(_ kind: RouteStopKind? = nil) {
        let selectedKind = kind ?? activeStopSelectionKind ?? (stops.contains(where: { $0.kind == .destination }) ? .waypoint : .destination)
        activeStopSelectionKind = nil
        pinDropKind = selectedKind
    }

    func cancelPinDrop() {
        pinDropKind = nil
    }

    func confirmPinDrop(at coordinate: RouteCoordinate) {
        guard let kind = pinDropKind else {
            return
        }

        applyStop(
            RouteStopDraft(
                id: UUID().uuidString,
                kind: kind,
                order: nil,
                label: pinLabel(for: kind),
                lat: coordinate.lat,
                lng: coordinate.lng,
                source: .pin
            ),
            kind: kind
        )
        pinDropKind = nil
    }

    func recalculateRoute() async {
        guard recalculationPolicy.shouldRecalculate(after: stops) else {
            return
        }

        isCalculating = true
        defer { isCalculating = false }

        do {
            let validated = try RouteStopValidator.validate(stops)
            let generated = try await routeProvider.route(for: validated)
            let routeData = RouteResponseNormalizer.routeData(from: generated, stops: validated)
            self.routeData = routeData
            isGPXPreview = false
            summaryText = summary(for: routeData)
            message = nil
        } catch let error as RouteSetupError {
            message = error.userMessage
        } catch {
            message = "Unable to calculate a route."
        }
    }

    func importGPXData(_ data: Data) throws {
        do {
            let routeData = try gpxParser.parseRouteData(from: data)
            self.routeData = routeData
            stops = routeData.stops ?? []
            isGPXPreview = true
            summaryText = summary(for: routeData)
            message = nil
        } catch let error as GPXImportError {
            message = error.userMessage
            throw error
        } catch {
            message = "That GPX file could not be read."
            throw error
        }
    }

    func discardGPXPreview() {
        guard isGPXPreview else {
            return
        }

        routeData = nil
        stops = editor.orderedStops
        isGPXPreview = false
        summaryText = "Add start and destination"
        message = nil
    }

    func saveRoute() async {
        guard let routeData else {
            message = "Calculate a route before saving."
            return
        }

        isSaving = true
        defer { isSaving = false }

        do {
            try await repository.saveRoute(routeData, runId: runId)
            try await repository.updateRunStatus(.ready, driveStartedAt: nil, runId: runId)
            router.present(.adminLobby(runId: runId))
        } catch {
            message = "Unable to save the route."
        }
    }

    func useDevelopmentCurrentLocationForStart() {
        setStart(sampleStop(id: "start", kind: .start, label: "Current Location", source: .currentLocation, lat: -33.9249, lng: 18.4241))
    }

    private func sampleStop(id: String, kind: RouteStopKind, label: String, source: RouteStopInputMethod, lat: Double, lng: Double) -> RouteStopDraft {
        RouteStopDraft(id: id, kind: kind, order: nil, label: label, lat: lat, lng: lng, source: source, placeId: nil)
    }

    private func applyStop(_ stop: RouteStopDraft, kind: RouteStopKind) {
        switch kind {
        case .start:
            setStart(stop)
        case .waypoint:
            addWaypoint(stop)
        case .destination:
            setDestination(stop)
        }
    }

    private func pinLabel(for kind: RouteStopKind) -> String {
        switch kind {
        case .start:
            "Pinned Start"
        case .waypoint:
            "Pinned Waypoint"
        case .destination:
            "Pinned Finish"
        }
    }

    private func summary(for route: RouteData) -> String {
        let kilometres = route.distanceMetres / 1_000
        let minutes = Int((route.durationSeconds ?? 0) / 60)
        if route.source == .gpx {
            return "\(String(format: "%.1f", kilometres)) km · GPX"
        }
        return "\(String(format: "%.1f", kilometres)) km · \(minutes) min"
    }

    private func clearImportedPreview() {
        if isGPXPreview {
            routeData = nil
            isGPXPreview = false
            summaryText = "Add start and destination"
            message = nil
        }
    }
}

struct RouteSetupView: View {
    @StateObject var viewModel: RouteSetupViewModel
    @State private var isImportingGPX = false
    @State private var isPanelExpanded = false
    @State private var mapPosition: MapCameraPosition = .automatic
    @State private var mapCenter = RouteCoordinate(lat: -33.9249, lng: 18.4241)
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .bottom) {
            RoutePreviewMap(
                routeData: viewModel.routeData,
                stops: viewModel.stops,
                mapPosition: $mapPosition,
                onCenterChanged: { mapCenter = $0 }
            )
                .ignoresSafeArea()
                .accessibilityIdentifier("routeSetup.map")

            VStack {
                HStack {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.title2.weight(.semibold))
                            .frame(width: 52, height: 52)
                            .background(.regularMaterial, in: Circle())
                    }
                    .accessibilityLabel("Back")

                    Spacer()

                    Text("Route Setup")
                        .font(.headline)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(.regularMaterial, in: Capsule())

                    Spacer()

                    Color.clear.frame(width: 52, height: 52)
                }
                .padding(.horizontal)
                .padding(.top, 10)

                Spacer()
            }

            if let pinDropKind = viewModel.pinDropKind {
                PinDropOverlay(
                    kind: pinDropKind,
                    coordinate: mapCenter,
                    onCancel: { viewModel.cancelPinDrop() },
                    onConfirm: { viewModel.confirmPinDrop(at: mapCenter) }
                )
            } else {
                RouteEditorPanel(
                    viewModel: viewModel,
                    isExpanded: $isPanelExpanded,
                    onImportGPX: { isImportingGPX = true }
                )
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .toolbar(.hidden, for: .navigationBar)
        .fileImporter(
            isPresented: $isImportingGPX,
            allowedContentTypes: [.gpx, .xml],
            allowsMultipleSelection: false
        ) { result in
            handleGPXImport(result)
        }
        .sheet(item: Binding(
            get: { viewModel.activeStopSelectionKind.map(RouteStopSelectionSheetItem.init(kind:)) },
            set: { item in
                if item == nil {
                    viewModel.cancelStopSelection()
                }
            }
        )) { item in
            RouteStopSelectionSheet(
                kind: item.kind,
                searchService: MapKitRouteStopSearchService(),
                onSelect: { result in
                    viewModel.applySearchResult(result)
                },
                onPinDrop: {
                    viewModel.beginPinDrop(item.kind)
                },
                onUseDevelopmentCurrentLocation: item.kind == .start ? {
                    viewModel.useDevelopmentCurrentLocationForStart()
                    viewModel.cancelStopSelection()
                } : nil
            )
        }
    }

    private func handleGPXImport(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else {
                return
            }

            let didAccess = url.startAccessingSecurityScopedResource()
            defer {
                if didAccess {
                    url.stopAccessingSecurityScopedResource()
                }
            }

            try viewModel.importGPXData(Data(contentsOf: url))
        } catch {
            // The view model owns user-facing parser errors.
        }
    }
}

private struct RouteStopSelectionSheetItem: Identifiable, Equatable {
    let kind: RouteStopKind
    var id: String { kind.rawValue }
}

private struct RoutePreviewMap: View {
    let routeData: RouteData?
    let stops: [RouteStopDraft]
    @Binding var mapPosition: MapCameraPosition
    let onCenterChanged: (RouteCoordinate) -> Void

    var body: some View {
        Map(position: $mapPosition) {
            ForEach(stops, id: \.id) { stop in
                if let lat = stop.lat, let lng = stop.lng {
                    Marker(stop.label, coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng))
                }
            }
            if let routeData {
                MapPolyline(coordinates: routeData.points.map { CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) })
                    .stroke(.blue, lineWidth: 5)
            }
        }
        .mapControls {
            MapCompass()
            MapScaleView()
        }
        .onMapCameraChange(frequency: .continuous) { context in
            onCenterChanged(
                RouteCoordinate(
                    lat: context.region.center.latitude,
                    lng: context.region.center.longitude
                )
            )
        }
    }
}

private struct RouteEditorPanel: View {
    @ObservedObject var viewModel: RouteSetupViewModel
    @Binding var isExpanded: Bool
    let onImportGPX: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Route")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(viewModel.summaryText)
                        .font(.headline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                }

                Spacer(minLength: 12)

                Button {
                    onImportGPX()
                } label: {
                    Label("GPX", systemImage: "doc.badge.plus")
                        .labelStyle(.titleAndIcon)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityIdentifier("routeSetup.importGPXButton")
            }

            if isExpanded || viewModel.stops.isEmpty || viewModel.isGPXPreview {
                stopsContent
            } else {
                compactStopsSummary
            }

            if viewModel.isGPXPreview {
                HStack {
                    Label("Preview-only GPX route", systemImage: "eye")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button(role: .destructive) {
                        viewModel.discardGPXPreview()
                    } label: {
                        Label("Discard", systemImage: "xmark.circle")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .accessibilityIdentifier("routeSetup.discardGPXButton")
                }
            } else {
                if isExpanded || viewModel.stops.isEmpty {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        RouteEditorActionButton(title: "Start", icon: "location.fill") {
                            viewModel.beginStopSelection(.start)
                        }
                        RouteEditorActionButton(title: "Waypoint", icon: "mappin.and.ellipse") {
                            viewModel.beginStopSelection(.waypoint)
                        }
                        RouteEditorActionButton(title: "Finish", icon: "flag.checkered") {
                            viewModel.beginStopSelection(.destination)
                        }
                        RouteEditorActionButton(title: "Pin", icon: "pin.fill") {
                            viewModel.beginPinDrop()
                        }
                    }
                }

                HStack(spacing: 10) {
                    Button {
                        withAnimation(.snappy) {
                            isExpanded.toggle()
                        }
                    } label: {
                        Label(isExpanded ? "Hide" : "Edit", systemImage: isExpanded ? "chevron.down" : "slider.horizontal.3")
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)

                    Button {
                        Task {
                            await viewModel.recalculateRoute()
                        }
                    } label: {
                        Label("Calculate", systemImage: "point.topleft.down.curvedto.point.bottomright.up")
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
                    .disabled(viewModel.isCalculating)

                    Button {
                        Task {
                            await viewModel.saveRoute()
                        }
                    } label: {
                        Label("Save Route", systemImage: "checkmark.circle.fill")
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                    .disabled(viewModel.isSaving)
                }
            }

            if viewModel.isGPXPreview {
                Button {
                    Task {
                        await viewModel.saveRoute()
                    }
                } label: {
                    Label("Save Route", systemImage: "checkmark.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isSaving)
            }

            if let message = viewModel.message {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(2)
            }
        }
        .padding(14)
        .frame(maxWidth: 380)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
    }

    private var compactStopsSummary: some View {
        HStack(spacing: 8) {
            Image(systemName: "mappin.and.ellipse")
                .foregroundStyle(.secondary)
            Text("\(viewModel.stops.count) stop\(viewModel.stops.count == 1 ? "" : "s") selected")
                .font(.subheadline.weight(.semibold))
            Spacer()
        }
        .padding(10)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
    }

    @ViewBuilder
    private var stopsContent: some View {
        if viewModel.stops.isEmpty {
            HStack(spacing: 10) {
                Image(systemName: "map")
                    .font(.headline)
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text("No stops yet")
                        .font(.subheadline.weight(.semibold))
                    Text("Add a start and finish, or import a GPX file.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Spacer()
            }
            .padding(10)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
            .accessibilityIdentifier("routeSetup.emptyStopsState")
        } else {
            VStack(spacing: 6) {
                ForEach(viewModel.stops, id: \.id) { stop in
                    HStack(spacing: 8) {
                        Image(systemName: icon(for: stop.kind))
                            .font(.footnote.weight(.semibold))
                            .frame(width: 20)
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(stop.label)
                                .font(.subheadline.weight(.semibold))
                                .lineLimit(1)
                            Text(stop.kind.rawValue.capitalized)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if stop.kind == .waypoint {
                            Image(systemName: "line.3.horizontal")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 8)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
                }
            }
            .frame(maxHeight: 138)
        }
    }

    private func icon(for kind: RouteStopKind) -> String {
        switch kind {
        case .start:
            "location.fill"
        case .waypoint:
            "circle"
        case .destination:
            "flag.checkered"
        }
    }
}

private struct RouteEditorActionButton: View {
    let title: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }
}

private struct RouteStopSelectionSheet: View {
    let kind: RouteStopKind
    let searchService: RouteStopSearching
    let onSelect: (RouteStopSearchResult) -> Void
    let onPinDrop: () -> Void
    let onUseDevelopmentCurrentLocation: (() -> Void)?

    @State private var query = ""
    @State private var results: [RouteStopSearchResult] = []
    @State private var isSearching = false
    @State private var message: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("Search for a place", text: $query)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .submitLabel(.search)
                        .onSubmit {
                            Task {
                                await search()
                            }
                        }
                        .accessibilityIdentifier("routeStopPicker.searchField")

                    Button {
                        onPinDrop()
                        dismiss()
                    } label: {
                        Label("Drop a pin on the map", systemImage: "pin.fill")
                    }

                    if let onUseDevelopmentCurrentLocation {
                        Button {
                            onUseDevelopmentCurrentLocation()
                            dismiss()
                        } label: {
                            Label("Use development current location", systemImage: "location.fill")
                        }
                    }
                }

                if isSearching {
                    Section {
                        ProgressView()
                    }
                }

                if let message {
                    Section {
                        Text(message)
                            .foregroundStyle(.secondary)
                    }
                }

                if !results.isEmpty {
                    Section("Results") {
                        ForEach(results) { result in
                            Button {
                                onSelect(result)
                                dismiss()
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(result.title)
                                        .font(.headline)
                                    if !result.subtitle.isEmpty {
                                        Text(result.subtitle)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(2)
                                    }
                                }
                            }
                            .accessibilityIdentifier("routeStopPicker.result")
                        }
                    }
                }
            }
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Search") {
                        Task {
                            await search()
                        }
                    }
                    .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .task(id: query) {
                guard query.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 else {
                    results = []
                    message = nil
                    return
                }

                try? await Task.sleep(nanoseconds: 350_000_000)
                if !Task.isCancelled {
                    await search()
                }
            }
        }
    }

    private var title: String {
        switch kind {
        case .start:
            "Choose Start"
        case .waypoint:
            "Add Waypoint"
        case .destination:
            "Choose Finish"
        }
    }

    private func search() async {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return
        }

        isSearching = true
        defer { isSearching = false }

        do {
            results = try await searchService.search(trimmed)
            message = results.isEmpty ? "No places found." : nil
        } catch {
            results = []
            message = "Search is unavailable. Try dropping a pin."
        }
    }
}

private struct PinDropOverlay: View {
    let kind: RouteStopKind
    let coordinate: RouteCoordinate
    let onCancel: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        ZStack {
            Image(systemName: "mappin.circle.fill")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(.red)
                .shadow(radius: 3)
                .accessibilityHidden(true)

            VStack {
                Spacer()

                VStack(alignment: .leading, spacing: 10) {
                    Text(pinTitle)
                        .font(.headline)
                    Text(String(format: "%.5f, %.5f", coordinate.lat, coordinate.lng))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)

                    HStack {
                        Button("Cancel", role: .cancel) {
                            onCancel()
                        }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)

                        Button {
                            onConfirm()
                        } label: {
                            Label("Use Pin", systemImage: "checkmark.circle.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .frame(maxWidth: .infinity)
                    }
                }
                .padding(14)
                .frame(maxWidth: 380)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            }
        }
    }

    private var pinTitle: String {
        switch kind {
        case .start:
            "Move map to choose start"
        case .waypoint:
            "Move map to choose waypoint"
        case .destination:
            "Move map to choose finish"
        }
    }
}

private extension UTType {
    static var gpx: UTType {
        UTType(filenameExtension: "gpx") ?? .xml
    }
}

private extension MKPolyline {
    var coordinates: [CLLocationCoordinate2D] {
        var result = Array(repeating: CLLocationCoordinate2D(), count: pointCount)
        getCoordinates(&result, range: NSRange(location: 0, length: pointCount))
        return result
    }
}
