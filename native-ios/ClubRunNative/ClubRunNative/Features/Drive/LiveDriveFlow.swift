import Foundation
import CoreLocation
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
    let reporterName: String
    let reportedAt: Int64
    let reportCount: Int
    let coordinate: RouteCoordinate
    let iconSystemName: String
    let colorHex: String
}

struct LiveDriveHazardOption: Identifiable, Equatable {
    let type: HazardType
    let title: String
    let iconSystemName: String
    let colorHex: String

    var id: String {
        type.rawValue
    }

    static let v1: [LiveDriveHazardOption] = [
        LiveDriveHazardOption(type: .pothole, title: "Pothole", iconSystemName: "exclamationmark.triangle.fill", colorHex: "#FFB000"),
        LiveDriveHazardOption(type: .roadworks, title: "Roadworks", iconSystemName: "figure.construction", colorHex: "#FF6B00"),
        LiveDriveHazardOption(type: .police, title: "Police", iconSystemName: "shield.lefthalf.filled", colorHex: "#1976D2"),
        LiveDriveHazardOption(type: .mobileCamera, title: "Camera", iconSystemName: "camera.fill", colorHex: "#7E57C2"),
        LiveDriveHazardOption(type: .debris, title: "Debris", iconSystemName: "shippingbox.fill", colorHex: "#607D8B"),
        LiveDriveHazardOption(type: .brokenDownCar, title: "Car", iconSystemName: "car.fill", colorHex: "#D32F2F")
    ]

    static func option(for type: HazardType) -> LiveDriveHazardOption {
        v1.first { $0.type == type } ?? LiveDriveHazardOption(
            type: type,
            title: LiveDriveHazardMarkerFactory.title(for: type),
            iconSystemName: LiveDriveHazardMarkerFactory.icon(for: type),
            colorHex: "#FFB000"
        )
    }
}

struct LiveDriveRouteEndpointMarker: Identifiable, Equatable {
    let id: String
    let kind: RouteStopKind
    let title: String
    let coordinate: RouteCoordinate
    let iconSystemName: String
}

struct LiveDriveCurrentUserMarker: Equatable {
    let coordinate: RouteCoordinate
    let heading: Double
    let accuracy: Double

    func screenHeading(relativeToMapHeading mapHeading: Double) -> Double {
        let heading = heading - mapHeading
        return heading < 0 ? heading + 360 : heading
    }
}

struct LiveDriveCameraTarget: Equatable {
    let center: RouteCoordinate
    let heading: Double
    let distanceMetres: Double
}

struct LiveLocationSample: Equatable, Sendable {
    let lat: Double
    let lng: Double
    let heading: Double
    let speed: Double
    let accuracy: Double
    let timestamp: Int64

    var driverLocation: DriverLocation {
        DriverLocation(lat: lat, lng: lng, heading: heading, speed: speed, accuracy: accuracy, timestamp: timestamp)
    }

    var trackPoint: TrackPoint {
        TrackPoint(lat: lat, lng: lng, heading: heading, speed: speed, accuracy: accuracy, timestamp: timestamp)
    }

    var coordinate: RouteCoordinate {
        RouteCoordinate(lat: lat, lng: lng)
    }
}

enum LiveLocationPermissionState: Equatable {
    case notDetermined
    case allowed
    case denied
    case restricted
    case reducedAccuracy

    var userMessage: String? {
        switch self {
        case .notDetermined, .allowed:
            nil
        case .denied:
            "Location permission is off. Enable it in Settings to share your drive position."
        case .restricted:
            "Location sharing is restricted on this device."
        case .reducedAccuracy:
            "Precise Location is off. Turn it on for better convoy positioning."
        }
    }
}

struct LiveLocationWriteDecision: Equatable {
    let shouldWrite: Bool
    let pointId: String?
}

struct LiveLocationWritePolicy: Equatable {
    let minimumIntervalMilliseconds: Int64
    let minimumDistanceMetres: Double

    init(minimumIntervalMilliseconds: Int64 = 5_000, minimumDistanceMetres: Double = 10) {
        self.minimumIntervalMilliseconds = minimumIntervalMilliseconds
        self.minimumDistanceMetres = minimumDistanceMetres
    }

    func decision(previous: LiveLocationSample?, current: LiveLocationSample) -> LiveLocationWriteDecision {
        guard let previous else {
            return LiveLocationWriteDecision(shouldWrite: true, pointId: pointId(for: current))
        }

        let elapsed = current.timestamp - previous.timestamp
        let distance = GPXDistanceCalculator.distanceMetres(for: [previous.coordinate, current.coordinate])
        let shouldWrite = elapsed >= minimumIntervalMilliseconds && distance >= minimumDistanceMetres
        return LiveLocationWriteDecision(shouldWrite: shouldWrite, pointId: shouldWrite ? pointId(for: current) : nil)
    }

    private func pointId(for sample: LiveLocationSample) -> String {
        "point_\(sample.timestamp)"
    }
}

protocol LiveLocationPersisting: Sendable {
    func writeLatestLocation(_ location: DriverLocation, runId: String, uid: String) async throws
    func writeTrackPoint(_ point: TrackPoint, pointId: String, runId: String, uid: String) async throws
    func updatePresence(_ presence: DriverPresence, runId: String, uid: String) async throws
}

protocol HazardPersisting: Sendable {
    func writeHazard(_ hazard: Hazard, hazardId: String, runId: String) async throws
}

@MainActor
final class LiveLocationTrackingController: ObservableObject {
    @Published private(set) var permissionState: LiveLocationPermissionState = .notDetermined
    @Published private(set) var isTracking = false
    @Published private(set) var message: String?

    private let runId: String
    private let uid: String
    private let repository: LiveLocationPersisting
    private let policy: LiveLocationWritePolicy
    private var previousWrittenSample: LiveLocationSample?

    init(
        runId: String,
        uid: String,
        repository: LiveLocationPersisting,
        policy: LiveLocationWritePolicy = LiveLocationWritePolicy()
    ) {
        self.runId = runId
        self.uid = uid
        self.repository = repository
        self.policy = policy
    }

    func updatePermissionState(_ state: LiveLocationPermissionState) {
        permissionState = state
        message = state.userMessage
    }

    func start() async {
        guard permissionState == .allowed || permissionState == .reducedAccuracy || permissionState == .notDetermined else {
            isTracking = false
            message = permissionState.userMessage
            return
        }

        isTracking = true
        do {
            try await repository.updatePresence(.online, runId: runId, uid: uid)
        } catch {
            message = "Unable to update presence."
        }
    }

    func stop(presence: DriverPresence = .offline) async {
        isTracking = false
        do {
            try await repository.updatePresence(presence, runId: runId, uid: uid)
        } catch {
            message = "Unable to update presence."
        }
    }

    func ingest(_ sample: LiveLocationSample, runStatus: RunStatus, finishState: DriverFinishState?) async {
        guard isTracking, runStatus == .active, finishState != .finished, finishState != .left else {
            return
        }

        let decision = policy.decision(previous: previousWrittenSample, current: sample)
        guard decision.shouldWrite, let pointId = decision.pointId else {
            return
        }

        do {
            try await repository.writeLatestLocation(sample.driverLocation, runId: runId, uid: uid)
            try await repository.writeTrackPoint(sample.trackPoint, pointId: pointId, runId: runId, uid: uid)
            previousWrittenSample = sample
            message = nil
        } catch {
            message = "Unable to share location."
        }
    }
}

protocol ForegroundLocationServicing: AnyObject {
    var onPermissionChange: ((LiveLocationPermissionState) -> Void)? { get set }
    var onLocation: ((LiveLocationSample) -> Void)? { get set }
    func requestWhenInUseAuthorization()
    func startUpdating()
    func stopUpdating()
}

final class CoreLocationForegroundLocationService: NSObject, ForegroundLocationServicing, CLLocationManagerDelegate {
    var onPermissionChange: ((LiveLocationPermissionState) -> Void)?
    var onLocation: ((LiveLocationSample) -> Void)?

    private let manager: CLLocationManager

    init(manager: CLLocationManager = CLLocationManager()) {
        self.manager = manager
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 5
        manager.allowsBackgroundLocationUpdates = false
    }

    func requestWhenInUseAuthorization() {
        manager.requestWhenInUseAuthorization()
    }

    func startUpdating() {
        manager.startUpdatingLocation()
    }

    func stopUpdating() {
        manager.stopUpdatingLocation()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        onPermissionChange?(permissionState(for: manager))
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            return
        }

        onLocation?(LiveLocationSample(
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            heading: max(location.course, 0),
            speed: max(location.speed, 0),
            accuracy: location.horizontalAccuracy,
            timestamp: Int64(location.timestamp.timeIntervalSince1970 * 1_000)
        ))
    }

    private func permissionState(for manager: CLLocationManager) -> LiveLocationPermissionState {
        switch manager.authorizationStatus {
        case .notDetermined:
            return .notDetermined
        case .restricted:
            return .restricted
        case .denied:
            return .denied
        case .authorizedAlways, .authorizedWhenInUse:
            return manager.accuracyAuthorization == .reducedAccuracy ? .reducedAccuracy : .allowed
        @unknown default:
            return .restricted
        }
    }
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
            .map { id, hazard in marker(id: id, hazard: hazard) }
            .sorted { $0.title < $1.title }
    }

    static func marker(id: String, hazard: Hazard) -> LiveDriveHazardMarker {
        let option = LiveDriveHazardOption.option(for: hazard.type)
        return LiveDriveHazardMarker(
            id: id,
            type: hazard.type,
            title: option.title,
            detail: "Reported by \(hazard.reporterName)",
            reporterName: hazard.reporterName,
            reportedAt: hazard.timestamp,
            reportCount: hazard.reportCount,
            coordinate: RouteCoordinate(lat: hazard.lat, lng: hazard.lng),
            iconSystemName: option.iconSystemName,
            colorHex: option.colorHex
        )
    }

    static func title(for type: HazardType) -> String {
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

    static func icon(for type: HazardType) -> String {
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

enum LiveDriveRouteEndpointMarkerFactory {
    static func markers(for route: RouteData?) -> [LiveDriveRouteEndpointMarker] {
        (route?.stops ?? [])
            .filter { $0.kind == .start || $0.kind == .destination }
            .compactMap { stop in
                guard let lat = stop.lat, let lng = stop.lng else {
                    return nil
                }

                return LiveDriveRouteEndpointMarker(
                    id: stop.id,
                    kind: stop.kind,
                    title: stop.kind == .start ? "Start" : "Finish",
                    coordinate: RouteCoordinate(lat: lat, lng: lng),
                    iconSystemName: stop.kind == .start ? "flag.fill" : "flag.checkered"
                )
            }
            .sorted { lhs, rhs in
                sortOrder(for: lhs.kind) < sortOrder(for: rhs.kind)
            }
    }

    private static func sortOrder(for kind: RouteStopKind) -> Int {
        switch kind {
        case .start:
            0
        case .waypoint:
            1
        case .destination:
            2
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
    @Published private(set) var routeEndpointMarkers: [LiveDriveRouteEndpointMarker] = []
    @Published private(set) var currentUserMarker: LiveDriveCurrentUserMarker?
    @Published private(set) var driverMarkers: [LiveDriveDriverMarker] = []
    @Published private(set) var hazardMarkers: [LiveDriveHazardMarker] = []
    @Published private(set) var statusTitle = "Loading"
    @Published private(set) var nextWaypointText = "Loading route"
    @Published private(set) var message: String?
    @Published private(set) var cameraTarget: LiveDriveCameraTarget?
    @Published private(set) var isFollowingCurrentUser = false
    @Published var selectedDriver: LiveDriveDriverMarker?
    @Published var selectedHazard: LiveDriveHazardMarker?

    let role: ActiveRunRole
    let locationController: LiveLocationTrackingController?
    let hazardOptions = LiveDriveHazardOption.v1

    private let uid: String
    private let runId: String
    private let runReader: RunReading
    private let hazardRepository: HazardPersisting?
    private let nowMilliseconds: @Sendable () -> Int64
    private var currentRunStatus: RunStatus?
    private var currentFinishState: DriverFinishState?
    private var reporterName = "Driver"

    init(
        uid: String,
        runId: String,
        role: ActiveRunRole,
        runReader: RunReading,
        liveLocationRepository: LiveLocationPersisting? = nil,
        hazardRepository: HazardPersisting? = nil,
        nowMilliseconds: @escaping @Sendable () -> Int64 = {
            Int64(Date().timeIntervalSince1970 * 1_000)
        }
    ) {
        self.uid = uid
        self.runId = runId
        self.role = role
        self.runReader = runReader
        self.hazardRepository = hazardRepository
        self.nowMilliseconds = nowMilliseconds
        if let liveLocationRepository {
            self.locationController = LiveLocationTrackingController(runId: runId, uid: uid, repository: liveLocationRepository)
        } else {
            self.locationController = nil
        }
    }

    func load() async {
        do {
            guard let run = try await runReader.readRun(runId: runId) else {
                message = "Unable to load drive."
                return
            }

            currentRunStatus = run.status
            currentFinishState = run.drivers?[uid]?.finishState
            let now = nowMilliseconds()
            routeCoordinates = (run.route?.points ?? []).compactMap { point in
                guard point.count >= 2 else {
                    return nil
                }
                return RouteCoordinate(lat: point[0], lng: point[1])
            }
            routeEndpointMarkers = LiveDriveRouteEndpointMarkerFactory.markers(for: run.route)
            driverMarkers = LiveDriveDriverMarkerFactory.markers(for: run, currentUID: uid, nowMilliseconds: now)
            currentUserMarker = currentUserMarker(from: run.drivers?[uid]?.location)
            reporterName = reporterName(from: run.drivers?[uid])
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

    func reportHazard(_ type: HazardType) async {
        guard let marker = currentUserMarker else {
            message = "Waiting for your location."
            return
        }

        guard let hazardRepository else {
            message = "Unable to report hazard."
            return
        }

        let timestamp = nowMilliseconds()
        let hazardId = "hazard_\(timestamp)_\(type.rawValue)"
        let hazard = Hazard(
            type: type,
            reportedBy: uid,
            reporterName: reporterName,
            lat: marker.coordinate.lat,
            lng: marker.coordinate.lng,
            timestamp: timestamp,
            dismissed: false,
            reportCount: 1
        )

        do {
            try await hazardRepository.writeHazard(hazard, hazardId: hazardId, runId: runId)
            hazardMarkers.append(LiveDriveHazardMarkerFactory.marker(id: hazardId, hazard: hazard))
            message = nil
        } catch {
            message = "Unable to report hazard."
        }
    }

    func locateCurrentUser() {
        guard let currentUserMarker else {
            isFollowingCurrentUser = false
            cameraTarget = nil
            message = "Waiting for your location."
            return
        }

        isFollowingCurrentUser = true
        cameraTarget = cameraTarget(for: currentUserMarker)
        message = nil
    }

    func selectDriver(_ marker: LiveDriveDriverMarker) {
        selectedDriver = marker
    }

    func clearSelectedDriver() {
        selectedDriver = nil
    }

    func selectHazard(_ marker: LiveDriveHazardMarker) {
        selectedHazard = marker
    }

    func clearSelectedHazard() {
        selectedHazard = nil
    }

    func clearMessage() {
        message = nil
    }

    func updateLocationPermission(_ state: LiveLocationPermissionState) async {
        locationController?.updatePermissionState(state)
        if state == .allowed || state == .reducedAccuracy {
            await locationController?.start()
        }
    }

    func ingestLocation(_ sample: LiveLocationSample) async {
        let marker = LiveDriveCurrentUserMarker(
            coordinate: sample.coordinate,
            heading: sample.heading,
            accuracy: sample.accuracy
        )
        currentUserMarker = marker
        if isFollowingCurrentUser {
            cameraTarget = cameraTarget(for: marker)
        }

        await locationController?.ingest(
            sample,
            runStatus: currentRunStatus ?? .ended,
            finishState: currentFinishState
        )
    }

    func stopLocationTracking() async {
        await locationController?.stop()
    }

    private func currentUserMarker(from location: DriverLocation?) -> LiveDriveCurrentUserMarker? {
        guard let location else {
            return nil
        }

        return LiveDriveCurrentUserMarker(
            coordinate: RouteCoordinate(lat: location.lat, lng: location.lng),
            heading: location.heading,
            accuracy: location.accuracy
        )
    }

    private func reporterName(from driver: DriverRecord?) -> String {
        guard let driver else {
            return "Driver"
        }

        return driver.profile.displayName ?? driver.profile.name
    }

    private func cameraTarget(for marker: LiveDriveCurrentUserMarker) -> LiveDriveCameraTarget {
        LiveDriveCameraTarget(
            center: marker.coordinate,
            heading: marker.heading,
            distanceMetres: 1_100
        )
    }
}

struct LiveDriveView: View {
    @StateObject var viewModel: LiveDriveViewModel
    @State private var foregroundLocationService = CoreLocationForegroundLocationService()
    @State private var mapPosition: MapCameraPosition = .automatic
    @State private var showsEndDrivePlaceholder = false
    @State private var isHazardRailExpanded = false

    var body: some View {
        ZStack {
            LiveDriveMap(
                routeCoordinates: viewModel.routeCoordinates,
                routeEndpointMarkers: viewModel.routeEndpointMarkers,
                currentUserMarker: viewModel.currentUserMarker,
                currentMapHeading: viewModel.isFollowingCurrentUser ? viewModel.cameraTarget?.heading ?? 0 : 0,
                driverMarkers: viewModel.driverMarkers,
                hazardMarkers: viewModel.hazardMarkers,
                mapPosition: $mapPosition,
                onDriverTap: viewModel.selectDriver,
                onHazardTap: viewModel.selectHazard
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
                .padding(.horizontal, 14)
                .padding(.top, 12)

                Spacer()

                ZStack(alignment: .bottom) {
                    LiveDriveBottomControls {
                        viewModel.locateCurrentUser()
                    }

                    HStack(spacing: 8) {
                        Spacer()

                        ZStack(alignment: .trailing) {
                            LiveDriveHazardRail(
                                options: viewModel.hazardOptions,
                                isExpanded: isHazardRailExpanded
                            ) { type in
                                Task {
                                    await viewModel.reportHazard(type)
                                    withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
                                        isHazardRailExpanded = false
                                    }
                                }
                            }
                            .padding(.trailing, 66)

                            Button {
                                withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
                                    isHazardRailExpanded.toggle()
                                }
                            } label: {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.title2.weight(.semibold))
                                    .foregroundStyle(.black)
                                    .frame(width: 58, height: 58)
                                    .background(.yellow, in: Circle())
                                    .overlay(Circle().stroke(.white.opacity(0.85), lineWidth: 2))
                                    .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
                                    .rotationEffect(.degrees(isHazardRailExpanded ? 180 : 0))
                            }
                            .accessibilityLabel("Report Hazard")
                            .accessibilityIdentifier("liveDrive.hazardButton")
                        }
                    }
                    .padding(.bottom, 76)
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 34)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            await viewModel.load()
            configureForegroundLocationService()
            foregroundLocationService.requestWhenInUseAuthorization()
            foregroundLocationService.startUpdating()
        }
        .onDisappear {
            foregroundLocationService.stopUpdating()
            Task {
                await viewModel.stopLocationTracking()
            }
        }
        .sheet(item: $viewModel.selectedDriver) { marker in
            LiveDriveDriverDetailView(marker: marker)
        }
        .sheet(item: $viewModel.selectedHazard) { marker in
            LiveDriveHazardDetailView(marker: marker)
        }
        .onChange(of: viewModel.cameraTarget) { _, cameraTarget in
            guard let cameraTarget else {
                return
            }

            mapPosition = .camera(cameraTarget.mapCamera)
        }
        .alert("End drive will be wired with drive controls.", isPresented: $showsEndDrivePlaceholder) {
            Button("OK", role: .cancel) {}
        }
        .alert(
            "Live Drive",
            isPresented: Binding(
                get: { viewModel.message != nil },
                set: { isPresented in
                    if !isPresented {
                        viewModel.clearMessage()
                    }
                }
            )
        ) {
            Button("OK", role: .cancel) {
                viewModel.clearMessage()
            }
        } message: {
            Text(viewModel.message ?? "")
        }
    }

    private func configureForegroundLocationService() {
        foregroundLocationService.onPermissionChange = { state in
            Task { @MainActor in
                await viewModel.updateLocationPermission(state)
            }
        }
        foregroundLocationService.onLocation = { sample in
            Task { @MainActor in
                await viewModel.ingestLocation(sample)
            }
        }
    }
}

private struct LiveDriveHazardRail: View {
    let options: [LiveDriveHazardOption]
    let isExpanded: Bool
    let onSelect: (HazardType) -> Void

    var body: some View {
        HStack(spacing: 8) {
            ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
                Button {
                    onSelect(option.type)
                } label: {
                    Image(systemName: option.iconSystemName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(Color(hex: option.colorHex), in: Circle())
                        .overlay(Circle().stroke(.white.opacity(0.88), lineWidth: 1.5))
                        .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(option.title)
                .scaleEffect(isExpanded ? 1 : 0.35)
                .opacity(isExpanded ? 1 : 0)
                .offset(x: isExpanded ? 0 : CGFloat((options.count - index) * 44))
                .animation(
                    .spring(response: 0.28, dampingFraction: 0.82)
                        .delay(isExpanded ? Double(index) * 0.018 : Double(options.count - index) * 0.01),
                    value: isExpanded
                )
            }
        }
        .allowsHitTesting(isExpanded)
        .accessibilityIdentifier("liveDrive.hazardRail")
    }
}

private struct LiveDriveMap: View {
    let routeCoordinates: [RouteCoordinate]
    let routeEndpointMarkers: [LiveDriveRouteEndpointMarker]
    let currentUserMarker: LiveDriveCurrentUserMarker?
    let currentMapHeading: Double
    let driverMarkers: [LiveDriveDriverMarker]
    let hazardMarkers: [LiveDriveHazardMarker]
    @Binding var mapPosition: MapCameraPosition
    let onDriverTap: (LiveDriveDriverMarker) -> Void
    let onHazardTap: (LiveDriveHazardMarker) -> Void

    var body: some View {
        Map(position: $mapPosition) {
            if routeCoordinates.count >= 2 {
                MapPolyline(coordinates: routeCoordinates.map(\.mapCoordinate))
                    .stroke(.blue, lineWidth: 6)
            }

            ForEach(routeEndpointMarkers) { marker in
                Annotation(marker.title, coordinate: marker.coordinate.mapCoordinate) {
                    LiveDriveRouteEndpointMarkerView(marker: marker)
                }
            }

            if let currentUserMarker {
                Annotation("You", coordinate: currentUserMarker.coordinate.mapCoordinate) {
                    LiveDriveCurrentUserMarkerView(
                        marker: currentUserMarker,
                        mapHeading: currentMapHeading
                    )
                }
            }

            ForEach(driverMarkers) { marker in
                if marker.state != .current {
                    Annotation(marker.displayName, coordinate: marker.coordinate.mapCoordinate) {
                        Button {
                            onDriverTap(marker)
                        } label: {
                            LiveDriveDriverMarkerView(marker: marker)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            ForEach(hazardMarkers) { marker in
                Annotation(marker.title, coordinate: marker.coordinate.mapCoordinate) {
                    Button {
                        onHazardTap(marker)
                    } label: {
                        Image(systemName: marker.iconSystemName)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(Color(hex: marker.colorHex), in: Circle())
                            .overlay(Circle().stroke(.white, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(marker.title). \(marker.detail)")
                }
            }
        }
    }
}

private struct LiveDriveCurrentUserMarkerView: View {
    let marker: LiveDriveCurrentUserMarker
    let mapHeading: Double

    var body: some View {
        ZStack {
            Circle()
                .fill(.blue.opacity(0.16))
                .frame(width: accuracyDiameter, height: accuracyDiameter)

            Circle()
                .fill(.blue)
                .frame(width: 18, height: 18)
                .overlay(Circle().stroke(.white, lineWidth: 4))
                .shadow(color: .black.opacity(0.2), radius: 5, y: 2)

            Image(systemName: "location.north.fill")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.blue)
                .rotationEffect(.degrees(marker.screenHeading(relativeToMapHeading: mapHeading)))
                .offset(y: -20)
        }
        .frame(width: max(44, accuracyDiameter), height: max(44, accuracyDiameter))
        .accessibilityLabel("Your location")
    }

    private var accuracyDiameter: CGFloat {
        min(max(CGFloat(marker.accuracy) * 2, 32), 76)
    }
}

private struct LiveDriveRouteEndpointMarkerView: View {
    let marker: LiveDriveRouteEndpointMarker

    var body: some View {
        Image(systemName: marker.iconSystemName)
            .font(.headline.weight(.bold))
            .foregroundStyle(foregroundColor)
            .frame(width: 38, height: 38)
            .background(.regularMaterial, in: Circle())
            .overlay(Circle().stroke(.white.opacity(0.9), lineWidth: 2))
            .shadow(color: .black.opacity(0.18), radius: 8, y: 3)
            .accessibilityLabel(marker.title)
    }

    private var foregroundColor: Color {
        marker.kind == .start ? .blue : .black
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
                    .font(.headline.weight(.semibold))
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
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 13)
                .padding(.vertical, 9)
                .background(.red.opacity(0.14), in: Capsule())
                .foregroundStyle(.red)
                .tint(.red)
                .accessibilityIdentifier("liveDrive.endDriveButton")
            }
        }
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
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
                Image(systemName: "list.bullet")
            }
            .accessibilityLabel("Lobby Details")
        }
        .font(.title3.weight(.semibold))
        .buttonStyle(.borderedProminent)
        .tint(.white.opacity(0.74))
        .foregroundStyle(.blue)
        .controlSize(.large)
        .padding(8)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
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

private struct LiveDriveHazardDetailView: View {
    let marker: LiveDriveHazardMarker

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        Image(systemName: marker.iconSystemName)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(Color(hex: marker.colorHex), in: Circle())

                        VStack(alignment: .leading, spacing: 2) {
                            Text(marker.title)
                                .font(.headline)
                            Text(marker.detail)
                                .foregroundStyle(.secondary)
                        }
                    }

                    LabeledContent("Reported by", value: marker.reporterName)
                    LabeledContent("Reports", value: "\(marker.reportCount)")
                    LabeledContent("Time", value: reportedTimeText)
                }
            }
            .navigationTitle("Hazard")
        }
    }

    private var reportedTimeText: String {
        let date = Date(timeIntervalSince1970: TimeInterval(marker.reportedAt) / 1_000)
        return date.formatted(date: .omitted, time: .shortened)
    }
}

private extension RouteCoordinate {
    var mapCoordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
}

private extension LiveDriveCameraTarget {
    var mapCamera: MapCamera {
        MapCamera(
            centerCoordinate: center.mapCoordinate,
            distance: distanceMetres,
            heading: heading,
            pitch: 0
        )
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
