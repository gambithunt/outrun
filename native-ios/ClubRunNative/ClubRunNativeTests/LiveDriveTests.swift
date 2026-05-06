import XCTest
@testable import ClubRunNative

@MainActor
final class LiveDriveTests: XCTestCase {
    func testRouteMapStateUsesRunRoutePoints() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.routeCoordinates, [
            RouteCoordinate(lat: -33.9, lng: 18.4),
            RouteCoordinate(lat: -33.95, lng: 18.45),
            RouteCoordinate(lat: -34.0, lng: 18.5)
        ])
    }

    func testDriverMarkerModelsUseBadgesAndHideOtherDriverSpeed() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()

        let otherDriver = viewModel.driverMarkers.first { $0.id == "uid_driver_2" }
        XCTAssertEqual(otherDriver?.displayName, "Sam")
        XCTAssertEqual(otherDriver?.vehicle, "BMW M2")
        XCTAssertEqual(otherDriver?.badgeText, "S")
        XCTAssertEqual(otherDriver?.badgeColorHex, "#43A047")
        XCTAssertNil(otherDriver?.speedText)
    }

    func testDriverMarkerStatesClassifyCurrentStaleAndOffline() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            nowMilliseconds: { 1_800_000_121_000 }
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.driverMarkers.first { $0.id == "uid_driver_1" }?.state, .current)
        XCTAssertEqual(viewModel.driverMarkers.first { $0.id == "uid_driver_2" }?.state, .stale)
        XCTAssertEqual(viewModel.driverMarkers.first { $0.id == "uid_driver_3" }?.state, .offline)
    }

    func testHazardMarkerModelsUseTypeAndLocation() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.hazardMarkers, [
            LiveDriveHazardMarker(
                id: "hazard_1",
                type: .pothole,
                title: "Pothole",
                detail: "Reported by Alex",
                coordinate: RouteCoordinate(lat: -33.94, lng: 18.44),
                iconSystemName: "exclamationmark.triangle.fill"
            )
        ])
    }

    func testTopStatusOverlayText() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.statusTitle, "Sunday Run · Active")
    }

    func testNextWaypointDistanceLabel() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.nextWaypointText, "Next stop: Scenic View · 2.9 km")
    }

    private static func makeRun() -> Run {
        Run(
            name: "Sunday Run",
            description: nil,
            joinCode: "123456",
            adminId: "uid_admin_1",
            status: .active,
            createdAt: 1_800_000_000_000,
            startedAt: nil,
            driveStartedAt: 1_800_000_001_000,
            endedAt: nil,
            maxDrivers: 15,
            route: RouteData(
                points: [[-33.9, 18.4], [-33.95, 18.45], [-34.0, 18.5]],
                distanceMetres: 12_300,
                durationSeconds: 1_440,
                source: .appleMaps,
                stops: [
                    RouteStopDraft(id: "start", kind: .start, order: 0, label: "Start", lat: -33.9, lng: 18.4, source: .search),
                    RouteStopDraft(id: "waypoint", kind: .waypoint, order: 1, label: "Scenic View", lat: -33.92, lng: 18.42, source: .search),
                    RouteStopDraft(id: "destination", kind: .destination, order: 2, label: "Finish", lat: -34.0, lng: 18.5, source: .search)
                ]
            ),
            drivers: [
                "uid_driver_1": makeDriver(
                    name: "Alex",
                    badge: DriverBadge(text: "A", colorHex: "#1E88E5"),
                    location: DriverLocation(lat: -33.9, lng: 18.4, heading: 90, speed: 18, accuracy: 5, timestamp: 1_800_000_004_000),
                    presence: .online
                ),
                "uid_driver_2": makeDriver(
                    name: "Sam",
                    badge: DriverBadge(text: "S", colorHex: "#43A047"),
                    location: DriverLocation(lat: -33.93, lng: 18.43, heading: 90, speed: 12, accuracy: 6, timestamp: 1_800_000_000_000),
                    presence: .online
                ),
                "uid_driver_3": makeDriver(
                    name: "Lee",
                    badge: DriverBadge(text: "L", colorHex: "#F4511E"),
                    location: DriverLocation(lat: -33.91, lng: 18.41, heading: 90, speed: 0, accuracy: 6, timestamp: 1_800_000_004_000),
                    presence: .offline
                )
            ],
            hazards: [
                "hazard_1": Hazard(
                    type: .pothole,
                    reportedBy: "uid_driver_1",
                    reporterName: "Alex",
                    lat: -33.94,
                    lng: 18.44,
                    timestamp: 1_800_000_003_000,
                    dismissed: false,
                    reportCount: 1
                )
            ]
        )
    }

    private func makeRun() -> Run {
        Self.makeRun()
    }

    private static func makeDriver(
        name: String,
        badge: DriverBadge,
        location: DriverLocation?,
        presence: DriverPresence
    ) -> DriverRecord {
        DriverRecord(
            profile: DriverProfile(
                name: name,
                displayName: name,
                carMake: name == "Sam" ? "BMW" : "Porsche",
                carModel: name == "Sam" ? "M2" : "911",
                badge: badge,
                fuelType: .petrol
            ),
            location: location,
            joinedAt: 1_800_000_000_000,
            leftAt: nil,
            presence: presence,
            finishState: .driving
        )
    }
}

private struct InMemoryLiveDriveRunReader: RunReading {
    let run: Run?

    func readRun(runId: String) async throws -> Run? {
        run
    }
}
