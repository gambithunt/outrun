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
    case mobileCamera = "mobile_camera"
    case debris
    case animal
    case brokenDownCar = "broken_down_car"
}

enum RouteSource: String, Codable, Equatable {
    case drawn
    case appleMaps = "apple_maps"
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

struct DriverBadge: Codable, Equatable {
    let text: String
    let colorHex: String

    static func generated(
        displayName: String,
        carMake: String,
        carModel: String,
        paletteIndex: Int = 0
    ) -> DriverBadge {
        let text = initials(from: displayName)
            ?? initials(from: "\(carMake) \(carModel)")
            ?? "CR"
        let palette = ["#1E88E5", "#43A047", "#F4511E", "#8E24AA", "#00897B", "#C0A000"]
        let colorIndex = abs(paletteIndex) % palette.count
        return DriverBadge(text: text, colorHex: palette[colorIndex])
    }

    private static func initials(from value: String) -> String? {
        let parts = value
            .split { !$0.isLetter && !$0.isNumber }
            .prefix(2)
            .compactMap(\.first)

        guard !parts.isEmpty else {
            return nil
        }

        return String(parts).uppercased()
    }
}

struct UserStats: Codable, Equatable {
    let totalRuns: Int
    let totalDistanceKm: Double
    let hazardsReported: Int
    let mostUsedCarId: String?
}

struct UserProfile: Codable, Equatable {
    let displayName: String
    let carMake: String
    let carModel: String
    let badge: DriverBadge
    let homeClub: String?
    let createdAt: Int64
    let updatedAt: Int64
    let stats: UserStats
}

struct DriverProfile: Codable, Equatable {
    let name: String
    let displayName: String?
    let carMake: String
    let carModel: String
    let badge: DriverBadge?
    let engineSize: String?
    let engineUnit: String?
    let fuelType: FuelType
    let fuelEfficiency: Double?
    let fuelUnit: String?

    init(
        name: String,
        displayName: String? = nil,
        carMake: String,
        carModel: String,
        badge: DriverBadge? = nil,
        engineSize: String? = nil,
        engineUnit: String? = nil,
        fuelType: FuelType,
        fuelEfficiency: Double? = nil,
        fuelUnit: String? = nil
    ) {
        self.name = name
        self.displayName = displayName
        self.carMake = carMake
        self.carModel = carModel
        self.badge = badge
        self.engineSize = engineSize
        self.engineUnit = engineUnit
        self.fuelType = fuelType
        self.fuelEfficiency = fuelEfficiency
        self.fuelUnit = fuelUnit
    }
}

struct DriverLocation: Codable, Equatable {
    let lat: Double
    let lng: Double
    let heading: Double
    let speed: Double
    let accuracy: Double
    let timestamp: Int64
}

struct TrackPoint: Codable, Equatable {
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
    let order: Int?
    let label: String
    let lat: Double?
    let lng: Double?
    let source: RouteStopInputMethod
    let placeId: String?

    init(
        id: String,
        kind: RouteStopKind,
        order: Int? = nil,
        label: String,
        lat: Double?,
        lng: Double?,
        source: RouteStopInputMethod,
        placeId: String? = nil
    ) {
        self.id = id
        self.kind = kind
        self.order = order
        self.label = label
        self.lat = lat
        self.lng = lng
        self.source = source
        self.placeId = placeId
    }
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
    let confidence: Double?
    let expiresAt: Int64?
    let confirmations: [String: HazardConfirmation]?

    init(
        type: HazardType,
        reportedBy: String,
        reporterName: String,
        lat: Double,
        lng: Double,
        timestamp: Int64,
        dismissed: Bool,
        reportCount: Int,
        confidence: Double? = nil,
        expiresAt: Int64? = nil,
        confirmations: [String: HazardConfirmation]? = nil
    ) {
        self.type = type
        self.reportedBy = reportedBy
        self.reporterName = reporterName
        self.lat = lat
        self.lng = lng
        self.timestamp = timestamp
        self.dismissed = dismissed
        self.reportCount = reportCount
        self.confidence = confidence
        self.expiresAt = expiresAt
        self.confirmations = confirmations
    }
}

struct HazardConfirmation: Codable, Equatable {
    let confirmedBy: String
    let reporterName: String
    let confirmedAt: Int64
}

enum DriverPresence: String, Codable, Equatable {
    case offline
    case online
    case background
}

enum DriverFinishState: String, Codable, Equatable {
    case driving
    case finished
    case left
}

struct DriverStats: Codable, Equatable {
    let topSpeed: Double?
    let avgMovingSpeedMs: Double?
    let totalDistanceKm: Double?
    let totalDriveTimeMinutes: Double?
    let stopCount: Int?
    let avgStopTimeSec: Double?
}

struct DriverRecord: Codable, Equatable {
    let profile: DriverProfile
    let location: DriverLocation?
    let joinedAt: Int64
    let leftAt: Int64?
    let presence: DriverPresence?
    let finishState: DriverFinishState?
    let finishedAt: Int64?
    let stats: DriverStats?

    init(
        profile: DriverProfile,
        location: DriverLocation? = nil,
        joinedAt: Int64,
        leftAt: Int64?,
        presence: DriverPresence? = nil,
        finishState: DriverFinishState? = nil,
        finishedAt: Int64? = nil,
        stats: DriverStats? = nil
    ) {
        self.profile = profile
        self.location = location
        self.joinedAt = joinedAt
        self.leftAt = leftAt
        self.presence = presence
        self.finishState = finishState
        self.finishedAt = finishedAt
        self.stats = stats
    }
}

struct PersonalSummary: Codable, Equatable {
    let name: String
    let carMake: String
    let carModel: String
    let badge: DriverBadge?
    let topSpeedKmh: Double?
    let avgMovingSpeedKmh: Double?
    let totalDistanceKm: Double?
    let totalDriveTimeMinutes: Double?
    let stopCount: Int?
    let avgStopTimeSec: Double?
    let fuelUsedLitres: Double?
    let fuelUsedKwh: Double?
    let fuelType: FuelType
}

struct CollectiveFuelSummary: Codable, Equatable {
    let petrolLitres: Double
    let dieselLitres: Double
    let hybridLitres: Double
    let electricKwh: Double
}

struct HazardSummary: Codable, Equatable {
    let total: Int
    let byType: [HazardType: Int]

    enum CodingKeys: String, CodingKey {
        case total
        case byType
    }

    init(total: Int, byType: [HazardType: Int]) {
        self.total = total
        self.byType = byType
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        total = try container.decode(Int.self, forKey: .total)

        let rawByType = try container.decode([String: Int].self, forKey: .byType)
        byType = rawByType.reduce(into: [:]) { result, entry in
            if let type = HazardType(rawValue: entry.key) {
                result[type] = entry.value
            }
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(total, forKey: .total)

        let rawByType = Dictionary(uniqueKeysWithValues: byType.map { ($0.key.rawValue, $0.value) })
        try container.encode(rawByType, forKey: .byType)
    }
}

struct SummaryRoutePreview: Codable, Equatable {
    let points: [[Double]]
    let speedBuckets: [Double]
}

struct RunSummary: Codable, Equatable {
    let totalDistanceKm: Double
    let totalDriveTimeMinutes: Double
    let driverStats: [String: PersonalSummary]
    let collectiveFuel: CollectiveFuelSummary
    let hazardSummary: HazardSummary
    let routePreview: SummaryRoutePreview?
    let generatedAt: Int64
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
    let summary: RunSummary?

    init(
        name: String,
        description: String? = nil,
        joinCode: String,
        adminId: String,
        status: RunStatus,
        createdAt: Int64,
        startedAt: Int64?,
        driveStartedAt: Int64? = nil,
        endedAt: Int64?,
        maxDrivers: Int,
        route: RouteData? = nil,
        drivers: [String: DriverRecord]? = nil,
        hazards: [String: Hazard]? = nil,
        summary: RunSummary? = nil
    ) {
        self.name = name
        self.description = description
        self.joinCode = joinCode
        self.adminId = adminId
        self.status = status
        self.createdAt = createdAt
        self.startedAt = startedAt
        self.driveStartedAt = driveStartedAt
        self.endedAt = endedAt
        self.maxDrivers = maxDrivers
        self.route = route
        self.drivers = drivers
        self.hazards = hazards
        self.summary = summary
    }
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
