import Foundation
import MapKit
import SwiftUI

enum LiveDriveDriverState: String, Equatable {
    case current
    case live
    case stale
    case offline
    case stopped

    var label: String {
        switch self {
        case .current:
            "You"
        case .live:
            "Live"
        case .stale:
            "Stale"
        case .offline:
            "Offline"
        case .stopped:
            "Stopped"
        }
    }
}

struct LiveDriveDriverMarker: Identifiable, Equatable {
    let id: String
    let displayName: String
    let vehicle: String
    let badgeText: String
    let badgeColorHex: String
    let coordinate: RouteCoordinate
    let state: LiveDriveDriverState
    let freshnessText: String
    let speedText: String?
}

struct LiveDriveHazardMarker: Identifiable, Equatable {
    let id: String
    let type: HazardType
    let title: String
    let detail: String
    let coordinate: RouteCoordinate
    let iconSystemName: String
}

enum LiveDriveDriverMarkerFactory {
    static let staleThresholdMilliseconds: Int64 = 120_000

    static func markers(for run: Run, currentUID: String, nowMilliseconds: Int64) -> [LiveDriveDriverMarker] {
        (run.drivers ?? [:])
            .compactMap { uid, driver in
                guard let location = driver.location else {
                    return nil
                }

                let displayName = driver.profile.displayName ?? driver.profile.name
                let badge = driver.profile.badge ?? DriverBadge.generated(
                    displayName: displayName,
                    carMake: driver.profile.carMake,
                    carModel: driver.profile.carModel
                )

                return LiveDriveDriverMarker(
                    id: uid,
                    displayName: displayName,
                    vehicle: "\(driver.profile.carMake) \(driver.profile.carModel)",
                    badgeText: badge.text,
                    badgeColorHex: badge.colorHex,
                    coordinate: RouteCoordinate(lat: location.lat, lng: location.lng),
                    state: state(for: driver, uid: uid, currentUID: currentUID, nowMilliseconds: nowMilliseconds),
                    freshnessText: freshnessText(for: location.timestamp, nowMilliseconds: nowMilliseconds),
                    speedText: nil
                )
            }
            .sorted { lhs, rhs in
                if lhs.id == currentUID {
                    return true
                }
                if rhs.id == currentUID {
                    return false
                }
                return lhs.displayName < rhs.displayName
            }
    }

    private static func state(for driver: DriverRecord, uid: String, currentUID: String, nowMilliseconds: Int64) -> LiveDriveDriverState {
        if driver.finishState == .finished || driver.finishState == .left {
            return .stopped
        }

        if driver.presence == .offline || driver.presence == nil {
            return .offline
        }

        if uid == currentUID {
            return .current
        }

        guard let timestamp = driver.location?.timestamp else {
            return .stale
        }

        if nowMilliseconds - timestamp > staleThresholdMilliseconds {
            return .stale
        }

        return .live
    }

    private static func freshnessText(for timestamp: Int64, nowMilliseconds: Int64) -> String {
        let seconds = max(0, (nowMilliseconds - timestamp) / 1_000)
        if seconds < 60 {
            return "Updated just now"
        }

        return "Updated \(seconds / 60)m ago"
    }
}

enum LiveDriveHazardMarkerFactory {
    static func markers(for run: Run) -> [LiveDriveHazardMarker] {
        (run.hazards ?? [:])
            .filter { !$0.value.dismissed }
            .map { id, hazard in
                LiveDriveHazardMarker(
                    id: id,
                    type: hazard.type,
                    title: title(for: hazard.type),
                    detail: "Reported by \(hazard.reporterName)",
                    coordinate: RouteCoordinate(lat: hazard.lat, lng: hazard.lng),
                    iconSystemName: icon(for: hazard.type)
                )
            }
            .sorted { $0.title < $1.title }
    }

    private static func title(for type: HazardType) -> String {
        switch type {
        case .pothole:
            "Pothole"
        case .roadworks:
            "Roadworks"
        case .police:
            "Police"
        case .mobileCamera:
            "Mobile camera"
        case .debris:
            "Debris"
        case .animal:
            "Animal"
        case .brokenDownCar:
            "Broken-down car"
        }
    }

    private static func icon(for type: HazardType) -> String {
        switch type {
        case .pothole, .debris, .animal, .brokenDownCar:
            "exclamationmark.triangle.fill"
        case .roadworks:
            "figure.construction"
        case .police:
            "shield.fill"
        case .mobileCamera:
            "camera.fill"
        }
    }
}

enum LiveDriveStatusFormatter {
    static func statusTitle(for run: Run) -> String {
        "\(run.name) · \(statusText(for: run.status))"
    }

    static func nextWaypointText(for run: Run, currentLocation: RouteCoordinate?) -> String {
        guard let stop = nextStop(in: run.route) else {
            return "Route active"
        }

        let distance = distanceToStop(stop, from: currentLocation) ?? run.route?.distanceMetres
        guard let distance else {
            return "Next stop: \(stop.label)"
        }

        return "Next stop: \(stop.label) · \(distanceLabel(distance))"
    }

    private static func statusText(for status: RunStatus) -> String {
        switch status {
        case .draft:
            "Draft"
        case .ready:
            "Ready"
        case .active:
            "Active"
        case .ended:
            "Ended"
        }
    }

    private static func nextStop(in route: RouteData?) -> RouteStopDraft? {
        route?.stops?
            .sorted { ($0.order ?? 0) < ($1.order ?? 0) }
            .first { $0.kind == .waypoint || $0.kind == .destination }
    }

    private static func distanceToStop(_ stop: RouteStopDraft, from currentLocation: RouteCoordinate?) -> Double? {
        guard let currentLocation,
              let lat = stop.lat,
              let lng = stop.lng else {
            return nil
        }

        return GPXDistanceCalculator.distanceMetres(
            for: [currentLocation, RouteCoordinate(lat: lat, lng: lng)]
        )
    }

    private static func distanceLabel(_ metres: Double) -> String {
        if metres < 1_000 {
            return "\(Int(metres.rounded())) m"
        }

        return "\(String(format: "%.1f", metres / 1_000)) km"
    }
}

@MainActor
final class LiveDriveViewModel: ObservableObject {
    @Published private(set) var routeCoordinates: [RouteCoordinate] = []
    @Published private(set) var driverMarkers: [LiveDriveDriverMarker] = []
    @Published private(set) var hazardMarkers: [LiveDriveHazardMarker] = []
    @Published private(set) var statusTitle = "Loading"
    @Published private(set) var nextWaypointText = "Loading route"
    @Published private(set) var message: String?
    @Published var selectedDriver: LiveDriveDriverMarker?

    let role: ActiveRunRole

    private let uid: String
    private let runId: String
    private let runReader: RunReading
    private let nowMilliseconds: @Sendable () -> Int64

    init(
        uid: String,
        runId: String,
        role: ActiveRunRole,
        runReader: RunReading,
        nowMilliseconds: @escaping @Sendable () -> Int64 = {
            Int64(Date().timeIntervalSince1970 * 1_000)
        }
    ) {
        self.uid = uid
        self.runId = runId
        self.role = role
        self.runReader = runReader
        self.nowMilliseconds = nowMilliseconds
    }

    func load() async {
        do {
            guard let run = try await runReader.readRun(runId: runId) else {
                message = "Unable to load drive."
                return
            }

            let now = nowMilliseconds()
            routeCoordinates = (run.route?.points ?? []).compactMap { point in
                guard point.count >= 2 else {
                    return nil
                }
                return RouteCoordinate(lat: point[0], lng: point[1])
            }
            driverMarkers = LiveDriveDriverMarkerFactory.markers(for: run, currentUID: uid, nowMilliseconds: now)
            hazardMarkers = LiveDriveHazardMarkerFactory.markers(for: run)
            statusTitle = LiveDriveStatusFormatter.statusTitle(for: run)
            nextWaypointText = LiveDriveStatusFormatter.nextWaypointText(
                for: run,
                currentLocation: driverMarkers.first { $0.id == uid }?.coordinate
            )
            message = nil
        } catch {
            message = "Unable to load drive."
        }
    }

    func selectDriver(_ marker: LiveDriveDriverMarker) {
        selectedDriver = marker
    }

    func clearSelectedDriver() {
        selectedDriver = nil
    }
}

struct LiveDriveView: View {
    @StateObject var viewModel: LiveDriveViewModel
    @State private var mapPosition: MapCameraPosition = .automatic
    @State private var showsEndDrivePlaceholder = false
    @State private var showsHazardPlaceholder = false

    var body: some View {
        ZStack {
            LiveDriveMap(
                routeCoordinates: viewModel.routeCoordinates,
                driverMarkers: viewModel.driverMarkers,
                hazardMarkers: viewModel.hazardMarkers,
                mapPosition: $mapPosition,
                onDriverTap: viewModel.selectDriver
            )
            .ignoresSafeArea()
            .accessibilityIdentifier("liveDrive.map")

            VStack(spacing: 0) {
                LiveDriveStatusOverlay(
                    title: viewModel.statusTitle,
                    subtitle: viewModel.nextWaypointText,
                    role: viewModel.role,
                    onEndDrive: {
                        showsEndDrivePlaceholder = true
                    }
                )
                .padding(.horizontal)
                .padding(.top, 12)

                Spacer()

                HStack(alignment: .bottom) {
                    LiveDriveBottomControls {
                        mapPosition = .automatic
                    }

                    Spacer()

                    Button {
                        showsHazardPlaceholder = true
                    } label: {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(width: 58, height: 58)
                            .background(.red, in: Circle())
                    }
                    .accessibilityLabel("Report Hazard")
                    .accessibilityIdentifier("liveDrive.hazardButton")
                }
                .padding()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            await viewModel.load()
        }
        .sheet(item: $viewModel.selectedDriver) { marker in
            LiveDriveDriverDetailView(marker: marker)
        }
        .alert("Hazard reporting comes next.", isPresented: $showsHazardPlaceholder) {
            Button("OK", role: .cancel) {}
        }
        .alert("End drive will be wired with drive controls.", isPresented: $showsEndDrivePlaceholder) {
            Button("OK", role: .cancel) {}
        }
    }
}

private struct LiveDriveMap: View {
    let routeCoordinates: [RouteCoordinate]
    let driverMarkers: [LiveDriveDriverMarker]
    let hazardMarkers: [LiveDriveHazardMarker]
    @Binding var mapPosition: MapCameraPosition
    let onDriverTap: (LiveDriveDriverMarker) -> Void

    var body: some View {
        Map(position: $mapPosition) {
            if routeCoordinates.count >= 2 {
                MapPolyline(coordinates: routeCoordinates.map(\.mapCoordinate))
                    .stroke(.blue, lineWidth: 6)
            }

            ForEach(driverMarkers) { marker in
                Annotation(marker.displayName, coordinate: marker.coordinate.mapCoordinate) {
                    Button {
                        onDriverTap(marker)
                    } label: {
                        LiveDriveDriverMarkerView(marker: marker)
                    }
                    .buttonStyle(.plain)
                }
            }

            ForEach(hazardMarkers) { marker in
                Annotation(marker.title, coordinate: marker.coordinate.mapCoordinate) {
                    Image(systemName: marker.iconSystemName)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(.orange, in: Circle())
                        .overlay(Circle().stroke(.white, lineWidth: 2))
                        .accessibilityLabel("\(marker.title). \(marker.detail)")
                }
            }
        }
    }
}

private struct LiveDriveDriverMarkerView: View {
    let marker: LiveDriveDriverMarker

    var body: some View {
        Text(marker.badgeText)
            .font(.caption.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: marker.state == .current ? 42 : 36, height: marker.state == .current ? 42 : 36)
            .background(Color(hex: marker.badgeColorHex), in: Circle())
            .overlay(Circle().stroke(ringColor, lineWidth: 3))
            .shadow(radius: 3)
            .accessibilityLabel("\(marker.displayName), \(marker.state.label)")
    }

    private var ringColor: Color {
        switch marker.state {
        case .current:
            .white
        case .live:
            .green
        case .stale:
            .yellow
        case .offline:
            .gray
        case .stopped:
            .secondary
        }
    }
}

private struct LiveDriveStatusOverlay: View {
    let title: String
    let subtitle: String
    let role: ActiveRunRole
    let onEndDrive: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            if role == .admin {
                Button("End") {
                    onEndDrive()
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .accessibilityIdentifier("liveDrive.endDriveButton")
            }
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
        .accessibilityIdentifier("liveDrive.statusOverlay")
    }
}

private struct LiveDriveBottomControls: View {
    let onRecenter: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button {
                onRecenter()
            } label: {
                Image(systemName: "location.fill")
            }
            .accessibilityLabel("Recenter")

            Button {} label: {
                Image(systemName: "map")
            }
            .accessibilityLabel("Route Overview")

            Button {} label: {
                Image(systemName: "list.bullet")
            }
            .accessibilityLabel("Lobby Details")
        }
        .font(.title3.weight(.semibold))
        .buttonStyle(.bordered)
        .controlSize(.large)
        .padding(8)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
        .accessibilityIdentifier("liveDrive.bottomControls")
    }
}

private struct LiveDriveDriverDetailView: View {
    let marker: LiveDriveDriverMarker

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        Text(marker.badgeText)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(Color(hex: marker.badgeColorHex), in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(marker.displayName)
                                .font(.headline)
                            Text(marker.vehicle)
                                .foregroundStyle(.secondary)
                        }
                    }
                    LabeledContent("Status", value: marker.state.label)
                    LabeledContent("Location", value: marker.freshnessText)
                }
            }
            .navigationTitle("Driver")
        }
    }
}

private extension RouteCoordinate {
    var mapCoordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
}

private extension Color {
    init(hex: String) {
        let scanner = Scanner(string: hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")))
        var value: UInt64 = 0
        scanner.scanHexInt64(&value)

        let red = Double((value >> 16) & 0xFF) / 255
        let green = Double((value >> 8) & 0xFF) / 255
        let blue = Double(value & 0xFF) / 255

        self.init(red: red, green: green, blue: blue)
    }
}
