import Foundation

enum BackendPaths {
    static func user(_ uid: String) -> String {
        "users/\(uid)"
    }

    static func joinCode(_ code: String) -> String {
        "joinCodes/\(code)"
    }

    static func run(_ runId: String) -> String {
        "runs/\(runId)"
    }

    static func runStatus(_ runId: String) -> String {
        "runs/\(runId)/status"
    }

    static func route(_ runId: String) -> String {
        "runs/\(runId)/route"
    }

    static func driver(_ runId: String, uid: String) -> String {
        "runs/\(runId)/drivers/\(uid)"
    }

    static func driverLocation(_ runId: String, uid: String) -> String {
        "runs/\(runId)/drivers/\(uid)/location"
    }

    static func hazard(_ runId: String, hazardId: String) -> String {
        "runs/\(runId)/hazards/\(hazardId)"
    }

    static func summary(_ runId: String) -> String {
        "runs/\(runId)/summary"
    }

    static func trackPoint(_ runId: String, uid: String, pointId: String) -> String {
        "tracks/\(runId)/\(uid)/\(pointId)"
    }
}
