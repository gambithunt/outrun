import SwiftUI

@main
struct ClubRunNativeApp: App {
    @State private var createdRun: CreatedRun?
    @State private var createRunStatus = "Not created"
    @State private var isCreatingRun = false
    @StateObject private var router = AppRouter()

    init() {
        FirebaseBootstrapService.shared.configure(.development)
    }

    var body: some Scene {
        WindowGroup {
            if ProcessInfo.processInfo.environment["CLUBRUN_UI_TEST_SIGNED_OUT"] == "1" {
                let authService = SignedOutAuthService()
                let profileService = UserProfileService(
                    repository: EmptyUserProfileRepository(),
                    cache: UserDefaultsProfileCache()
                )
                AuthGateView(
                    viewModel: AuthGateViewModel(authService: authService, profileService: profileService),
                    authService: authService,
                    profileService: profileService
                ) { uid, _, onResetSession in
                    driveDiagnosticsView(uid: uid, onResetSession: onResetSession)
                }
            } else if ProcessInfo.processInfo.environment["CLUBRUN_UI_TEST_PROFILE_COMPLETE"] == "1" {
                let authService = SignedInTestAuthService()
                let profile = ClubRunNativeApp.testProfile
                let profileService = UserProfileService(
                    repository: StaticUserProfileRepository(profile: profile),
                    cache: NoopUserProfileCache()
                )
                AuthGateView(
                    viewModel: AuthGateViewModel(authService: authService, profileService: profileService),
                    authService: authService,
                    profileService: profileService
                ) { uid, profile, onResetSession in
                    homeHubView(
                        uid: uid,
                        profile: profile,
                        runReader: EmptyRunReader(),
                        runRepository: UITestRunRepository(),
                        onResetSession: onResetSession
                    )
                }
            } else {
            #if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseDatabase)
            let authService = FirebaseAuthService()
            let profileService = UserProfileService(
                repository: FirebaseUserProfileRepository(),
                cache: UserDefaultsProfileCache()
            )
            AuthGateView(
                viewModel: AuthGateViewModel(authService: authService, profileService: profileService),
                authService: authService,
                profileService: profileService
            ) { uid, profile, onResetSession in
                homeHubView(
                    uid: uid,
                    profile: profile,
                    runReader: FirebaseRunRepository(),
                    runRepository: FirebaseRunRepository(),
                    onResetSession: onResetSession
                )
            }
            #else
            driveDiagnosticsView(uid: nil, onResetSession: {})
            #endif
            }
        }
    }

    private func homeHubView(
        uid: String,
        profile: UserProfile,
        runReader: RunReading,
        runRepository: RunRepositoring,
        onResetSession: @escaping () -> Void
    ) -> some View {
        let activeRunStore = UserDefaultsActiveRunStore()
        return HomeHubView(
            uid: uid,
            profile: profile,
            viewModel: HomeHubViewModel(
                uid: uid,
                profile: profile,
                activeRunStore: activeRunStore,
                runReader: runReader,
                router: router
            ),
            router: router,
            runCreationService: RunCreationService(repository: runRepository),
            joinRunService: JoinRunService(repository: runRepository),
            lobbyService: LobbyService(repository: runRepository),
            runReader: runReader,
            activeRunStore: activeRunStore,
            onResetSession: onResetSession
        )
    }

    private func driveDiagnosticsView(uid: String?, onResetSession: @escaping () -> Void) -> some View {
        let configuration = FirebaseConfiguration.development
        let environment = AppEnvironment(
            session: BackendSession(
                authMode: uid == nil ? .pending : configuration.emailAuthMode,
                databaseMode: configuration.databaseMode,
                authenticatedUserState: uid.map { .signedIn(uid: $0) } ?? .signedOut,
                runRoundTripStatus: "Not run"
            ),
            diagnostics: .development
        )

        return DriveView(
            viewModel: DriveViewModel(
                session: environment.session,
                diagnostics: environment.diagnostics
            ),
            createdRun: createdRun,
            createRunStatus: createRunStatus,
            isCreatingRun: isCreatingRun,
            onResetSession: onResetSession,
            onCreateRun: {
                Task {
                    await createDraftRun(uid: uid)
                }
            }
        )
    }

    @MainActor
    private func createDraftRun(uid: String?) async {
        guard !isCreatingRun else {
            return
        }

        guard let uid else {
            createRunStatus = "Sign in first"
            return
        }

        isCreatingRun = true
        createRunStatus = "Creating"

        #if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseDatabase)
        do {
            let service = RunCreationService(repository: FirebaseRunRepository())
            createdRun = try await service.createDraftRun(adminUID: uid)
            createRunStatus = "Created"
        } catch {
            createRunStatus = "Failed"
        }
        #else
        createRunStatus = "Unavailable"
        #endif

        isCreatingRun = false
    }

    private static let testProfile = UserProfile(
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

private struct SignedInTestAuthService: AuthServicing {
    func currentUser() async throws -> AuthUserSession? {
        AuthUserSession(uid: "ui_test_uid", email: "ui@example.com")
    }

    func signOut() async throws {}

    func signInAnonymously() async throws -> String {
        "ui_test_uid"
    }
}

private struct StaticUserProfileRepository: UserProfileRepositoring {
    let profile: UserProfile

    func writeUserProfile(_ profile: UserProfile, uid: String) async throws {}

    func readUserProfile(uid: String) async throws -> UserProfile? {
        profile
    }
}

private struct NoopUserProfileCache: UserProfileCaching {
    func readCachedProfile(uid: String) -> UserProfile? {
        nil
    }

    func cacheProfile(_ profile: UserProfile, uid: String) {}

    func clearCachedProfile(uid: String) {}
}

private final class UITestRunRepository: RunRepositoring, @unchecked Sendable {
    private var runs: [String: Run] = [:]
    private var joinCodes: [String: JoinCodeRecord] = [:]

    init() {
        let run = Run(
            name: "UI Test Run",
            description: nil,
            joinCode: "123456",
            adminId: "uid_admin_1",
            status: .ready,
            createdAt: 1_800_000_000_000,
            startedAt: nil,
            endedAt: nil,
            maxDrivers: 15,
            route: RouteData(
                points: [[18.4, -33.9], [18.5, -34.0]],
                distanceMetres: 12_300,
                durationSeconds: 1_440,
                source: .appleMaps,
                stops: nil
            )
        )
        runs["ui_test_run"] = run
        joinCodes["123456"] = JoinCodeRecord(runId: "ui_test_run", createdAt: 1_800_000_000_000)
    }

    func writeRun(_ run: Run, runId: String) async throws {
        runs[runId] = run
    }

    func readRun(runId: String) async throws -> Run? {
        runs[runId]
    }

    func writeJoinCode(_ record: JoinCodeRecord, code: String) async throws {
        joinCodes[code] = record
    }

    func readJoinCode(code: String) async throws -> JoinCodeRecord? {
        joinCodes[code]
    }

    func writeDriver(_ driver: DriverRecord, runId: String, uid: String) async throws {
        var run = runs[runId]
        var drivers = run?.drivers ?? [:]
        drivers[uid] = driver
        if let existingRun = run {
            run = Run(
                name: existingRun.name,
                description: existingRun.description,
                joinCode: existingRun.joinCode,
                adminId: existingRun.adminId,
                status: existingRun.status,
                createdAt: existingRun.createdAt,
                startedAt: existingRun.startedAt,
                driveStartedAt: existingRun.driveStartedAt,
                endedAt: existingRun.endedAt,
                maxDrivers: existingRun.maxDrivers,
                route: existingRun.route,
                drivers: drivers,
                hazards: existingRun.hazards,
                summary: existingRun.summary
            )
        }
        runs[runId] = run
    }
}
