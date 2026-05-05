import Foundation

enum RunStatus: String, Codable, Equatable {
    case draft
    case ready
    case active
    case ended
}

enum FuelType: String, Codable, Equatable {
    case petrol
    case diesel
    case electric
    case hybrid
}

enum HazardType: String, Codable, Equatable {
    case pothole
    case roadworks
    case police
    case debris
    case animal
    case brokenDownCar = "broken_down_car"
}

enum RouteSource: String, Codable, Equatable {
    case drawn
    case gpx
}

enum RouteStopKind: String, Codable, Equatable {
    case start
    case waypoint
    case destination
}

enum RouteStopInputMethod: String, Codable, Equatable {
    case search
    case coordinates
    case pin
    case currentLocation = "current_location"
}

struct DriverProfile: Codable, Equatable {
    let name: String
    let carMake: String
    let carModel: String
    let engineSize: String?
    let engineUnit: String?
    let fuelType: FuelType
    let fuelEfficiency: Double?
    let fuelUnit: String?
}

struct DriverLocation: Codable, Equatable {
    let lat: Double
    let lng: Double
    let heading: Double
    let speed: Double
    let accuracy: Double
    let timestamp: Int64
}

struct RouteStopDraft: Codable, Equatable {
    let id: String
    let kind: RouteStopKind
    let label: String
    let lat: Double?
    let lng: Double?
    let source: RouteStopInputMethod
    let placeId: String?
}

struct RouteData: Codable, Equatable {
    let points: [[Double]]
    let distanceMetres: Double
    let durationSeconds: Double?
    let source: RouteSource
    let stops: [RouteStopDraft]?
}

struct Hazard: Codable, Equatable {
    let type: HazardType
    let reportedBy: String
    let reporterName: String
    let lat: Double
    let lng: Double
    let timestamp: Int64
    let dismissed: Bool
    let reportCount: Int
}

struct DriverRecord: Codable, Equatable {
    let profile: DriverProfile
    let location: DriverLocation?
    let joinedAt: Int64
    let leftAt: Int64?
}

struct Run: Codable, Equatable {
    let name: String
    let description: String?
    let joinCode: String
    let adminId: String
    let status: RunStatus
    let createdAt: Int64
    let startedAt: Int64?
    let driveStartedAt: Int64?
    let endedAt: Int64?
    let maxDrivers: Int
    let route: RouteData?
    let drivers: [String: DriverRecord]?
    let hazards: [String: Hazard]?
}

extension JSONEncoder {
    static var clubRunFirebase: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}

extension JSONDecoder {
    static var clubRunFirebase: JSONDecoder {
        JSONDecoder()
    }
}

