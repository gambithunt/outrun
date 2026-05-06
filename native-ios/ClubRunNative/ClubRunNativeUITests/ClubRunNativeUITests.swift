import XCTest

final class ClubRunNativeUITests: XCTestCase {
    func testLaunchShowsSignedOutAuthEntryPoints() {
        let app = XCUIApplication()
        app.launchEnvironment["CLUBRUN_UI_TEST_SIGNED_OUT"] = "1"
        app.launch()

        XCTAssertTrue(app.navigationBars["Log In"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["Email"].exists)
        XCTAssertTrue(app.secureTextFields["Password"].exists)
        XCTAssertTrue(app.buttons["Log In"].exists)
        XCTAssertTrue(app.buttons["Create Account"].exists)
        XCTAssertTrue(app.buttons["Forgot Password"].exists)
    }

    func testLaunchShowsHomeHubForProfileCompleteUser() {
        let app = XCUIApplication()
        app.launchEnvironment["CLUBRUN_UI_TEST_PROFILE_COMPLETE"] = "1"
        app.launch()

        XCTAssertTrue(app.navigationBars["ClubRun"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Alex Driver"].exists)
        XCTAssertTrue(app.buttons["Create Run"].exists)
        XCTAssertTrue(app.buttons["Join Run"].exists)
    }

    func testCreateRunFormValidationRequiresName() {
        let app = XCUIApplication()
        app.launchEnvironment["CLUBRUN_UI_TEST_PROFILE_COMPLETE"] = "1"
        app.launch()

        XCTAssertTrue(app.buttons["Create Run"].waitForExistence(timeout: 5))
        app.buttons["Create Run"].tap()

        XCTAssertTrue(app.navigationBars["Create Run"].waitForExistence(timeout: 5))
        app.buttons["Create Run"].tap()

        XCTAssertTrue(app.staticTexts["Enter a run name."].waitForExistence(timeout: 5))
    }

    func testJoinRunFormValidationRequiresCode() {
        let app = XCUIApplication()
        app.launchEnvironment["CLUBRUN_UI_TEST_PROFILE_COMPLETE"] = "1"
        app.launch()

        XCTAssertTrue(app.buttons["Join Run"].waitForExistence(timeout: 5))
        app.buttons["Join Run"].tap()

        XCTAssertTrue(app.navigationBars["Join Run"].waitForExistence(timeout: 5))
        app.buttons["Find Run"].tap()

        XCTAssertTrue(app.staticTexts["Enter a six-digit code."].waitForExistence(timeout: 5))
    }

    func testAdminLobbyShowsAdminControls() {
        let app = XCUIApplication()
        app.launchEnvironment["CLUBRUN_UI_TEST_PROFILE_COMPLETE"] = "1"
        app.launch()

        XCTAssertTrue(app.buttons["Create Run"].waitForExistence(timeout: 5))
        app.buttons["Create Run"].tap()
        XCTAssertTrue(app.navigationBars["Create Run"].waitForExistence(timeout: 5))
        app.textFields["Run Name"].tap()
        app.textFields["Run Name"].typeText("Morning Run")
        app.buttons["Create Run"].tap()

        XCTAssertTrue(app.navigationBars["Admin Lobby"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Start Drive"].exists)
        XCTAssertTrue(app.buttons["Share"].exists)
        XCTAssertTrue(app.buttons["Copy"].exists)
        XCTAssertTrue(app.buttons["adminLobby.routeRow"].exists)
        XCTAssertTrue(app.buttons["adminLobby.driversRow"].exists)
    }

    func testAdminLobbyOpensRouteSetup() {
        let app = XCUIApplication()
        app.launchEnvironment["CLUBRUN_UI_TEST_PROFILE_COMPLETE"] = "1"
        app.launch()

        XCTAssertTrue(app.buttons["Create Run"].waitForExistence(timeout: 5))
        app.buttons["Create Run"].tap()
        XCTAssertTrue(app.navigationBars["Create Run"].waitForExistence(timeout: 5))
        app.textFields["Run Name"].tap()
        app.textFields["Run Name"].typeText("Route Run")
        app.buttons["Create Run"].tap()

        XCTAssertTrue(app.buttons["adminLobby.routeRow"].waitForExistence(timeout: 5))
        app.buttons["adminLobby.routeRow"].tap()

        XCTAssertTrue(app.navigationBars["Route Setup"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.otherElements["routeSetup.map"].exists)
    }

    func testDriverLobbyDoesNotShowAdminControls() {
        let app = XCUIApplication()
        app.launchEnvironment["CLUBRUN_UI_TEST_PROFILE_COMPLETE"] = "1"
        app.launch()

        XCTAssertTrue(app.buttons["Join Run"].waitForExistence(timeout: 5))
        app.buttons["Join Run"].tap()
        XCTAssertTrue(app.navigationBars["Join Run"].waitForExistence(timeout: 5))
        app.textFields["Join Code"].tap()
        app.textFields["Join Code"].typeText("123456")
        app.buttons["Find Run"].tap()
        XCTAssertTrue(app.buttons["Join Run"].waitForExistence(timeout: 5))
        app.buttons["Join Run"].tap()

        XCTAssertTrue(app.navigationBars["Driver Lobby"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Start Drive"].exists)
        XCTAssertFalse(app.buttons["Share"].exists)
        XCTAssertFalse(app.buttons["Copy"].exists)
    }
}
