import Foundation

struct DriveViewModel {
    let authProvider: String
    let databaseMode: String
    let authenticatedUID: String
    let runRoundTripStatus: String

    init(session: BackendSession) {
        authProvider = session.authProvider
        databaseMode = session.databaseMode
        authenticatedUID = session.authenticatedUID
        runRoundTripStatus = session.runRoundTripStatus
    }
}
