import Foundation

struct DriveViewModel {
    let showsBackendDiagnostics: Bool
    let authProvider: String
    let databaseMode: String
    let authenticatedUID: String
    let runRoundTripStatus: String

    init(session: BackendSession, diagnostics: AppDiagnosticsConfiguration) {
        showsBackendDiagnostics = diagnostics.showsBackendDiagnostics
        authProvider = session.authMode.diagnosticLabel
        databaseMode = session.databaseMode.diagnosticLabel
        authenticatedUID = session.authenticatedUID
        runRoundTripStatus = session.runRoundTripStatus
    }
}
