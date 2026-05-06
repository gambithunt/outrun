import XCTest
@testable import ClubRunNative

final class FirebaseRepositoryContractTests: XCTestCase {
    func testDevelopmentEnvironmentStartsSignedOut() {
        let environment = AppEnvironment.development()

        XCTAssertEqual(environment.session.authMode, .pending)
        XCTAssertEqual(environment.session.databaseMode, .emulator)
        XCTAssertEqual(environment.session.authenticatedUserState, .signedOut)
        XCTAssertEqual(environment.session.runRoundTripStatus, "Not run")
    }

    func testEnvironmentBootstrapSignsInAnonymously() async {
        let environment = await AppEnvironment.authenticated(
            configuration: .development,
            authService: FakeAuthService(uid: "uid_admin_1")
        )

        XCTAssertEqual(environment.session.authMode, .anonymousFirebase)
        XCTAssertEqual(environment.session.databaseMode, .emulator)
        XCTAssertEqual(environment.session.authenticatedUserState, .signedIn(uid: "uid_admin_1"))
        XCTAssertEqual(environment.session.runRoundTripStatus, "Not run")
    }

    func testEnvironmentBootstrapVerifiesRunRepositoryRoundTrip() async {
        let environment = await AppEnvironment.authenticated(
            configuration: .development,
            authService: FakeAuthService(uid: "uid_admin_1"),
            runRepository: InMemoryRunRepository()
        )

        XCTAssertEqual(environment.session.authMode, .anonymousFirebase)
        XCTAssertEqual(environment.session.databaseMode, .emulator)
        XCTAssertEqual(environment.session.authenticatedUserState, .signedIn(uid: "uid_admin_1"))
        XCTAssertEqual(environment.session.runRoundTripStatus, "OK")
    }

    func testEnvironmentBootstrapShowsAuthFailure() async {
        let environment = await AppEnvironment.authenticated(
            configuration: .development,
            authService: FailingAuthService()
        )

        XCTAssertEqual(environment.session.authMode, .anonymousFirebase)
        XCTAssertEqual(environment.session.databaseMode, .emulator)
        XCTAssertEqual(environment.session.authenticatedUserState, .failed)
        XCTAssertEqual(environment.session.runRoundTripStatus, "Not run")
    }

    func testEnvironmentBootstrapShowsRunRoundTripFailure() async {
        let environment = await AppEnvironment.authenticated(
            configuration: .development,
            authService: FakeAuthService(uid: "uid_admin_1"),
            runRepository: FailingRunRepository()
        )

        XCTAssertEqual(environment.session.authMode, .anonymousFirebase)
        XCTAssertEqual(environment.session.databaseMode, .emulator)
        XCTAssertEqual(environment.session.authenticatedUserState, .signedIn(uid: "uid_admin_1"))
        XCTAssertEqual(environment.session.runRoundTripStatus, "Failed")
    }

    func testDevelopmentEnvironmentCanHideDiagnostics() {
        let environment = AppEnvironment.development(diagnostics: .disabled)

        XCTAssertEqual(environment.diagnostics, .disabled)
    }

    func testAuthenticatedEnvironmentCanHideDiagnostics() async {
        let environment = await AppEnvironment.authenticated(
            configuration: .production,
            authService: FakeAuthService(uid: "uid_admin_1"),
            diagnostics: .disabled
        )

        XCTAssertEqual(environment.session.authMode, .anonymousFirebase)
        XCTAssertEqual(environment.session.databaseMode, .firebase)
        XCTAssertEqual(environment.session.authenticatedUserState, .signedIn(uid: "uid_admin_1"))
        XCTAssertEqual(environment.diagnostics, .disabled)
    }

    func testDriveViewModelExposesBackendDiagnosticsWhenEnabled() {
        let viewModel = DriveViewModel(
            session: BackendSession(
                authMode: .anonymousFirebase,
                databaseMode: .emulator,
                authenticatedUserState: .signedIn(uid: "uid_admin_1"),
                runRoundTripStatus: "OK"
            ),
            diagnostics: .enabled
        )

        XCTAssertTrue(viewModel.showsBackendDiagnostics)
        XCTAssertEqual(viewModel.authProvider, "Firebase Anonymous")
        XCTAssertEqual(viewModel.databaseMode, "Emulator")
        XCTAssertEqual(viewModel.authenticatedUID, "uid_admin_1")
        XCTAssertEqual(viewModel.runRoundTripStatus, "OK")
    }

    func testDriveViewModelHidesBackendDiagnosticsWhenDisabled() {
        let viewModel = DriveViewModel(
            session: BackendSession(
                authMode: .anonymousFirebase,
                databaseMode: .firebase,
                authenticatedUserState: .signedIn(uid: "uid_admin_1"),
                runRoundTripStatus: "OK"
            ),
            diagnostics: .disabled
        )

        XCTAssertFalse(viewModel.showsBackendDiagnostics)
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

        let created = try await service.createDraftRun(
            input: CreateRunInput(name: " Morning Drive ", description: " Coastal route "),
            adminUID: "uid_admin_1"
        )

        XCTAssertEqual(created.runId, "run_created_1")
        XCTAssertEqual(created.joinCode, "654321")
        XCTAssertEqual(created.run.name, "Morning Drive")
        XCTAssertEqual(created.run.description, "Coastal route")
        XCTAssertEqual(created.run.adminId, "uid_admin_1")
        XCTAssertEqual(created.run.status, .draft)
        XCTAssertEqual(created.run.createdAt, 1_800_000_001_000)
        XCTAssertEqual(created.run.maxDrivers, 15)
        let storedRun = try await repository.readRun(runId: "run_created_1")
        let storedJoinCode = try await repository.readJoinCode(code: "654321")

        XCTAssertEqual(storedRun, created.run)
        XCTAssertEqual(
            storedJoinCode,
            JoinCodeRecord(runId: "run_created_1", createdAt: 1_800_000_001_000)
        )
    }

    func testRunCreationServiceRetriesJoinCodeCollisions() async throws {
        let repository = InMemoryRunRepository()
        try await repository.writeJoinCode(
            JoinCodeRecord(runId: "existing_run", createdAt: 1),
            code: "111111"
        )
        let codes = SequentialJoinCodeGenerator(codes: ["111111", "222222"])
        let service = RunCreationService(
            repository: repository,
            runIDGenerator: { "run_created_2" },
            joinCodeGenerator: { codes.next() },
            nowMilliseconds: { 1_800_000_002_000 }
        )

        let created = try await service.createDraftRun(
            input: CreateRunInput(name: "Sunday Run", description: nil),
            adminUID: "uid_admin_1"
        )
        let storedJoinCode = try await repository.readJoinCode(code: "222222")

        XCTAssertEqual(created.joinCode, "222222")
        XCTAssertEqual(
            storedJoinCode,
            JoinCodeRecord(runId: "run_created_2", createdAt: 1_800_000_002_000)
        )
    }

    func testRunCreationServiceRejectsMissingRunNameAndLongDescription() async {
        let service = RunCreationService(repository: InMemoryRunRepository())

        do {
            _ = try await service.createDraftRun(
                input: CreateRunInput(name: " ", description: nil),
                adminUID: "uid_admin_1"
            )
            XCTFail("Expected missing name validation failure.")
        } catch {
            XCTAssertEqual(error as? CreateRunValidationError, .missingName)
        }

        do {
            _ = try await service.createDraftRun(
                input: CreateRunInput(name: "Sunday Run", description: String(repeating: "a", count: 141)),
                adminUID: "uid_admin_1"
            )
            XCTFail("Expected long description validation failure.")
        } catch {
            XCTAssertEqual(error as? CreateRunValidationError, .descriptionTooLong)
        }
    }

    @MainActor
    func testCreateRunViewModelStoresAdminActiveSessionAndRoutesToAdminLobby() async {
        let repository = InMemoryRunRepository()
        let activeRunStore = InMemoryActiveRunStore()
        let router = AppRouter()
        let viewModel = CreateRunViewModel(
            uid: "uid_admin_1",
            service: RunCreationService(
                repository: repository,
                runIDGenerator: { "run_created_1" },
                joinCodeGenerator: { "654321" },
                nowMilliseconds: { 1_800_000_001_000 }
            ),
            activeRunStore: activeRunStore,
            router: router
        )
        viewModel.name = "Sunday Run"
        viewModel.description = "Short route"

        await viewModel.create()

        XCTAssertEqual(activeRunStore.readActiveRunSession(uid: "uid_admin_1"), ActiveRunSessionMetadata(runId: "run_created_1", role: .admin))
        XCTAssertEqual(router.presentedRoute, AppRoute.adminLobby(runId: "run_created_1"))
        XCTAssertNil(viewModel.message)
    }

    @MainActor
    func testCreateRunViewModelShowsRecoverableFailureMessage() async {
        let viewModel = CreateRunViewModel(
            uid: "uid_admin_1",
            service: RunCreationService(repository: FailingRunRepository()),
            activeRunStore: InMemoryActiveRunStore(),
            router: AppRouter()
        )
        viewModel.name = "Sunday Run"

        await viewModel.create()

        XCTAssertEqual(viewModel.message, "Unable to create the run. Try again.")
        XCTAssertFalse(viewModel.isCreating)
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

private final class InMemoryRunRepository: RunRepositoring, @unchecked Sendable {
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

private final class SequentialJoinCodeGenerator: @unchecked Sendable {
    private var codes: [String]

    init(codes: [String]) {
        self.codes = codes
    }

    func next() -> String {
        codes.removeFirst()
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
