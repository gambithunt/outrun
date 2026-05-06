import XCTest
@testable import ClubRunNative

final class DomainSerializationTests: XCTestCase {
    func testDecodesMinimalDraftRunFixture() throws {
        let run: Run = try decodeFixture("minimal-draft-run")

        XCTAssertEqual(run.name, "Sunday Run")
        XCTAssertEqual(run.status, .draft)
        XCTAssertEqual(run.joinCode, "123456")
        XCTAssertEqual(run.startedAt, nil)
        XCTAssertEqual(run.endedAt, nil)
        XCTAssertEqual(run.maxDrivers, 15)
    }

    func testRoundTripsActiveRunWithRouteFixture() throws {
        let run: Run = try decodeFixture("active-run-with-route")
        let encoded = try JSONEncoder.clubRunFirebase.encode(run)
        let decoded = try JSONDecoder.clubRunFirebase.decode(Run.self, from: encoded)

        XCTAssertEqual(decoded.status, .active)
        XCTAssertEqual(decoded.route?.points.first, [-26.2041, 28.0473])
        XCTAssertEqual(decoded.route?.source, .drawn)
        XCTAssertEqual(decoded.drivers?["uid_driver_1"]?.profile.fuelType, .petrol)
        XCTAssertEqual(decoded.hazards?["hazard_1"]?.type, .pothole)
    }

    func testEncodesBackendCompatibleLocationKeys() throws {
        let location = DriverLocation(
            lat: -26.2041,
            lng: 28.0473,
            heading: 180,
            speed: 12.4,
            accuracy: 5,
            timestamp: 1_710_000_003_000
        )

        let data = try JSONEncoder.clubRunFirebase.encode(location)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["lat"] as? Double, -26.2041)
        XCTAssertEqual(object["lng"] as? Double, 28.0473)
        XCTAssertEqual(object["timestamp"] as? Int64, 1_710_000_003_000)
    }

    func testEncodesUserProfileWithGeneratedBadgeFields() throws {
        let profile = UserProfile(
            displayName: "Alex Driver",
            carMake: "Porsche",
            carModel: "911",
            badge: DriverBadge(text: "AD", colorHex: "#1E88E5"),
            homeClub: "Johannesburg",
            createdAt: 1_800_000_000_000,
            updatedAt: 1_800_000_001_000,
            stats: UserStats(
                totalRuns: 2,
                totalDistanceKm: 312.4,
                hazardsReported: 3,
                mostUsedCarId: nil
            )
        )

        let object = try encodeObject(profile)

        XCTAssertEqual(object["displayName"] as? String, "Alex Driver")
        XCTAssertEqual(object["carMake"] as? String, "Porsche")
        XCTAssertEqual(object["carModel"] as? String, "911")
        XCTAssertEqual(object["badge"] as? [String: String], ["colorHex": "#1E88E5", "text": "AD"])
        XCTAssertEqual((object["stats"] as? [String: Any])?["hazardsReported"] as? Int, 3)
    }

    func testGeneratesDriverBadgeFromDisplayName() {
        let badge = DriverBadge.generated(
            displayName: "Alex Driver",
            carMake: "Porsche",
            carModel: "911",
            paletteIndex: 2
        )

        XCTAssertEqual(badge.text, "AD")
        XCTAssertEqual(badge.colorHex, "#F4511E")
    }

    func testRoundTripsAllRunStates() throws {
        for status in [RunStatus.draft, .ready, .active, .ended] {
            let run = makeRun(status: status)
            let decoded = try roundTrip(run)

            XCTAssertEqual(decoded.status, status)
        }
    }

    func testEncodesJoinCodeRecord() throws {
        let record = JoinCodeRecord(runId: "run_1", createdAt: 1_800_000_000_000)
        let object = try encodeObject(record)

        XCTAssertEqual(object["runId"] as? String, "run_1")
        XCTAssertEqual(object["createdAt"] as? Int64, 1_800_000_000_000)
    }

    func testEncodesDriverRecordWithProfileSnapshotPresenceAndFinishState() throws {
        let record = DriverRecord(
            profile: DriverProfile(
                name: "Alex Driver",
                displayName: "Alex Driver",
                carMake: "Porsche",
                carModel: "911",
                badge: DriverBadge(text: "AD", colorHex: "#1E88E5"),
                engineSize: nil,
                engineUnit: nil,
                fuelType: .petrol,
                fuelEfficiency: nil,
                fuelUnit: nil
            ),
            location: makeLocation(),
            joinedAt: 1_800_000_000_000,
            leftAt: nil,
            presence: .online,
            finishState: .finished,
            finishedAt: 1_800_000_100_000,
            stats: DriverStats(topSpeed: 31.2, avgMovingSpeedMs: 14.2, totalDistanceKm: 54, totalDriveTimeMinutes: 68, stopCount: 2, avgStopTimeSec: 24)
        )

        let object = try encodeObject(record)
        let profile = try XCTUnwrap(object["profile"] as? [String: Any])

        XCTAssertEqual(profile["displayName"] as? String, "Alex Driver")
        XCTAssertEqual(profile["badge"] as? [String: String], ["colorHex": "#1E88E5", "text": "AD"])
        XCTAssertEqual(object["presence"] as? String, "online")
        XCTAssertEqual(object["finishState"] as? String, "finished")
        XCTAssertEqual(object["finishedAt"] as? Int64, 1_800_000_100_000)
    }

    func testEncodesLatestLocationAndTrackPointPayloads() throws {
        let locationObject = try encodeObject(makeLocation())
        let trackPointObject = try encodeObject(
            TrackPoint(
                lat: -26.2041,
                lng: 28.0473,
                heading: 180,
                speed: 12.4,
                accuracy: 5,
                timestamp: 1_800_000_002_000
            )
        )

        XCTAssertEqual(locationObject["lat"] as? Double, -26.2041)
        XCTAssertEqual(trackPointObject["lat"] as? Double, -26.2041)
        XCTAssertEqual(trackPointObject["timestamp"] as? Int64, 1_800_000_002_000)
    }

    func testEncodesRouteDataWithAppleMapsAndGPXSources() throws {
        let appleMaps = makeRoute(source: .appleMaps)
        let gpx = makeRoute(source: .gpx)

        XCTAssertEqual(try encodeObject(appleMaps)["source"] as? String, "apple_maps")
        XCTAssertEqual(try encodeObject(gpx)["source"] as? String, "gpx")
    }

    func testEncodesRouteStopsForStartWaypointAndDestination() throws {
        let route = makeRoute(source: .appleMaps)
        let object = try encodeObject(route)
        let stops = try XCTUnwrap(object["stops"] as? [[String: Any]])

        XCTAssertEqual(stops.compactMap { $0["kind"] as? String }, ["start", "waypoint", "destination"])
        XCTAssertEqual(stops.compactMap { $0["order"] as? Int }, [0, 1, 2])
    }

    func testEncodesSupportedHazardTypes() throws {
        let expected: [(HazardType, String)] = [
            (.pothole, "pothole"),
            (.roadworks, "roadworks"),
            (.police, "police"),
            (.mobileCamera, "mobile_camera"),
            (.debris, "debris"),
            (.brokenDownCar, "broken_down_car")
        ]

        for (type, rawValue) in expected {
            let object = try encodeObject(makeHazard(type: type))
            XCTAssertEqual(object["type"] as? String, rawValue)
        }
    }

    func testEncodesHazardConfidenceExpiryAndConfirmationReadyFields() throws {
        let hazard = makeHazard(
            type: .police,
            confidence: 0.82,
            expiresAt: 1_800_000_600_000,
            confirmations: [
                "uid_driver_2": HazardConfirmation(
                    confirmedBy: "uid_driver_2",
                    reporterName: "Sam Driver",
                    confirmedAt: 1_800_000_030_000
                )
            ]
        )

        let object = try encodeObject(hazard)
        let confirmations = try XCTUnwrap(object["confirmations"] as? [String: [String: Any]])

        XCTAssertEqual(object["confidence"] as? Double, 0.82)
        XCTAssertEqual(object["expiresAt"] as? Int64, 1_800_000_600_000)
        XCTAssertEqual(confirmations["uid_driver_2"]?["confirmedBy"] as? String, "uid_driver_2")
        XCTAssertEqual(confirmations["uid_driver_2"]?["confirmedAt"] as? Int64, 1_800_000_030_000)
    }

    func testEncodesGroupAndPersonalSummaryPayloads() throws {
        let summary = RunSummary(
            totalDistanceKm: 54.2,
            totalDriveTimeMinutes: 72,
            driverStats: [
                "uid_driver_1": PersonalSummary(
                    name: "Alex Driver",
                    carMake: "Porsche",
                    carModel: "911",
                    badge: DriverBadge(text: "AD", colorHex: "#1E88E5"),
                    topSpeedKmh: 112,
                    avgMovingSpeedKmh: 67,
                    totalDistanceKm: 54.2,
                    totalDriveTimeMinutes: 72,
                    stopCount: 3,
                    avgStopTimeSec: 28,
                    fuelUsedLitres: 6.4,
                    fuelUsedKwh: nil,
                    fuelType: .petrol
                )
            ],
            collectiveFuel: CollectiveFuelSummary(petrolLitres: 6.4, dieselLitres: 0, hybridLitres: 0, electricKwh: 0),
            hazardSummary: HazardSummary(total: 2, byType: [.pothole: 1, .police: 1]),
            routePreview: SummaryRoutePreview(points: [[-26.2041, 28.0473]], speedBuckets: [40, 60, 80]),
            generatedAt: 1_800_000_700_000
        )

        let object = try encodeObject(summary)
        let driverStats = try XCTUnwrap(object["driverStats"] as? [String: [String: Any]])
        let hazardSummary = try XCTUnwrap(object["hazardSummary"] as? [String: Any])
        let byType = try XCTUnwrap(hazardSummary["byType"] as? [String: Int])

        XCTAssertEqual(object["totalDistanceKm"] as? Double, 54.2)
        XCTAssertEqual(driverStats["uid_driver_1"]?["badge"] as? [String: String], ["colorHex": "#1E88E5", "text": "AD"])
        XCTAssertEqual(byType["police"], 1)
    }

    private func decodeFixture<T: Decodable>(_ name: String) throws -> T {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: name, withExtension: "json"))
        let data = try Data(contentsOf: url)
        return try JSONDecoder.clubRunFirebase.decode(T.self, from: data)
    }

    private func roundTrip<T: Codable & Equatable>(_ value: T) throws -> T {
        let data = try JSONEncoder.clubRunFirebase.encode(value)
        return try JSONDecoder.clubRunFirebase.decode(T.self, from: data)
    }

    private func encodeObject<T: Encodable>(_ value: T) throws -> [String: Any] {
        let data = try JSONEncoder.clubRunFirebase.encode(value)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func makeRun(status: RunStatus) -> Run {
        Run(
            name: "Sunday Run",
            description: nil,
            joinCode: "123456",
            adminId: "uid_admin_1",
            status: status,
            createdAt: 1_800_000_000_000,
            startedAt: status == .draft ? nil : 1_800_000_001_000,
            driveStartedAt: status == .active || status == .ended ? 1_800_000_002_000 : nil,
            endedAt: status == .ended ? 1_800_000_100_000 : nil,
            maxDrivers: 15,
            route: nil,
            drivers: nil,
            hazards: nil,
            summary: nil
        )
    }

    private func makeLocation() -> DriverLocation {
        DriverLocation(
            lat: -26.2041,
            lng: 28.0473,
            heading: 180,
            speed: 12.4,
            accuracy: 5,
            timestamp: 1_800_000_002_000
        )
    }

    private func makeRoute(source: RouteSource) -> RouteData {
        RouteData(
            points: [[-26.2041, 28.0473], [-25.7479, 28.2293]],
            distanceMetres: 54_000,
            durationSeconds: 3_600,
            source: source,
            stops: [
                RouteStopDraft(id: "start", kind: .start, order: 0, label: "Start", lat: -26.2041, lng: 28.0473, source: .coordinates, placeId: nil),
                RouteStopDraft(id: "stop_1", kind: .waypoint, order: 1, label: "Scenic Stop", lat: -26.0, lng: 28.1, source: .search, placeId: "place_1"),
                RouteStopDraft(id: "finish", kind: .destination, order: 2, label: "Finish", lat: -25.7479, lng: 28.2293, source: .pin, placeId: nil)
            ]
        )
    }

    private func makeHazard(
        type: HazardType,
        confidence: Double? = nil,
        expiresAt: Int64? = nil,
        confirmations: [String: HazardConfirmation]? = nil
    ) -> Hazard {
        Hazard(
            type: type,
            reportedBy: "uid_driver_1",
            reporterName: "Alex Driver",
            lat: -26.18,
            lng: 28.05,
            timestamp: 1_800_000_003_000,
            dismissed: false,
            reportCount: 1,
            confidence: confidence,
            expiresAt: expiresAt,
            confirmations: confirmations
        )
    }
}
