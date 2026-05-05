import XCTest
@testable import ClubRunNative

final class BackendPathsTests: XCTestCase {
    func testCentralizesFirebasePaths() {
        XCTAssertEqual(BackendPaths.joinCode("123456"), "joinCodes/123456")
        XCTAssertEqual(BackendPaths.run("run_1"), "runs/run_1")
        XCTAssertEqual(BackendPaths.runStatus("run_1"), "runs/run_1/status")
        XCTAssertEqual(BackendPaths.route("run_1"), "runs/run_1/route")
        XCTAssertEqual(BackendPaths.driver("run_1", uid: "uid_1"), "runs/run_1/drivers/uid_1")
        XCTAssertEqual(BackendPaths.driverLocation("run_1", uid: "uid_1"), "runs/run_1/drivers/uid_1/location")
        XCTAssertEqual(BackendPaths.hazard("run_1", hazardId: "hazard_1"), "runs/run_1/hazards/hazard_1")
        XCTAssertEqual(BackendPaths.summary("run_1"), "runs/run_1/summary")
        XCTAssertEqual(BackendPaths.trackPoint("run_1", uid: "uid_1", pointId: "point_1"), "tracks/run_1/uid_1/point_1")
    }
}

