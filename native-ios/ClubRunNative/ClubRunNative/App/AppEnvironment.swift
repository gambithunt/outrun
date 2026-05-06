import Foundation

struct AppEnvironment {
    let session: BackendSession
    let diagnostics: AppDiagnosticsConfiguration

    static func development(
        diagnostics: AppDiagnosticsConfiguration = .development
    ) -> AppEnvironment {
        AppEnvironment(
            session: BackendSession(
                authMode: .pending,
                databaseMode: FirebaseConfiguration.development.databaseMode,
                authenticatedUserState: .signedOut,
                runRoundTripStatus: "Not run"
            ),
            diagnostics: diagnostics
        )
    }

    static func authenticated(
        configuration: FirebaseConfiguration,
        authService: AuthServicing,
        runRepository: RunRepositoring? = nil,
        diagnostics: AppDiagnosticsConfiguration = .development
    ) async -> AppEnvironment {
        do {
            let uid = try await authService.signInAnonymously()
            let runRoundTripStatus = await RunRepositorySmokeCheck.verify(
                adminUID: uid,
                repository: runRepository
            )

            return AppEnvironment(
                session: BackendSession(
                    authMode: configuration.authMode,
                    databaseMode: configuration.databaseMode,
                    authenticatedUserState: .signedIn(uid: uid),
                    runRoundTripStatus: runRoundTripStatus
                ),
                diagnostics: diagnostics
            )
        } catch {
            return AppEnvironment(
                session: BackendSession(
                    authMode: configuration.authMode,
                    databaseMode: configuration.databaseMode,
                    authenticatedUserState: .failed,
                    runRoundTripStatus: "Not run"
                ),
                diagnostics: diagnostics
            )
        }
    }
}

struct BackendSession: Equatable {
    let authMode: AuthMode
    let databaseMode: BackendMode
    let authenticatedUserState: AuthenticatedUserState
    let runRoundTripStatus: String

    var authenticatedUID: String {
        authenticatedUserState.diagnosticLabel
    }
}

enum AuthMode: Equatable {
    case pending
    case anonymousFirebase
    case anonymousEmulator
    case emailFirebase
    case emailEmulator

    var diagnosticLabel: String {
        switch self {
        case .pending:
            "Pending"
        case .anonymousFirebase:
            "Firebase Anonymous"
        case .anonymousEmulator:
            "Emulator Anonymous"
        case .emailFirebase:
            "Firebase Email"
        case .emailEmulator:
            "Emulator Email"
        }
    }
}

enum BackendMode: Equatable {
    case firebase
    case emulator

    var diagnosticLabel: String {
        switch self {
        case .firebase:
            "Firebase"
        case .emulator:
            "Emulator"
        }
    }
}

enum AuthenticatedUserState: Equatable {
    case signedOut
    case signedIn(uid: String)
    case failed

    var uid: String? {
        switch self {
        case let .signedIn(uid):
            uid
        case .signedOut, .failed:
            nil
        }
    }

    var diagnosticLabel: String {
        switch self {
        case .signedOut:
            "Not signed in"
        case let .signedIn(uid):
            uid
        case .failed:
            "Auth failed"
        }
    }
}

struct AppDiagnosticsConfiguration: Equatable {
    let showsBackendDiagnostics: Bool

    static let enabled = AppDiagnosticsConfiguration(showsBackendDiagnostics: true)
    static let disabled = AppDiagnosticsConfiguration(showsBackendDiagnostics: false)

    static var development: AppDiagnosticsConfiguration {
        #if DEBUG
        .enabled
        #else
        .disabled
        #endif
    }
}
