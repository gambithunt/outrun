import XCTest
@testable import ClubRunNative

@MainActor
final class JoinRunTests: XCTestCase {
    func testNormalizesTypedAndPastedJoinCodes() throws {
        XCTAssertEqual(try JoinCodeNormalizer.normalize("123456"), "123456")
        XCTAssertEqual(try JoinCodeNormalizer.normalize("123 456"), "123456")
        XCTAssertEqual(try JoinCodeNormalizer.normalize("Code: 123-456"), "123456")
    }

    func testRejectsMissingAndInvalidJoinCodes() {
        XCTAssertThrowsError(try JoinCodeNormalizer.normalize("")) { error in
            XCTAssertEqual(error as? JoinRunError, .missingCode)
        }
        XCTAssertThrowsError(try JoinCodeNormalizer.normalize("12345")) { error in
            XCTAssertEqual(error as? JoinRunError, .invalidCode)
        }
        XCTAssertThrowsError(try JoinCodeNormalizer.normalize("1234567")) { error in
            XCTAssertEqual(error as? JoinRunError, .invalidCode)
        }
    }

    func testResolveShowsRunName() async throws {
        let repository = InMemoryJoinRunRepository()
        try await repository.writeJoinCode(JoinCodeRecord(runId: "run_1", createdAt: 1), code: "123456")
        try await repository.writeRun(makeRun(name: "Sunday Run", status: .draft), runId: "run_1")
        let viewModel = JoinRunViewModel(
            uid: "uid_driver_1",
            profile: makeProfile(),
            service: JoinRunService(repository: repository, nowMilliseconds: { 1_800_000_001_000 }),
            activeRunStore: InMemoryActiveRunStore(),
            router: AppRouter()
        )
        viewModel.code = "123 456"

        await viewModel.resolve()

        XCTAssertEqual(viewModel.resolvedRunName, "Sunday Run")
        XCTAssertNil(viewModel.message)
    }

    func testInvalidCodeShowsUsefulError() async {
        let viewModel = JoinRunViewModel(
            uid: "uid_driver_1",
            profile: makeProfile(),
            service: JoinRunService(repository: InMemoryJoinRunRepository(), nowMilliseconds: { 1_800_000_001_000 }),
            activeRunStore: InMemoryActiveRunStore(),
            router: AppRouter()
        )
        viewModel.code = "999999"

        await viewModel.resolve()

        XCTAssertEqual(viewModel.message, "No run found for that code.")
    }

    func testEndedRunCannotBeJoined() async throws {
        let repository = InMemoryJoinRunRepository()
        try await repository.writeJoinCode(JoinCodeRecord(runId: "run_ended", createdAt: 1), code: "123456")
        try await repository.writeRun(makeRun(name: "Ended Run", status: .ended), runId: "run_ended")
        let service = JoinRunService(repository: repository, nowMilliseconds: { 1_800_000_001_000 })

        do {
            _ = try await service.resolve(code: "123456")
            XCTFail("Expected ended run failure.")
        } catch {
            XCTAssertEqual(error as? JoinRunError, .runEnded)
        }
    }

    func testJoinWritesDriverProfileSnapshotStoresActiveSessionAndRoutesToDriverLobby() async throws {
        let repository = InMemoryJoinRunRepository()
        try await repository.writeJoinCode(JoinCodeRecord(runId: "run_1", createdAt: 1), code: "123456")
        try await repository.writeRun(makeRun(name: "Ready Run", status: .ready), runId: "run_1")
        let activeRunStore = InMemoryActiveRunStore()
        let router = AppRouter()
        let profile = makeProfile()
        let viewModel = JoinRunViewModel(
            uid: "uid_driver_1",
            profile: profile,
            service: JoinRunService(repository: repository, nowMilliseconds: { 1_800_000_001_000 }),
            activeRunStore: activeRunStore,
            router: router
        )
        viewModel.code = "123456"
        await viewModel.resolve()

        await viewModel.join()

        XCTAssertEqual(
            repository.drivers["run_1/uid_driver_1"],
            DriverRecord(
                profile: DriverProfile(
                    name: "Alex Driver",
                    displayName: "Alex Driver",
                    carMake: "Porsche",
                    carModel: "911",
                    badge: DriverBadge(text: "AD", colorHex: "#1E88E5"),
                    fuelType: .petrol
                ),
                joinedAt: 1_800_000_001_000,
                leftAt: nil,
                presence: .online,
                finishState: .driving
            )
        )
        XCTAssertEqual(activeRunStore.readActiveRunSession(uid: "uid_driver_1"), ActiveRunSessionMetadata(runId: "run_1", role: .driver))
        XCTAssertEqual(router.presentedRoute, AppRoute.driverLobby(runId: "run_1"))
    }

    func testJoinRoutesActiveRunToLiveDrive() async throws {
        let repository = InMemoryJoinRunRepository()
        try await repository.writeJoinCode(JoinCodeRecord(runId: "run_active", createdAt: 1), code: "123456")
        try await repository.writeRun(makeRun(name: "Active Run", status: .active), runId: "run_active")
        let router = AppRouter()
        let viewModel = JoinRunViewModel(
            uid: "uid_driver_1",
            profile: makeProfile(),
            service: JoinRunService(repository: repository, nowMilliseconds: { 1_800_000_001_000 }),
            activeRunStore: InMemoryActiveRunStore(),
            router: router
        )
        viewModel.code = "123456"
        await viewModel.resolve()

        await viewModel.join()

        XCTAssertEqual(router.presentedRoute, AppRoute.liveDrive(runId: "run_active", role: .driver))
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

    private func makeRun(name: String, status: RunStatus) -> Run {
        Run(
            name: name,
            description: nil,
            joinCode: "123456",
            adminId: "uid_admin_1",
            status: status,
            createdAt: 1_800_000_000_000,
            startedAt: nil,
            endedAt: nil,
            maxDrivers: 15
        )
    }
}

private final class InMemoryJoinRunRepository: RunRepositoring, @unchecked Sendable {
    private var runs: [String: Run] = [:]
    private var joinCodes: [String: JoinCodeRecord] = [:]
    private(set) var drivers: [String: DriverRecord] = [:]

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

    func writeDriver(_ driver: DriverRecord, runId: String, uid: String) async throws {
        drivers["\(runId)/\(uid)"] = driver
    }
}

private final class InMemoryActiveRunStore: ActiveRunStoring, @unchecked Sendable {
    private var session: ActiveRunSessionMetadata?

    func readActiveRunSession(uid: String) -> ActiveRunSessionMetadata? {
        session
    }

    func saveActiveRunSession(_ session: ActiveRunSessionMetadata, uid: String) {
        self.session = session
    }

    func clearActiveRunSession(uid: String) {
        session = nil
    }
}
