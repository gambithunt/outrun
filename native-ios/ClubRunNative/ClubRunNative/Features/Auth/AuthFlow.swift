import Foundation
import SwiftUI
#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

struct AuthUserSession: Equatable {
    let uid: String
    let email: String?
}

struct RegistrationInput: Equatable {
    var email: String
    var password: String
    var confirmPassword: String
}

struct LoginInput: Equatable {
    var email: String
    var password: String
}

struct PasswordResetInput: Equatable {
    var email: String
}

struct ProfileInput: Equatable {
    var displayName: String
    var carMake: String
    var carModel: String
}

enum FormValidationError: Error, Equatable {
    case missingEmail
    case invalidEmail
    case missingPassword
    case weakPassword
    case passwordMismatch
    case missingDisplayName
    case missingCarMake
    case missingCarModel

    var userMessage: String {
        switch self {
        case .missingEmail:
            "Enter an email address."
        case .invalidEmail:
            "Enter a valid email address."
        case .missingPassword:
            "Enter a password."
        case .weakPassword:
            "Use at least 8 characters for your password."
        case .passwordMismatch:
            "Passwords do not match."
        case .missingDisplayName:
            "Enter your display name."
        case .missingCarMake:
            "Enter your car make."
        case .missingCarModel:
            "Enter your car model."
        }
    }
}

enum AuthFlowValidation {
    static func validateRegistration(_ input: RegistrationInput) throws {
        try validateEmail(input.email)
        try validatePassword(input.password)

        guard input.password == input.confirmPassword else {
            throw FormValidationError.passwordMismatch
        }
    }

    static func validateLogin(_ input: LoginInput) throws {
        try validateEmail(input.email)

        guard !input.password.trimmed.isEmpty else {
            throw FormValidationError.missingPassword
        }
    }

    static func validatePasswordReset(_ input: PasswordResetInput) throws {
        try validateEmail(input.email)
    }

    static func validateProfile(_ input: ProfileInput) throws {
        guard !input.displayName.trimmed.isEmpty else {
            throw FormValidationError.missingDisplayName
        }

        guard !input.carMake.trimmed.isEmpty else {
            throw FormValidationError.missingCarMake
        }

        guard !input.carModel.trimmed.isEmpty else {
            throw FormValidationError.missingCarModel
        }
    }

    static func makeUserProfile(
        input: ProfileInput,
        nowMilliseconds: Int64,
        badgePaletteIndex: Int = 0
    ) throws -> UserProfile {
        try validateProfile(input)

        return UserProfile(
            displayName: input.displayName.trimmed,
            carMake: input.carMake.trimmed,
            carModel: input.carModel.trimmed,
            badge: DriverBadge.generated(
                displayName: input.displayName,
                carMake: input.carMake,
                carModel: input.carModel,
                paletteIndex: badgePaletteIndex
            ),
            homeClub: nil,
            createdAt: nowMilliseconds,
            updatedAt: nowMilliseconds,
            stats: UserStats(totalRuns: 0, totalDistanceKm: 0, hazardsReported: 0, mostUsedCarId: nil)
        )
    }

    private static func validateEmail(_ email: String) throws {
        let trimmed = email.trimmed

        guard !trimmed.isEmpty else {
            throw FormValidationError.missingEmail
        }

        guard trimmed.contains("@"), trimmed.contains(".") else {
            throw FormValidationError.invalidEmail
        }
    }

    private static func validatePassword(_ password: String) throws {
        guard !password.trimmed.isEmpty else {
            throw FormValidationError.missingPassword
        }

        guard password.count >= 8 else {
            throw FormValidationError.weakPassword
        }
    }
}

struct SignedOutAuthService: AuthServicing {
    func currentUser() async throws -> AuthUserSession? {
        nil
    }

    func signInAnonymously() async throws -> String {
        throw AuthServiceError.unsupported
    }
}

struct EmptyUserProfileRepository: UserProfileRepositoring {
    func writeUserProfile(_ profile: UserProfile, uid: String) async throws {}

    func readUserProfile(uid: String) async throws -> UserProfile? {
        nil
    }
}

enum AuthGateState: Equatable {
    case checking
    case signedOut
    case signedInIncompleteProfile(uid: String)
    case signedInCompleteProfile(uid: String, profile: UserProfile)
    case failed(message: String)
}

@MainActor
final class AuthGateViewModel: ObservableObject {
    @Published private(set) var state: AuthGateState = .checking

    private let authService: AuthServicing
    private let profileService: UserProfileService

    init(authService: AuthServicing, profileService: UserProfileService) {
        self.authService = authService
        self.profileService = profileService
    }

    func load() async {
        do {
            guard let user = try await authService.currentUser() else {
                state = .signedOut
                return
            }

            if let profile = try await profileService.profile(uid: user.uid) {
                state = .signedInCompleteProfile(uid: user.uid, profile: profile)
            } else {
                state = .signedInIncompleteProfile(uid: user.uid)
            }
        } catch {
            state = .failed(message: "Unable to check your session.")
        }
    }

    func completeProfile(uid: String, profile: UserProfile) {
        state = .signedInCompleteProfile(uid: uid, profile: profile)
    }

    func resetSession() async {
        let uid = state.uid

        do {
            try await authService.signOut()
            if let uid {
                profileService.clearCachedProfile(uid: uid)
            }
            state = .signedOut
        } catch {
            state = .failed(message: "Unable to sign out.")
        }
    }
}

private extension AuthGateState {
    var uid: String? {
        switch self {
        case let .signedInIncompleteProfile(uid):
            uid
        case let .signedInCompleteProfile(uid, _):
            uid
        case .checking, .signedOut, .failed:
            nil
        }
    }
}

@MainActor
final class AuthFormViewModel: ObservableObject {
    @Published var email = ""
    @Published var password = ""
    @Published var confirmPassword = ""
    @Published private(set) var message: String?
    @Published private(set) var isWorking = false

    private let authService: AuthServicing

    init(authService: AuthServicing) {
        self.authService = authService
    }

    func register() async -> AuthUserSession? {
        await perform {
            let input = RegistrationInput(email: email, password: password, confirmPassword: confirmPassword)
            try AuthFlowValidation.validateRegistration(input)
            return try await authService.register(email: input.email.trimmed, password: input.password)
        }
    }

    func login() async -> AuthUserSession? {
        await perform {
            let input = LoginInput(email: email, password: password)
            try AuthFlowValidation.validateLogin(input)
            return try await authService.login(email: input.email.trimmed, password: input.password)
        }
    }

    func resetPassword() async -> Bool {
        let result: Bool? = await perform {
            let input = PasswordResetInput(email: email)
            try AuthFlowValidation.validatePasswordReset(input)
            try await authService.resetPassword(email: input.email.trimmed)
            return true
        }
        return result == true
    }

    private func perform<T>(_ action: () async throws -> T) async -> T? {
        isWorking = true
        defer { isWorking = false }

        do {
            message = nil
            return try await action()
        } catch let error as FormValidationError {
            message = error.userMessage
            return nil
        } catch let error as AuthServiceError {
            message = error.userMessage
            return nil
        } catch {
            message = AuthErrorMessageMapper.message(for: error)
            return nil
        }
    }
}

enum AuthErrorMessageMapper {
    static func message(for error: Error) -> String {
        #if canImport(FirebaseAuth)
        let nsError = error as NSError
        if nsError.domain == AuthErrorDomain, let code = AuthErrorCode(rawValue: nsError.code) {
            switch code {
            case .wrongPassword, .userNotFound, .invalidCredential:
                return "Email or password is incorrect."
            case .invalidEmail:
                return "Enter a valid email address."
            case .emailAlreadyInUse:
                return "An account already exists for this email."
            case .weakPassword:
                return "Use at least 8 characters for your password."
            case .networkError:
                return "Check your internet connection and try again."
            case .tooManyRequests:
                return "Too many attempts. Wait a moment and try again."
            case .operationNotAllowed:
                return "Email/password sign-in is not enabled for this Firebase project."
            default:
                break
            }
        }
        #endif

        let description = (error as NSError).localizedDescription
        if !description.isEmpty, description != "The operation couldn’t be completed." {
            return description
        }

        return "Something went wrong. Try again."
    }
}

@MainActor
final class ProfileFormViewModel: ObservableObject {
    @Published var displayName = ""
    @Published var carMake = ""
    @Published var carModel = ""
    @Published private(set) var message: String?
    @Published private(set) var isSaving = false

    private let uid: String
    private let service: UserProfileService
    private let nowMilliseconds: () -> Int64

    init(
        uid: String,
        service: UserProfileService,
        nowMilliseconds: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }
    ) {
        self.uid = uid
        self.service = service
        self.nowMilliseconds = nowMilliseconds
    }

    func save() async -> UserProfile? {
        isSaving = true
        defer { isSaving = false }

        do {
            let profile = try AuthFlowValidation.makeUserProfile(
                input: ProfileInput(displayName: displayName, carMake: carMake, carModel: carModel),
                nowMilliseconds: nowMilliseconds(),
                badgePaletteIndex: abs(uid.hashValue)
            )
            try await service.saveProfile(profile, uid: uid)
            message = nil
            return profile
        } catch let error as FormValidationError {
            message = error.userMessage
            return nil
        } catch {
            message = "Unable to save your profile."
            return nil
        }
    }
}

struct AuthGateView<AuthenticatedContent: View>: View {
    @StateObject private var viewModel: AuthGateViewModel
    private let authService: AuthServicing
    private let profileService: UserProfileService
    private let authenticatedContent: (String, UserProfile, @escaping () -> Void) -> AuthenticatedContent

    init(
        viewModel: AuthGateViewModel,
        authService: AuthServicing,
        profileService: UserProfileService,
        @ViewBuilder authenticatedContent: @escaping (String, UserProfile, @escaping () -> Void) -> AuthenticatedContent
    ) {
        _viewModel = StateObject(wrappedValue: viewModel)
        self.authService = authService
        self.profileService = profileService
        self.authenticatedContent = authenticatedContent
    }

    var body: some View {
        Group {
            switch viewModel.state {
            case .checking:
                ProgressView()
            case .signedOut:
                LoginView(viewModel: AuthFormViewModel(authService: authService)) {
                    Task { await viewModel.load() }
                }
            case let .signedInIncompleteProfile(uid):
                ProfileSetupView(viewModel: ProfileFormViewModel(uid: uid, service: profileService)) { profile in
                    viewModel.completeProfile(uid: uid, profile: profile)
                }
            case let .signedInCompleteProfile(uid, profile):
                authenticatedContent(uid, profile) {
                    Task { await viewModel.resetSession() }
                }
            case let .failed(message):
                ContentUnavailableView("Session unavailable", systemImage: "exclamationmark.triangle", description: Text(message))
            }
        }
        .task {
            await viewModel.load()
        }
    }
}

struct LoginView: View {
    @StateObject var viewModel: AuthFormViewModel
    @State private var showsRegister = false
    @State private var showsReset = false
    let onAuthenticated: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $viewModel.email)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    SecureField("Password", text: $viewModel.password)
                        .textContentType(.password)
                }

                if let message = viewModel.message {
                    Text(message)
                        .foregroundStyle(.red)
                }

                Section {
                    Button("Log In") {
                        Task {
                            if await viewModel.login() != nil {
                                onAuthenticated()
                            }
                        }
                    }
                    .disabled(viewModel.isWorking)

                    Button("Create Account") {
                        showsRegister = true
                    }

                    Button("Forgot Password") {
                        showsReset = true
                    }
                }
            }
            .navigationTitle("Log In")
            .sheet(isPresented: $showsRegister) {
                RegisterView(viewModel: AuthFormViewModel(authService: viewModel.authServiceForChild)) {
                    showsRegister = false
                    onAuthenticated()
                }
            }
            .sheet(isPresented: $showsReset) {
                ForgotPasswordView(viewModel: AuthFormViewModel(authService: viewModel.authServiceForChild))
            }
        }
    }
}

struct RegisterView: View {
    @StateObject var viewModel: AuthFormViewModel
    let onAuthenticated: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $viewModel.email)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                    SecureField("Password", text: $viewModel.password)
                        .textContentType(.newPassword)
                    SecureField("Confirm Password", text: $viewModel.confirmPassword)
                        .textContentType(.newPassword)
                }

                if let message = viewModel.message {
                    Text(message)
                        .foregroundStyle(.red)
                }

                Button("Create Account") {
                    Task {
                        if await viewModel.register() != nil {
                            onAuthenticated()
                        }
                    }
                }
                .disabled(viewModel.isWorking)
            }
            .navigationTitle("Create Account")
        }
    }
}

struct ForgotPasswordView: View {
    @StateObject var viewModel: AuthFormViewModel

    var body: some View {
        NavigationStack {
            Form {
                TextField("Email", text: $viewModel.email)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)

                if let message = viewModel.message {
                    Text(message)
                        .foregroundStyle(.red)
                }

                Button("Send Reset Email") {
                    Task { _ = await viewModel.resetPassword() }
                }
                .disabled(viewModel.isWorking)
            }
            .navigationTitle("Reset Password")
        }
    }
}

struct ProfileSetupView: View {
    @StateObject var viewModel: ProfileFormViewModel
    let onSaved: (UserProfile) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Display Name", text: $viewModel.displayName)
                        .textContentType(.name)
                    TextField("Car Make", text: $viewModel.carMake)
                    TextField("Car Model", text: $viewModel.carModel)
                }

                if let message = viewModel.message {
                    Text(message)
                        .foregroundStyle(.red)
                }

                Button("Save Profile") {
                    Task {
                        if let profile = await viewModel.save() {
                            onSaved(profile)
                        }
                    }
                }
                .disabled(viewModel.isSaving)
            }
            .navigationTitle("Driver Profile")
        }
    }
}

private extension String {
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private extension AuthFormViewModel {
    var authServiceForChild: AuthServicing {
        authService
    }
}
