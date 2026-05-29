import XCTest
@testable import ClubRunNative

@MainActor
final class HomeHubTests: XCTestCase {
    func testHomeHubViewModelShowsIdentityAndNoActiveRunWhenNoStoredSessionExists() async {
        let router = AppRouter()
        let store = InMemoryActiveRunStore()
        let viewModel = HomeHubViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            activeRunStore: store,
            runReader: InMemoryRunReader(),
            router: router
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.identity.displayName, "Alex Driver")
        XCTAssertEqual(viewModel.identity.badge, DriverBadge(text: "AD", colorHex: "#1E88E5"))
        XCTAssertEqual(viewModel.identity.vehicle, "Porsche 911")
        XCTAssertNil(viewModel.activeRunCard)
    }

    func testHomeHubViewModelShowsActiveRunCardForStoredActiveRun() async {
        let router = AppRouter()
        let store = InMemoryActiveRunStore(storedSession: ActiveRunSessionMetadata(runId: "run_1"))
        let runReader = InMemoryRunReader(runs: ["run_1": makeRun(name: "Sunday Drive", adminId: "uid_1", status: .active)])
        let viewModel = HomeHubViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            activeRunStore: store,
            runReader: runReader,
            router: router
        )

        await viewModel.load()

        XCTAssertEqual(
            viewModel.activeRunCard,
            ActiveRunCard(runId: "run_1", runName: "Sunday Drive", status: .active, statusText: "Active", role: .admin)
        )
    }

    func testClassifiesActiveRunRoleAsAdminOrDriver() {
        let adminRun = makeRun(name: "Admin Run", adminId: "uid_1", status: .draft)
        let driverRun = makeRun(
            name: "Driver Run",
            adminId: "admin_uid",
            status: .ready,
            drivers: ["uid_1": makeDriverRecord()]
        )

        XCTAssertEqual(HomeHubActiveRunResolver.role(for: "uid_1", in: adminRun), ActiveRunRole.admin)
        XCTAssertEqual(HomeHubActiveRunResolver.role(for: "uid_1", in: driverRun), ActiveRunRole.driver)
        XCTAssertNil(HomeHubActiveRunResolver.role(for: "stranger_uid", in: driverRun))
    }

    func testStoredActiveRunValidationClearsMissingEndedOrUnrelatedRuns() async {
        let router = AppRouter()
        let store = InMemoryActiveRunStore(storedSession: ActiveRunSessionMetadata(runId: "run_1"))
        let runReader = InMemoryRunReader(runs: ["run_1": makeRun(name: "Ended Run", adminId: "uid_1", status: .ended)])
        let viewModel = HomeHubViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            activeRunStore: store,
            runReader: runReader,
            router: router
        )

        await viewModel.load()

        XCTAssertNil(viewModel.activeRunCard)
        XCTAssertTrue(store.didClear)
    }

    func testHomeHubRoutesCreateJoinSettingsAndActiveRunThroughRouter() async {
        let router = AppRouter()
        let store = InMemoryActiveRunStore(storedSession: ActiveRunSessionMetadata(runId: "run_1"))
        let runReader = InMemoryRunReader(runs: ["run_1": makeRun(name: "Sunday Drive", adminId: "uid_1", status: .active)])
        let viewModel = HomeHubViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            activeRunStore: store,
            runReader: runReader,
            router: router
        )
        await viewModel.load()

        viewModel.openCreateRun()
        XCTAssertEqual(router.presentedRoute, AppRoute.createRun)

        viewModel.openJoinRun()
        XCTAssertEqual(router.presentedRoute, AppRoute.joinRun)

        viewModel.openSettings()
        XCTAssertEqual(router.presentedRoute, AppRoute.settings)

        viewModel.openActiveRun()
        XCTAssertEqual(router.presentedRoute, AppRoute.liveDrive(runId: "run_1", role: .admin))
    }

    func testSummaryShareTextIncludesCoreMetricsAndDrivers() {
        let summary = RunSummary(
            totalDistanceKm: 83.2,
            totalDriveTimeMinutes: 89,
            driverStats: [
                "uid_1": PersonalSummary(
                    name: "Alex",
                    carMake: "Porsche",
                    carModel: "911",
                    badge: DriverBadge(text: "AD", colorHex: "#1E88E5"),
                    topSpeedKmh: nil,
                    avgMovingSpeedKmh: nil,
                    totalDistanceKm: 83.2,
                    totalDriveTimeMinutes: 89,
                    stopCount: nil,
                    avgStopTimeSec: nil,
                    fuelUsedLitres: nil,
                    fuelUsedKwh: nil,
                    fuelType: .petrol
                ),
                "uid_2": PersonalSummary(
                    name: "Sam",
                    carMake: "BMW",
                    carModel: "M3",
                    badge: DriverBadge(text: "SM", colorHex: "#43A047"),
                    topSpeedKmh: nil,
                    avgMovingSpeedKmh: nil,
                    totalDistanceKm: 81.9,
                    totalDriveTimeMinutes: 91,
                    stopCount: nil,
                    avgStopTimeSec: nil,
                    fuelUsedLitres: nil,
                    fuelUsedKwh: nil,
                    fuelType: .petrol
                ),
            ],
            collectiveFuel: CollectiveFuelSummary(petrolLitres: 0, dieselLitres: 0, hybridLitres: 0, electricKwh: 0),
            hazardSummary: HazardSummary(total: 2, byType: [.pothole: 1, .police: 1]),
            routePreview: SummaryRoutePreview(points: [[-33.9, 18.4], [-34.0, 18.5]], speedBuckets: []),
            generatedAt: 1_800_000_090_000
        )

        XCTAssertEqual(
            SummaryShareTextFormatter.shareText(runName: "Sunday Drive", summary: summary),
            """
            Sunday Drive
            Distance: 83.2 km
            Time: 1 hr 29 min
            Hazards: 2
            Drivers:
            - Alex · Porsche 911 · 83.2 km
            - Sam · BMW M3 · 81.9 km
            """
        )
    }

    func testSummaryShareTextIncludesDriverSpeedAndGForceWithoutRanking() {
        let summary = RunSummary(
            totalDistanceKm: 83.2,
            totalDriveTimeMinutes: 89,
            driverStats: [
                "uid_1": PersonalSummary(
                    name: "Alex",
                    carMake: "Porsche",
                    carModel: "911",
                    badge: DriverBadge(text: "AD", colorHex: "#1E88E5"),
                    topSpeedKmh: 137,
                    avgMovingSpeedKmh: 72,
                    totalDistanceKm: 83.2,
                    totalDriveTimeMinutes: 89,
                    stopCount: 2,
                    avgStopTimeSec: 180,
                    maxGForce: 0.42,
                    fuelUsedLitres: nil,
                    fuelUsedKwh: nil,
                    fuelType: .petrol
                ),
                "uid_2": PersonalSummary(
                    name: "Sam",
                    carMake: "BMW",
                    carModel: "M3",
                    badge: DriverBadge(text: "SM", colorHex: "#43A047"),
                    topSpeedKmh: 151,
                    avgMovingSpeedKmh: 70,
                    totalDistanceKm: 81.9,
                    totalDriveTimeMinutes: 91,
                    stopCount: 1,
                    avgStopTimeSec: 210,
                    maxGForce: 0.55,
                    fuelUsedLitres: nil,
                    fuelUsedKwh: nil,
                    fuelType: .petrol
                )
            ],
            collectiveFuel: CollectiveFuelSummary(petrolLitres: 0, dieselLitres: 0, hybridLitres: 0, electricKwh: 0),
            hazardSummary: HazardSummary(total: 0, byType: [:]),
            routePreview: nil,
            generatedAt: 1_800_000_090_000
        )

        XCTAssertEqual(
            SummaryShareTextFormatter.shareText(runName: "Sunday Drive", summary: summary),
            """
            Sunday Drive
            Distance: 83.2 km
            Time: 1 hr 29 min
            Hazards: 0
            Drivers:
            - Alex · Porsche 911 · 83.2 km · top 137 km/h · max 0.42 g
            - Sam · BMW M3 · 81.9 km · top 151 km/h · max 0.55 g
            """
        )
    }

    func testSummaryLoadWritesPostDriveHistoryEntry() async {
        let historyStore = InMemorySummaryHistoryStore()
        let runReader = InMemoryRunReader(runs: [
            "run_ended_1": makeRun(
                name: "Sunday Drive",
                adminId: "uid_1",
                status: .ended,
                endedAt: 1_800_000_200_000,
                summary: makeSummary()
            )
        ])
        let viewModel = SummaryViewModel(
            uid: "uid_1",
            runId: "run_ended_1",
            runReader: runReader,
            summaryHistoryStore: historyStore
        )

        await viewModel.load()

        XCTAssertEqual(
            historyStore.entries,
            [
                SummaryHistoryEntry(
                    runId: "run_ended_1",
                    runName: "Sunday Drive",
                    endedAt: 1_800_000_200_000,
                    distanceText: "83.2 km",
                    timeText: "89 min"
                )
            ]
        )
    }

    func testSummaryLoadRetriesUntilLatestEndedRunIsReadable() async {
        let historyStore = InMemorySummaryHistoryStore()
        let runReader = SequencedRunReader(results: [
            nil,
            makeRun(
                name: "Latest Drive",
                adminId: "uid_1",
                status: .ended,
                endedAt: 1_800_000_300_000,
                summary: makeSummary()
            )
        ])
        let viewModel = SummaryViewModel(
            uid: "uid_1",
            runId: "run_ended_1",
            runReader: runReader,
            summaryHistoryStore: historyStore,
            retryDelaysNanoseconds: [0]
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.title, "Latest Drive")
        XCTAssertEqual(viewModel.distanceText, "83.2 km")
        XCTAssertEqual(viewModel.participantDetails.map(\.title), ["Alex · Porsche 911 · You"])
        XCTAssertEqual(historyStore.entries.first?.runId, "run_ended_1")
        XCTAssertEqual(historyStore.entries.first?.runName, "Latest Drive")
        XCTAssertNil(viewModel.message)
    }

    func testSummaryUsesStoredUnitPreferenceForDistancesAndSpeeds() async {
        let unitsStore = InMemoryUnitPreferenceStore(units: .miles)
        let summary = RunSummary(
            totalDistanceKm: 10,
            totalDriveTimeMinutes: 12,
            driverStats: [
                "uid_1": PersonalSummary(
                    name: "Alex",
                    carMake: "Porsche",
                    carModel: "911",
                    badge: DriverBadge(text: "AD", colorHex: "#1E88E5"),
                    topSpeedKmh: 100,
                    avgMovingSpeedKmh: nil,
                    totalDistanceKm: 10,
                    totalDriveTimeMinutes: 12,
                    stopCount: nil,
                    avgStopTimeSec: nil,
                    fuelUsedLitres: nil,
                    fuelUsedKwh: nil,
                    fuelType: .petrol
                )
            ],
            collectiveFuel: CollectiveFuelSummary(petrolLitres: 0, dieselLitres: 0, hybridLitres: 0, electricKwh: 0),
            hazardSummary: HazardSummary(total: 0, byType: [:]),
            routePreview: nil,
            generatedAt: 1_800_000_090_000
        )
        let runReader = InMemoryRunReader(runs: [
            "run_ended_1": makeRun(name: "Sunday Drive", adminId: "uid_1", status: .ended, summary: summary)
        ])
        let viewModel = SummaryViewModel(
            uid: "uid_1",
            runId: "run_ended_1",
            runReader: runReader,
            unitPreferenceStore: unitsStore
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.distanceText, "6.2 mi")
        XCTAssertEqual(viewModel.participantDetails.first?.distanceText, "6.2 mi")
        XCTAssertEqual(viewModel.participantDetails.first?.speedText, "Top 62 mph")
    }

    func testSummaryShowsCurrentUserPersonalStatsAndPrivacySafeOtherDrivers() async {
        let runReader = InMemoryRunReader(runs: [
            "run_ended_1": makeRun(
                name: "Sunday Drive",
                adminId: "uid_1",
                status: .ended,
                drivers: [
                    "uid_1": makeDriverRecord(
                        name: "Alex",
                        carMake: "Porsche",
                        carModel: "911",
                        stats: DriverStats(
                            topSpeed: 30,
                            avgMovingSpeedMs: 12,
                            totalDistanceKm: 14.2,
                            totalDriveTimeMinutes: 18,
                            movingTimeMinutes: 15,
                            stoppedTimeMinutes: 3,
                            stopCount: 1,
                            avgStopTimeSec: 180,
                            maxGForce: 0.36
                        )
                    ),
                    "uid_2": makeDriverRecord(
                        name: "Sam",
                        carMake: "BMW",
                        carModel: "M3",
                        stats: DriverStats(
                            topSpeed: 40,
                            totalDistanceKm: 15.8,
                            totalDriveTimeMinutes: 19,
                            maxGForce: 0.44
                        )
                    )
                ],
                endedAt: 1_800_000_200_000
            )
        ])
        let viewModel = SummaryViewModel(
            uid: "uid_1",
            runId: "run_ended_1",
            runReader: runReader
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.participantDetails.map(\.title), [
            "Alex · Porsche 911 · You",
            "Sam · BMW M3"
        ])
        XCTAssertEqual(viewModel.participantDetails[0].statusText, "Ended with group")
        XCTAssertEqual(viewModel.participantDetails[0].distanceText, "14.2 km")
        XCTAssertEqual(viewModel.participantDetails[0].speedText, "Top 108 km/h")
        XCTAssertEqual(viewModel.participantDetails[0].gForceText, "0.36 g max")
        XCTAssertEqual(viewModel.participantDetails[1].statusText, "Ended with group")
        XCTAssertFalse(viewModel.participantDetails[1].hasPersonalStats)
        XCTAssertEqual(viewModel.currentUserSummary?.title, "Alex · Porsche 911 · You")
        XCTAssertEqual(viewModel.otherDriverSummaries.map(\.title), ["Sam · BMW M3"])
    }

    func testSummaryNormalizesCurrentUserOfflineStatusAfterGroupEnd() async {
        let runReader = InMemoryRunReader(runs: [
            "run_ended_1": makeRun(
                name: "Sunday Drive",
                adminId: "uid_1",
                status: .ended,
                drivers: [
                    "uid_1": makeDriverRecord(
                        name: "Alex",
                        carMake: "Porsche",
                        carModel: "911",
                        presence: .offline,
                        stats: DriverStats(totalDistanceKm: 14.2, totalDriveTimeMinutes: 18)
                    )
                ],
                endedAt: 1_800_000_200_000
            )
        ])
        let viewModel = SummaryViewModel(
            uid: "uid_1",
            runId: "run_ended_1",
            runReader: runReader
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.currentUserSummary?.statusText, "Ended with group")
    }

    func testUserDefaultsSummaryHistoryPersistsAndSortsEntries() {
        let suiteName = "clubrun.history.tests.\(UUID().uuidString)"
        let userDefaults = UserDefaults(suiteName: suiteName)!
        defer {
            userDefaults.removePersistentDomain(forName: suiteName)
        }
        let store = UserDefaultsSummaryHistoryStore(userDefaults: userDefaults)

        store.saveSummaryHistoryEntry(
            SummaryHistoryEntry(runId: "older", runName: "Older Run", endedAt: 1_800_000_100_000, distanceText: "10.0 km", timeText: "20 min"),
            uid: "uid_1"
        )
        store.saveSummaryHistoryEntry(
            SummaryHistoryEntry(runId: "newer", runName: "Newer Run", endedAt: 1_800_000_200_000, distanceText: "20.0 km", timeText: "40 min"),
            uid: "uid_1"
        )

        let reloadedStore = UserDefaultsSummaryHistoryStore(userDefaults: userDefaults)

        XCTAssertEqual(reloadedStore.readSummaryHistory(uid: "uid_1").map(\.runId), ["newer", "older"])
    }

    func testSettingsViewModelLoadsProfileHistoryUnitsAndDiagnostics() {
        let unitsStore = InMemoryUnitPreferenceStore(units: .miles)
        let historyStore = InMemorySummaryHistoryStore()
        historyStore.saveSummaryHistoryEntry(
            SummaryHistoryEntry(runId: "run_1", runName: "Coastal Run", endedAt: 1_800_000_200_000, distanceText: "12.0 km", timeText: "24 min"),
            uid: "uid_1"
        )
        let viewModel = SettingsViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            authService: RecordingSettingsAuthService(),
            profileService: UserProfileService(repository: RecordingSettingsProfileRepository(), cache: RecordingSettingsProfileCache()),
            unitPreferenceStore: unitsStore,
            summaryHistoryStore: historyStore,
            diagnostics: .enabled,
            onResetSession: {}
        )

        XCTAssertEqual(viewModel.displayName, "Alex Driver")
        XCTAssertEqual(viewModel.vehicleText, "Porsche 911")
        XCTAssertEqual(viewModel.selectedUnits, .miles)
        XCTAssertEqual(viewModel.historyEntries.map(\.runId), ["run_1"])
        XCTAssertTrue(viewModel.showsDiagnostics)
    }

    func testSettingsViewModelRefreshesHistoryAfterSummarySaved() {
        let historyStore = InMemorySummaryHistoryStore()
        let viewModel = SettingsViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            authService: RecordingSettingsAuthService(),
            profileService: UserProfileService(repository: RecordingSettingsProfileRepository(), cache: RecordingSettingsProfileCache()),
            unitPreferenceStore: InMemoryUnitPreferenceStore(),
            summaryHistoryStore: historyStore,
            diagnostics: .disabled,
            onResetSession: {}
        )

        historyStore.saveSummaryHistoryEntry(
            SummaryHistoryEntry(runId: "run_latest", runName: "Latest Drive", endedAt: 1_800_000_300_000, distanceText: "40.1 km", timeText: "7 min"),
            uid: "uid_1"
        )
        viewModel.refreshHistory()

        XCTAssertEqual(viewModel.historyEntries.map(\.runId), ["run_latest"])
        XCTAssertEqual(viewModel.historyEntries.first?.runName, "Latest Drive")
    }

    func testSettingsUnitPreferencePersistsSelection() {
        let unitsStore = InMemoryUnitPreferenceStore()
        let viewModel = SettingsViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            authService: RecordingSettingsAuthService(),
            profileService: UserProfileService(repository: RecordingSettingsProfileRepository(), cache: RecordingSettingsProfileCache()),
            unitPreferenceStore: unitsStore,
            summaryHistoryStore: InMemorySummaryHistoryStore(),
            diagnostics: .disabled,
            onResetSession: {}
        )

        viewModel.updateUnits(.miles)

        XCTAssertEqual(unitsStore.units, .miles)
        XCTAssertEqual(viewModel.selectedUnits, .miles)
    }

    func testSettingsHazardAlertAudioModeDefaultsAnnouncedAndPersistsSelection() {
        let alertModeStore = InMemoryHazardAlertAudioModeStore()
        let viewModel = SettingsViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            authService: RecordingSettingsAuthService(),
            profileService: UserProfileService(repository: RecordingSettingsProfileRepository(), cache: RecordingSettingsProfileCache()),
            unitPreferenceStore: InMemoryUnitPreferenceStore(),
            hazardAlertAudioModeStore: alertModeStore,
            summaryHistoryStore: InMemorySummaryHistoryStore(),
            diagnostics: .disabled,
            onResetSession: {}
        )

        XCTAssertEqual(viewModel.selectedHazardAlertAudioMode, .announced)

        viewModel.updateHazardAlertAudioMode(.simple)

        XCTAssertEqual(alertModeStore.mode, .simple)
        XCTAssertEqual(viewModel.selectedHazardAlertAudioMode, .simple)
    }

    func testSettingsResetPasswordUsesCurrentUserEmail() async {
        let authService = RecordingSettingsAuthService(session: AuthUserSession(uid: "uid_1", email: "alex@example.com"))
        let viewModel = SettingsViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            authService: authService,
            profileService: UserProfileService(repository: RecordingSettingsProfileRepository(), cache: RecordingSettingsProfileCache()),
            unitPreferenceStore: InMemoryUnitPreferenceStore(),
            summaryHistoryStore: InMemorySummaryHistoryStore(),
            diagnostics: .disabled,
            onResetSession: {}
        )

        await viewModel.resetPassword()

        XCTAssertEqual(authService.resetEmail, "alex@example.com")
        XCTAssertEqual(viewModel.message, "Password reset email sent.")
    }

    func testSettingsLoadsCurrentAccountEmail() async {
        let authService = RecordingSettingsAuthService(session: AuthUserSession(uid: "uid_1", email: "alex@example.com"))
        let viewModel = SettingsViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            authService: authService,
            profileService: UserProfileService(repository: RecordingSettingsProfileRepository(), cache: RecordingSettingsProfileCache()),
            unitPreferenceStore: InMemoryUnitPreferenceStore(),
            summaryHistoryStore: InMemorySummaryHistoryStore(),
            diagnostics: .disabled,
            onResetSession: {}
        )

        await viewModel.loadAccount()

        XCTAssertEqual(viewModel.emailText, "alex@example.com")
    }

    func testSettingsProfileEditWritesBackendAndCache() async {
        let repository = RecordingSettingsProfileRepository()
        let cache = RecordingSettingsProfileCache()
        let service = UserProfileService(repository: repository, cache: cache)
        let viewModel = SettingsViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            authService: RecordingSettingsAuthService(),
            profileService: service,
            unitPreferenceStore: InMemoryUnitPreferenceStore(),
            summaryHistoryStore: InMemorySummaryHistoryStore(),
            diagnostics: .disabled,
            nowMilliseconds: { 1_800_000_300_000 },
            onResetSession: {}
        )

        await viewModel.saveProfile(displayName: "Alex Updated", carMake: "BMW", carModel: "M3")

        XCTAssertEqual(repository.writtenProfile?.displayName, "Alex Updated")
        XCTAssertEqual(repository.writtenProfile?.carMake, "BMW")
        XCTAssertEqual(repository.writtenProfile?.carModel, "M3")
        XCTAssertEqual(cache.cachedProfile?.displayName, "Alex Updated")
        XCTAssertEqual(viewModel.displayName, "Alex Updated")
        XCTAssertEqual(viewModel.vehicleText, "BMW M3")
    }

    func testSettingsCarSuggestionsFilterMakeAndModelsWithFreeTextFallback() {
        let viewModel = SettingsViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            authService: RecordingSettingsAuthService(),
            profileService: UserProfileService(repository: RecordingSettingsProfileRepository(), cache: RecordingSettingsProfileCache()),
            unitPreferenceStore: InMemoryUnitPreferenceStore(),
            summaryHistoryStore: InMemorySummaryHistoryStore(),
            diagnostics: .disabled,
            onResetSession: {}
        )

        XCTAssertEqual(Array(viewModel.carMakeSuggestions(query: "po").prefix(2)), ["Polestar", "Porsche"])
        XCTAssertEqual(viewModel.carModelSuggestions(make: "Porsche", query: "9"), ["911"])
        XCTAssertTrue(viewModel.carMakeSuggestions(query: "Caterham").isEmpty)
    }

    func testSettingsDiagnosticsRowsAreTuckedBehindBuildConfiguration() {
        let viewModel = SettingsViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            authService: RecordingSettingsAuthService(),
            profileService: UserProfileService(repository: RecordingSettingsProfileRepository(), cache: RecordingSettingsProfileCache()),
            unitPreferenceStore: InMemoryUnitPreferenceStore(),
            summaryHistoryStore: InMemorySummaryHistoryStore(),
            diagnostics: .enabled,
            diagnosticsSnapshot: SettingsDiagnosticsSnapshot(
                authMode: "Firebase Email",
                authUID: "uid_1",
                databaseMode: "Emulator",
                backendStatus: "Not run"
            ),
            onResetSession: {}
        )

        XCTAssertTrue(viewModel.showsDiagnostics)
        XCTAssertEqual(
            viewModel.diagnosticsRows,
            [
                SettingsDiagnosticsRow(title: "Auth", value: "Firebase Email"),
                SettingsDiagnosticsRow(title: "UID", value: "uid_1"),
                SettingsDiagnosticsRow(title: "Database", value: "Emulator"),
                SettingsDiagnosticsRow(title: "Smoke", value: "Not run")
            ]
        )
    }

    func testSettingsSignOutInvokesResetSession() {
        var didReset = false
        let viewModel = SettingsViewModel(
            uid: "uid_1",
            profile: makeProfile(),
            authService: RecordingSettingsAuthService(),
            profileService: UserProfileService(repository: RecordingSettingsProfileRepository(), cache: RecordingSettingsProfileCache()),
            unitPreferenceStore: InMemoryUnitPreferenceStore(),
            summaryHistoryStore: InMemorySummaryHistoryStore(),
            diagnostics: .disabled,
            onResetSession: { didReset = true }
        )

        viewModel.signOut()

        XCTAssertTrue(didReset)
    }

    private func makeProfile() -> UserProfile {
        UserProfile(
            displayName: "Alex Driver",
            carMake: "Porsche",
            carModel: "911",
            badge: DriverBadge(text: "AD", colorHex: "#1E88E5"),
            homeClub: nil,
            createdAt: 1_800_000_000_000,
            updatedAt: 1_800_000_000_000,
            stats: UserStats(totalRuns: 0, totalDistanceKm: 0, hazardsReported: 0, mostUsedCarId: nil)
        )
    }

    private func makeRun(
        name: String,
        adminId: String,
        status: RunStatus,
        drivers: [String: DriverRecord]? = nil,
        endedAt: Int64? = nil,
        summary: RunSummary? = nil
    ) -> Run {
        Run(
            name: name,
            description: nil,
            joinCode: "123456",
            adminId: adminId,
            status: status,
            createdAt: 1_800_000_000_000,
            startedAt: nil,
            endedAt: endedAt,
            maxDrivers: 15,
            drivers: drivers,
            summary: summary
        )
    }

    private func makeSummary() -> RunSummary {
        RunSummary(
            totalDistanceKm: 83.2,
            totalDriveTimeMinutes: 89,
            driverStats: [
                "uid_1": PersonalSummary(
                    name: "Alex",
                    carMake: "Porsche",
                    carModel: "911",
                    badge: DriverBadge(text: "AD", colorHex: "#1E88E5"),
                    topSpeedKmh: nil,
                    avgMovingSpeedKmh: nil,
                    totalDistanceKm: 83.2,
                    totalDriveTimeMinutes: 89,
                    stopCount: nil,
                    avgStopTimeSec: nil,
                    fuelUsedLitres: nil,
                    fuelUsedKwh: nil,
                    fuelType: .petrol
                )
            ],
            collectiveFuel: CollectiveFuelSummary(petrolLitres: 0, dieselLitres: 0, hybridLitres: 0, electricKwh: 0),
            hazardSummary: HazardSummary(total: 0, byType: [:]),
            routePreview: nil,
            generatedAt: 1_800_000_200_000
        )
    }

    private func makeDriverRecord(
        name: String = "Alex Driver",
        carMake: String = "Porsche",
        carModel: String = "911",
        presence: DriverPresence = .online,
        stats: DriverStats? = nil
    ) -> DriverRecord {
        DriverRecord(
            profile: DriverProfile(
                name: name,
                displayName: name,
                carMake: carMake,
                carModel: carModel,
                badge: DriverBadge(text: "AD", colorHex: "#1E88E5"),
                fuelType: .petrol
            ),
            joinedAt: 1_800_000_000_000,
            leftAt: nil,
            presence: presence,
            finishState: .driving,
            stats: stats
        )
    }
}

private final class InMemoryActiveRunStore: ActiveRunStoring, @unchecked Sendable {
    private var storedSession: ActiveRunSessionMetadata?
    private(set) var didClear = false

    init(storedSession: ActiveRunSessionMetadata? = nil) {
        self.storedSession = storedSession
    }

    func readActiveRunSession(uid: String) -> ActiveRunSessionMetadata? {
        storedSession
    }

    func saveActiveRunSession(_ session: ActiveRunSessionMetadata, uid: String) {
        storedSession = session
    }

    func clearActiveRunSession(uid: String) {
        storedSession = nil
        didClear = true
    }
}

private struct InMemoryRunReader: RunReading, @unchecked Sendable {
    var runs: [String: Run] = [:]

    func readRun(runId: String) async throws -> Run? {
        runs[runId]
    }
}

private final class SequencedRunReader: RunReading, @unchecked Sendable {
    private var results: [Run?]

    init(results: [Run?]) {
        self.results = results
    }

    func readRun(runId: String) async throws -> Run? {
        guard !results.isEmpty else {
            return nil
        }

        return results.removeFirst()
    }
}

private final class InMemorySummaryHistoryStore: SummaryHistoryStoring, @unchecked Sendable {
    private(set) var entries: [SummaryHistoryEntry] = []

    func readSummaryHistory(uid: String) -> [SummaryHistoryEntry] {
        entries
    }

    func saveSummaryHistoryEntry(_ entry: SummaryHistoryEntry, uid: String) {
        entries = entries.filter { $0.runId != entry.runId }
        entries.insert(entry, at: 0)
    }
}

private final class InMemoryUnitPreferenceStore: UnitPreferenceStoring, @unchecked Sendable {
    var units: RoutePreferredUnits

    init(units: RoutePreferredUnits = .kilometres) {
        self.units = units
    }

    func readUnitPreference(uid: String) -> RoutePreferredUnits {
        units
    }

    func saveUnitPreference(_ units: RoutePreferredUnits, uid: String) {
        self.units = units
    }
}

private final class InMemoryHazardAlertAudioModeStore: HazardAlertAudioModeStoring, @unchecked Sendable {
    var mode: HazardAlertAudioMode

    init(mode: HazardAlertAudioMode = .announced) {
        self.mode = mode
    }

    func readHazardAlertAudioMode(uid: String) -> HazardAlertAudioMode {
        mode
    }

    func saveHazardAlertAudioMode(_ mode: HazardAlertAudioMode, uid: String) {
        self.mode = mode
    }
}

private final class RecordingSettingsAuthService: AuthServicing, @unchecked Sendable {
    let session: AuthUserSession?
    var resetEmail: String?

    init(session: AuthUserSession? = AuthUserSession(uid: "uid_1", email: "alex@example.com")) {
        self.session = session
    }

    func currentUser() async throws -> AuthUserSession? {
        session
    }

    func resetPassword(email: String) async throws {
        resetEmail = email
    }

    func signInAnonymously() async throws -> String {
        session?.uid ?? "uid_1"
    }
}

private final class RecordingSettingsProfileRepository: UserProfileRepositoring, @unchecked Sendable {
    private(set) var writtenProfile: UserProfile?

    func writeUserProfile(_ profile: UserProfile, uid: String) async throws {
        writtenProfile = profile
    }

    func readUserProfile(uid: String) async throws -> UserProfile? {
        writtenProfile
    }
}

private final class RecordingSettingsProfileCache: UserProfileCaching, @unchecked Sendable {
    private(set) var cachedProfile: UserProfile?

    func readCachedProfile(uid: String) -> UserProfile? {
        cachedProfile
    }

    func cacheProfile(_ profile: UserProfile, uid: String) {
        cachedProfile = profile
    }

    func clearCachedProfile(uid: String) {
        cachedProfile = nil
    }
}
