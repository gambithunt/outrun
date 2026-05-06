import Foundation
#if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseDatabase)
import FirebaseAuth
import FirebaseCore
import FirebaseDatabase
#endif

protocol AuthServicing: Sendable {
    func currentUser() async throws -> AuthUserSession?
    func register(email: String, password: String) async throws -> AuthUserSession
    func login(email: String, password: String) async throws -> AuthUserSession
    func resetPassword(email: String) async throws
    func signOut() async throws
    func signInAnonymously() async throws -> String
}

extension AuthServicing {
    func currentUser() async throws -> AuthUserSession? {
        nil
    }

    func register(email: String, password: String) async throws -> AuthUserSession {
        throw AuthServiceError.unsupported
    }

    func login(email: String, password: String) async throws -> AuthUserSession {
        throw AuthServiceError.unsupported
    }

    func resetPassword(email: String) async throws {
        throw AuthServiceError.unsupported
    }

    func signOut() async throws {
        throw AuthServiceError.unsupported
    }
}

enum AuthServiceError: Error, Equatable {
    case unsupported
    case message(String)

    var userMessage: String {
        switch self {
        case .unsupported:
            "This sign-in method is not available in this build."
        case let .message(message):
            message
        }
    }
}

protocol RunRepositoring: Sendable {
    func writeRun(_ run: Run, runId: String) async throws
    func readRun(runId: String) async throws -> Run?
    func writeJoinCode(_ record: JoinCodeRecord, code: String) async throws
    func readJoinCode(code: String) async throws -> JoinCodeRecord?
    func writeDriver(_ driver: DriverRecord, runId: String, uid: String) async throws
    func saveRoute(_ route: RouteData, runId: String) async throws
    func updateRunStatus(_ status: RunStatus, driveStartedAt: Int64?, runId: String) async throws
}

protocol RoutePersisting: Sendable {
    func saveRoute(_ route: RouteData, runId: String) async throws
    func updateRunStatus(_ status: RunStatus, driveStartedAt: Int64?, runId: String) async throws
}

extension RunRepositoring {
    func writeDriver(_ driver: DriverRecord, runId: String, uid: String) async throws {
        var run = try await readRun(runId: runId)
        var drivers = run?.drivers ?? [:]
        drivers[uid] = driver
        if let existingRun = run {
            run = Run(
                name: existingRun.name,
                description: existingRun.description,
                joinCode: existingRun.joinCode,
                adminId: existingRun.adminId,
                status: existingRun.status,
                createdAt: existingRun.createdAt,
                startedAt: existingRun.startedAt,
                driveStartedAt: existingRun.driveStartedAt,
                endedAt: existingRun.endedAt,
                maxDrivers: existingRun.maxDrivers,
                route: existingRun.route,
                drivers: drivers,
                hazards: existingRun.hazards,
                summary: existingRun.summary
            )
        }

        if let run {
            try await writeRun(run, runId: runId)
        }
    }

    func updateRunStatus(_ status: RunStatus, driveStartedAt: Int64?, runId: String) async throws {
        guard let existingRun = try await readRun(runId: runId) else {
            return
        }

        let updatedRun = Run(
            name: existingRun.name,
            description: existingRun.description,
            joinCode: existingRun.joinCode,
            adminId: existingRun.adminId,
            status: status,
            createdAt: existingRun.createdAt,
            startedAt: existingRun.startedAt,
            driveStartedAt: driveStartedAt ?? existingRun.driveStartedAt,
            endedAt: existingRun.endedAt,
            maxDrivers: existingRun.maxDrivers,
            route: existingRun.route,
            drivers: existingRun.drivers,
            hazards: existingRun.hazards,
            summary: existingRun.summary
        )

        try await writeRun(updatedRun, runId: runId)
    }

    func saveRoute(_ route: RouteData, runId: String) async throws {
        guard let existingRun = try await readRun(runId: runId) else {
            return
        }

        let updatedRun = Run(
            name: existingRun.name,
            description: existingRun.description,
            joinCode: existingRun.joinCode,
            adminId: existingRun.adminId,
            status: existingRun.status,
            createdAt: existingRun.createdAt,
            startedAt: existingRun.startedAt,
            driveStartedAt: existingRun.driveStartedAt,
            endedAt: existingRun.endedAt,
            maxDrivers: existingRun.maxDrivers,
            route: route,
            drivers: existingRun.drivers,
            hazards: existingRun.hazards,
            summary: existingRun.summary
        )

        try await writeRun(updatedRun, runId: runId)
    }
}

struct JoinCodeRecord: Codable, Equatable {
    let runId: String
    let createdAt: Int64
}

struct CreatedRun: Equatable {
    let runId: String
    let joinCode: String
    let run: Run
}

struct CreateRunInput: Equatable {
    let name: String
    let description: String?
}

struct RunCreationService: Sendable {
    let repository: RunRepositoring
    let runIDGenerator: @Sendable () -> String
    let joinCodeGenerator: @Sendable () -> String
    let nowMilliseconds: @Sendable () -> Int64

    init(
        repository: RunRepositoring,
        runIDGenerator: @escaping @Sendable () -> String = { UUID().uuidString },
        joinCodeGenerator: @escaping @Sendable () -> String = {
            String(format: "%06d", Int.random(in: 0...999_999))
        },
        nowMilliseconds: @escaping @Sendable () -> Int64 = {
            Int64(Date().timeIntervalSince1970 * 1000)
        }
    ) {
        self.repository = repository
        self.runIDGenerator = runIDGenerator
        self.joinCodeGenerator = joinCodeGenerator
        self.nowMilliseconds = nowMilliseconds
    }

    func createDraftRun(adminUID: String) async throws -> CreatedRun {
        try await createDraftRun(
            input: CreateRunInput(name: "Native iOS Run", description: nil),
            adminUID: adminUID
        )
    }

    func createDraftRun(input: CreateRunInput, adminUID: String) async throws -> CreatedRun {
        let validated = try CreateRunValidation.validate(input)
        let runId = runIDGenerator()
        let joinCode = try await uniqueJoinCode()
        let createdAt = nowMilliseconds()
        let run = Run(
            name: validated.name,
            description: validated.description,
            joinCode: joinCode,
            adminId: adminUID,
            status: .draft,
            createdAt: createdAt,
            startedAt: nil,
            driveStartedAt: nil,
            endedAt: nil,
            maxDrivers: 15,
            route: nil,
            drivers: nil,
            hazards: nil
        )

        try await repository.writeRun(run, runId: runId)
        try await repository.writeJoinCode(
            JoinCodeRecord(runId: runId, createdAt: createdAt),
            code: joinCode
        )

        return CreatedRun(runId: runId, joinCode: joinCode, run: run)
    }

    private func uniqueJoinCode(maxAttempts: Int = 5) async throws -> String {
        for _ in 0..<maxAttempts {
            let code = joinCodeGenerator()
            if try await repository.readJoinCode(code: code) == nil {
                return code
            }
        }

        throw RunCreationError.joinCodeUnavailable
    }
}

enum RunCreationError: Error, Equatable {
    case joinCodeUnavailable
}

enum CreateRunValidationError: Error, Equatable {
    case missingName
    case descriptionTooLong

    var userMessage: String {
        switch self {
        case .missingName:
            "Enter a run name."
        case .descriptionTooLong:
            "Keep the description to 140 characters or less."
        }
    }
}

enum CreateRunValidation {
    static let maxDescriptionLength = 140

    static func validate(_ input: CreateRunInput) throws -> CreateRunInput {
        let name = input.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
            throw CreateRunValidationError.missingName
        }

        let description = input.description?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let description, description.count > maxDescriptionLength {
            throw CreateRunValidationError.descriptionTooLong
        }

        return CreateRunInput(
            name: name,
            description: description?.isEmpty == true ? nil : description
        )
    }
}

struct FirebaseConfiguration {
    let mode: String
    let databaseURL: String
    let projectID: String
    let useAuthEmulator: Bool
    let authEmulatorHost: String
    let authEmulatorPort: Int
    let useDatabaseEmulator: Bool
    let databaseEmulatorHost: String
    let databaseEmulatorPort: Int

    static let development = FirebaseConfiguration(
        mode: "Emulator",
        databaseURL: "http://127.0.0.1:9000?ns=outrun-9c9db",
        projectID: "outrun-9c9db",
        useAuthEmulator: false,
        authEmulatorHost: "127.0.0.1",
        authEmulatorPort: 9099,
        useDatabaseEmulator: true,
        databaseEmulatorHost: "127.0.0.1",
        databaseEmulatorPort: 9000
    )

    static let production = FirebaseConfiguration(
        mode: "Production",
        databaseURL: "https://outrun-9c9db-default-rtdb.firebaseio.com",
        projectID: "outrun-9c9db",
        useAuthEmulator: false,
        authEmulatorHost: "127.0.0.1",
        authEmulatorPort: 9099,
        useDatabaseEmulator: false,
        databaseEmulatorHost: "127.0.0.1",
        databaseEmulatorPort: 9000
    )

    var authMode: AuthMode {
        useAuthEmulator ? .anonymousEmulator : .anonymousFirebase
    }

    var emailAuthMode: AuthMode {
        useAuthEmulator ? .emailEmulator : .emailFirebase
    }

    var databaseMode: BackendMode {
        useDatabaseEmulator ? .emulator : .firebase
    }
}

struct EmulatorEndpoint: Equatable {
    let host: String
    let port: Int
}

@MainActor
protocol FirebaseConfiguring: AnyObject {
    func configureDefaultApp()
    func useAuthEmulator(host: String, port: Int)
    func useDatabaseEmulator(host: String, port: Int)
}

@MainActor
final class FirebaseBootstrapService {
    static let shared = FirebaseBootstrapService(configurator: defaultConfigurator())

    private let configurator: FirebaseConfiguring
    private var didConfigureDefaultApp = false
    private var didConfigureDatabaseEmulator = false
    private var didConfigureAuthEmulator = false

    init(configurator: FirebaseConfiguring) {
        self.configurator = configurator
    }

    func configure(_ configuration: FirebaseConfiguration) {
        if !didConfigureDefaultApp {
            configurator.configureDefaultApp()
            didConfigureDefaultApp = true
        }

        if configuration.useAuthEmulator, !didConfigureAuthEmulator {
            configurator.useAuthEmulator(
                host: configuration.authEmulatorHost,
                port: configuration.authEmulatorPort
            )
            didConfigureAuthEmulator = true
        }

        if configuration.useDatabaseEmulator, !didConfigureDatabaseEmulator {
            configurator.useDatabaseEmulator(
                host: configuration.databaseEmulatorHost,
                port: configuration.databaseEmulatorPort
            )
            didConfigureDatabaseEmulator = true
        }
    }

    private static func defaultConfigurator() -> FirebaseConfiguring {
        #if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseDatabase)
        LiveFirebaseConfigurator()
        #else
        NoopFirebaseConfigurator()
        #endif
    }
}

enum RunRepositorySmokeCheck {
    static func verify(adminUID: String, repository: RunRepositoring?) async -> String {
        guard let repository else {
            return "Not run"
        }

        let runId = "native_ios_smoke_\(firebaseKeySafeID(from: adminUID))"
        let run = Run(
            name: "Native iOS Smoke Test",
            description: "Backend compatibility smoke test",
            joinCode: "900001",
            adminId: adminUID,
            status: .draft,
            createdAt: 1_800_000_000_000,
            startedAt: nil,
            driveStartedAt: nil,
            endedAt: nil,
            maxDrivers: 15,
            route: nil,
            drivers: nil,
            hazards: nil
        )

        do {
            try await repository.writeRun(run, runId: runId)
            let stored = try await repository.readRun(runId: runId)
            return stored == run ? "OK" : "Failed"
        } catch {
            return "Failed"
        }
    }

    private static func firebaseKeySafeID(from value: String) -> String {
        let allowed = Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")
        return String(value.map { allowed.contains($0) ? $0 : "_" })
    }
}

@MainActor
private final class NoopFirebaseConfigurator: FirebaseConfiguring {
    func configureDefaultApp() {}
    func useAuthEmulator(host: String, port: Int) {}
    func useDatabaseEmulator(host: String, port: Int) {}
}

#if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseDatabase)
@MainActor
private final class LiveFirebaseConfigurator: FirebaseConfiguring {
    func configureDefaultApp() {
        FirebaseApp.configure()
    }

    func useAuthEmulator(host: String, port: Int) {
        Auth.auth().useEmulator(withHost: host, port: port)
    }

    func useDatabaseEmulator(host: String, port: Int) {
        Database.database().useEmulator(withHost: host, port: port)
    }
}

final class FirebaseAuthService: AuthServicing, @unchecked Sendable {
    func currentUser() async throws -> AuthUserSession? {
        guard let user = Auth.auth().currentUser else {
            return nil
        }

        return AuthUserSession(uid: user.uid, email: user.email)
    }

    func register(email: String, password: String) async throws -> AuthUserSession {
        let result = try await Auth.auth().createUser(withEmail: email, password: password)
        return AuthUserSession(uid: result.user.uid, email: result.user.email)
    }

    func login(email: String, password: String) async throws -> AuthUserSession {
        let result = try await Auth.auth().signIn(withEmail: email, password: password)
        return AuthUserSession(uid: result.user.uid, email: result.user.email)
    }

    func resetPassword(email: String) async throws {
        try await Auth.auth().sendPasswordReset(withEmail: email)
    }

    func signOut() async throws {
        try Auth.auth().signOut()
    }

    func signInAnonymously() async throws -> String {
        let result = try await Auth.auth().signInAnonymously()
        return result.user.uid
    }
}

final class FirebaseRunRepository: RunRepositoring, RunReading, RoutePersisting, @unchecked Sendable {
    private let database: DatabaseReference

    init(database: DatabaseReference = Database.database().reference()) {
        self.database = database
    }

    func writeRun(_ run: Run, runId: String) async throws {
        let data = try JSONEncoder.clubRunFirebase.encode(run)
        let object = try JSONSerialization.jsonObject(with: data)
        try await database.child(BackendPaths.run(runId)).setValue(object)
    }

    func readRun(runId: String) async throws -> Run? {
        try await withCheckedThrowingContinuation { continuation in
            database.child(BackendPaths.run(runId)).observeSingleEvent(of: .value) { snapshot in
                guard snapshot.exists(), let value = snapshot.value else {
                    continuation.resume(returning: nil)
                    return
                }

                do {
                    let data = try JSONSerialization.data(withJSONObject: value)
                    let run = try JSONDecoder.clubRunFirebase.decode(Run.self, from: data)
                    continuation.resume(returning: run)
                } catch {
                    continuation.resume(throwing: error)
                }
            } withCancel: { error in
                continuation.resume(throwing: error)
            }
        }
    }

    func writeJoinCode(_ record: JoinCodeRecord, code: String) async throws {
        let data = try JSONEncoder.clubRunFirebase.encode(record)
        let object = try JSONSerialization.jsonObject(with: data)
        try await database.child(BackendPaths.joinCode(code)).setValue(object)
    }

    func readJoinCode(code: String) async throws -> JoinCodeRecord? {
        try await withCheckedThrowingContinuation { continuation in
            database.child(BackendPaths.joinCode(code)).observeSingleEvent(of: .value) { snapshot in
                guard snapshot.exists(), let value = snapshot.value else {
                    continuation.resume(returning: nil)
                    return
                }

                do {
                    let data = try JSONSerialization.data(withJSONObject: value)
                    let record = try JSONDecoder.clubRunFirebase.decode(JoinCodeRecord.self, from: data)
                    continuation.resume(returning: record)
                } catch {
                    continuation.resume(throwing: error)
                }
            } withCancel: { error in
                continuation.resume(throwing: error)
            }
        }
    }

    func writeDriver(_ driver: DriverRecord, runId: String, uid: String) async throws {
        let data = try JSONEncoder.clubRunFirebase.encode(driver)
        let object = try JSONSerialization.jsonObject(with: data)
        try await database.child(BackendPaths.driver(runId, uid: uid)).setValue(object)
    }

    func saveRoute(_ route: RouteData, runId: String) async throws {
        let data = try JSONEncoder.clubRunFirebase.encode(route)
        let object = try JSONSerialization.jsonObject(with: data)
        try await database.child(BackendPaths.route(runId)).setValue(object)
    }

    func updateRunStatus(_ status: RunStatus, driveStartedAt: Int64?, runId: String) async throws {
        var updates: [String: Any] = [
            "status": status.rawValue
        ]
        if let driveStartedAt {
            updates["driveStartedAt"] = driveStartedAt
        }

        try await database.child(BackendPaths.run(runId)).updateChildValues(updates)
    }
}
#endif
