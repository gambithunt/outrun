import XCTest
@testable import ClubRunNative

final class FirebaseBootstrapTests: XCTestCase {
    @MainActor
    func testBootstrapConfiguresFirebaseOnlyOnceAtStartup() {
        let configurator = RecordingFirebaseConfiguring()
        let bootstrap = FirebaseBootstrapService(configurator: configurator)

        bootstrap.configure(.development)
        bootstrap.configure(.development)

        XCTAssertEqual(configurator.defaultAppConfigureCallCount, 1)
    }

    @MainActor
    func testBootstrapKeepsDatabaseEmulatorConfigurationAvailable() {
        let configurator = RecordingFirebaseConfiguring()
        let bootstrap = FirebaseBootstrapService(configurator: configurator)

        bootstrap.configure(.development)
        bootstrap.configure(.development)

        XCTAssertEqual(
            configurator.databaseEmulatorConfigurations,
            [EmulatorEndpoint(host: "127.0.0.1", port: 9000)]
        )
    }

    @MainActor
    func testProductionConfigurationDoesNotEnableEmulators() {
        let configurator = RecordingFirebaseConfiguring()
        let bootstrap = FirebaseBootstrapService(configurator: configurator)

        bootstrap.configure(.production)

        XCTAssertEqual(configurator.defaultAppConfigureCallCount, 1)
        XCTAssertTrue(configurator.authEmulatorConfigurations.isEmpty)
        XCTAssertTrue(configurator.databaseEmulatorConfigurations.isEmpty)
    }
}

@MainActor
private final class RecordingFirebaseConfiguring: FirebaseConfiguring {
    var defaultAppConfigureCallCount = 0
    var authEmulatorConfigurations: [EmulatorEndpoint] = []
    var databaseEmulatorConfigurations: [EmulatorEndpoint] = []

    func configureDefaultApp() {
        defaultAppConfigureCallCount += 1
    }

    func useAuthEmulator(host: String, port: Int) {
        authEmulatorConfigurations.append(EmulatorEndpoint(host: host, port: port))
    }

    func useDatabaseEmulator(host: String, port: Int) {
        databaseEmulatorConfigurations.append(EmulatorEndpoint(host: host, port: port))
    }
}
