import XCTest

final class ClubRunNativeUITests: XCTestCase {
    func testLaunchShowsSignedOutAuthEntryPoints() {
        let app = launchApp(environment: ["CLUBRUN_UI_TEST_SIGNED_OUT": "1"])

        XCTAssertTrue(app.navigationBars["Log In"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["Email"].exists)
        XCTAssertTrue(app.secureTextFields["Password"].exists)
        XCTAssertTrue(app.buttons["Log In"].exists)
        XCTAssertTrue(app.buttons["Create Account"].exists)
        XCTAssertTrue(app.buttons["Forgot Password"].exists)
    }

    func testLaunchShowsHomeHubForProfileCompleteUser() {
        let app = launchApp(environment: ["CLUBRUN_UI_TEST_PROFILE_COMPLETE": "1"])

        XCTAssertTrue(app.navigationBars["ClubRun"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Alex Driver"].exists)
        XCTAssertTrue(app.buttons["Create Run"].exists)
        XCTAssertTrue(app.buttons["Join Run"].exists)
    }

    func testCreateRunFormValidationRequiresName() {
        let app = launchApp(environment: ["CLUBRUN_UI_TEST_PROFILE_COMPLETE": "1"])

        XCTAssertTrue(app.buttons["Create Run"].waitForExistence(timeout: 5))
        app.buttons["Create Run"].tap()

        XCTAssertTrue(app.navigationBars["Create Run"].waitForExistence(timeout: 5))
        app.buttons["Create Run"].tap()

        XCTAssertTrue(app.staticTexts["Enter a run name."].waitForExistence(timeout: 5))
    }

    func testJoinRunFormValidationRequiresCode() {
        let app = launchApp(environment: ["CLUBRUN_UI_TEST_PROFILE_COMPLETE": "1"])

        let joinRunButton = app.buttons["homeHub.joinRunButton"]
        XCTAssertTrue(joinRunButton.waitForExistence(timeout: 5))
        joinRunButton.tap()

        XCTAssertTrue(app.navigationBars["Join Run"].waitForExistence(timeout: 5))
        let resolveButton = app.buttons["joinRun.resolveButton"]
        XCTAssertTrue(resolveButton.waitForExistence(timeout: 5))
        resolveButton.tap()

        let message = app.staticTexts["joinRun.message"]
        XCTAssertTrue(message.waitForExistence(timeout: 5))
        XCTAssertEqual(message.label, "Enter a six-digit code.")
    }

    func testAdminLobbyShowsAdminControls() {
        let app = launchApp(environment: ["CLUBRUN_UI_TEST_PROFILE_COMPLETE": "1"])

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
        let app = launchApp(environment: ["CLUBRUN_UI_TEST_PROFILE_COMPLETE": "1"])

        XCTAssertTrue(app.buttons["Create Run"].waitForExistence(timeout: 5))
        app.buttons["Create Run"].tap()
        XCTAssertTrue(app.navigationBars["Create Run"].waitForExistence(timeout: 5))
        app.textFields["Run Name"].tap()
        app.textFields["Run Name"].typeText("Route Run")
        app.buttons["Create Run"].tap()

        XCTAssertTrue(app.buttons["adminLobby.routeRow"].waitForExistence(timeout: 5))
        app.buttons["adminLobby.routeRow"].tap()

        XCTAssertTrue(app.staticTexts["ROUTE SETUP"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.otherElements["routeSetup.map"].exists)
        XCTAssertTrue(app.buttons["routeSetup.settingsButton"].exists)
    }

    func testDriverLobbyDoesNotShowAdminControls() {
        let app = launchApp(environment: ["CLUBRUN_UI_TEST_PROFILE_COMPLETE": "1"])

        let joinRunButton = app.buttons["homeHub.joinRunButton"]
        XCTAssertTrue(joinRunButton.waitForExistence(timeout: 5))
        joinRunButton.tap()
        XCTAssertTrue(app.navigationBars["Join Run"].waitForExistence(timeout: 5))
        app.textFields["joinRun.codeField"].tap()
        app.textFields["joinRun.codeField"].typeText("123456")
        app.buttons["joinRun.resolveButton"].tap()
        XCTAssertTrue(app.buttons["joinRun.submitButton"].waitForExistence(timeout: 5))
        app.buttons["joinRun.submitButton"].tap()

        XCTAssertTrue(app.navigationBars["Driver Lobby"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Start Drive"].exists)
        XCTAssertFalse(app.buttons["Share"].exists)
        XCTAssertFalse(app.buttons["Copy"].exists)
    }

    override func tearDown() {
        XCUIApplication().terminate()
        super.tearDown()
    }

    private func launchApp(environment: [String: String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-ApplePersistenceIgnoreState", "YES"]
        environment.forEach { key, value in
            app.launchEnvironment[key] = value
        }
        app.launch()
        return app
    }
}
