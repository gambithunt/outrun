import Foundation
import AudioToolbox
import AVFoundation
import CoreLocation
import MapKit
import SwiftUI

#if DEBUG
private extension DecodingError {
    var clubRunDebugSummary: String {
        switch self {
        case let .dataCorrupted(context):
            return "Decode failed at \(codingPathDescription(context.codingPath)): \(context.debugDescription)"
        case let .keyNotFound(key, context):
            return "Decode missing \(key.stringValue) at \(codingPathDescription(context.codingPath)): \(context.debugDescription)"
        case let .typeMismatch(type, context):
            return "Decode type mismatch for \(type) at \(codingPathDescription(context.codingPath)): \(context.debugDescription)"
        case let .valueNotFound(type, context):
            return "Decode missing value for \(type) at \(codingPathDescription(context.codingPath)): \(context.debugDescription)"
        @unknown default:
            return "Decode failed."
        }
    }

    private func codingPathDescription(_ path: [CodingKey]) -> String {
        let value = path.map(\.stringValue).joined(separator: ".")
        return value.isEmpty ? "<root>" : value
    }
}
#endif

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
    let reportedBy: String
    let reporterName: String
    let reportedAt: Int64
    let reportCount: Int
    let coordinate: RouteCoordinate
    let iconSystemName: String
    let colorHex: String
}

struct LiveDriveHazardAudioEvent: Equatable {
    let hazardId: String
    let type: HazardType
    let distanceMetres: Double
}

enum LiveDriveHazardAlertPolicy {
    static let actionableDistanceMetres = 300.0

    static func actionableRemoteHazards(
        from hazards: [LiveDriveHazardMarker],
        currentLocation: RouteCoordinate?,
        currentUID: String,
        alertedHazardIds: Set<String>
    ) -> [LiveDriveHazardAudioEvent] {
        guard let currentLocation else {
            return []
        }

        return hazards.compactMap { hazard in
            guard hazard.reportedBy != currentUID,
                  !alertedHazardIds.contains(hazard.id) else {
                return nil
            }

            let distance = GPXDistanceCalculator.distanceMetres(
                for: [currentLocation, hazard.coordinate]
            )
            guard distance <= actionableDistanceMetres else {
                return nil
            }

            return LiveDriveHazardAudioEvent(
                hazardId: hazard.id,
                type: hazard.type,
                distanceMetres: distance
            )
        }
    }
}

protocol LiveDriveHazardAudioAlerting: Sendable {
    func playHazardAlert(for type: HazardType, mode: HazardAlertAudioMode)
}

enum HazardAlertAudioMode: String, CaseIterable, Identifiable {
    case announced
    case simple

    var id: String {
        rawValue
    }

    var label: String {
        switch self {
        case .announced:
            "Announced"
        case .simple:
            "Simple"
        }
    }
}

final class SystemLiveDriveHazardAudioAlert: LiveDriveHazardAudioAlerting, @unchecked Sendable {
    private let lock = NSLock()
    private var players: [String: AVAudioPlayer] = [:]

    func playHazardAlert(for type: HazardType, mode: HazardAlertAudioMode) {
        let resourceName = Self.resourceName(for: type, mode: mode)
        guard let url = Bundle.main.url(forResource: resourceName, withExtension: "mp3") else {
            AudioServicesPlaySystemSound(1104)
            return
        }

        do {
            let player = try player(for: resourceName, url: url)
            player.currentTime = 0
            player.play()
        } catch {
            AudioServicesPlaySystemSound(1104)
        }
    }

    private func player(for resourceName: String, url: URL) throws -> AVAudioPlayer {
        lock.lock()
        defer { lock.unlock() }

        if let player = players[resourceName] {
            return player
        }

        let player = try AVAudioPlayer(contentsOf: url)
        player.prepareToPlay()
        players[resourceName] = player
        return player
    }

    private static func resourceName(for type: HazardType, mode: HazardAlertAudioMode) -> String {
        guard mode == .announced else {
            return "alert"
        }

        switch type {
        case .pothole:
            return "pothole-ahead"
        case .roadworks:
            return "roadworks"
        case .police:
            return "police-ahead"
        case .mobileCamera:
            return "speed-camera"
        case .debris:
            return "debris-ahead"
        case .brokenDownCar:
            return "broken-down-car"
        case .animal:
            return "hazard-ahead"
        }
    }
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

enum LiveDriveFollowCameraPolicy {
    static let movementThresholdMetresPerSecond = 2.0
    static let interactionResumeDelayMilliseconds: Int64 = 9_000

    static func isMoving(speed: Double) -> Bool {
        speed > movementThresholdMetresPerSecond
    }

    static func distanceMetres(for speed: Double?) -> Double {
        guard let speed else {
            return 1_100
        }

        if speed >= 22 {
            return 1_700
        }

        if speed >= 8 {
            return 1_250
        }

        return 850
    }

    static func cameraCenter(for coordinate: RouteCoordinate, heading: Double, speed: Double?) -> RouteCoordinate {
        guard let speed, isMoving(speed: speed) else {
            return coordinate
        }

        let lookAheadMetres = min(max(distanceMetres(for: speed) * 0.18, 120), 300)
        return projectedCoordinate(from: coordinate, bearingDegrees: heading, distanceMetres: lookAheadMetres)
    }

    static func canResumeAfterInteraction(
        lastInteractionAt: Int64?,
        nowMilliseconds: Int64,
        isMoving: Bool,
        hasLocation: Bool,
        hasModalOpen: Bool,
        runStatus: RunStatus?
    ) -> Bool {
        guard let lastInteractionAt,
              isMoving,
              hasLocation,
              !hasModalOpen,
              runStatus == .active else {
            return false
        }

        return nowMilliseconds - lastInteractionAt >= interactionResumeDelayMilliseconds
    }

    private static func projectedCoordinate(
        from coordinate: RouteCoordinate,
        bearingDegrees: Double,
        distanceMetres: Double
    ) -> RouteCoordinate {
        let earthRadiusMetres = 6_371_000.0
        let bearing = bearingDegrees * .pi / 180
        let lat1 = coordinate.lat * .pi / 180
        let lon1 = coordinate.lng * .pi / 180
        let angularDistance = distanceMetres / earthRadiusMetres

        let lat2 = asin(
            sin(lat1) * cos(angularDistance) +
            cos(lat1) * sin(angularDistance) * cos(bearing)
        )
        let lon2 = lon1 + atan2(
            sin(bearing) * sin(angularDistance) * cos(lat1),
            cos(angularDistance) - sin(lat1) * sin(lat2)
        )

        return RouteCoordinate(lat: lat2 * 180 / .pi, lng: lon2 * 180 / .pi)
    }
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
    let shouldWriteLatestLocation: Bool
    let shouldWriteTrackPoint: Bool
    let pointId: String?

    var shouldWrite: Bool {
        shouldWriteLatestLocation || shouldWriteTrackPoint
    }
}

enum LiveLocationAccuracyQuality: Equatable {
    case reliable
    case degraded
    case unusable
}

enum LiveLocationAccuracyPolicy {
    static let reliableAccuracyMetres = 50.0
    static let roughAccuracyMetres = 150.0
    static let roughLatestLocationIntervalMilliseconds: Int64 = 20_000

    static func quality(for accuracy: Double) -> LiveLocationAccuracyQuality {
        guard accuracy.isFinite, accuracy >= 0 else {
            return .unusable
        }

        if accuracy <= reliableAccuracyMetres {
            return .reliable
        }

        if accuracy <= roughAccuracyMetres {
            return .degraded
        }

        return .unusable
    }

    static func canUseForSafetyCriticalAction(_ accuracy: Double) -> Bool {
        quality(for: accuracy) == .reliable
    }
}

struct LiveLocationWritePolicy: Equatable {
    let minimumIntervalMilliseconds: Int64
    let minimumDistanceMetres: Double

    init(minimumIntervalMilliseconds: Int64 = 5_000, minimumDistanceMetres: Double = 10) {
        self.minimumIntervalMilliseconds = minimumIntervalMilliseconds
        self.minimumDistanceMetres = minimumDistanceMetres
    }

    func decision(previous: LiveLocationSample?, current: LiveLocationSample) -> LiveLocationWriteDecision {
        switch LiveLocationAccuracyPolicy.quality(for: current.accuracy) {
        case .reliable:
            return reliableDecision(previous: previous, current: current)
        case .degraded:
            return degradedDecision(previous: previous, current: current)
        case .unusable:
            return LiveLocationWriteDecision(
                shouldWriteLatestLocation: false,
                shouldWriteTrackPoint: false,
                pointId: nil
            )
        }
    }

    private func reliableDecision(previous: LiveLocationSample?, current: LiveLocationSample) -> LiveLocationWriteDecision {
        guard let previous else {
            return LiveLocationWriteDecision(
                shouldWriteLatestLocation: true,
                shouldWriteTrackPoint: true,
                pointId: pointId(for: current)
            )
        }

        let elapsed = current.timestamp - previous.timestamp
        let distance = GPXDistanceCalculator.distanceMetres(for: [previous.coordinate, current.coordinate])
        let shouldWrite = elapsed >= minimumIntervalMilliseconds && distance >= minimumDistanceMetres
        return LiveLocationWriteDecision(
            shouldWriteLatestLocation: shouldWrite,
            shouldWriteTrackPoint: shouldWrite,
            pointId: shouldWrite ? pointId(for: current) : nil
        )
    }

    private func degradedDecision(previous: LiveLocationSample?, current: LiveLocationSample) -> LiveLocationWriteDecision {
        let shouldWriteLatestLocation: Bool
        if let previous {
            shouldWriteLatestLocation = current.timestamp - previous.timestamp >= LiveLocationAccuracyPolicy.roughLatestLocationIntervalMilliseconds
        } else {
            shouldWriteLatestLocation = true
        }

        return LiveLocationWriteDecision(
            shouldWriteLatestLocation: shouldWriteLatestLocation,
            shouldWriteTrackPoint: false,
            pointId: nil
        )
    }

    private func pointId(for sample: LiveLocationSample) -> String {
        "point_\(sample.timestamp)"
    }
}

protocol LiveLocationPersisting: Sendable {
    func writeLatestLocation(_ location: DriverLocation, runId: String, uid: String) async throws
    func writeTrackPoint(_ point: TrackPoint, pointId: String, runId: String, uid: String) async throws
    func updateDriverStats(_ stats: DriverStats, runId: String, uid: String) async throws
    func updatePresence(_ presence: DriverPresence, runId: String, uid: String) async throws
}

protocol HazardPersisting: Sendable {
    func writeHazard(_ hazard: Hazard, hazardId: String, runId: String) async throws
}

protocol HazardDismissing: Sendable {
    func dismissHazard(runId: String, hazardId: String) async throws
}

protocol RunEnding: Sendable {
    func endDrive(runId: String, endedAt: Int64) async throws
}

protocol RunSummaryPersisting: Sendable {
    func writeRunSummary(_ summary: RunSummary, runId: String) async throws
}

protocol PersonalSummaryPersisting: Sendable {
    func writePersonalSummary(_ summary: PersonalSummary, runId: String, uid: String) async throws
}

protocol DriverDriveSessionUpdating: Sendable {
    func finishDriver(runId: String, uid: String, finishedAt: Int64) async throws
    func leaveDriver(runId: String, uid: String, leftAt: Int64) async throws
}

extension RunRepositoring {
    func endDrive(runId: String, endedAt: Int64) async throws {
        guard let existingRun = try await readRun(runId: runId) else {
            return
        }

        let updatedRun = Run(
            name: existingRun.name,
            description: existingRun.description,
            joinCode: existingRun.joinCode,
            adminId: existingRun.adminId,
            status: .ended,
            createdAt: existingRun.createdAt,
            startedAt: existingRun.startedAt,
            driveStartedAt: existingRun.driveStartedAt,
            endedAt: endedAt,
            maxDrivers: existingRun.maxDrivers,
            route: existingRun.route,
            drivers: existingRun.drivers,
            hazards: existingRun.hazards,
            summary: existingRun.summary
        )

        try await writeRun(updatedRun, runId: runId)
    }

    func finishDriver(runId: String, uid: String, finishedAt: Int64) async throws {
        try await updateDriverSession(runId: runId, uid: uid, finishState: .finished, timestamp: finishedAt)
    }

    func leaveDriver(runId: String, uid: String, leftAt: Int64) async throws {
        try await updateDriverSession(runId: runId, uid: uid, finishState: .left, timestamp: leftAt)
    }

    private func updateDriverSession(
        runId: String,
        uid: String,
        finishState: DriverFinishState,
        timestamp: Int64
    ) async throws {
        guard let existingRun = try await readRun(runId: runId),
              let existingDriver = existingRun.drivers?[uid] else {
            return
        }

        let updatedDriver = DriverRecord(
            profile: existingDriver.profile,
            location: existingDriver.location,
            joinedAt: existingDriver.joinedAt,
            leftAt: finishState == .left ? timestamp : existingDriver.leftAt,
            presence: .offline,
            finishState: finishState,
            finishedAt: finishState == .finished ? timestamp : existingDriver.finishedAt,
            stats: existingDriver.stats
        )

        try await writeDriver(updatedDriver, runId: runId, uid: uid)
    }
}

enum LiveDriveArrivalPrompt: Equatable {
    case driverFinish
    case adminEndGroup
}

enum LiveDriveArrivalPolicy {
    static let destinationArrivalThresholdMetres = 150.0

    static func prompt(
        role: ActiveRunRole,
        runStatus: RunStatus?,
        finishState: DriverFinishState?,
        currentLocation: RouteCoordinate?,
        route: RouteData?
    ) -> LiveDriveArrivalPrompt? {
        guard runStatus == .active,
              finishState != .finished,
              finishState != .left,
              let currentLocation,
              let destination = destinationCoordinate(in: route)
        else {
            return nil
        }

        let distance = GPXDistanceCalculator.distanceMetres(for: [currentLocation, destination])
        guard distance <= destinationArrivalThresholdMetres else {
            return nil
        }

        switch role {
        case .admin:
            return .adminEndGroup
        case .driver:
            return .driverFinish
        }
    }

    private static func destinationCoordinate(in route: RouteData?) -> RouteCoordinate? {
        let destinationStop = route?.stops?
            .sorted { ($0.order ?? 0) < ($1.order ?? 0) }
            .last { $0.kind == .destination }

        if let lat = destinationStop?.lat, let lng = destinationStop?.lng {
            return RouteCoordinate(lat: lat, lng: lng)
        }

        guard let point = route?.points.last, point.count >= 2 else {
            return nil
        }

        return RouteCoordinate(lat: point[0], lng: point[1])
    }
}

enum LiveDriveDriverTimeoutPolicy {
    static let staleThresholdMilliseconds: Int64 = 120_000
    static let offlineThresholdMilliseconds: Int64 = 300_000

    static func markerState(
        for driver: DriverRecord,
        uid: String,
        currentUID: String,
        nowMilliseconds: Int64
    ) -> LiveDriveDriverState {
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

        let age = nowMilliseconds - timestamp
        if age >= offlineThresholdMilliseconds {
            return .offline
        }
        if age >= staleThresholdMilliseconds {
            return .stale
        }

        return .live
    }

    static func summaryStatus(for driver: DriverRecord, runStatus: RunStatus, generatedAt: Int64) -> SummaryDriverStatus {
        if driver.finishState == .finished {
            return .finished
        }
        if driver.finishState == .left {
            return .left
        }
        if driver.presence == .offline || driver.presence == nil {
            return .offline
        }
        if runStatus == .ended {
            return .endedWithGroup
        }

        guard let timestamp = driver.location?.timestamp else {
            return .stale
        }

        let age = generatedAt - timestamp
        if age >= offlineThresholdMilliseconds {
            return .offline
        }
        if age >= staleThresholdMilliseconds {
            return .stale
        }

        return .active
    }
}

enum RunSummaryCalculator {
    static func summary(for run: Run, generatedAt: Int64) -> RunSummary {
        let totalDistanceKm = kilometres(run.route?.distanceMetres ?? 0)
        let totalDriveTimeMinutes = driveTimeMinutes(for: run, generatedAt: generatedAt)
        let driverStats = Dictionary(uniqueKeysWithValues: (run.drivers ?? [:]).map { uid, driver in
            let personalSummary = personalSummary(
                for: driver,
                runStatus: run.status,
                generatedAt: generatedAt,
                fallbackDistanceKm: totalDistanceKm,
                fallbackDriveTimeMinutes: totalDriveTimeMinutes
            )
            return (uid, privacySafeGroupSummary(from: personalSummary))
        })
        let activeHazards = (run.hazards ?? [:]).values.filter { !$0.dismissed }
        let hazardCounts = activeHazards.reduce(into: [HazardType: Int]()) { result, hazard in
            result[hazard.type, default: 0] += 1
        }

        return RunSummary(
            totalDistanceKm: rounded(totalDistanceKm),
            totalDriveTimeMinutes: rounded(totalDriveTimeMinutes),
            driverStats: driverStats,
            collectiveFuel: CollectiveFuelSummary(petrolLitres: 0, dieselLitres: 0, hybridLitres: 0, electricKwh: 0),
            hazardSummary: HazardSummary(total: activeHazards.count, byType: hazardCounts),
            routePreview: routePreview(for: run.route),
            generatedAt: generatedAt
        )
    }

    static func personalSummary(for uid: String, in run: Run, generatedAt: Int64) -> PersonalSummary? {
        guard let driver = run.drivers?[uid] else {
            return nil
        }

        return personalSummary(
            for: driver,
            runStatus: run.status,
            generatedAt: generatedAt,
            fallbackDistanceKm: kilometres(run.route?.distanceMetres ?? 0),
            fallbackDriveTimeMinutes: driveTimeMinutes(for: run, generatedAt: generatedAt)
        )
    }

    private static func personalSummary(
        for driver: DriverRecord,
        runStatus: RunStatus,
        generatedAt: Int64,
        fallbackDistanceKm: Double,
        fallbackDriveTimeMinutes: Double
    ) -> PersonalSummary {
        let stats = driver.stats
        let driveTime = stats?.totalDriveTimeMinutes ?? fallbackDriveTimeMinutes
        let distance = stats?.totalDistanceKm ?? fallbackDistanceKm
        let avgMovingSpeedKmh = stats?.avgMovingSpeedMs.map { $0 * 3.6 }

        return PersonalSummary(
            name: driver.profile.displayName ?? driver.profile.name,
            carMake: driver.profile.carMake,
            carModel: driver.profile.carModel,
            badge: driver.profile.badge,
            driverStatus: LiveDriveDriverTimeoutPolicy.summaryStatus(for: driver, runStatus: runStatus, generatedAt: generatedAt),
            topSpeedKmh: stats?.topSpeed.map { $0 * 3.6 },
            avgMovingSpeedKmh: avgMovingSpeedKmh,
            totalDistanceKm: rounded(distance),
            totalDriveTimeMinutes: rounded(driveTime),
            movingTimeMinutes: stats?.movingTimeMinutes.map(rounded),
            stoppedTimeMinutes: stats?.stoppedTimeMinutes.map(rounded),
            stopCount: stats?.stopCount,
            avgStopTimeSec: stats?.avgStopTimeSec,
            maxGForce: stats?.maxGForce.map(rounded),
            fuelUsedLitres: nil,
            fuelUsedKwh: nil,
            fuelType: driver.profile.fuelType
        )
    }

    private static func privacySafeGroupSummary(from summary: PersonalSummary) -> PersonalSummary {
        PersonalSummary(
            name: summary.name,
            carMake: summary.carMake,
            carModel: summary.carModel,
            badge: summary.badge,
            driverStatus: summary.driverStatus,
            topSpeedKmh: nil,
            avgMovingSpeedKmh: nil,
            totalDistanceKm: nil,
            totalDriveTimeMinutes: nil,
            movingTimeMinutes: nil,
            stoppedTimeMinutes: nil,
            stopCount: nil,
            avgStopTimeSec: nil,
            maxGForce: nil,
            fuelUsedLitres: nil,
            fuelUsedKwh: nil,
            fuelType: summary.fuelType
        )
    }

    private static func driveTimeMinutes(for run: Run, generatedAt: Int64) -> Double {
        let start = run.driveStartedAt ?? run.startedAt ?? run.createdAt
        let end = run.endedAt ?? generatedAt
        return max(0, Double(end - start) / 60_000)
    }

    private static func routePreview(for route: RouteData?) -> SummaryRoutePreview? {
        guard let route else {
            return nil
        }

        return SummaryRoutePreview(points: route.points, speedBuckets: [])
    }

    private static func kilometres(_ metres: Double) -> Double {
        metres / 1_000
    }

    private static func rounded(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }
}

struct LiveDriveStatsAccumulator: Equatable {
    private static let movingSpeedThresholdMetresPerSecond = 1.0
    private static let gravityMetresPerSecondSquared = 9.80665

    private var firstTimestamp: Int64?
    private var previousSample: LiveLocationSample?
    private var topSpeedMetresPerSecond = 0.0
    private var movingSpeedTotal = 0.0
    private var movingSampleCount = 0
    private var distanceMetres = 0.0
    private var movingTimeSeconds = 0.0
    private var stoppedTimeSeconds = 0.0
    private var stopCount = 0
    private var currentStopDurationSeconds = 0.0
    private var completedStopDurationSeconds = 0.0
    private var maxGForce = 0.0
    private var wasStopped = false

    mutating func ingest(_ sample: LiveLocationSample) -> DriverStats? {
        guard LiveLocationAccuracyPolicy.quality(for: sample.accuracy) == .reliable else {
            return currentStats()
        }

        if firstTimestamp == nil {
            firstTimestamp = sample.timestamp
        }

        topSpeedMetresPerSecond = max(topSpeedMetresPerSecond, max(sample.speed, 0))
        if sample.speed > Self.movingSpeedThresholdMetresPerSecond {
            movingSpeedTotal += sample.speed
            movingSampleCount += 1
        }

        let isStopped = sample.speed <= Self.movingSpeedThresholdMetresPerSecond
        if previousSample == nil, isStopped {
            stopCount += 1
        }

        if let previousSample {
            let elapsedSeconds = max(0, Double(sample.timestamp - previousSample.timestamp) / 1_000)
            let segmentDistance = GPXDistanceCalculator.distanceMetres(for: [previousSample.coordinate, sample.coordinate])
            distanceMetres += segmentDistance

            if isStopped {
                stoppedTimeSeconds += elapsedSeconds
                currentStopDurationSeconds += elapsedSeconds
                if !wasStopped {
                    stopCount += 1
                }
            } else {
                movingTimeSeconds += elapsedSeconds
                if wasStopped {
                    completedStopDurationSeconds += currentStopDurationSeconds
                    currentStopDurationSeconds = 0
                }
            }

            if elapsedSeconds > 0 {
                let acceleration = abs(sample.speed - previousSample.speed) / elapsedSeconds
                maxGForce = max(maxGForce, acceleration / Self.gravityMetresPerSecondSquared)
            }
        }

        wasStopped = isStopped
        previousSample = sample
        return currentStats()
    }

    func currentStats() -> DriverStats? {
        guard firstTimestamp != nil else {
            return nil
        }

        let totalStopSeconds = completedStopDurationSeconds + currentStopDurationSeconds
        let avgStopTimeSec: Double? = stopCount > 0 ? totalStopSeconds / Double(stopCount) : nil
        let avgMovingSpeedMs: Double? = movingSampleCount > 0 ? movingSpeedTotal / Double(movingSampleCount) : nil

        return DriverStats(
            topSpeed: rounded(topSpeedMetresPerSecond),
            avgMovingSpeedMs: avgMovingSpeedMs.map(rounded),
            totalDistanceKm: rounded(distanceMetres / 1_000),
            totalDriveTimeMinutes: rounded((movingTimeSeconds + stoppedTimeSeconds) / 60),
            movingTimeMinutes: rounded(movingTimeSeconds / 60),
            stoppedTimeMinutes: rounded(stoppedTimeSeconds / 60),
            stopCount: stopCount,
            avgStopTimeSec: avgStopTimeSec.map(rounded),
            maxGForce: rounded(maxGForce)
        )
    }

    private func rounded(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }
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
    private var statsAccumulator = LiveDriveStatsAccumulator()

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
        guard isTracking else {
            return
        }

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
        guard decision.shouldWrite else {
            return
        }

        do {
            if decision.shouldWriteLatestLocation {
                try await repository.writeLatestLocation(sample.driverLocation, runId: runId, uid: uid)
            }
            if decision.shouldWriteTrackPoint, let pointId = decision.pointId {
                try await repository.writeTrackPoint(sample.trackPoint, pointId: pointId, runId: runId, uid: uid)
                if let stats = statsAccumulator.ingest(sample) {
                    try await repository.updateDriverStats(stats, runId: runId, uid: uid)
                }
            }
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
    var currentPermissionState: LiveLocationPermissionState { get }
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

    var currentPermissionState: LiveLocationPermissionState {
        permissionState(for: manager)
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
                    state: LiveDriveDriverTimeoutPolicy.markerState(
                        for: driver,
                        uid: uid,
                        currentUID: currentUID,
                        nowMilliseconds: nowMilliseconds
                    ),
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

    private static func freshnessText(for timestamp: Int64, nowMilliseconds: Int64) -> String {
        let seconds = max(0, (nowMilliseconds - timestamp) / 1_000)
        if seconds < 60 {
            return "Updated just now"
        }

        return "Updated \(seconds / 60)m ago"
    }
}

enum LiveDriveHazardMarkerFactory {
    static func markers(for run: Run, nowMilliseconds: Int64) -> [LiveDriveHazardMarker] {
        (run.hazards ?? [:])
            .filter { LiveDriveHazardExpiryPolicy.isVisible($0.value, nowMilliseconds: nowMilliseconds) }
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
            reportedBy: hazard.reportedBy,
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

enum LiveDriveHazardExpiryPolicy {
    static let displayWindowMilliseconds: Int64 = 30 * 60 * 1_000

    static func isVisible(_ hazard: Hazard, nowMilliseconds: Int64) -> Bool {
        guard !hazard.dismissed else {
            return false
        }

        return nowMilliseconds - hazard.timestamp <= displayWindowMilliseconds
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
    @Published private(set) var hazardConfirmationText: String?
    @Published private(set) var locationAccuracyMessage: String?
    @Published private(set) var cameraTarget: LiveDriveCameraTarget?
    @Published private(set) var isFollowingCurrentUser = false
    @Published private(set) var isHazardAudioMuted = false
    @Published private(set) var hazardAlertAudioMode: HazardAlertAudioMode
    @Published private(set) var arrivalPrompt: LiveDriveArrivalPrompt?
    @Published var selectedDriver: LiveDriveDriverMarker?
    @Published var selectedHazard: LiveDriveHazardMarker?

    let role: ActiveRunRole
    let locationController: LiveLocationTrackingController?
    let hazardOptions = LiveDriveHazardOption.v1

    private let uid: String
    private let runId: String
    private let runReader: RunReading
    private let runObserver: RunObserving?
    private let runEnding: RunEnding?
    private let summaryPersisting: RunSummaryPersisting?
    private let personalSummaryPersisting: PersonalSummaryPersisting?
    private let driverSessionUpdater: DriverDriveSessionUpdating?
    private let activeRunStore: ActiveRunStoring?
    private let router: AppRouter?
    private let hazardRepository: HazardPersisting?
    private let hazardDismissing: HazardDismissing?
    private let hazardAudioAlert: LiveDriveHazardAudioAlerting?
    private let nowMilliseconds: @Sendable () -> Int64
    private var currentRunStatus: RunStatus?
    private var currentFinishState: DriverFinishState?
    private var currentRun: Run?
    private var lastLocationSpeed: Double?
    private var lastMapInteractionAt: Int64?
    private var isAutoFollowPausedByInteraction = false
    private var reporterName = "Driver"
    private var runObservation: RunObservation?
    private var hasLoadedInitialHazardSnapshot = false
    private var alertedHazardIds = Set<String>()
    private var hasFinishedDriveLocally = false

    init(
        uid: String,
        runId: String,
        role: ActiveRunRole,
        runReader: RunReading,
        runObserver: RunObserving? = nil,
        runEnding: RunEnding? = nil,
        summaryPersisting: RunSummaryPersisting? = nil,
        personalSummaryPersisting: PersonalSummaryPersisting? = nil,
        driverSessionUpdater: DriverDriveSessionUpdating? = nil,
        activeRunStore: ActiveRunStoring? = nil,
        router: AppRouter? = nil,
        liveLocationRepository: LiveLocationPersisting? = nil,
        hazardRepository: HazardPersisting? = nil,
        hazardDismissing: HazardDismissing? = nil,
        hazardAudioAlert: LiveDriveHazardAudioAlerting? = SystemLiveDriveHazardAudioAlert(),
        hazardAlertAudioMode: HazardAlertAudioMode = .announced,
        nowMilliseconds: @escaping @Sendable () -> Int64 = {
            Int64(Date().timeIntervalSince1970 * 1_000)
        }
    ) {
        self.uid = uid
        self.runId = runId
        self.role = role
        self.runReader = runReader
        self.runObserver = runObserver
        self.runEnding = runEnding
        self.summaryPersisting = summaryPersisting
        self.personalSummaryPersisting = personalSummaryPersisting
        self.driverSessionUpdater = driverSessionUpdater
        self.activeRunStore = activeRunStore
        self.router = router
        self.hazardRepository = hazardRepository
        self.hazardDismissing = hazardDismissing
        self.hazardAudioAlert = hazardAudioAlert
        self.hazardAlertAudioMode = hazardAlertAudioMode
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

            await applyRun(run)
        } catch {
            message = "Unable to load drive."
        }
    }

    func startObservingRun() {
        guard runObservation == nil, let runObserver else {
            return
        }

        runObservation = runObserver.observeRun(runId: runId) { [weak self] result in
            Task { @MainActor in
                guard let self else {
                    return
                }

                guard !self.hasFinishedDriveLocally else {
                    return
                }

                switch result {
                case let .success(run?):
                    await self.applyRun(run)
                case .success(nil):
                    self.message = "Unable to load drive."
                case let .failure(error):
                    self.message = Self.driveUpdateFailureMessage(for: error)
                }
            }
        }
    }

    private static func driveUpdateFailureMessage(for error: Error) -> String {
#if DEBUG
        if let decodingError = error as? DecodingError {
            return "Unable to update drive. \(decodingError.clubRunDebugSummary)"
        }

        let description = error.localizedDescription
        guard !description.isEmpty else {
            return "Unable to update drive."
        }

        return "Unable to update drive. \(description)"
#else
        return "Unable to update drive."
#endif
    }

    func stopObservingRun() {
        runObservation?.cancel()
        runObservation = nil
    }

    func reportHazard(_ type: HazardType) async {
        guard let marker = currentUserMarker else {
            message = "Waiting for your location."
            return
        }

        guard LiveLocationAccuracyPolicy.canUseForSafetyCriticalAction(marker.accuracy) else {
            message = "Location accuracy is too low to report a hazard."
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
            hazardConfirmationText = "\(LiveDriveHazardOption.option(for: type).title) reported"
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
        isAutoFollowPausedByInteraction = false
        lastMapInteractionAt = nil
        cameraTarget = cameraTarget(for: currentUserMarker, speed: lastLocationSpeed)
        message = nil
    }

    func recordMapInteraction(nowMilliseconds: Int64? = nil) {
        guard isFollowingCurrentUser || isAutoFollowPausedByInteraction else {
            return
        }

        isFollowingCurrentUser = false
        isAutoFollowPausedByInteraction = true
        lastMapInteractionAt = nowMilliseconds ?? self.nowMilliseconds()
    }

    func resumeFollowAfterInteractionDelay(nowMilliseconds: Int64? = nil) {
        let now = nowMilliseconds ?? self.nowMilliseconds()
        guard LiveDriveFollowCameraPolicy.canResumeAfterInteraction(
            lastInteractionAt: lastMapInteractionAt,
            nowMilliseconds: now,
            isMoving: LiveDriveFollowCameraPolicy.isMoving(speed: lastLocationSpeed ?? 0),
            hasLocation: currentUserMarker != nil,
            hasModalOpen: selectedDriver != nil || selectedHazard != nil,
            runStatus: currentRunStatus
        ), let currentUserMarker else {
            return
        }

        isFollowingCurrentUser = true
        isAutoFollowPausedByInteraction = false
        lastMapInteractionAt = nil
        cameraTarget = cameraTarget(for: currentUserMarker, speed: lastLocationSpeed)
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

    func dismissSelectedHazard() async {
        guard role == .admin else {
            message = "Only admins can dismiss hazards."
            return
        }

        guard let selectedHazard else {
            return
        }

        guard let hazardDismissing else {
            message = "Unable to dismiss hazard."
            return
        }

        do {
            try await hazardDismissing.dismissHazard(runId: runId, hazardId: selectedHazard.id)
            hazardMarkers.removeAll { $0.id == selectedHazard.id }
            self.selectedHazard = nil
            hazardConfirmationText = "Hazard dismissed"
            message = nil
        } catch {
            message = "Unable to dismiss hazard."
        }
    }

    func clearMessage() {
        message = nil
    }

    func clearHazardConfirmation() {
        hazardConfirmationText = nil
    }

    func toggleHazardAudioMuted() {
        isHazardAudioMuted.toggle()
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
        updateLocationAccuracyMessage(for: sample.accuracy)
        lastLocationSpeed = sample.speed
        currentUserMarker = marker
        if isFollowingCurrentUser || (!isAutoFollowPausedByInteraction && LiveDriveFollowCameraPolicy.isMoving(speed: sample.speed)) {
            isFollowingCurrentUser = true
            cameraTarget = cameraTarget(for: marker, speed: sample.speed)
        }
        playActionableHazardAlertsIfNeeded()
        evaluateArrivalPrompt()

        await locationController?.ingest(
            sample,
            runStatus: currentRunStatus ?? .ended,
            finishState: currentFinishState
        )
    }

    func stopLocationTracking() async {
        await locationController?.stop()
    }

    func endDrive() async {
        guard role == .admin else {
            message = "Only the run admin can end the drive."
            return
        }

        guard let runEnding else {
            message = "Unable to end drive."
            return
        }

        do {
            let endedAt = nowMilliseconds()
            let runForSummary: Run?
            if let currentRun {
                runForSummary = currentRun
            } else {
                runForSummary = try await runReader.readRun(runId: runId)
            }
            if let runForSummary, let summaryPersisting {
                let summaryRun = Run(
                    name: runForSummary.name,
                    description: runForSummary.description,
                    joinCode: runForSummary.joinCode,
                    adminId: runForSummary.adminId,
                    status: .ended,
                    createdAt: runForSummary.createdAt,
                    startedAt: runForSummary.startedAt,
                    driveStartedAt: runForSummary.driveStartedAt,
                    endedAt: endedAt,
                    maxDrivers: runForSummary.maxDrivers,
                    route: runForSummary.route,
                    drivers: runForSummary.drivers,
                    hazards: runForSummary.hazards,
                    summary: runForSummary.summary
                )
                try? await summaryPersisting.writeRunSummary(
                    RunSummaryCalculator.summary(for: summaryRun, generatedAt: endedAt),
                    runId: runId
                )
            }
            try await runEnding.endDrive(runId: runId, endedAt: endedAt)
            await locationController?.stop()
            finishDriveLocally(routeToSummary: true)
        } catch {
            message = "Unable to end drive."
        }
    }

    func finishDriverDrive() async {
        guard role == .driver else {
            message = "Use End to finish the run for everyone."
            return
        }

        guard let driverSessionUpdater else {
            message = "Unable to finish drive."
            return
        }

        do {
            let finishedAt = nowMilliseconds()
            try await persistPersonalSummaryIfAvailable(generatedAt: finishedAt)
            try await driverSessionUpdater.finishDriver(runId: runId, uid: uid, finishedAt: finishedAt)
            currentFinishState = .finished
            await locationController?.stop()
            finishDriveLocally(routeToSummary: true)
        } catch {
            message = "Unable to finish drive."
        }
    }

    func leaveDriverDrive() async {
        guard role == .driver else {
            message = "Admins should end the drive instead of leaving it."
            return
        }

        guard let driverSessionUpdater else {
            message = "Unable to leave drive."
            return
        }

        do {
            let leftAt = nowMilliseconds()
            try await persistPersonalSummaryIfAvailable(generatedAt: leftAt)
            try await driverSessionUpdater.leaveDriver(runId: runId, uid: uid, leftAt: leftAt)
            currentFinishState = .left
            await locationController?.stop()
            finishDriveLocally(routeToSummary: true)
        } catch {
            message = "Unable to leave drive."
        }
    }

    private func persistPersonalSummaryIfAvailable(generatedAt: Int64) async throws {
        guard let personalSummaryPersisting else {
            return
        }

        let run: Run?
        if let currentRun {
            run = currentRun
        } else {
            run = try await runReader.readRun(runId: runId)
        }

        guard let run,
              let summary = RunSummaryCalculator.personalSummary(for: uid, in: run, generatedAt: generatedAt)
        else {
            return
        }

        try await personalSummaryPersisting.writePersonalSummary(summary, runId: runId, uid: uid)
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

    private func applyRun(_ run: Run) async {
        currentRun = run
        currentRunStatus = run.status
        currentFinishState = run.drivers?[uid]?.finishState
        if run.status == .ended {
            await locationController?.stop()
            finishDriveLocally(routeToSummary: true)
            return
        }

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
        hazardMarkers = LiveDriveHazardMarkerFactory.markers(for: run, nowMilliseconds: now)
        if hasLoadedInitialHazardSnapshot {
            playActionableHazardAlertsIfNeeded()
        } else {
            hasLoadedInitialHazardSnapshot = true
        }
        updateSelectionsFromLatestMarkers()
        statusTitle = LiveDriveStatusFormatter.statusTitle(for: run)
        nextWaypointText = LiveDriveStatusFormatter.nextWaypointText(
            for: run,
            currentLocation: driverMarkers.first { $0.id == uid }?.coordinate
        )
        evaluateArrivalPrompt()
        if isFollowingCurrentUser, let currentUserMarker {
            cameraTarget = cameraTarget(for: currentUserMarker, speed: lastLocationSpeed)
        }
        message = nil
    }

    func clearArrivalPrompt() {
        arrivalPrompt = nil
    }

    func confirmArrivalPrompt() async {
        guard let arrivalPrompt else {
            return
        }

        self.arrivalPrompt = nil
        switch arrivalPrompt {
        case .driverFinish:
            await finishDriverDrive()
        case .adminEndGroup:
            await endDrive()
        }
    }

    private func evaluateArrivalPrompt() {
        guard arrivalPrompt == nil else {
            return
        }

        guard let currentUserMarker,
              LiveLocationAccuracyPolicy.canUseForSafetyCriticalAction(currentUserMarker.accuracy) else {
            return
        }

        arrivalPrompt = LiveDriveArrivalPolicy.prompt(
            role: role,
            runStatus: currentRunStatus,
            finishState: currentFinishState,
            currentLocation: currentUserMarker.coordinate,
            route: currentRun?.route
        )
    }

    private func updateLocationAccuracyMessage(for accuracy: Double) {
        switch LiveLocationAccuracyPolicy.quality(for: accuracy) {
        case .reliable:
            locationAccuracyMessage = nil
        case .degraded:
            locationAccuracyMessage = "Location accuracy low"
        case .unusable:
            locationAccuracyMessage = "Location unavailable"
        }
    }

    private func finishDriveLocally(routeToSummary: Bool) {
        guard !hasFinishedDriveLocally else {
            return
        }

        hasFinishedDriveLocally = true
        activeRunStore?.clearActiveRunSession(uid: uid)
        stopObservingRun()
        if routeToSummary {
            router?.present(.summary(runId: runId))
        } else {
            router?.dismissPresentedRoute()
        }
    }

    private func updateSelectionsFromLatestMarkers() {
        if let selectedDriver {
            self.selectedDriver = driverMarkers.first { $0.id == selectedDriver.id }
        }
        if let selectedHazard {
            self.selectedHazard = hazardMarkers.first { $0.id == selectedHazard.id }
        }
    }

    private func reporterName(from driver: DriverRecord?) -> String {
        guard let driver else {
            return "Driver"
        }

        return driver.profile.displayName ?? driver.profile.name
    }

    private func cameraTarget(for marker: LiveDriveCurrentUserMarker, speed: Double? = nil) -> LiveDriveCameraTarget {
        LiveDriveCameraTarget(
            center: LiveDriveFollowCameraPolicy.cameraCenter(
                for: marker.coordinate,
                heading: marker.heading,
                speed: speed
            ),
            heading: marker.heading,
            distanceMetres: LiveDriveFollowCameraPolicy.distanceMetres(for: speed)
        )
    }

    private func playActionableHazardAlertsIfNeeded() {
        let events = LiveDriveHazardAlertPolicy.actionableRemoteHazards(
            from: hazardMarkers,
            currentLocation: currentUserMarker?.coordinate,
            currentUID: uid,
            alertedHazardIds: alertedHazardIds
        )
        guard !events.isEmpty else {
            return
        }

        events.forEach { alertedHazardIds.insert($0.hazardId) }
        guard !isHazardAudioMuted else {
            return
        }

        hazardAudioAlert?.playHazardAlert(for: events[0].type, mode: hazardAlertAudioMode)
    }
}

struct LiveDriveView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject var viewModel: LiveDriveViewModel
    @State private var foregroundLocationService = CoreLocationForegroundLocationService()
    @State private var mapPosition: MapCameraPosition = .automatic
    @State private var showsEndDriveConfirmation = false
    @State private var showsLeaveDriveConfirmation = false
    @State private var isHazardRailExpanded = false
    @State private var visibleMapHeading = 0.0
    @State private var hazardConfirmationDismissTask: Task<Void, Never>?
    @State private var mapInteractionResumeTask: Task<Void, Never>?

    var body: some View {
        ZStack {
            LiveDriveMap(
                routeCoordinates: viewModel.routeCoordinates,
                routeEndpointMarkers: viewModel.routeEndpointMarkers,
                currentUserMarker: viewModel.currentUserMarker,
                currentMapHeading: visibleMapHeading,
                driverMarkers: viewModel.driverMarkers,
                hazardMarkers: viewModel.hazardMarkers,
                mapPosition: $mapPosition,
                onDriverTap: viewModel.selectDriver,
                onHazardTap: viewModel.selectHazard,
                onMapInteraction: handleMapInteraction,
                onCameraHeadingChange: { heading in
                    visibleMapHeading = heading
                }
            )
            .ignoresSafeArea()
            .accessibilityIdentifier("liveDrive.map")

            VStack(spacing: 0) {
                LiveDriveStatusOverlay(
                    title: viewModel.statusTitle,
                    subtitle: viewModel.nextWaypointText,
                    accuracyMessage: viewModel.locationAccuracyMessage,
                    role: viewModel.role,
                    onEndDrive: {
                        showsEndDriveConfirmation = true
                    },
                    onFinishDrive: {
                        Task {
                            await viewModel.finishDriverDrive()
                        }
                    },
                    onLeaveDrive: {
                        showsLeaveDriveConfirmation = true
                    }
                )
                .padding(.horizontal, 14)
                .padding(.top, 12)

                Spacer()

                ZStack(alignment: .bottom) {
                    LiveDriveBottomControls {
                        viewModel.locateCurrentUser()
                    }

                    if let confirmationText = viewModel.hazardConfirmationText {
                        LiveDriveConfirmationToast(text: confirmationText)
                            .padding(.bottom, 144)
                            .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
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
                                    updateHazardRail {
                                        isHazardRailExpanded = false
                                    }
                                }
                            }
                            .padding(.trailing, 66)

                            VStack(spacing: 12) {
                                Button {
                                    viewModel.toggleHazardAudioMuted()
                                } label: {
                                    Image(systemName: viewModel.isHazardAudioMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(viewModel.isHazardAudioMuted ? .secondary : .primary)
                                        .frame(width: 42, height: 42)
                                        .liveDriveGlassSurface(Circle(), tintOpacity: 0.84, strokeOpacity: 0.75, strokeWidth: 1.5)
                                        .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
                                }
                                .accessibilityLabel(viewModel.isHazardAudioMuted ? "Unmute hazard alerts" : "Mute hazard alerts")
                                .accessibilityIdentifier("liveDrive.hazardMuteButton")

                                Button {
                                    updateHazardRail {
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
                                        .rotationEffect(.degrees(!reduceMotion && isHazardRailExpanded ? 180 : 0))
                                }
                                .accessibilityLabel("Report Hazard")
                                .accessibilityIdentifier("liveDrive.hazardButton")
                            }
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
            viewModel.startObservingRun()
            configureForegroundLocationService()
            foregroundLocationService.requestWhenInUseAuthorization()
            foregroundLocationService.startUpdating()
        }
        .onDisappear {
            foregroundLocationService.stopUpdating()
            hazardConfirmationDismissTask?.cancel()
            mapInteractionResumeTask?.cancel()
            viewModel.stopObservingRun()
            Task {
                await viewModel.stopLocationTracking()
            }
        }
        .onChange(of: viewModel.hazardConfirmationText) { _, text in
            hazardConfirmationDismissTask?.cancel()
            guard text != nil else {
                return
            }

            hazardConfirmationDismissTask = Task {
                try? await Task.sleep(nanoseconds: 1_600_000_000)
                guard !Task.isCancelled else {
                    return
                }

                await MainActor.run {
                    updateHazardConfirmation {
                        viewModel.clearHazardConfirmation()
                    }
                }
            }
        }
        .sheet(item: $viewModel.selectedDriver) { marker in
            LiveDriveDriverDetailView(marker: marker)
        }
        .sheet(item: $viewModel.selectedHazard) { marker in
            LiveDriveHazardDetailView(
                marker: marker,
                canDismiss: viewModel.role == .admin,
                onDismiss: {
                    Task {
                        await viewModel.dismissSelectedHazard()
                    }
                }
            )
        }
        .onChange(of: viewModel.cameraTarget) { _, cameraTarget in
            guard let cameraTarget else {
                return
            }

            mapPosition = .camera(cameraTarget.mapCamera)
        }
        .confirmationDialog("End this drive?", isPresented: $showsEndDriveConfirmation) {
            Button("End Drive", role: .destructive) {
                Task {
                    await viewModel.endDrive()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will end the run for every joined driver.")
        }
        .confirmationDialog("Leave this drive?", isPresented: $showsLeaveDriveConfirmation) {
            Button("Leave Drive", role: .destructive) {
                Task {
                    await viewModel.leaveDriverDrive()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This stops your location sharing and removes this run from your active session.")
        }
        .confirmationDialog(
            arrivalPromptTitle,
            isPresented: Binding(
                get: { viewModel.arrivalPrompt != nil },
                set: { isPresented in
                    if !isPresented {
                        viewModel.clearArrivalPrompt()
                    }
                }
            )
        ) {
            Button(arrivalPromptActionTitle) {
                Task {
                    await viewModel.confirmArrivalPrompt()
                }
            }
            Button("Not Yet", role: .cancel) {
                viewModel.clearArrivalPrompt()
            }
        } message: {
            Text(arrivalPromptMessage)
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

    private var arrivalPromptTitle: String {
        switch viewModel.arrivalPrompt {
        case .adminEndGroup:
            "End group drive?"
        case .driverFinish:
            "Finish your drive?"
        case nil:
            "Destination reached"
        }
    }

    private var arrivalPromptActionTitle: String {
        switch viewModel.arrivalPrompt {
        case .adminEndGroup:
            "End Group Drive"
        case .driverFinish:
            "Finish Drive"
        case nil:
            "Continue"
        }
    }

    private var arrivalPromptMessage: String {
        switch viewModel.arrivalPrompt {
        case .adminEndGroup:
            "You are near the final destination. Ending will stop the run for every joined driver."
        case .driverFinish:
            "You are near the final destination. Finishing stops your location sharing."
        case nil:
            ""
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
        Task {
            await viewModel.updateLocationPermission(foregroundLocationService.currentPermissionState)
        }
    }

    private func handleMapInteraction() {
        viewModel.recordMapInteraction()
        mapInteractionResumeTask?.cancel()
        mapInteractionResumeTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(LiveDriveFollowCameraPolicy.interactionResumeDelayMilliseconds) * 1_000_000)
            guard !Task.isCancelled else {
                return
            }

            await MainActor.run {
                viewModel.resumeFollowAfterInteractionDelay()
            }
        }
    }

    private func updateHazardRail(_ updates: () -> Void) {
        guard !reduceMotion else {
            updates()
            return
        }

        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
            updates()
        }
    }

    private func updateHazardConfirmation(_ updates: () -> Void) {
        guard !reduceMotion else {
            updates()
            return
        }

        withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
            updates()
        }
    }
}

private struct LiveDriveHazardRail: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
                .scaleEffect(reduceMotion || isExpanded ? 1 : 0.35)
                .opacity(isExpanded ? 1 : 0)
                .offset(x: reduceMotion || isExpanded ? 0 : CGFloat((options.count - index) * 44))
                .animation(
                    reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.82)
                        .delay(isExpanded ? Double(index) * 0.018 : Double(options.count - index) * 0.01),
                    value: isExpanded
                )
            }
        }
        .allowsHitTesting(isExpanded)
        .accessibilityIdentifier("liveDrive.hazardRail")
    }
}

private struct LiveDriveConfirmationToast: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "checkmark.circle.fill")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.primary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .liveDriveGlassSurface(Capsule(), tintOpacity: 0.88)
            .shadow(color: .black.opacity(0.14), radius: 10, y: 4)
            .accessibilityIdentifier("liveDrive.hazardConfirmation")
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
    let onMapInteraction: () -> Void
    let onCameraHeadingChange: (Double) -> Void

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
        .onMapCameraChange(frequency: .continuous) { context in
            onCameraHeadingChange(context.camera.heading)
            if mapPosition.positionedByUser {
                onMapInteraction()
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
            .liveDriveGlassSurface(Circle(), tintOpacity: 0.86, strokeOpacity: 0.9, strokeWidth: 2)
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
    let accuracyMessage: String?
    let role: ActiveRunRole
    let onEndDrive: () -> Void
    let onFinishDrive: () -> Void
    let onLeaveDrive: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
                if let accuracyMessage {
                    Text(accuracyMessage)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(statusAccessibilityLabel)

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
                .accessibilityLabel("End drive")
                .accessibilityIdentifier("liveDrive.endDriveButton")
            } else {
                HStack(spacing: 8) {
                    Button("Finish") {
                        onFinishDrive()
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(.green.opacity(0.16), in: Capsule())
                    .foregroundStyle(.green)
                    .accessibilityLabel("Finish drive")
                    .accessibilityIdentifier("liveDrive.finishDriveButton")

                    Button("Leave") {
                        onLeaveDrive()
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(.red.opacity(0.12), in: Capsule())
                    .foregroundStyle(.red)
                    .accessibilityLabel("Leave drive")
                    .accessibilityIdentifier("liveDrive.leaveDriveButton")
                }
            }
        }
        .padding(14)
        .liveDriveGlassSurface(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
        .accessibilityIdentifier("liveDrive.statusOverlay")
    }

    private var statusAccessibilityLabel: String {
        if let accuracyMessage {
            "\(title). \(subtitle). \(accuracyMessage)"
        } else {
            "\(title). \(subtitle)"
        }
    }
}

private struct LiveDriveBottomControls: View {
    let onRecenter: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            LiveDriveRoundControlButton(
                systemName: "location.fill",
                accessibilityLabel: "Recenter on my location",
                action: onRecenter
            )

            LiveDriveRoundControlButton(
                systemName: "list.bullet",
                accessibilityLabel: "Drive details",
                action: {}
            )
        }
        .padding(10)
        .liveDriveGlassSurface(RoundedRectangle(cornerRadius: 18, style: .continuous), tintOpacity: 0.88)
        .shadow(color: .black.opacity(0.16), radius: 14, y: 5)
        .accessibilityIdentifier("liveDrive.bottomControls")
    }
}

private struct LiveDriveRoundControlButton: View {
    let systemName: String
    let accessibilityLabel: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.blue)
                .frame(width: 56, height: 56)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .strokeBorder(.white.opacity(0.36), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
    }
}

private struct LiveDriveDriverDetailView: View {
    let marker: LiveDriveDriverMarker

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(spacing: 14) {
                            Text(marker.badgeText)
                                .font(.title3.weight(.bold))
                                .foregroundStyle(.white)
                                .frame(width: 58, height: 58)
                                .background(Color(hex: marker.badgeColorHex), in: Circle())
                                .overlay(Circle().stroke(.white.opacity(0.82), lineWidth: 2))
                                .shadow(color: .black.opacity(0.14), radius: 8, y: 3)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(marker.displayName)
                                    .font(.title2.weight(.bold))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.82)
                                Text(marker.vehicle)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()
                        }

                        VStack(spacing: 10) {
                            LiveDriveHazardDetailRow(title: "Status", value: marker.state.label)
                            LiveDriveHazardDetailRow(title: "Location", value: marker.freshnessText)
                        }
                    }
                    .padding(18)
                    .liveDriveGlassSurface(RoundedRectangle(cornerRadius: 28, style: .continuous), tintOpacity: 0.9)
                    .accessibilityElement(children: .combine)

                    Text(driverStateHelpText)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 4)
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 28)
            }
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .navigationTitle("Driver")
        }
    }

    private var driverStateHelpText: String {
        switch marker.state {
        case .current:
            "This is your live position."
        case .live:
            "This driver is sharing a recent live position."
        case .stale:
            "This driver has not sent a fresh position recently."
        case .offline:
            "This driver is currently offline."
        case .stopped:
            "This driver has finished or left the drive."
        }
    }
}

private struct LiveDriveHazardDetailView: View {
    let marker: LiveDriveHazardMarker
    let canDismiss: Bool
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(alignment: .top, spacing: 14) {
                            Image(systemName: marker.iconSystemName)
                                .font(.title2.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(width: 58, height: 58)
                                .background(Color(hex: marker.colorHex), in: Circle())
                                .overlay(Circle().stroke(.white.opacity(0.88), lineWidth: 2))
                                .shadow(color: .black.opacity(0.14), radius: 8, y: 3)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(marker.title)
                                    .font(.title2.weight(.bold))
                                    .lineLimit(2)
                                    .minimumScaleFactor(0.82)
                                Text(marker.detail)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()
                        }

                        VStack(spacing: 10) {
                            LiveDriveHazardDetailRow(title: "Reported by", value: marker.reporterName)
                            LiveDriveHazardDetailRow(title: "Reports", value: "\(marker.reportCount)")
                            LiveDriveHazardDetailRow(title: "Time", value: reportedTimeText)
                        }
                    }
                    .padding(18)
                    .liveDriveGlassSurface(RoundedRectangle(cornerRadius: 28, style: .continuous), tintOpacity: 0.9)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(
                        "\(marker.title). \(marker.detail). Reported by \(marker.reporterName). \(marker.reportCount) reports. Reported at \(reportedTimeText)."
                    )

                    if canDismiss {
                        Button(role: .destructive, action: onDismiss) {
                            LiveDriveDestructiveActionLabel(title: "Dismiss Hazard", systemName: "xmark.circle.fill")
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("liveDrive.dismissHazardButton")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 28)
            }
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .navigationTitle("Hazard")
        }
    }

    private var reportedTimeText: String {
        let date = Date(timeIntervalSince1970: TimeInterval(marker.reportedAt) / 1_000)
        return date.formatted(date: .omitted, time: .shortened)
    }
}

private struct LiveDriveDestructiveActionLabel: View {
    let title: String
    let systemName: String

    var body: some View {
        Label(title, systemImage: systemName)
            .font(.headline.weight(.semibold))
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .padding(.horizontal, 18)
            .background(Color.red.opacity(0.12), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(Color.red.opacity(0.28), lineWidth: 1)
            }
    }
}

private struct LiveDriveHazardDetailRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            Spacer(minLength: 12)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .multilineTextAlignment(.trailing)
                .lineLimit(2)
                .minimumScaleFactor(0.82)
        }
        .padding(.vertical, 3)
    }
}

private struct LiveDriveGlassSurface<S: InsettableShape>: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    let shape: S
    let tintOpacity: Double
    let strokeOpacity: Double
    let strokeWidth: CGFloat

    func body(content: Content) -> some View {
        content
            .background {
                if reduceTransparency || colorSchemeContrast == .increased {
                    shape.fill(Color(.systemBackground).opacity(colorSchemeContrast == .increased ? 0.98 : tintOpacity))
                } else {
                    shape.fill(.thinMaterial)
                }
            }
            .overlay {
                shape.strokeBorder(
                    borderColor,
                    lineWidth: colorSchemeContrast == .increased ? max(strokeWidth, 1.5) : strokeWidth
                )
            }
    }

    private var borderColor: Color {
        if colorSchemeContrast == .increased {
            return .primary.opacity(0.34)
        }

        return .white.opacity(strokeOpacity)
    }
}

private extension View {
    func liveDriveGlassSurface<S: InsettableShape>(
        _ shape: S,
        tintOpacity: Double = 0.86,
        strokeOpacity: Double = 0.45,
        strokeWidth: CGFloat = 1
    ) -> some View {
        modifier(
            LiveDriveGlassSurface(
                shape: shape,
                tintOpacity: tintOpacity,
                strokeOpacity: strokeOpacity,
                strokeWidth: strokeWidth
            )
        )
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
