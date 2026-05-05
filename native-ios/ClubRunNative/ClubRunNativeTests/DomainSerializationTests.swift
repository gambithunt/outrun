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

    private func decodeFixture<T: Decodable>(_ name: String) throws -> T {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: name, withExtension: "json"))
        let data = try Data(contentsOf: url)
        return try JSONDecoder.clubRunFirebase.decode(T.self, from: data)
    }
}

