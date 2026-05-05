import XCTest
@testable import ClubRunNative

final class FirebaseRepositoryContractTests: XCTestCase {
    func testDevelopmentEnvironmentStartsSignedOut() {
        let environment = AppEnvironment.development()

        XCTAssertEqual(environment.session.authProvider, "Pending")
        XCTAssertEqual(environment.session.databaseMode, "Emulator")
        XCTAssertEqual(environment.session.authenticatedUID, "Not signed in")
        XCTAssertEqual(environment.session.runRoundTripStatus, "Not run")
    }

    func testEnvironmentBootstrapSignsInAnonymously() async {
        let environment = await AppEnvironment.authenticated(
            configuration: .development,
            authService: FakeAuthService(uid: "uid_admin_1")
        )

        XCTAssertEqual(environment.session.authProvider, "Firebase")
        XCTAssertEqual(environment.session.databaseMode, "Emulator")
        XCTAssertEqual(environment.session.authenticatedUID, "uid_admin_1")
        XCTAssertEqual(environment.session.runRoundTripStatus, "Not run")
    }

    func testEnvironmentBootstrapVerifiesRunRepositoryRoundTrip() async {
        let environment = await AppEnvironment.authenticated(
            configuration: .development,
            authService: FakeAuthService(uid: "uid_admin_1"),
            runRepository: InMemoryRunRepository()
        )

        XCTAssertEqual(environment.session.authProvider, "Firebase")
        XCTAssertEqual(environment.session.databaseMode, "Emulator")
        XCTAssertEqual(environment.session.authenticatedUID, "uid_admin_1")
        XCTAssertEqual(environment.session.runRoundTripStatus, "OK")
    }

    func testEnvironmentBootstrapShowsAuthFailure() async {
        let environment = await AppEnvironment.authenticated(
            configuration: .development,
            authService: FailingAuthService()
        )

        XCTAssertEqual(environment.session.authProvider, "Firebase")
        XCTAssertEqual(environment.session.databaseMode, "Emulator")
        XCTAssertEqual(environment.session.authenticatedUID, "Auth failed")
        XCTAssertEqual(environment.session.runRoundTripStatus, "Not run")
    }

    func testEnvironmentBootstrapShowsRunRoundTripFailure() async {
        let environment = await AppEnvironment.authenticated(
            configuration: .development,
            authService: FakeAuthService(uid: "uid_admin_1"),
            runRepository: FailingRunRepository()
        )

        XCTAssertEqual(environment.session.authProvider, "Firebase")
        XCTAssertEqual(environment.session.databaseMode, "Emulator")
        XCTAssertEqual(environment.session.authenticatedUID, "uid_admin_1")
        XCTAssertEqual(environment.session.runRoundTripStatus, "Failed")
    }

    func testDriveViewModelLabelsBackendDiagnostics() {
        let viewModel = DriveViewModel(
            session: BackendSession(
                authProvider: "Firebase",
                databaseMode: "Emulator",
                authenticatedUID: "uid_admin_1",
                runRoundTripStatus: "OK"
            )
        )

        XCTAssertEqual(viewModel.authProvider, "Firebase")
        XCTAssertEqual(viewModel.databaseMode, "Emulator")
        XCTAssertEqual(viewModel.authenticatedUID, "uid_admin_1")
        XCTAssertEqual(viewModel.runRoundTripStatus, "OK")
    }

    func testAuthServiceProtocolReturnsAuthenticatedUID() async throws {
        let service = FakeAuthService(uid: "uid_admin_1")

        let uid = try await service.signInAnonymously()

        XCTAssertEqual(uid, "uid_admin_1")
    }

    func testRunRepositoryProtocolRoundTripsRun() async throws {
        let repository = InMemoryRunRepository()
        let run = Run(
            name: "Sunday Run",
            description: nil,
            joinCode: "123456",
            adminId: "uid_admin_1",
            status: .draft,
            createdAt: 1_710_000_000_000,
            startedAt: nil,
            driveStartedAt: nil,
            endedAt: nil,
            maxDrivers: 15,
            route: nil,
            drivers: nil,
            hazards: nil
        )

        try await repository.writeRun(run, runId: "run_1")

        let stored = try await repository.readRun(runId: "run_1")
        XCTAssertEqual(stored, run)
    }

    func testRunCreationServiceWritesRunAndJoinCode() async throws {
        let repository = InMemoryRunRepository()
        let service = RunCreationService(
            repository: repository,
            runIDGenerator: { "run_created_1" },
            joinCodeGenerator: { "654321" },
            nowMilliseconds: { 1_800_000_001_000 }
        )

        let created = try await service.createDraftRun(adminUID: "uid_admin_1")

        XCTAssertEqual(created.runId, "run_created_1")
        XCTAssertEqual(created.joinCode, "654321")
        XCTAssertEqual(created.run.adminId, "uid_admin_1")
        XCTAssertEqual(created.run.status, .draft)
        XCTAssertEqual(created.run.createdAt, 1_800_000_001_000)
        XCTAssertEqual(try await repository.readRun(runId: "run_created_1"), created.run)
        XCTAssertEqual(
            try await repository.readJoinCode(code: "654321"),
            JoinCodeRecord(runId: "run_created_1", createdAt: 1_800_000_001_000)
        )
    }

    func testRunCreationServiceRetriesJoinCodeCollisions() async throws {
        let repository = InMemoryRunRepository()
        try await repository.writeJoinCode(
            JoinCodeRecord(runId: "existing_run", createdAt: 1),
            code: "111111"
        )
        var codes = ["111111", "222222"]
        let service = RunCreationService(
            repository: repository,
            runIDGenerator: { "run_created_2" },
            joinCodeGenerator: { codes.removeFirst() },
            nowMilliseconds: { 1_800_000_002_000 }
        )

        let created = try await service.createDraftRun(adminUID: "uid_admin_1")

        XCTAssertEqual(created.joinCode, "222222")
        XCTAssertEqual(
            try await repository.readJoinCode(code: "222222"),
            JoinCodeRecord(runId: "run_created_2", createdAt: 1_800_000_002_000)
        )
    }
}

private struct FakeAuthService: AuthServicing {
    let uid: String

    func signInAnonymously() async throws -> String {
        uid
    }
}

private struct FailingAuthService: AuthServicing {
    func signInAnonymously() async throws -> String {
        throw TestAuthError.failed
    }
}

private enum TestAuthError: Error {
    case failed
}

private final class InMemoryRunRepository: RunRepositoring {
    private var runs: [String: Run] = [:]
    private var joinCodes: [String: JoinCodeRecord] = [:]

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

private struct FailingRunRepository: RunRepositoring {
    func writeRun(_ run: Run, runId: String) async throws {
        throw TestAuthError.failed
    }

    func readRun(runId: String) async throws -> Run? {
        throw TestAuthError.failed
    }

    func writeJoinCode(_ record: JoinCodeRecord, code: String) async throws {
        throw TestAuthError.failed
    }

    func readJoinCode(code: String) async throws -> JoinCodeRecord? {
        throw TestAuthError.failed
    }
}
