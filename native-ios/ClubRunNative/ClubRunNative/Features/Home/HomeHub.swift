import Foundation
import SwiftUI

enum ActiveRunRole: String, Codable, Equatable, Hashable {
    case admin
    case driver
}

struct ActiveRunSessionMetadata: Codable, Equatable {
    let runId: String
    let role: ActiveRunRole?

    init(runId: String, role: ActiveRunRole? = nil) {
        self.runId = runId
        self.role = role
    }
}

struct ActiveRunCard: Equatable {
    let runId: String
    let runName: String
    let statusText: String
    let role: ActiveRunRole
}

struct HomeHubIdentity: Equatable {
    let displayName: String
    let badge: DriverBadge
    let vehicle: String
}

enum AppRoute: Equatable, Hashable, Identifiable {
    case createRun
    case joinRun
    case activeRun(runId: String, role: ActiveRunRole)
    case adminLobby(runId: String)
    case driverLobby(runId: String)
    case liveDrive(runId: String, role: ActiveRunRole)
    case settings

    var id: String {
        switch self {
        case .createRun:
            "createRun"
        case .joinRun:
            "joinRun"
        case let .activeRun(runId, role):
            "activeRun.\(runId).\(role.rawValue)"
        case let .adminLobby(runId):
            "adminLobby.\(runId)"
        case let .driverLobby(runId):
            "driverLobby.\(runId)"
        case let .liveDrive(runId, role):
            "liveDrive.\(runId).\(role.rawValue)"
        case .settings:
            "settings"
        }
    }
}

@MainActor
final class AppRouter: ObservableObject {
    @Published var presentedRoute: AppRoute?

    func present(_ route: AppRoute) {
        presentedRoute = route
    }
}

protocol ActiveRunStoring: Sendable {
    func readActiveRunSession(uid: String) -> ActiveRunSessionMetadata?
    func saveActiveRunSession(_ session: ActiveRunSessionMetadata, uid: String)
    func clearActiveRunSession(uid: String)
}

final class UserDefaultsActiveRunStore: ActiveRunStoring, @unchecked Sendable {
    private let userDefaults: UserDefaults

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    func readActiveRunSession(uid: String) -> ActiveRunSessionMetadata? {
        guard let data = userDefaults.data(forKey: cacheKey(uid: uid)) else {
            return nil
        }

        return try? JSONDecoder.clubRunFirebase.decode(ActiveRunSessionMetadata.self, from: data)
    }

    func saveActiveRunSession(_ session: ActiveRunSessionMetadata, uid: String) {
        guard let data = try? JSONEncoder.clubRunFirebase.encode(session) else {
            return
        }

        userDefaults.set(data, forKey: cacheKey(uid: uid))
    }

    func clearActiveRunSession(uid: String) {
        userDefaults.removeObject(forKey: cacheKey(uid: uid))
    }

    private func cacheKey(uid: String) -> String {
        "clubrun.activeRunSession.\(uid)"
    }
}

protocol RunReading: Sendable {
    func readRun(runId: String) async throws -> Run?
}

struct EmptyRunReader: RunReading {
    func readRun(runId: String) async throws -> Run? {
        nil
    }
}

enum HomeHubActiveRunResolver {
    static func role(for uid: String, in run: Run) -> ActiveRunRole? {
        if run.adminId == uid {
            return .admin
        }

        if run.drivers?[uid] != nil {
            return .driver
        }

        return nil
    }

    static func card(for uid: String, runId: String, run: Run) -> ActiveRunCard? {
        guard run.status != .ended, let role = role(for: uid, in: run) else {
            return nil
        }

        return ActiveRunCard(
            runId: runId,
            runName: run.name,
            statusText: statusText(for: run.status),
            role: role
        )
    }

    private static func statusText(for status: RunStatus) -> String {
        switch status {
        case .draft:
            "Draft"
        case .ready:
            "Ready"
        case .active:
            "Active"
        case .ended:
            "Ended"
        }
    }
}

@MainActor
final class HomeHubViewModel: ObservableObject {
    @Published private(set) var activeRunCard: ActiveRunCard?

    let identity: HomeHubIdentity

    private let uid: String
    private let activeRunStore: ActiveRunStoring
    private let runReader: RunReading
    private let router: AppRouter

    init(
        uid: String,
        profile: UserProfile,
        activeRunStore: ActiveRunStoring,
        runReader: RunReading,
        router: AppRouter
    ) {
        self.uid = uid
        self.identity = HomeHubIdentity(
            displayName: profile.displayName,
            badge: profile.badge,
            vehicle: "\(profile.carMake) \(profile.carModel)"
        )
        self.activeRunStore = activeRunStore
        self.runReader = runReader
        self.router = router
    }

    func load() async {
        guard let session = activeRunStore.readActiveRunSession(uid: uid), !session.runId.isEmpty else {
            activeRunCard = nil
            return
        }

        do {
            guard let run = try await runReader.readRun(runId: session.runId),
                  let card = HomeHubActiveRunResolver.card(for: uid, runId: session.runId, run: run)
            else {
                activeRunStore.clearActiveRunSession(uid: uid)
                activeRunCard = nil
                return
            }

            activeRunCard = card
        } catch {
            activeRunStore.clearActiveRunSession(uid: uid)
            activeRunCard = nil
        }
    }

    func openCreateRun() {
        router.present(.createRun)
    }

    func openJoinRun() {
        router.present(.joinRun)
    }

    func openActiveRun() {
        guard let activeRunCard else {
            return
        }

        router.present(.activeRun(runId: activeRunCard.runId, role: activeRunCard.role))
    }

    func openSettings() {
        router.present(.settings)
    }
}

struct HomeHubView: View {
    @StateObject private var viewModel: HomeHubViewModel
    @ObservedObject private var router: AppRouter
    private let uid: String
    private let profile: UserProfile
    private let runCreationService: RunCreationService
    private let joinRunService: JoinRunService
    private let lobbyService: LobbyService
    private let runReader: RunReading
    private let activeRunStore: ActiveRunStoring
    private let onResetSession: () -> Void

    init(
        uid: String,
        profile: UserProfile,
        viewModel: HomeHubViewModel,
        router: AppRouter,
        runCreationService: RunCreationService,
        joinRunService: JoinRunService,
        lobbyService: LobbyService,
        runReader: RunReading,
        activeRunStore: ActiveRunStoring,
        onResetSession: @escaping () -> Void
    ) {
        _viewModel = StateObject(wrappedValue: viewModel)
        self.uid = uid
        self.profile = profile
        self.router = router
        self.runCreationService = runCreationService
        self.joinRunService = joinRunService
        self.lobbyService = lobbyService
        self.runReader = runReader
        self.activeRunStore = activeRunStore
        self.onResetSession = onResetSession
    }

    var body: some View {
        NavigationStack {
            List {
                identitySection

                Section {
                    Button {
                        viewModel.openCreateRun()
                    } label: {
                        Label("Create Run", systemImage: "plus.circle.fill")
                    }
                    .accessibilityIdentifier("homeHub.createRunButton")

                    Button {
                        viewModel.openJoinRun()
                    } label: {
                        Label("Join Run", systemImage: "number.circle.fill")
                    }
                    .accessibilityIdentifier("homeHub.joinRunButton")
                }

                if let activeRunCard = viewModel.activeRunCard {
                    Section("Active Run") {
                        Button {
                            viewModel.openActiveRun()
                        } label: {
                            ActiveRunCardRow(card: activeRunCard)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("homeHub.activeRunCard")
                    }
                }
            }
            .navigationTitle("ClubRun")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        viewModel.openSettings()
                    } label: {
                        Image(systemName: "person.crop.circle")
                    }
                    .accessibilityLabel("Profile and Settings")
                }
            }
            .navigationDestination(item: $router.presentedRoute) { route in
                destination(for: route)
            }
            .task {
                await viewModel.load()
            }
        }
    }

    private var identitySection: some View {
        Section {
            HStack(spacing: 12) {
                BadgeView(badge: viewModel.identity.badge)

                VStack(alignment: .leading, spacing: 2) {
                    Text(viewModel.identity.displayName)
                        .font(.headline)
                    Text(viewModel.identity.vehicle)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 4)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("homeHub.identityRow")
        }
    }

    @ViewBuilder
    private func destination(for route: AppRoute) -> some View {
        switch route {
        case .createRun:
            CreateRunView(
                viewModel: CreateRunViewModel(
                    uid: uid,
                    service: runCreationService,
                    activeRunStore: activeRunStore,
                    router: router
                )
            )
        case .joinRun:
            JoinRunView(
                viewModel: JoinRunViewModel(
                    uid: uid,
                    profile: profile,
                    service: joinRunService,
                    activeRunStore: activeRunStore,
                    router: router
                )
            )
        case let .activeRun(runId, role):
            if role == .admin {
                AdminLobbyView(
                    viewModel: AdminLobbyViewModel(uid: uid, runId: runId, service: lobbyService),
                    router: router,
                    routeProvider: AppleMapsRouteProvider(),
                    routePersisting: lobbyService
                )
            } else {
                DriverLobbyView(viewModel: DriverLobbyViewModel(uid: uid, runId: runId, service: lobbyService))
            }
        case let .adminLobby(runId):
            AdminLobbyView(
                viewModel: AdminLobbyViewModel(uid: uid, runId: runId, service: lobbyService),
                router: router,
                routeProvider: AppleMapsRouteProvider(),
                routePersisting: lobbyService
            )
        case let .driverLobby(runId):
            DriverLobbyView(viewModel: DriverLobbyViewModel(uid: uid, runId: runId, service: lobbyService))
        case let .liveDrive(runId, role):
            LiveDriveView(
                viewModel: LiveDriveViewModel(
                    uid: uid,
                    runId: runId,
                    role: role,
                    runReader: runReader
                )
            )
        case .settings:
            SettingsDestinationView(identity: viewModel.identity, onResetSession: onResetSession)
        }
    }

    private func roleTitle(_ role: ActiveRunRole) -> String {
        switch role {
        case .admin:
            "Admin"
        case .driver:
            "Driver"
        }
    }
}

private struct ActiveRunCardRow: View {
    let card: ActiveRunCard

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(card.runName)
                    .font(.headline)
                Text(card.statusText)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 8)
    }
}

private struct BadgeView: View {
    let badge: DriverBadge

    var body: some View {
        Text(badge.text)
            .font(.headline.weight(.semibold))
            .foregroundStyle(.white)
            .frame(width: 44, height: 44)
            .background(Color(hex: badge.colorHex), in: Circle())
    }
}

private struct PlaceholderDestinationView: View {
    let title: String
    let message: String

    var body: some View {
        ContentUnavailableView(title, systemImage: "steeringwheel", description: Text(message))
            .navigationTitle(title)
    }
}

private struct AdminLobbyPlaceholderView: View {
    let runId: String

    var body: some View {
        ContentUnavailableView(
            "Admin Lobby",
            systemImage: "person.3.sequence.fill",
            description: Text("Run \(runId) is ready for lobby setup.")
        )
        .navigationTitle("Admin Lobby")
    }
}

private struct DriverLobbyPlaceholderView: View {
    let runId: String

    var body: some View {
        ContentUnavailableView(
            "Driver Lobby",
            systemImage: "person.2.fill",
            description: Text("Run \(runId) is ready for driver lobby.")
        )
        .navigationTitle("Driver Lobby")
    }
}

private struct SettingsDestinationView: View {
    let identity: HomeHubIdentity
    let onResetSession: () -> Void

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    BadgeView(badge: identity.badge)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(identity.displayName)
                            .font(.headline)
                        Text(identity.vehicle)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section {
                Button("Sign Out", role: .destructive) {
                    onResetSession()
                }
                .accessibilityIdentifier("settings.signOutButton")
            }
        }
        .navigationTitle("Profile")
    }
}

private extension Color {
    init(hex: String) {
        let scanner = Scanner(string: hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")))
        var value: UInt64 = 0
        scanner.scanHexInt64(&value)

        let red = Double((value >> 16) & 0xFF) / 255
        let green = Double((value >> 8) & 0xFF) / 255
        let blue = Double(value & 0xFF) / 255

        self.init(red: red, green: green, blue: blue)
    }
}
