import Foundation
import MapKit
import SwiftUI
import UniformTypeIdentifiers

enum RouteSetupError: Error, Equatable {
    case missingStart
    case missingDestination
    case invalidStop
    case routeUnavailable
    case routeLegUnavailable(from: String, to: String)

    var userMessage: String {
        switch self {
        case .missingStart:
            "Add a start point."
        case .missingDestination:
            "Add a destination."
        case .invalidStop:
            "Each stop needs a name and location."
        case .routeUnavailable:
            "Unable to calculate a route. Move pinned stops closer to a road and try again."
        case let .routeLegUnavailable(from, to):
            "No driving route found from \(from) to \(to). Move that stop closer to a road and try again."
        }
    }
}

struct RouteCoordinate: Equatable, Sendable {
    let lat: Double
    let lng: Double
}

enum RoutePreferredUnits: String, CaseIterable, Identifiable {
    case kilometres
    case miles

    var id: String { rawValue }

    var label: String {
        switch self {
        case .kilometres:
            "Kilometres"
        case .miles:
            "Miles"
        }
    }

    var distanceLabel: String {
        switch self {
        case .kilometres:
            "km"
        case .miles:
            "mi"
        }
    }
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

struct PendingRouteStopConfirmation: Equatable, Sendable {
    let kind: RouteStopKind
    let result: RouteStopSearchResult
}

struct RouteMapFocusRequest: Identifiable, Equatable, Sendable {
    let id = UUID()
    let coordinate: RouteCoordinate
    let span: Double

    static func == (lhs: RouteMapFocusRequest, rhs: RouteMapFocusRequest) -> Bool {
        lhs.id == rhs.id
    }
}

protocol RouteStopSearching: Sendable {
    func search(_ query: String) async throws -> [RouteStopSearchResult]
}

protocol RoutePinNaming: Sendable {
    func name(for coordinate: RouteCoordinate, kind: RouteStopKind, existingStops: [RouteStopDraft]) async -> String
}

enum RoutePinFallbackName {
    static func name(for kind: RouteStopKind, existingStops: [RouteStopDraft]) -> String {
        switch kind {
        case .start:
            "Pinned Start"
        case .waypoint:
            "Waypoint \(existingStops.filter { $0.kind == .waypoint }.count + 1)"
        case .destination:
            "Pinned Finish"
        }
    }
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

    mutating func moveWaypoint(id: String, beforeWaypointID destinationID: String?) {
        guard let sourceIndex = waypoints.firstIndex(where: { $0.id == id }) else {
            return
        }

        let moved = waypoints.remove(at: sourceIndex)
        guard let destinationID, let destinationIndex = waypoints.firstIndex(where: { $0.id == destinationID }) else {
            waypoints.append(moved)
            return
        }

        waypoints.insert(moved, at: destinationIndex)
    }

    mutating func moveWaypoint(id: String, toWaypointIndex destinationIndex: Int) {
        guard let sourceIndex = waypoints.firstIndex(where: { $0.id == id }) else {
            return
        }

        let moved = waypoints.remove(at: sourceIndex)
        let boundedDestination = min(max(destinationIndex, 0), waypoints.count)
        waypoints.insert(moved, at: boundedDestination)
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
            let route: MKRoute
            do {
                route = try await routeLeg(from: pair.0, to: pair.1)
            } catch {
                #if DEBUG
                print("Route leg calculation failed from \(pair.0.label) to \(pair.1.label): \(error)")
                #endif
                throw RouteSetupError.routeLegUnavailable(from: pair.0.label, to: pair.1.label)
            }
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
    let centerCoordinate: RouteCoordinate?
    let preferredCountryCode: String?

    init(centerCoordinate: RouteCoordinate? = nil, preferredCountryCode: String? = nil) {
        self.centerCoordinate = centerCoordinate
        self.preferredCountryCode = preferredCountryCode
    }

    func search(_ query: String) async throws -> [RouteStopSearchResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return []
        }

        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = trimmed
        if let centerCoordinate {
            request.region = MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: centerCoordinate.lat, longitude: centerCoordinate.lng),
                span: MKCoordinateSpan(latitudeDelta: 4, longitudeDelta: 4)
            )
        }

        let response = try await MKLocalSearch(request: request).start()
        let preferredCountryCode = try await resolvedPreferredCountryCode()
        let mapItems = filteredMapItems(response.mapItems, preferredCountryCode: preferredCountryCode)

        return mapItems.prefix(8).map { item in
            let coordinate = item.location.coordinate
            let title = item.name ?? trimmed
            return RouteStopSearchResult(
                id: "\(title).\(coordinate.latitude).\(coordinate.longitude)",
                title: title,
                subtitle: subtitle(for: item),
                coordinate: RouteCoordinate(lat: coordinate.latitude, lng: coordinate.longitude),
                placeId: item.identifier?.rawValue
            )
        }
    }

    private func resolvedPreferredCountryCode() async throws -> String? {
        if let preferredCountryCode {
            return preferredCountryCode.uppercased()
        }

        guard let centerCoordinate else {
            return nil
        }

        let location = CLLocation(latitude: centerCoordinate.lat, longitude: centerCoordinate.lng)
        let mapItems = try await MKReverseGeocodingRequest(location: location)?.mapItems
        return mapItems?.first?.addressRepresentations?.__regionCode?.uppercased()
    }

    private func filteredMapItems(_ mapItems: [MKMapItem], preferredCountryCode: String?) -> [MKMapItem] {
        guard let preferredCountryCode else {
            return mapItems
        }

        let sameCountryItems = mapItems.filter { item in
            item.addressRepresentations?.__regionCode?.uppercased() == preferredCountryCode
        }
        return sameCountryItems.isEmpty ? mapItems : sameCountryItems
    }

    private func subtitle(for item: MKMapItem) -> String {
        item.addressRepresentations?.cityWithContext(.full) ??
            item.addressRepresentations?.fullAddress(includingRegion: true, singleLine: true) ??
            ""
    }
}

struct MapKitRoutePinNamer: RoutePinNaming {
    func name(for coordinate: RouteCoordinate, kind: RouteStopKind, existingStops: [RouteStopDraft]) async -> String {
        let fallback = RoutePinFallbackName.name(for: kind, existingStops: existingStops)
        let location = CLLocation(latitude: coordinate.lat, longitude: coordinate.lng)

        do {
            let mapItems = try await MKReverseGeocodingRequest(location: location)?.mapItems ?? []
            return resolvedName(from: mapItems) ?? fallback
        } catch {
            return fallback
        }
    }

    private func resolvedName(from mapItems: [MKMapItem]) -> String? {
        for item in mapItems {
            if let name = cleaned(item.name), !isCoordinateLike(name) {
                return name
            }

            if let address = cleaned(item.addressRepresentations?.fullAddress(includingRegion: false, singleLine: true)) {
                return address
            }

            if let city = cleaned(item.addressRepresentations?.cityWithContext(.short)) {
                return city
            }
        }

        return nil
    }

    private func cleaned(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private func isCoordinateLike(_ value: String) -> Bool {
        value.range(of: #"^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$"#, options: .regularExpression) != nil
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
    @Published private(set) var pendingStopConfirmation: PendingRouteStopConfirmation?
    @Published private(set) var mapFocusRequest: RouteMapFocusRequest?
    @Published private(set) var routeNeedsRecalculation = false

    private let runId: String
    private let routeProvider: RouteProviding
    private let repository: RoutePersisting
    private let router: AppRouter
    private let gpxParser: GPXRouteParser
    private let pinNamer: RoutePinNaming
    private var editor = RouteStopEditor()
    private var recalculationPolicy = RouteRecalculationPolicy()

    init(
        runId: String,
        routeProvider: RouteProviding,
        repository: RoutePersisting,
        router: AppRouter,
        gpxParser: GPXRouteParser = GPXRouteParser(),
        pinNamer: RoutePinNaming = MapKitRoutePinNamer()
    ) {
        self.runId = runId
        self.routeProvider = routeProvider
        self.repository = repository
        self.router = router
        self.gpxParser = gpxParser
        self.pinNamer = pinNamer
    }

    func setStart(_ stop: RouteStopDraft) {
        clearImportedPreview()
        editor.setStart(stop)
        stops = editor.orderedStops
        markRouteStaleIfNeeded()
    }

    func setDestination(_ stop: RouteStopDraft) {
        clearImportedPreview()
        editor.setDestination(stop)
        stops = editor.orderedStops
        markRouteStaleIfNeeded()
    }

    func addWaypoint(_ stop: RouteStopDraft) {
        clearImportedPreview()
        editor.addWaypoint(stop)
        stops = editor.orderedStops
        markRouteStaleIfNeeded()
    }

    func removeWaypoint(id: String) {
        clearImportedPreview()
        editor.removeWaypoint(id: id)
        stops = editor.orderedStops
        markRouteStaleIfNeeded()
    }

    func moveWaypoint(fromOffsets source: IndexSet, toOffset destination: Int) {
        clearImportedPreview()
        editor.moveWaypoint(fromOffsets: source, toOffset: destination)
        stops = editor.orderedStops
        markRouteStaleIfNeeded()
    }

    func moveWaypoint(id: String, beforeWaypointID destinationID: String?) {
        clearImportedPreview()
        editor.moveWaypoint(id: id, beforeWaypointID: destinationID)
        stops = editor.orderedStops
        markRouteStaleIfNeeded()
    }

    func moveWaypoint(id: String, toWaypointIndex destinationIndex: Int) {
        clearImportedPreview()
        editor.moveWaypoint(id: id, toWaypointIndex: destinationIndex)
        stops = editor.orderedStops
        markRouteStaleIfNeeded()
    }

    func beginStopSelection(_ kind: RouteStopKind) {
        activeStopSelectionKind = kind
    }

    func cancelStopSelection() {
        activeStopSelectionKind = nil
    }

    func applySearchResult(_ result: RouteStopSearchResult) {
        previewSearchResult(result)
        confirmPendingSearchResult(at: result.coordinate)
    }

    func previewSearchResult(_ result: RouteStopSearchResult) {
        guard let kind = activeStopSelectionKind else {
            return
        }

        pendingStopConfirmation = PendingRouteStopConfirmation(kind: kind, result: result)
        mapFocusRequest = RouteMapFocusRequest(coordinate: result.coordinate, span: 0.01)
        activeStopSelectionKind = nil
    }

    func cancelPendingSearchResult() {
        pendingStopConfirmation = nil
    }

    func confirmPendingSearchResult(at coordinate: RouteCoordinate) {
        guard let pendingStopConfirmation else {
            return
        }

        let result = pendingStopConfirmation.result
        applyStop(
            RouteStopDraft(
                id: UUID().uuidString,
                kind: pendingStopConfirmation.kind,
                order: nil,
                label: result.title,
                lat: coordinate.lat,
                lng: coordinate.lng,
                source: .search,
                placeId: result.placeId
            ),
            kind: pendingStopConfirmation.kind
        )
        self.pendingStopConfirmation = nil
    }

    func beginPinDrop(_ kind: RouteStopKind? = nil) {
        let selectedKind = kind ?? activeStopSelectionKind ?? (stops.contains(where: { $0.kind == .destination }) ? .waypoint : .destination)
        activeStopSelectionKind = nil
        pinDropKind = selectedKind
    }

    func cancelPinDrop() {
        pinDropKind = nil
    }

    func confirmPinDrop(at coordinate: RouteCoordinate) async {
        guard let kind = pinDropKind else {
            return
        }

        let label = await pinNamer.name(for: coordinate, kind: kind, existingStops: stops)
        applyStop(
            RouteStopDraft(
                id: UUID().uuidString,
                kind: kind,
                order: nil,
                label: label,
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
            routeNeedsRecalculation = false
            summaryText = summary(for: routeData)
            message = nil
        } catch let error as RouteSetupError {
            message = error.userMessage
        } catch {
            #if DEBUG
            print("Route calculation failed: \(error)")
            #endif
            message = "Unable to calculate a route."
        }
    }

    func importGPXData(_ data: Data) throws {
        do {
            let routeData = try gpxParser.parseRouteData(from: data)
            self.routeData = routeData
            stops = routeData.stops ?? []
            isGPXPreview = true
            routeNeedsRecalculation = false
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
        guard !routeNeedsRecalculation else {
            message = "Recalculate the route before saving."
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
            routeNeedsRecalculation = false
            summaryText = "Add start and destination"
            message = nil
        }
    }

    private func markRouteStaleIfNeeded() {
        if routeData != nil, !isGPXPreview {
            routeNeedsRecalculation = true
        }
    }
}

struct RouteSetupView: View {
    @StateObject var viewModel: RouteSetupViewModel
    @State private var isImportingGPX = false
    @State private var isSettingsPresented = false
    @State private var panelState: RoutePanelState = .compact
    @State private var preferredUnits: RoutePreferredUnits = .kilometres
    @State private var mapPosition: MapCameraPosition = .automatic
    @State private var mapCenter = RouteCoordinate(lat: -33.9249, lng: 18.4241)
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .top) {
                RoutePreviewMap(
                    routeData: viewModel.routeData,
                    stops: viewModel.stops,
                    mapPosition: $mapPosition,
                    onCenterChanged: { mapCenter = $0 }
                )
                .frame(width: proxy.size.width, height: proxy.size.height)
                .accessibilityIdentifier("routeSetup.map")

                RouteSetupTopBar(
                    topInset: proxy.safeAreaInsets.top,
                    onBack: { dismiss() },
                    onLocate: { focusMap(on: mapCenter, span: 0.025) },
                    onSettings: { isSettingsPresented = true }
                )

                if let pendingStopConfirmation = viewModel.pendingStopConfirmation {
                    PinDropOverlay(
                        title: "Confirm \(pendingStopConfirmation.result.title)",
                        subtitle: "Move map to refine this \(stopKindLabel(pendingStopConfirmation.kind).lowercased()).",
                        coordinate: mapCenter,
                        confirmTitle: "Use Place",
                        onCancel: { viewModel.cancelPendingSearchResult() },
                        onConfirm: { viewModel.confirmPendingSearchResult(at: mapCenter) }
                    )
                } else if let pinDropKind = viewModel.pinDropKind {
                    PinDropOverlay(
                        title: pinTitle(for: pinDropKind),
                        subtitle: nil,
                        coordinate: mapCenter,
                        confirmTitle: "Use Pin",
                        onCancel: { viewModel.cancelPinDrop() },
                        onConfirm: {
                            Task {
                                await viewModel.confirmPinDrop(at: mapCenter)
                            }
                        }
                    )
                } else {
                    RouteEditorPanel(
                        viewModel: viewModel,
                        panelState: $panelState,
                        preferredUnits: preferredUnits,
                        bottomInset: proxy.safeAreaInsets.bottom,
                        onImportGPX: { isImportingGPX = true }
                    )
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .background(Color.black)
        }
        .ignoresSafeArea(.container, edges: .all)
        .toolbar(.hidden, for: .navigationBar)
        .onChange(of: viewModel.pinDropKind) { _, newValue in
            guard newValue != nil else {
                return
            }

            withAnimation(.snappy) {
                focusMap(on: mapCenter, span: 0.025)
            }
        }
        .onChange(of: viewModel.mapFocusRequest) { _, request in
            guard let request else {
                return
            }

            mapCenter = request.coordinate
            withAnimation(.snappy) {
                focusMap(on: request.coordinate, span: request.span)
            }
        }
        .fileImporter(
            isPresented: $isImportingGPX,
            allowedContentTypes: [.gpx, .xml],
            allowsMultipleSelection: false
        ) { result in
            handleGPXImport(result)
        }
        .sheet(isPresented: $isSettingsPresented) {
            RouteSettingsSheet(
                preferredUnits: $preferredUnits,
                canExportGPX: viewModel.routeData != nil,
                onImportGPX: {
                    isSettingsPresented = false
                    isImportingGPX = true
                }
            )
            .presentationDetents([.medium])
            .presentationBackground(.ultraThinMaterial)
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
                searchService: MapKitRouteStopSearchService(centerCoordinate: mapCenter),
                onSelect: { result in
                    panelState = .compact
                    viewModel.previewSearchResult(result)
                },
                onPinDrop: {
                    panelState = .compact
                    viewModel.beginPinDrop(item.kind)
                },
                onUseDevelopmentCurrentLocation: item.kind == .start ? {
                    viewModel.useDevelopmentCurrentLocationForStart()
                    viewModel.cancelStopSelection()
                } : nil
            )
            .presentationDetents([.height(420)])
            .presentationDragIndicator(.visible)
            .presentationBackground(.ultraThinMaterial)
        }
    }

    private func stopKindLabel(_ kind: RouteStopKind) -> String {
        switch kind {
        case .start:
            "Start"
        case .waypoint:
            "Waypoint"
        case .destination:
            "Finish"
        }
    }

    private func pinTitle(for kind: RouteStopKind) -> String {
        switch kind {
        case .start:
            "Move map to choose start"
        case .waypoint:
            "Move map to choose waypoint"
        case .destination:
            "Move map to choose finish"
        }
    }

    private func focusMap(on coordinate: RouteCoordinate, span: CLLocationDegrees) {
        mapPosition = .region(MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: coordinate.lat, longitude: coordinate.lng),
            span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)
        ))
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

private enum RoutePanelState: CaseIterable {
    case compact
    case medium
    case expanded

    mutating func expand() {
        switch self {
        case .compact:
            self = .medium
        case .medium:
            self = .expanded
        case .expanded:
            break
        }
    }

    mutating func collapse() {
        switch self {
        case .compact:
            break
        case .medium:
            self = .compact
        case .expanded:
            self = .medium
        }
    }

    mutating func toggle() {
        switch self {
        case .compact:
            self = .medium
        case .medium, .expanded:
            self = .compact
        }
    }
}

private struct RouteSetupTopBar: View {
    let topInset: CGFloat
    let onBack: () -> Void
    let onLocate: () -> Void
    let onSettings: () -> Void

    var body: some View {
        VStack(alignment: .trailing, spacing: 10) {
            HStack(alignment: .top) {
                CircleIconButton(systemName: "chevron.left", accessibilityLabel: "Back", action: onBack)

                Spacer()

                CircleIconButton(systemName: "gearshape", accessibilityLabel: "Route Settings", action: onSettings)
                    .accessibilityIdentifier("routeSetup.settingsButton")
            }
            .overlay(alignment: .top) {
                Text("ROUTE SETUP")
                    .font(.caption.weight(.heavy))
                    .tracking(2)
                    .foregroundStyle(.primary)
                    .padding(.horizontal, 26)
                    .padding(.vertical, 15)
                    .background(.ultraThinMaterial, in: Capsule())
                    .background(Color.white.opacity(0.10), in: Capsule())
                    .overlay(Capsule().stroke(.white.opacity(0.28), lineWidth: 1))
            }

            CircleIconButton(systemName: "location.north", accessibilityLabel: "Center Map", action: onLocate)
                .accessibilityIdentifier("routeSetup.locateButton")
        }
        .padding(.horizontal, 16)
        .padding(.top, max(topInset + 28, 92))
        .frame(maxWidth: .infinity, alignment: .top)
    }
}

private struct CircleIconButton: View {
    let systemName: String
    let accessibilityLabel: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.title3.weight(.semibold))
                .frame(width: 56, height: 56)
                .background(.ultraThinMaterial, in: Circle())
                .background(Color.white.opacity(0.10), in: Circle())
                .overlay(Circle().stroke(.white.opacity(0.28), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
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
        .mapStyle(.standard(elevation: .realistic, emphasis: .muted))
        .overlay(Color.black.opacity(0.14).allowsHitTesting(false))
        .onMapCameraChange(frequency: .continuous) { context in
            onCenterChanged(
                RouteCoordinate(
                    lat: context.region.center.latitude,
                    lng: context.region.center.longitude
                )
            )
        }
        .ignoresSafeArea(.all)
    }
}

private struct RouteEditorPanel: View {
    @ObservedObject var viewModel: RouteSetupViewModel
    @Binding var panelState: RoutePanelState
    let preferredUnits: RoutePreferredUnits
    let bottomInset: CGFloat
    let onImportGPX: () -> Void
    @State private var draggingWaypointID: String?
    @State private var dragStartWaypointIndex: Int?
    @State private var dragCurrentWaypointIndex: Int?

    var body: some View {
        VStack {
            Spacer()

            VStack(alignment: .leading, spacing: panelState == .compact ? 18 : 12) {
                Capsule()
                    .fill(.secondary.opacity(0.35))
                    .frame(width: 58, height: 5)
                    .frame(maxWidth: .infinity)
                    .onTapGesture {
                        withAnimation(.snappy) {
                            panelState.toggle()
                        }
                    }
                    .gesture(
                        DragGesture(minimumDistance: 20)
                            .onEnded { value in
                                withAnimation(.snappy) {
                                    if value.translation.height < -20 {
                                        panelState.expand()
                                    } else if value.translation.height > 20 {
                                        panelState.collapse()
                                    }
                                }
                            }
                    )

                if panelState != .compact {
                    routeHeader

                    if panelState == .expanded {
                        stopsContent
                        routeMetrics
                    } else {
                        compactStopsSummary
                        routeMetrics
                    }
                }

                if viewModel.isGPXPreview {
                    gpxPreviewControls
                } else {
                    routeStopActions
                    if panelState != .compact {
                        primaryRouteAction
                    }
                }

                if let message = viewModel.message, panelState != .compact {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .lineLimit(2)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, panelState == .compact ? max(bottomInset + 46, 62) : max(bottomInset + 18, 26))
            .frame(maxWidth: .infinity)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 32))
            .background(Color.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 32))
            .clipShape(RoundedRectangle(cornerRadius: 32))
            .overlay(RoundedRectangle(cornerRadius: 32).stroke(.white.opacity(0.28), lineWidth: 1))
            .shadow(color: .black.opacity(0.12), radius: 18, y: 8)
            .offset(y: panelState == .compact ? max(bottomInset + 8, 30) : 0)
            .accessibilityIdentifier("routeSetup.bottomSheet")
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    }

    private var routeHeader: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Route")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                Text(viewModel.summaryText)
                    .font(.title3.weight(.bold))
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)
            }
            Spacer(minLength: 8)

            if panelState == .expanded {
                Button {
                    onImportGPX()
                } label: {
                    Label("GPX", systemImage: "doc.badge.plus")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityIdentifier("routeSetup.importGPXButton")
            }
        }
    }

    private var routeStopActions: some View {
        HStack(spacing: 18) {
            RouteSetupStopButton(title: "START", icon: "location.north.fill", isPrimary: !viewModel.stops.contains(where: { $0.kind == .start })) {
                viewModel.beginStopSelection(.start)
            }
            RouteSetupStopButton(title: "WAYPOINT", icon: "mappin.and.ellipse", isPrimary: false) {
                viewModel.beginStopSelection(.waypoint)
            }
            RouteSetupStopButton(title: "FINISH", icon: "flag.fill", isPrimary: !viewModel.stops.contains(where: { $0.kind == .destination })) {
                viewModel.beginStopSelection(.destination)
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var primaryRouteAction: some View {
        if (viewModel.routeData == nil && hasStartAndDestination) || viewModel.routeNeedsRecalculation {
            Button {
                Task {
                    await viewModel.recalculateRoute()
                }
            } label: {
                Label(routeActionTitle, systemImage: "point.topleft.down.curvedto.point.bottomright.up")
                    .font(.headline.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(viewModel.routeNeedsRecalculation ? .orange : .accentColor)
            .disabled(viewModel.isCalculating)
            .accessibilityIdentifier("routeSetup.calculateButton")
        } else if viewModel.routeData == nil {
            EmptyView()
        } else {
            Button {
                Task {
                    await viewModel.saveRoute()
                }
            } label: {
                Label(viewModel.isSaving ? "Saving" : "Save Route", systemImage: "checkmark.circle.fill")
                    .font(.headline.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.isSaving)
            .accessibilityIdentifier("routeSetup.saveButton")
        }
    }

    private var routeActionTitle: String {
        if viewModel.isCalculating {
            return "Calculating"
        }
        return viewModel.routeNeedsRecalculation ? "Recalculate Route" : "Calculate Route"
    }

    private var hasStartAndDestination: Bool {
        viewModel.stops.contains { $0.kind == .start } &&
            viewModel.stops.contains { $0.kind == .destination }
    }

    private var gpxPreviewControls: some View {
        VStack(alignment: .leading, spacing: 10) {
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

            Button {
                Task {
                    await viewModel.saveRoute()
                }
            } label: {
                Label(viewModel.isSaving ? "Saving" : "Save Route", systemImage: "checkmark.circle.fill")
                    .font(.headline.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.isSaving)
            .accessibilityIdentifier("routeSetup.saveGPXButton")
        }
    }

    @ViewBuilder
    private var routeMetrics: some View {
        if let routeData = viewModel.routeData {
            HStack(spacing: 8) {
                RouteMetricPill(title: "Distance", value: distanceText(for: routeData))
                RouteMetricPill(title: "Time", value: durationText(for: routeData))
                RouteMetricPill(title: "Source", value: routeData.source == .gpx ? "GPX" : "Maps")
            }
        }
    }

    private func distanceText(for route: RouteData) -> String {
        switch preferredUnits {
        case .kilometres:
            "\(String(format: "%.1f", route.distanceMetres / 1_000)) km"
        case .miles:
            "\(String(format: "%.1f", route.distanceMetres / 1_609.344)) mi"
        }
    }

    private func durationText(for route: RouteData) -> String {
        let minutes = Int((route.durationSeconds ?? 0) / 60)
        if minutes < 60 {
            return "\(minutes) min"
        }
        return "\(minutes / 60) hr \(minutes % 60) min"
    }

    private var compactStopsSummary: some View {
        HStack(spacing: 10) {
            Image(systemName: "mappin.and.ellipse")
                .foregroundStyle(.secondary)
            Text("\(viewModel.stops.count) stop\(viewModel.stops.count == 1 ? "" : "s") selected")
                .font(.subheadline.weight(.semibold))
            Spacer()
        }
        .padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
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
                }
                Spacer()
            }
            .padding(12)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
            .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
            .accessibilityIdentifier("routeSetup.emptyStopsState")
        } else {
            ScrollView {
                VStack(spacing: 6) {
                    if waypointStops.count > 1 {
                        Text("Drag waypoints to reorder")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }

                    if let start = viewModel.stops.first(where: { $0.kind == .start }) {
                        RouteStopListRow(stop: start, icon: icon(for: start.kind), isReorderable: false)
                    }

                    ForEach(Array(waypointStops.enumerated()), id: \.element.id) { index, stop in
                        RouteStopListRow(
                            stop: stop,
                            icon: icon(for: stop.kind),
                            isReorderable: true,
                            isDragging: draggingWaypointID == stop.id,
                            dragGesture: waypointDragGesture(for: stop, currentIndex: index)
                        )
                    }

                    if let destination = viewModel.stops.first(where: { $0.kind == .destination }) {
                        RouteStopListRow(stop: destination, icon: icon(for: destination.kind), isReorderable: false)
                    }
                }
                .padding(.bottom, 12)
            }
            .frame(maxHeight: min(CGFloat(max(viewModel.stops.count, 1)) * 60 + 28, 260))
            .scrollIndicators(.visible)
        }
    }

    private var waypointStops: [RouteStopDraft] {
        viewModel.stops.filter { $0.kind == .waypoint }
    }

    private func waypointDragGesture(for stop: RouteStopDraft, currentIndex: Int) -> AnyGesture<DragGesture.Value> {
        AnyGesture(DragGesture(minimumDistance: 4)
            .onChanged { value in
                if draggingWaypointID != stop.id {
                    draggingWaypointID = stop.id
                    dragStartWaypointIndex = currentIndex
                    dragCurrentWaypointIndex = currentIndex
                }

                guard let dragStartWaypointIndex else {
                    return
                }

                let rowStride: CGFloat = 64
                let indexOffset = Int((value.translation.height / rowStride).rounded())
                let proposedIndex = min(max(dragStartWaypointIndex + indexOffset, 0), max(waypointStops.count - 1, 0))

                guard proposedIndex != dragCurrentWaypointIndex else {
                    return
                }

                dragCurrentWaypointIndex = proposedIndex
                withAnimation(.snappy) {
                    viewModel.moveWaypoint(id: stop.id, toWaypointIndex: proposedIndex)
                }
            }
            .onEnded { _ in
                draggingWaypointID = nil
                dragStartWaypointIndex = nil
                dragCurrentWaypointIndex = nil
            }
        )
    }

    private func icon(for kind: RouteStopKind) -> String {
        switch kind {
        case .start:
            "location.north.fill"
        case .waypoint:
            "mappin.and.ellipse"
        case .destination:
            "flag.fill"
        }
    }
}

private struct RouteStopListRow: View {
    let stop: RouteStopDraft
    let icon: String
    let isReorderable: Bool
    var isDragging = false
    var dragGesture: AnyGesture<DragGesture.Value>?

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.footnote.weight(.semibold))
                .frame(width: 22)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(stop.label)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(stop.kind.rawValue.capitalized)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if isReorderable {
                Image(systemName: isDragging ? "hand.draw.fill" : "line.3.horizontal")
                    .font(.caption)
                    .frame(width: 44, height: 32)
                    .foregroundStyle(isDragging ? Color.accentColor : Color.secondary)
                    .contentShape(Rectangle())
                    .modifier(OptionalGestureModifier(gesture: dragGesture))
                    .accessibilityLabel("Drag to reorder")
                    .accessibilityIdentifier("routeSetup.waypointDragHandle")
            }
        }
        .padding(.vertical, 7)
        .padding(.horizontal, 12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 16))
        .scaleEffect(isDragging ? 1.015 : 1)
    }
}

private struct OptionalGestureModifier: ViewModifier {
    let gesture: AnyGesture<DragGesture.Value>?

    func body(content: Content) -> some View {
        if let gesture {
            content.gesture(gesture)
        } else {
            content
        }
    }
}

private struct RouteSetupStopButton: View {
    let title: String
    let icon: String
    let isPrimary: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.title2.weight(.semibold))
                    .frame(width: 58, height: 58)
                    .background(isPrimary ? Color.white.opacity(0.96) : Color.white.opacity(0.72), in: Circle())
                    .foregroundStyle(isPrimary ? Color.accentColor : Color.primary)
                Text(title)
                    .font(.caption.weight(.heavy))
                    .tracking(1.2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("routeSetup.\(title.lowercased())Button")
    }
}

private struct RouteMetricPill: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct RouteSettingsSheet: View {
    @Binding var preferredUnits: RoutePreferredUnits
    let canExportGPX: Bool
    let onImportGPX: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Preferred Units") {
                    Picker("Distance", selection: $preferredUnits) {
                        ForEach(RoutePreferredUnits.allCases) { units in
                            Text(units.label).tag(units)
                        }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("routeSettings.preferredUnitsPicker")
                }

                Section("GPX") {
                    Button {
                        onImportGPX()
                    } label: {
                        Label("Import GPX", systemImage: "square.and.arrow.down")
                    }
                    .accessibilityIdentifier("routeSettings.importGPXButton")

                    HStack {
                        Label("Export GPX", systemImage: "square.and.arrow.up")
                        Spacer()
                        Text(canExportGPX ? "Later" : "No route")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .foregroundStyle(.secondary)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(canExportGPX ? "Export GPX coming later" : "Export GPX unavailable without a route")
                }
            }
            .navigationTitle("Route Settings")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
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
            .scrollContentBackground(.hidden)
            .background(Color.clear)
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
    let title: String
    let subtitle: String?
    let coordinate: RouteCoordinate
    let confirmTitle: String
    let onCancel: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        ZStack {
            Image(systemName: "mappin.circle.fill")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(.red)
                .shadow(radius: 3)
                .accessibilityHidden(true)

            GeometryReader { proxy in
                VStack {
                    Spacer()

                    VStack(alignment: .leading, spacing: 12) {
                        Text(title)
                            .font(.headline)
                        if let subtitle {
                            Text(subtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Text(String(format: "%.5f, %.5f", coordinate.lat, coordinate.lng))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)

                        HStack(spacing: 16) {
                            Button("Cancel", role: .cancel) {
                                onCancel()
                            }
                            .buttonStyle(.bordered)
                            .frame(maxWidth: .infinity)

                            Button {
                                onConfirm()
                            } label: {
                                Label(confirmTitle, systemImage: "checkmark.circle.fill")
                            }
                            .buttonStyle(.borderedProminent)
                            .frame(maxWidth: .infinity)
                        }
                        .padding(.top, 2)
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 20)
                    .padding(.bottom, max(proxy.safeAreaInsets.bottom + 42, 62))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 32))
                    .background(Color.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 32))
                    .overlay(RoundedRectangle(cornerRadius: 32).stroke(.white.opacity(0.28), lineWidth: 1))
                    .shadow(color: .black.opacity(0.12), radius: 18, y: 8)
                    .offset(y: max(proxy.safeAreaInsets.bottom + 16, 36))
                }
                .ignoresSafeArea(.container, edges: .bottom)
            }
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
