import Foundation

struct AppEnvironment {
    let session: BackendSession

    static func development() -> AppEnvironment {
        AppEnvironment(
            session: BackendSession(
                authProvider: "Pending",
                databaseMode: FirebaseConfiguration.development.databaseModeLabel,
                authenticatedUID: "Not signed in",
                runRoundTripStatus: "Not run"
            )
        )
    }

    static func authenticated(
        configuration: FirebaseConfiguration,
        authService: AuthServicing,
        runRepository: RunRepositoring? = nil
    ) async -> AppEnvironment {
        do {
            let uid = try await authService.signInAnonymously()
            let runRoundTripStatus = await RunRepositorySmokeCheck.verify(
                adminUID: uid,
                repository: runRepository
            )

            return AppEnvironment(
                session: BackendSession(
                    authProvider: configuration.authProviderLabel,
                    databaseMode: configuration.databaseModeLabel,
                    authenticatedUID: uid,
                    runRoundTripStatus: runRoundTripStatus
                )
            )
        } catch {
            return AppEnvironment(
                session: BackendSession(
                    authProvider: configuration.authProviderLabel,
                    databaseMode: configuration.databaseModeLabel,
                    authenticatedUID: "Auth failed",
                    runRoundTripStatus: "Not run"
                )
            )
        }
    }
}

struct BackendSession: Equatable {
    let authProvider: String
    let databaseMode: String
    let authenticatedUID: String
    let runRoundTripStatus: String
}
