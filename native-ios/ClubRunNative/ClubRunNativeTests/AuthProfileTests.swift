import XCTest
@testable import ClubRunNative

final class AuthProfileTests: XCTestCase {
    func testRegistrationValidationRequiresValidEmailAndStrongPassword() {
        XCTAssertThrowsError(try AuthFlowValidation.validateRegistration(.init(email: "", password: "password1", confirmPassword: "password1"))) { error in
            XCTAssertEqual(error as? FormValidationError, .missingEmail)
        }
        XCTAssertThrowsError(try AuthFlowValidation.validateRegistration(.init(email: "alex", password: "password1", confirmPassword: "password1"))) { error in
            XCTAssertEqual(error as? FormValidationError, .invalidEmail)
        }
        XCTAssertThrowsError(try AuthFlowValidation.validateRegistration(.init(email: "alex@example.com", password: "short", confirmPassword: "short"))) { error in
            XCTAssertEqual(error as? FormValidationError, .weakPassword)
        }
        XCTAssertThrowsError(try AuthFlowValidation.validateRegistration(.init(email: "alex@example.com", password: "password1", confirmPassword: "password2"))) { error in
            XCTAssertEqual(error as? FormValidationError, .passwordMismatch)
        }
        XCTAssertNoThrow(try AuthFlowValidation.validateRegistration(.init(email: "alex@example.com", password: "password1", confirmPassword: "password1")))
    }

    func testLoginValidationRequiresEmailAndPassword() {
        XCTAssertThrowsError(try AuthFlowValidation.validateLogin(.init(email: "alex", password: "password1"))) { error in
            XCTAssertEqual(error as? FormValidationError, .invalidEmail)
        }
        XCTAssertThrowsError(try AuthFlowValidation.validateLogin(.init(email: "alex@example.com", password: ""))) { error in
            XCTAssertEqual(error as? FormValidationError, .missingPassword)
        }
        XCTAssertNoThrow(try AuthFlowValidation.validateLogin(.init(email: "alex@example.com", password: "password1")))
    }

    @MainActor
    func testAuthFormViewModelShowsUserActionableLoginFailure() async {
        let authService = RecordingAuthService()
        authService.loginError = AuthServiceError.message("Email or password is incorrect.")
        let viewModel = AuthFormViewModel(authService: authService)
        viewModel.email = " alex@example.com "
        viewModel.password = "password1"

        let session = await viewModel.login()

        XCTAssertNil(session)
        XCTAssertEqual(viewModel.message, "Email or password is incorrect.")
    }

    func testPasswordResetValidationRequiresEmail() {
        XCTAssertThrowsError(try AuthFlowValidation.validatePasswordReset(.init(email: ""))) { error in
            XCTAssertEqual(error as? FormValidationError, .missingEmail)
        }
        XCTAssertThrowsError(try AuthFlowValidation.validatePasswordReset(.init(email: "alex"))) { error in
            XCTAssertEqual(error as? FormValidationError, .invalidEmail)
        }
        XCTAssertNoThrow(try AuthFlowValidation.validatePasswordReset(.init(email: "alex@example.com")))
    }

    func testProfileValidationRequiresDisplayNameCarMakeAndCarModel() {
        XCTAssertThrowsError(try AuthFlowValidation.validateProfile(.init(displayName: "", carMake: "Porsche", carModel: "911"))) { error in
            XCTAssertEqual(error as? FormValidationError, .missingDisplayName)
        }
        XCTAssertThrowsError(try AuthFlowValidation.validateProfile(.init(displayName: "Alex", carMake: "", carModel: "911"))) { error in
            XCTAssertEqual(error as? FormValidationError, .missingCarMake)
        }
        XCTAssertThrowsError(try AuthFlowValidation.validateProfile(.init(displayName: "Alex", carMake: "Porsche", carModel: ""))) { error in
            XCTAssertEqual(error as? FormValidationError, .missingCarModel)
        }
        XCTAssertNoThrow(try AuthFlowValidation.validateProfile(.init(displayName: "Alex", carMake: "Porsche", carModel: "911")))
    }

    func testProfileCreationGeneratesBadgeAndInitialStats() throws {
        let profile = try AuthFlowValidation.makeUserProfile(
            input: ProfileInput(displayName: " Alex Driver ", carMake: " Porsche ", carModel: " 911 "),
            nowMilliseconds: 1_800_000_000_000,
            badgePaletteIndex: 1
        )

        XCTAssertEqual(profile.displayName, "Alex Driver")
        XCTAssertEqual(profile.carMake, "Porsche")
        XCTAssertEqual(profile.carModel, "911")
        XCTAssertEqual(profile.badge, DriverBadge(text: "AD", colorHex: "#43A047"))
        XCTAssertEqual(profile.stats, UserStats(totalRuns: 0, totalDistanceKm: 0, hazardsReported: 0, mostUsedCarId: nil))
    }

    func testUserProfileRepositoryWritesAndReadsUsersByUID() async throws {
        let repository = InMemoryUserProfileRepository()
        let profile = makeProfile()

        try await repository.writeUserProfile(profile, uid: "uid_1")

        let stored = try await repository.readUserProfile(uid: "uid_1")
        XCTAssertEqual(stored, profile)
    }

    func testProfileServiceCachesProfileAfterWriteAndRead() async throws {
        let repository = InMemoryUserProfileRepository()
        let cache = InMemoryProfileCache()
        let service = UserProfileService(repository: repository, cache: cache)
        let profile = makeProfile()

        try await service.saveProfile(profile, uid: "uid_1")

        XCTAssertEqual(cache.readCachedProfile(uid: "uid_1"), profile)
        let storedProfile = try await service.profile(uid: "uid_1")
        XCTAssertEqual(storedProfile, profile)
    }

    @MainActor
    func testAuthFormViewModelRegistersWithEmailPassword() async {
        let authService = RecordingAuthService()
        let viewModel = AuthFormViewModel(authService: authService)
        viewModel.email = " alex@example.com "
        viewModel.password = "password1"
        viewModel.confirmPassword = "password1"

        let session = await viewModel.register()

        XCTAssertEqual(session, AuthUserSession(uid: "uid_registered", email: "alex@example.com"))
        XCTAssertEqual(authService.registeredEmail, "alex@example.com")
        XCTAssertEqual(authService.registeredPassword, "password1")
    }

    @MainActor
    func testAuthFormViewModelLogsInWithEmailPassword() async {
        let authService = RecordingAuthService()
        let viewModel = AuthFormViewModel(authService: authService)
        viewModel.email = " alex@example.com "
        viewModel.password = "password1"

        let session = await viewModel.login()

        XCTAssertEqual(session, AuthUserSession(uid: "uid_logged_in", email: "alex@example.com"))
        XCTAssertEqual(authService.loggedInEmail, "alex@example.com")
        XCTAssertEqual(authService.loggedInPassword, "password1")
    }

    @MainActor
    func testAuthFormViewModelSendsPasswordResetEmail() async {
        let authService = RecordingAuthService()
        let viewModel = AuthFormViewModel(authService: authService)
        viewModel.email = " alex@example.com "

        let sent = await viewModel.resetPassword()

        XCTAssertTrue(sent)
        XCTAssertEqual(authService.resetEmail, "alex@example.com")
    }

    func testAuthServiceSupportsCurrentUserAndSignOut() async throws {
        let authService = RecordingAuthService()

        let user = try await authService.currentUser()
        try await authService.signOut()

        XCTAssertEqual(user, AuthUserSession(uid: "uid_current", email: "current@example.com"))
        XCTAssertTrue(authService.didSignOut)
    }

    @MainActor
    func testAuthGateRoutesSignedOutUsersToLogin() async {
        let viewModel = AuthGateViewModel(
            authService: FakeAuthService(session: nil),
            profileService: UserProfileService(repository: InMemoryUserProfileRepository(), cache: InMemoryProfileCache())
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.state, .signedOut)
    }

    @MainActor
    func testAuthGateRoutesSignedInUserWithoutProfileToProfileSetup() async {
        let viewModel = AuthGateViewModel(
            authService: FakeAuthService(session: AuthUserSession(uid: "uid_1", email: "alex@example.com")),
            profileService: UserProfileService(repository: InMemoryUserProfileRepository(), cache: InMemoryProfileCache())
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.state, .signedInIncompleteProfile(uid: "uid_1"))
    }

    @MainActor
    func testAuthGateRoutesSignedInUserWithProfileToHome() async throws {
        let repository = InMemoryUserProfileRepository()
        let profile = makeProfile()
        try await repository.writeUserProfile(profile, uid: "uid_1")
        let viewModel = AuthGateViewModel(
            authService: FakeAuthService(session: AuthUserSession(uid: "uid_1", email: "alex@example.com")),
            profileService: UserProfileService(repository: repository, cache: InMemoryProfileCache())
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.state, .signedInCompleteProfile(uid: "uid_1", profile: profile))
    }

    @MainActor
    func testAuthGateResetSessionSignsOutClearsCachedProfileAndRoutesToLogin() async throws {
        let authService = RecordingAuthService()
        let repository = InMemoryUserProfileRepository()
        let cache = InMemoryProfileCache()
        let profile = makeProfile()
        let profileService = UserProfileService(repository: repository, cache: cache)
        profileService.clearCachedProfile(uid: "uid_1")
        try await profileService.saveProfile(profile, uid: "uid_1")
        let viewModel = AuthGateViewModel(
            authService: authService,
            profileService: profileService
        )
        viewModel.completeProfile(uid: "uid_1", profile: profile)

        await viewModel.resetSession()

        XCTAssertTrue(authService.didSignOut)
        XCTAssertNil(cache.readCachedProfile(uid: "uid_1"))
        XCTAssertEqual(viewModel.state, .signedOut)
    }

    @MainActor
    func testAuthGateResetSessionClearsIncompleteProfileCache() async throws {
        let authService = RecordingAuthService()
        let cache = InMemoryProfileCache()
        let profileService = UserProfileService(repository: InMemoryUserProfileRepository(), cache: cache)
        cache.cacheProfile(makeProfile(), uid: "uid_1")
        let viewModel = AuthGateViewModel(authService: authService, profileService: profileService)
        await viewModel.load()
        viewModel.completeProfile(uid: "uid_1", profile: makeProfile())

        await viewModel.resetSession()

        XCTAssertTrue(authService.didSignOut)
        XCTAssertNil(cache.readCachedProfile(uid: "uid_1"))
        XCTAssertEqual(viewModel.state, .signedOut)
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
}

private struct FakeAuthService: AuthServicing {
    let session: AuthUserSession?

    func currentUser() async throws -> AuthUserSession? {
        session
    }

    func signInAnonymously() async throws -> String {
        session?.uid ?? "anonymous_uid"
    }
}

private final class RecordingAuthService: AuthServicing, @unchecked Sendable {
    var registeredEmail: String?
    var registeredPassword: String?
    var loggedInEmail: String?
    var loggedInPassword: String?
    var resetEmail: String?
    var didSignOut = false
    var loginError: Error?

    func currentUser() async throws -> AuthUserSession? {
        AuthUserSession(uid: "uid_current", email: "current@example.com")
    }

    func register(email: String, password: String) async throws -> AuthUserSession {
        registeredEmail = email
        registeredPassword = password
        return AuthUserSession(uid: "uid_registered", email: email)
    }

    func login(email: String, password: String) async throws -> AuthUserSession {
        if let loginError {
            throw loginError
        }

        loggedInEmail = email
        loggedInPassword = password
        return AuthUserSession(uid: "uid_logged_in", email: email)
    }

    func resetPassword(email: String) async throws {
        resetEmail = email
    }

    func signOut() async throws {
        didSignOut = true
    }

    func signInAnonymously() async throws -> String {
        "anonymous_uid"
    }
}

private final class InMemoryUserProfileRepository: UserProfileRepositoring, @unchecked Sendable {
    private var profiles: [String: UserProfile] = [:]

    func writeUserProfile(_ profile: UserProfile, uid: String) async throws {
        profiles[uid] = profile
    }

    func readUserProfile(uid: String) async throws -> UserProfile? {
        profiles[uid]
    }
}

private final class InMemoryProfileCache: UserProfileCaching, @unchecked Sendable {
    private var profiles: [String: UserProfile] = [:]

    func readCachedProfile(uid: String) -> UserProfile? {
        profiles[uid]
    }

    func cacheProfile(_ profile: UserProfile, uid: String) {
        profiles[uid] = profile
    }

    func clearCachedProfile(uid: String) {
        profiles[uid] = nil
    }
}
