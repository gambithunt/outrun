import XCTest

final class ClubRunNativeUITests: XCTestCase {
    func testLaunchShowsBackendDiagnostics() {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.navigationBars["ClubRun"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Backend"].exists)
        XCTAssertTrue(app.staticTexts["Auth"].exists)
        XCTAssertTrue(app.staticTexts["Database"].exists)
        XCTAssertTrue(app.staticTexts["UID"].exists)
        XCTAssertTrue(app.staticTexts["Run write/read"].exists)
        XCTAssertTrue(app.staticTexts["Create Run"].exists)
        XCTAssertTrue(app.buttons["Create test run"].exists)
    }
}
