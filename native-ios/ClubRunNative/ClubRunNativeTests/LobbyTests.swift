import XCTest
@testable import ClubRunNative

@MainActor
final class LobbyTests: XCTestCase {
    func testAdminLobbyNoRouteStateDisablesStart() async {
        let viewModel = AdminLobbyViewModel(
            uid: "uid_admin_1",
            runId: "run_1",
            service: LobbyService(repository: InMemoryLobbyRepository(runs: ["run_1": makeRun(status: .draft, route: nil)]))
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.title, "Sunday Run")
        XCTAssertEqual(viewModel.joinCode, "123456")
        XCTAssertEqual(viewModel.routeSummary, "Route not set")
        XCTAssertEqual(viewModel.startReadinessLabel, "Add a route before starting.")
        XCTAssertFalse(viewModel.canStartDrive)
    }

    func testAdminLobbyRouteReadyStateEnablesStart() async {
        let viewModel = AdminLobbyViewModel(
            uid: "uid_admin_1",
            runId: "run_1",
            service: LobbyService(repository: InMemoryLobbyRepository(runs: ["run_1": makeRun(status: .ready, route: makeRoute())]))
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.routeSummary, "12.3 km · 24 min · Apple Maps")
        XCTAssertEqual(viewModel.startReadinessLabel, "Ready to start.")
        XCTAssertTrue(viewModel.canStartDrive)
    }

    func testSoloStartRequiresConfirmationWhenNoOtherDriversWaiting() async {
        let viewModel = AdminLobbyViewModel(
            uid: "uid_admin_1",
            runId: "run_1",
            service: LobbyService(repository: InMemoryLobbyRepository(runs: ["run_1": makeRun(status: .ready, route: makeRoute(), drivers: nil)]))
        )

        await viewModel.load()
        await viewModel.startDrive()

        XCTAssertTrue(viewModel.showsSoloStartConfirmation)
    }

    func testStartDriveTransitionsRunToActiveAfterSoloConfirmation() async {
        let repository = InMemoryLobbyRepository(runs: ["run_1": makeRun(status: .ready, route: makeRoute(), drivers: nil)])
        let viewModel = AdminLobbyViewModel(
            uid: "uid_admin_1",
            runId: "run_1",
            service: LobbyService(repository: repository, nowMilliseconds: { 1_800_000_002_000 })
        )

        await viewModel.load()
        await viewModel.confirmSoloStart()

        XCTAssertEqual(repository.runs["run_1"]?.status, .active)
        XCTAssertEqual(repository.runs["run_1"]?.driveStartedAt, 1_800_000_002_000)
        XCTAssertEqual(viewModel.startReadinessLabel, "Drive active.")
    }

    func testDriverCountAndWaitingSummary() async {
        let viewModel = DriverLobbyViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            service: LobbyService(repository: InMemoryLobbyRepository(runs: ["run_1": makeRun(status: .ready, route: makeRoute(), drivers: [
                "uid_driver_1": makeDriver(name: "Alex", presence: .online),
                "uid_driver_2": makeDriver(name: "Sam", presence: .online),
                "uid_driver_3": makeDriver(name: "Lee", presence: .offline)
            ])]))
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.driverSummary, "3 joined · 2 waiting")
    }

    func testDriverPresenceClassification() {
        XCTAssertEqual(LobbyDriverPresencePolicy.classification(for: makeDriver(name: "Alex", presence: .online)), .waiting)
        XCTAssertEqual(LobbyDriverPresencePolicy.classification(for: makeDriver(name: "Alex", presence: .offline)), .offline)
        XCTAssertEqual(LobbyDriverPresencePolicy.classification(for: makeDriver(name: "Alex", presence: .online, finishState: .left)), .left)
    }

    func testDriverLobbyDoesNotExposeAdminControls() async {
        let viewModel = DriverLobbyViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            service: LobbyService(repository: InMemoryLobbyRepository(runs: ["run_1": makeRun(status: .ready, route: makeRoute())]))
        )

        await viewModel.load()

        XCTAssertFalse(viewModel.showsAdminControls)
        XCTAssertEqual(viewModel.routeSummary, "12.3 km · 24 min · Apple Maps")
    }

    private static func makeRun(status: RunStatus, route: RouteData? = nil, drivers: [String: DriverRecord]? = nil) -> Run {
        Run(
            name: "Sunday Run",
            description: "Morning route",
            joinCode: "123456",
            adminId: "uid_admin_1",
            status: status,
            createdAt: 1_800_000_000_000,
            startedAt: nil,
            driveStartedAt: nil,
            endedAt: nil,
            maxDrivers: 15,
            route: route,
            drivers: drivers
        )
    }

    private func makeRun(status: RunStatus, route: RouteData? = nil, drivers: [String: DriverRecord]? = nil) -> Run {
        Self.makeRun(status: status, route: route, drivers: drivers)
    }

    private static func makeRoute() -> RouteData {
        RouteData(
            points: [[18.4, -33.9], [18.5, -34.0]],
            distanceMetres: 12_300,
            durationSeconds: 1_440,
            source: .appleMaps,
            stops: nil
        )
    }

    private func makeRoute() -> RouteData {
        Self.makeRoute()
    }

    private static func makeDriver(
        name: String,
        presence: DriverPresence,
        finishState: DriverFinishState = .driving
    ) -> DriverRecord {
        DriverRecord(
            profile: DriverProfile(
                name: name,
                displayName: name,
                carMake: "Porsche",
                carModel: "911",
                badge: DriverBadge(text: String(name.prefix(1)), colorHex: "#1E88E5"),
                fuelType: .petrol
            ),
            joinedAt: 1_800_000_000_000,
            leftAt: nil,
            presence: presence,
            finishState: finishState
        )
    }

    private func makeDriver(
        name: String,
        presence: DriverPresence,
        finishState: DriverFinishState = .driving
    ) -> DriverRecord {
        Self.makeDriver(name: name, presence: presence, finishState: finishState)
    }
}

private final class InMemoryLobbyRepository: RunRepositoring, @unchecked Sendable {
    var runs: [String: Run]
    private var joinCodes: [String: JoinCodeRecord] = [:]

    init(runs: [String: Run]) {
        self.runs = runs
    }

    func writeRun(_ run: Run, runId: String) async throws {
        runs[runId] = run
    }

    func readRun(runId: String) async throws -> Run? {
        runs[runId]
    }

    func writeJoinCode(_ record: JoinCodeRecord, code: String) async throws {
        joinCodes[code] = record
    }

    func readJoinCode(code: String) async throws -> JoinCodeRecord? {
        joinCodes[code]
    }
}
