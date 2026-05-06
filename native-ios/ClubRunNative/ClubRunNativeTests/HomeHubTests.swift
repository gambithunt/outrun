import XCTest
@testable import ClubRunNative

@MainActor
final class HomeHubTests: XCTestCase {
    func testHomeHubViewModelShowsIdentityAndNoActiveRunWhenNoStoredSessionExists() async {
        let router = AppRouter()
        let store = InMemoryActiveRunStore()
        let viewModel = HomeHubViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            activeRunStore: store,
            runReader: InMemoryRunReader(),
            router: router
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.identity.displayName, "Alex Driver")
        XCTAssertEqual(viewModel.identity.badge, DriverBadge(text: "AD", colorHex: "#1E88E5"))
        XCTAssertEqual(viewModel.identity.vehicle, "Porsche 911")
        XCTAssertNil(viewModel.activeRunCard)
    }

    func testHomeHubViewModelShowsActiveRunCardForStoredActiveRun() async {
        let router = AppRouter()
        let store = InMemoryActiveRunStore(storedSession: ActiveRunSessionMetadata(runId: "run_1"))
        let runReader = InMemoryRunReader(runs: ["run_1": makeRun(name: "Sunday Drive", adminId: "uid_1", status: .active)])
        let viewModel = HomeHubViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            activeRunStore: store,
            runReader: runReader,
            router: router
        )

        await viewModel.load()

        XCTAssertEqual(
            viewModel.activeRunCard,
            ActiveRunCard(runId: "run_1", runName: "Sunday Drive", statusText: "Active", role: .admin)
        )
    }

    func testClassifiesActiveRunRoleAsAdminOrDriver() {
        let adminRun = makeRun(name: "Admin Run", adminId: "uid_1", status: .draft)
        let driverRun = makeRun(
            name: "Driver Run",
            adminId: "admin_uid",
            status: .ready,
            drivers: ["uid_1": makeDriverRecord()]
        )

        XCTAssertEqual(HomeHubActiveRunResolver.role(for: "uid_1", in: adminRun), ActiveRunRole.admin)
        XCTAssertEqual(HomeHubActiveRunResolver.role(for: "uid_1", in: driverRun), ActiveRunRole.driver)
        XCTAssertNil(HomeHubActiveRunResolver.role(for: "stranger_uid", in: driverRun))
    }

    func testStoredActiveRunValidationClearsMissingEndedOrUnrelatedRuns() async {
        let router = AppRouter()
        let store = InMemoryActiveRunStore(storedSession: ActiveRunSessionMetadata(runId: "run_1"))
        let runReader = InMemoryRunReader(runs: ["run_1": makeRun(name: "Ended Run", adminId: "uid_1", status: .ended)])
        let viewModel = HomeHubViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            activeRunStore: store,
            runReader: runReader,
            router: router
        )

        await viewModel.load()

        XCTAssertNil(viewModel.activeRunCard)
        XCTAssertTrue(store.didClear)
    }

    func testHomeHubRoutesCreateJoinSettingsAndActiveRunThroughRouter() async {
        let router = AppRouter()
        let store = InMemoryActiveRunStore(storedSession: ActiveRunSessionMetadata(runId: "run_1"))
        let runReader = InMemoryRunReader(runs: ["run_1": makeRun(name: "Sunday Drive", adminId: "uid_1", status: .active)])
        let viewModel = HomeHubViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            activeRunStore: store,
            runReader: runReader,
            router: router
        )
        await viewModel.load()

        viewModel.openCreateRun()
        XCTAssertEqual(router.presentedRoute, AppRoute.createRun)

        viewModel.openJoinRun()
        XCTAssertEqual(router.presentedRoute, AppRoute.joinRun)

        viewModel.openSettings()
        XCTAssertEqual(router.presentedRoute, AppRoute.settings)

        viewModel.openActiveRun()
        XCTAssertEqual(router.presentedRoute, AppRoute.activeRun(runId: "run_1", role: .admin))
    }

    private func makeProfile() -> UserProfile {
        UserProfile(
            displayName: "Alex Driver",
            carMake: "Porsche",
            carModel: "911",
            badge: DriverBadge(text: "AD", colorHex: "#1E88E5"),
            homeClub: nil,
            createdAt: 1_800_000_000_000,
            updatedAt: 1_800_000_000_000,
            stats: UserStats(totalRuns: 0, totalDistanceKm: 0, hazardsReported: 0, mostUsedCarId: nil)
        )
    }

    private func makeRun(
        name: String,
        adminId: String,
        status: RunStatus,
        drivers: [String: DriverRecord]? = nil
    ) -> Run {
        Run(
            name: name,
            description: nil,
            joinCode: "123456",
            adminId: adminId,
            status: status,
            createdAt: 1_800_000_000_000,
            startedAt: nil,
            endedAt: nil,
            maxDrivers: 15,
            drivers: drivers
        )
    }

    private func makeDriverRecord() -> DriverRecord {
        DriverRecord(
            profile: DriverProfile(
                name: "Alex Driver",
                displayName: "Alex Driver",
                carMake: "Porsche",
                carModel: "911",
                badge: DriverBadge(text: "AD", colorHex: "#1E88E5"),
                fuelType: .petrol
            ),
            joinedAt: 1_800_000_000_000,
            leftAt: nil,
            presence: .online,
            finishState: .driving
        )
    }
}

private final class InMemoryActiveRunStore: ActiveRunStoring, @unchecked Sendable {
    private var storedSession: ActiveRunSessionMetadata?
    private(set) var didClear = false

    init(storedSession: ActiveRunSessionMetadata? = nil) {
        self.storedSession = storedSession
    }

    func readActiveRunSession(uid: String) -> ActiveRunSessionMetadata? {
        storedSession
    }

    func saveActiveRunSession(_ session: ActiveRunSessionMetadata, uid: String) {
        storedSession = session
    }

    func clearActiveRunSession(uid: String) {
        storedSession = nil
        didClear = true
    }
}

private struct InMemoryRunReader: RunReading, @unchecked Sendable {
    var runs: [String: Run] = [:]

    func readRun(runId: String) async throws -> Run? {
        runs[runId]
    }
}
