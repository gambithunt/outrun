import Foundation
#if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseDatabase)
import FirebaseAuth
import FirebaseCore
import FirebaseDatabase
#endif

protocol AuthServicing {
    func signInAnonymously() async throws -> String
}

protocol RunRepositoring {
    func writeRun(_ run: Run, runId: String) async throws
    func readRun(runId: String) async throws -> Run?
    func writeJoinCode(_ record: JoinCodeRecord, code: String) async throws
    func readJoinCode(code: String) async throws -> JoinCodeRecord?
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

struct RunCreationService {
    let repository: RunRepositoring
    let runIDGenerator: () -> String
    let joinCodeGenerator: () -> String
    let nowMilliseconds: () -> Int64

    init(
        repository: RunRepositoring,
        runIDGenerator: @escaping () -> String = { UUID().uuidString },
        joinCodeGenerator: @escaping () -> String = {
            String(format: "%06d", Int.random(in: 0...999_999))
        },
        nowMilliseconds: @escaping () -> Int64 = {
            Int64(Date().timeIntervalSince1970 * 1000)
        }
    ) {
        self.repository = repository
        self.runIDGenerator = runIDGenerator
        self.joinCodeGenerator = joinCodeGenerator
        self.nowMilliseconds = nowMilliseconds
    }

    func createDraftRun(adminUID: String) async throws -> CreatedRun {
        let runId = runIDGenerator()
        let joinCode = try await uniqueJoinCode()
        let createdAt = nowMilliseconds()
        let run = Run(
            name: "Native iOS Run",
            description: nil,
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

    var authProviderLabel: String {
        useAuthEmulator ? "Emulator" : "Firebase"
    }

    var databaseModeLabel: String {
        useDatabaseEmulator ? "Emulator" : "Firebase"
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

#if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseDatabase)
@MainActor
enum FirebaseBootstrap {
    private static var didConfigureDefaultApp = false
    private static var didConfigureDatabaseEmulator = false
    private static var didConfigureAuthEmulator = false

    static func configure(_ configuration: FirebaseConfiguration) {
        if !didConfigureDefaultApp {
            FirebaseApp.configure()
            didConfigureDefaultApp = true
        }

        if configuration.useAuthEmulator, !didConfigureAuthEmulator {
            Auth.auth().useEmulator(
                withHost: configuration.authEmulatorHost,
                port: configuration.authEmulatorPort
            )
            didConfigureAuthEmulator = true
        }

        if configuration.useDatabaseEmulator, !didConfigureDatabaseEmulator {
            Database.database().useEmulator(
                withHost: configuration.databaseEmulatorHost,
                port: configuration.databaseEmulatorPort
            )
            didConfigureDatabaseEmulator = true
        }
    }
}

final class FirebaseAuthService: AuthServicing {
    func signInAnonymously() async throws -> String {
        let result = try await Auth.auth().signInAnonymously()
        return result.user.uid
    }
}

final class FirebaseRunRepository: RunRepositoring {
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
}
#endif
