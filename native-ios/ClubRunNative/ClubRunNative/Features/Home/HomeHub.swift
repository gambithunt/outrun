import Foundation
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

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
    let status: RunStatus
    let statusText: String
    let role: ActiveRunRole
}

struct HomeHubIdentity: Equatable {
    let displayName: String
    let badge: DriverBadge
    let vehicle: String
}

struct SettingsDiagnosticsSnapshot: Equatable {
    let authMode: String
    let authUID: String
    let databaseMode: String
    let backendStatus: String

    static let development = SettingsDiagnosticsSnapshot(
        authMode: FirebaseConfiguration.development.emailAuthMode.diagnosticLabel,
        authUID: "Current user",
        databaseMode: FirebaseConfiguration.development.databaseMode.diagnosticLabel,
        backendStatus: "Not run"
    )
}

struct SettingsDiagnosticsRow: Equatable, Identifiable {
    let title: String
    let value: String

    var id: String {
        title
    }
}

struct SummaryHistoryEntry: Codable, Equatable, Identifiable {
    let runId: String
    let runName: String
    let endedAt: Int64
    let distanceText: String
    let timeText: String

    var id: String {
        runId
    }
}

enum AppRoute: Equatable, Hashable, Identifiable {
    case createRun
    case joinRun
    case activeRun(runId: String, role: ActiveRunRole)
    case adminLobby(runId: String)
    case driverLobby(runId: String)
    case liveDrive(runId: String, role: ActiveRunRole)
    case summary(runId: String)
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
        case let .summary(runId):
            "summary.\(runId)"
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

    func dismissPresentedRoute() {
        presentedRoute = nil
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

protocol SummaryHistoryStoring: Sendable {
    func readSummaryHistory(uid: String) -> [SummaryHistoryEntry]
    func saveSummaryHistoryEntry(_ entry: SummaryHistoryEntry, uid: String)
}

protocol UnitPreferenceStoring: Sendable {
    func readUnitPreference(uid: String) -> RoutePreferredUnits
    func saveUnitPreference(_ units: RoutePreferredUnits, uid: String)
}

protocol HazardAlertAudioModeStoring: Sendable {
    func readHazardAlertAudioMode(uid: String) -> HazardAlertAudioMode
    func saveHazardAlertAudioMode(_ mode: HazardAlertAudioMode, uid: String)
}

final class UserDefaultsSummaryHistoryStore: SummaryHistoryStoring, @unchecked Sendable {
    private let userDefaults: UserDefaults
    private let maxEntries: Int

    init(userDefaults: UserDefaults = .standard, maxEntries: Int = 25) {
        self.userDefaults = userDefaults
        self.maxEntries = maxEntries
    }

    func readSummaryHistory(uid: String) -> [SummaryHistoryEntry] {
        guard let data = userDefaults.data(forKey: cacheKey(uid: uid)),
              let entries = try? JSONDecoder.clubRunFirebase.decode([SummaryHistoryEntry].self, from: data)
        else {
            return []
        }

        return entries.sorted { $0.endedAt > $1.endedAt }
    }

    func saveSummaryHistoryEntry(_ entry: SummaryHistoryEntry, uid: String) {
        var entries = readSummaryHistory(uid: uid).filter { $0.runId != entry.runId }
        entries.insert(entry, at: 0)
        entries = Array(entries.prefix(maxEntries))

        guard let data = try? JSONEncoder.clubRunFirebase.encode(entries) else {
            return
        }

        userDefaults.set(data, forKey: cacheKey(uid: uid))
    }

    private func cacheKey(uid: String) -> String {
        "clubrun.summaryHistory.\(uid)"
    }
}

final class UserDefaultsUnitPreferenceStore: UnitPreferenceStoring, @unchecked Sendable {
    private let userDefaults: UserDefaults

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    func readUnitPreference(uid: String) -> RoutePreferredUnits {
        guard let rawValue = userDefaults.string(forKey: cacheKey(uid: uid)) else {
            return .kilometres
        }

        return RoutePreferredUnits(rawValue: rawValue) ?? .kilometres
    }

    func saveUnitPreference(_ units: RoutePreferredUnits, uid: String) {
        userDefaults.set(units.rawValue, forKey: cacheKey(uid: uid))
    }

    private func cacheKey(uid: String) -> String {
        "clubrun.unitPreference.\(uid)"
    }
}

final class UserDefaultsHazardAlertAudioModeStore: HazardAlertAudioModeStoring, @unchecked Sendable {
    private let userDefaults: UserDefaults

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    func readHazardAlertAudioMode(uid: String) -> HazardAlertAudioMode {
        guard let rawValue = userDefaults.string(forKey: cacheKey(uid: uid)) else {
            return .announced
        }

        return HazardAlertAudioMode(rawValue: rawValue) ?? .announced
    }

    func saveHazardAlertAudioMode(_ mode: HazardAlertAudioMode, uid: String) {
        userDefaults.set(mode.rawValue, forKey: cacheKey(uid: uid))
    }

    private func cacheKey(uid: String) -> String {
        "clubrun.hazardAlertAudioMode.\(uid)"
    }
}

protocol RunReading: Sendable {
    func readRun(runId: String) async throws -> Run?
}

protocol RunObservation: AnyObject, Sendable {
    func cancel()
}

protocol RunObserving: Sendable {
    @discardableResult
    func observeRun(
        runId: String,
        onChange: @escaping @Sendable (Result<Run?, Error>) -> Void
    ) -> RunObservation
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
            status: run.status,
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

        if activeRunCard.status == .active {
            router.present(.liveDrive(runId: activeRunCard.runId, role: activeRunCard.role))
        } else {
            router.present(.activeRun(runId: activeRunCard.runId, role: activeRunCard.role))
        }
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
    private let summaryHistoryStore: SummaryHistoryStoring
    private let unitPreferenceStore: UnitPreferenceStoring
    private let hazardAlertAudioModeStore: HazardAlertAudioModeStoring
    private let authService: AuthServicing
    private let profileService: UserProfileService
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
        summaryHistoryStore: SummaryHistoryStoring,
        unitPreferenceStore: UnitPreferenceStoring,
        hazardAlertAudioModeStore: HazardAlertAudioModeStoring,
        authService: AuthServicing,
        profileService: UserProfileService,
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
        self.summaryHistoryStore = summaryHistoryStore
        self.unitPreferenceStore = unitPreferenceStore
        self.hazardAlertAudioModeStore = hazardAlertAudioModeStore
        self.authService = authService
        self.profileService = profileService
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
                    viewModel: AdminLobbyViewModel(
                        uid: uid,
                        runId: runId,
                        profile: profile,
                        service: lobbyService,
                        router: router,
                        runObserver: runReader as? RunObserving
                    ),
                    router: router,
                    routeProvider: AppleMapsRouteProvider(),
                    routePersisting: lobbyService
                )
            } else {
                DriverLobbyView(
                    viewModel: DriverLobbyViewModel(
                        uid: uid,
                        runId: runId,
                        service: lobbyService,
                        router: router,
                        runObserver: runReader as? RunObserving
                    )
                )
            }
        case let .adminLobby(runId):
            AdminLobbyView(
                viewModel: AdminLobbyViewModel(
                    uid: uid,
                    runId: runId,
                    profile: profile,
                    service: lobbyService,
                    router: router,
                    runObserver: runReader as? RunObserving
                ),
                router: router,
                routeProvider: AppleMapsRouteProvider(),
                routePersisting: lobbyService
            )
        case let .driverLobby(runId):
            DriverLobbyView(
                viewModel: DriverLobbyViewModel(
                    uid: uid,
                    runId: runId,
                    service: lobbyService,
                    router: router,
                    runObserver: runReader as? RunObserving
                )
            )
        case let .liveDrive(runId, role):
            LiveDriveView(
                viewModel: LiveDriveViewModel(
                    uid: uid,
                    runId: runId,
                    role: role,
                    runReader: runReader,
                    runObserver: runReader as? RunObserving,
                    runEnding: runReader as? RunEnding,
                    summaryPersisting: runReader as? RunSummaryPersisting,
                    personalSummaryPersisting: runReader as? PersonalSummaryPersisting,
                    driverSessionUpdater: runReader as? DriverDriveSessionUpdating,
                    activeRunStore: activeRunStore,
                    router: router,
                    liveLocationRepository: runReader as? LiveLocationPersisting,
                    hazardRepository: runReader as? HazardPersisting,
                    hazardAlertAudioMode: hazardAlertAudioModeStore.readHazardAlertAudioMode(uid: uid)
                )
            )
        case let .summary(runId):
            SummaryView(
                viewModel: SummaryViewModel(
                    uid: uid,
                    runId: runId,
                    runReader: runReader,
                    summaryHistoryStore: summaryHistoryStore,
                    unitPreferenceStore: unitPreferenceStore
                )
            )
        case .settings:
            SettingsDestinationView(
                viewModel: SettingsViewModel(
                    uid: uid,
                    profile: profile,
                    authService: authService,
                    profileService: profileService,
                    unitPreferenceStore: unitPreferenceStore,
                    hazardAlertAudioModeStore: hazardAlertAudioModeStore,
                    summaryHistoryStore: summaryHistoryStore,
                    diagnostics: .development,
                    onResetSession: onResetSession
                ),
                onOpenSummary: { runId in
                    router.present(.summary(runId: runId))
                }
            )
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

@MainActor
final class SummaryViewModel: ObservableObject {
    @Published private(set) var title = "Drive Summary"
    @Published private(set) var distanceText = "Distance unavailable"
    @Published private(set) var timeText = "Time unavailable"
    @Published private(set) var hazardText = "No hazards"
    @Published private(set) var participants: [String] = []
    @Published private(set) var participantDetails: [SummaryDriverDisplay] = []
    @Published private(set) var shareText = ""
    @Published private(set) var message: String?
    @Published private(set) var isLoading = false

    var currentUserSummary: SummaryDriverDisplay? {
        participantDetails.first { $0.isCurrentUser }
    }

    var otherDriverSummaries: [SummaryDriverDisplay] {
        participantDetails.filter { !$0.isCurrentUser }
    }

    private let uid: String
    private let runId: String
    private let runReader: RunReading
    private let summaryHistoryStore: SummaryHistoryStoring?
    private let units: RoutePreferredUnits
    private let retryDelaysNanoseconds: [UInt64]

    init(
        uid: String,
        runId: String,
        runReader: RunReading,
        summaryHistoryStore: SummaryHistoryStoring? = nil,
        unitPreferenceStore: UnitPreferenceStoring? = nil,
        retryDelaysNanoseconds: [UInt64] = [200_000_000, 500_000_000, 1_000_000_000]
    ) {
        self.uid = uid
        self.runId = runId
        self.runReader = runReader
        self.summaryHistoryStore = summaryHistoryStore
        self.units = unitPreferenceStore?.readUnitPreference(uid: uid) ?? .kilometres
        self.retryDelaysNanoseconds = retryDelaysNanoseconds
    }

    func load() async {
        isLoading = true
        message = nil
        defer {
            isLoading = false
        }

        for attempt in 0...retryDelaysNanoseconds.count {
            do {
                if let run = try await runReader.readRun(runId: runId) {
                    apply(run)
                    return
                }
            } catch {
                if attempt == retryDelaysNanoseconds.count {
                    break
                }
            }

            guard attempt < retryDelaysNanoseconds.count else {
                break
            }

            try? await Task.sleep(nanoseconds: retryDelaysNanoseconds[attempt])
        }

        message = "Unable to load summary."
    }

    func clearMessage() {
        message = nil
    }

    private func apply(_ run: Run) {
        title = run.name
        let baseSummary = run.summary ?? RunSummaryCalculator.summary(
            for: run,
            generatedAt: run.endedAt ?? Int64(Date().timeIntervalSince1970 * 1_000)
        )
        let summary = displaySummary(for: run, baseSummary: baseSummary)
        distanceText = UnitPreferenceFormatter.formatDistance(kilometres: summary.totalDistanceKm, units: units)
        timeText = "\(Int(summary.totalDriveTimeMinutes.rounded())) min"
        hazardText = summary.hazardSummary.total == 1 ? "1 hazard" : "\(summary.hazardSummary.total) hazards"
        participantDetails = summary.driverStats
            .sorted {
                if $0.key == uid {
                    return true
                }
                if $1.key == uid {
                    return false
                }
                return $0.value.name.localizedCaseInsensitiveCompare($1.value.name) == .orderedAscending
            }
            .map { SummaryDriverDisplay(summary: $0.value, isCurrentUser: $0.key == uid, units: units) }
        participants = participantDetails
            .map(\.title)
            .sorted()
        shareText = SummaryShareTextFormatter.shareText(runName: run.name, summary: summary, units: units)
        summaryHistoryStore?.saveSummaryHistoryEntry(
            SummaryHistoryEntry(
                runId: runId,
                runName: run.name,
                endedAt: run.endedAt ?? summary.generatedAt,
                distanceText: distanceText,
                timeText: timeText
            ),
            uid: uid
        )
    }

    private func displaySummary(for run: Run, baseSummary: RunSummary) -> RunSummary {
        let generatedAt = run.endedAt ?? baseSummary.generatedAt
        var driverStats = baseSummary.driverStats.mapValues { summary in
            normalizeSummaryStatus(summary, runStatus: run.status)
        }

        if let personalSummary = RunSummaryCalculator.personalSummary(for: uid, in: run, generatedAt: generatedAt) {
            driverStats[uid] = normalizeCurrentUserSummaryStatus(personalSummary, runStatus: run.status)
        }

        return RunSummary(
            totalDistanceKm: baseSummary.totalDistanceKm,
            totalDriveTimeMinutes: baseSummary.totalDriveTimeMinutes,
            driverStats: driverStats,
            collectiveFuel: baseSummary.collectiveFuel,
            hazardSummary: baseSummary.hazardSummary,
            routePreview: baseSummary.routePreview,
            generatedAt: baseSummary.generatedAt
        )
    }

    private func normalizeSummaryStatus(_ summary: PersonalSummary, runStatus: RunStatus) -> PersonalSummary {
        guard runStatus == .ended, summary.driverStatus == .active else {
            return summary
        }

        return summary.withDriverStatus(.endedWithGroup)
    }

    private func normalizeCurrentUserSummaryStatus(_ summary: PersonalSummary, runStatus: RunStatus) -> PersonalSummary {
        guard runStatus == .ended else {
            return summary
        }

        switch summary.driverStatus {
        case .finished, .left:
            return summary
        case .active, .stale, .offline, .endedWithGroup, nil:
            return summary.withDriverStatus(.endedWithGroup)
        }
    }
}

private extension PersonalSummary {
    func withDriverStatus(_ driverStatus: SummaryDriverStatus) -> PersonalSummary {
        return PersonalSummary(
            name: name,
            carMake: carMake,
            carModel: carModel,
            badge: badge,
            driverStatus: driverStatus,
            topSpeedKmh: topSpeedKmh,
            avgMovingSpeedKmh: avgMovingSpeedKmh,
            totalDistanceKm: totalDistanceKm,
            totalDriveTimeMinutes: totalDriveTimeMinutes,
            movingTimeMinutes: movingTimeMinutes,
            stoppedTimeMinutes: stoppedTimeMinutes,
            stopCount: stopCount,
            avgStopTimeSec: avgStopTimeSec,
            maxGForce: maxGForce,
            fuelUsedLitres: fuelUsedLitres,
            fuelUsedKwh: fuelUsedKwh,
            fuelType: fuelType
        )
    }
}

struct SummaryDriverDisplay: Equatable, Identifiable {
    let id: String
    let title: String
    let distanceText: String
    let timeText: String
    let speedText: String
    let stopText: String
    let gForceText: String
    let statusText: String
    let hasPersonalStats: Bool
    let isCurrentUser: Bool

    init(summary: PersonalSummary, isCurrentUser: Bool = false, units: RoutePreferredUnits = .kilometres) {
        id = "\(summary.name)-\(summary.carMake)-\(summary.carModel)"
        title = isCurrentUser ? "\(summary.name) · \(summary.carMake) \(summary.carModel) · You" : "\(summary.name) · \(summary.carMake) \(summary.carModel)"
        distanceText = summary.totalDistanceKm.map { UnitPreferenceFormatter.formatDistance(kilometres: $0, units: units) } ?? "Distance unavailable"
        timeText = summary.totalDriveTimeMinutes.map { SummaryShareTextFormatter.formatDuration($0) } ?? "Time unavailable"
        speedText = summary.topSpeedKmh.map { "Top \(UnitPreferenceFormatter.formatSpeed(kmh: $0, units: units))" } ?? "Top speed unavailable"
        if let stopCount = summary.stopCount {
            stopText = stopCount == 1 ? "1 stop" : "\(stopCount) stops"
        } else {
            stopText = "Stops unavailable"
        }
        gForceText = summary.maxGForce.map { "\(String(format: "%.2f", $0)) g max" } ?? "Max g unavailable"
        statusText = summary.driverStatus?.displayText ?? "Status unavailable"
        hasPersonalStats = summary.totalDistanceKm != nil
            || summary.totalDriveTimeMinutes != nil
            || summary.topSpeedKmh != nil
            || summary.maxGForce != nil
            || summary.stopCount != nil
        self.isCurrentUser = isCurrentUser
    }
}

enum SummaryShareTextFormatter {
    static func shareText(runName: String, summary: RunSummary, units: RoutePreferredUnits = .kilometres) -> String {
        let driverLines = summary.driverStats.values
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            .map { driver in
                let distance = driver.totalDistanceKm.map { " · \(UnitPreferenceFormatter.formatDistance(kilometres: $0, units: units))" } ?? ""
                let topSpeed = driver.topSpeedKmh.map { " · top \(UnitPreferenceFormatter.formatSpeed(kmh: $0, units: units))" } ?? ""
                let maxG = driver.maxGForce.map { " · max \(String(format: "%.2f", $0)) g" } ?? ""
                let status = driver.driverStatus.map { " · \($0.displayText.lowercased())" } ?? ""
                return "- \(driver.name) · \(driver.carMake) \(driver.carModel)\(status)\(distance)\(topSpeed)\(maxG)"
            }

        let driversBlock: String
        if driverLines.isEmpty {
            driversBlock = "Drivers:\n- No driver summaries yet"
        } else {
            driversBlock = "Drivers:\n\(driverLines.joined(separator: "\n"))"
        }

        return """
        \(runName)
        Distance: \(UnitPreferenceFormatter.formatDistance(kilometres: summary.totalDistanceKm, units: units))
        Time: \(formatDuration(summary.totalDriveTimeMinutes))
        Hazards: \(summary.hazardSummary.total)
        \(driversBlock)
        """
    }

    static func formatDistance(_ kilometres: Double) -> String {
        "\(String(format: "%.1f", kilometres)) km"
    }

    static func formatDuration(_ minutes: Double) -> String {
        let roundedMinutes = Int(minutes.rounded())
        guard roundedMinutes >= 60 else {
            return "\(roundedMinutes) min"
        }

        let hours = roundedMinutes / 60
        let remainingMinutes = roundedMinutes % 60
        if remainingMinutes == 0 {
            return hours == 1 ? "1 hr" : "\(hours) hr"
        }

        return "\(hours) hr \(remainingMinutes) min"
    }
}

private extension SummaryDriverStatus {
    var displayText: String {
        switch self {
        case .active:
            "Active"
        case .endedWithGroup:
            "Ended with group"
        case .finished:
            "Finished"
        case .left:
            "Left"
        case .stale:
            "Stale"
        case .offline:
            "Offline"
        }
    }
}

enum UnitPreferenceFormatter {
    private static let milesPerKilometre = 0.621_371

    static func formatDistance(kilometres: Double, units: RoutePreferredUnits) -> String {
        switch units {
        case .kilometres:
            "\(String(format: "%.1f", kilometres)) km"
        case .miles:
            "\(String(format: "%.1f", kilometres * milesPerKilometre)) mi"
        }
    }

    static func formatSpeed(kmh: Double, units: RoutePreferredUnits) -> String {
        switch units {
        case .kilometres:
            "\(Int(kmh.rounded())) km/h"
        case .miles:
            "\(Int((kmh * milesPerKilometre).rounded())) mph"
        }
    }
}

struct SummaryView: View {
    @StateObject var viewModel: SummaryViewModel

    var body: some View {
        List {
            if viewModel.isLoading {
                Section {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Loading summary")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            Section {
                HStack(spacing: 12) {
                    SummaryMetricView(title: "Route", value: viewModel.distanceText)
                    SummaryMetricView(title: "Time", value: viewModel.timeText)
                    SummaryMetricView(title: "Hazards", value: viewModel.hazardText)
                }
                .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
            }

            if let currentUserSummary = viewModel.currentUserSummary {
                Section("Your drive") {
                    SummaryDriverRow(participant: currentUserSummary)
                }
            }

            Section("Other drivers") {
                if viewModel.otherDriverSummaries.isEmpty {
                    Text("No other driver summaries yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(viewModel.otherDriverSummaries) { participant in
                        SummaryDriverRow(participant: participant)
                    }
                }
            }
        }
        .navigationTitle(viewModel.title)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    copySummary()
                } label: {
                    Label("Copy Summary", systemImage: "doc.on.doc")
                }
                .disabled(viewModel.shareText.isEmpty)
                .accessibilityLabel("Copy drive summary")
            }
        }
        .task {
            await viewModel.load()
        }
        .alert(
            "Summary",
            isPresented: Binding(
                get: { viewModel.message != nil },
                set: { isPresented in
                    if !isPresented {
                        viewModel.clearMessage()
                    }
                }
            )
        ) {
            Button("OK", role: .cancel) {
                viewModel.clearMessage()
            }
        } message: {
            Text(viewModel.message ?? "")
        }
    }

    private func copySummary() {
        #if canImport(UIKit)
        UIPasteboard.general.string = viewModel.shareText
        #endif
    }
}

private struct SummaryDriverRow: View {
    let participant: SummaryDriverDisplay

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(participant.title, systemImage: "person.fill")
                .font(.headline)
            if participant.hasPersonalStats {
                HStack(spacing: 8) {
                    SummaryStatChip(title: "Driven", value: participant.distanceText)
                    SummaryStatChip(title: "Time", value: participant.timeText)
                }
                HStack(spacing: 8) {
                    SummaryStatChip(title: "Speed", value: participant.speedText)
                    SummaryStatChip(title: "Force", value: participant.gForceText)
                }
                HStack(spacing: 8) {
                    SummaryStatChip(title: "Stops", value: participant.stopText)
                    SummaryStatChip(title: "Status", value: participant.statusText)
                }
            } else {
                SummaryStatChip(title: "Status", value: participant.statusText)
            }
        }
        .padding(.vertical, 6)
    }
}

private struct SummaryMetricView: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct SummaryStatChip: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published private(set) var displayName: String
    @Published private(set) var vehicleText: String
    @Published private(set) var badge: DriverBadge
    @Published var selectedUnits: RoutePreferredUnits
    @Published var selectedHazardAlertAudioMode: HazardAlertAudioMode
    @Published private(set) var historyEntries: [SummaryHistoryEntry]
    @Published private(set) var message: String?
    @Published private(set) var isSavingProfile = false
    @Published private(set) var isResettingPassword = false
    @Published private(set) var emailText = "Email unavailable"

    let showsDiagnostics: Bool
    let diagnosticsRows: [SettingsDiagnosticsRow]

    private let uid: String
    private var profile: UserProfile
    private let authService: AuthServicing
    private let profileService: UserProfileService
    private let unitPreferenceStore: UnitPreferenceStoring
    private let hazardAlertAudioModeStore: HazardAlertAudioModeStoring
    private let summaryHistoryStore: SummaryHistoryStoring
    private let nowMilliseconds: () -> Int64
    private let onResetSession: () -> Void

    init(
        uid: String,
        profile: UserProfile,
        authService: AuthServicing,
        profileService: UserProfileService,
        unitPreferenceStore: UnitPreferenceStoring,
        hazardAlertAudioModeStore: HazardAlertAudioModeStoring = UserDefaultsHazardAlertAudioModeStore(),
        summaryHistoryStore: SummaryHistoryStoring,
        diagnostics: AppDiagnosticsConfiguration,
        diagnosticsSnapshot: SettingsDiagnosticsSnapshot = .development,
        nowMilliseconds: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1_000) },
        onResetSession: @escaping () -> Void
    ) {
        self.uid = uid
        self.profile = profile
        self.displayName = profile.displayName
        self.vehicleText = "\(profile.carMake) \(profile.carModel)"
        self.badge = profile.badge
        self.selectedUnits = unitPreferenceStore.readUnitPreference(uid: uid)
        self.selectedHazardAlertAudioMode = hazardAlertAudioModeStore.readHazardAlertAudioMode(uid: uid)
        self.historyEntries = summaryHistoryStore.readSummaryHistory(uid: uid)
        self.showsDiagnostics = diagnostics.showsBackendDiagnostics
        self.diagnosticsRows = [
            SettingsDiagnosticsRow(title: "Auth", value: diagnosticsSnapshot.authMode),
            SettingsDiagnosticsRow(title: "UID", value: diagnosticsSnapshot.authUID == "Current user" ? uid : diagnosticsSnapshot.authUID),
            SettingsDiagnosticsRow(title: "Database", value: diagnosticsSnapshot.databaseMode),
            SettingsDiagnosticsRow(title: "Smoke", value: diagnosticsSnapshot.backendStatus)
        ]
        self.authService = authService
        self.profileService = profileService
        self.unitPreferenceStore = unitPreferenceStore
        self.hazardAlertAudioModeStore = hazardAlertAudioModeStore
        self.summaryHistoryStore = summaryHistoryStore
        self.nowMilliseconds = nowMilliseconds
        self.onResetSession = onResetSession
    }

    func refreshHistory() {
        historyEntries = summaryHistoryStore.readSummaryHistory(uid: uid)
    }

    func updateUnits(_ units: RoutePreferredUnits) {
        selectedUnits = units
        unitPreferenceStore.saveUnitPreference(units, uid: uid)
    }

    func updateHazardAlertAudioMode(_ mode: HazardAlertAudioMode) {
        selectedHazardAlertAudioMode = mode
        hazardAlertAudioModeStore.saveHazardAlertAudioMode(mode, uid: uid)
    }

    func saveProfile(displayName: String, carMake: String, carModel: String) async {
        isSavingProfile = true
        defer { isSavingProfile = false }

        do {
            let input = ProfileInput(displayName: displayName, carMake: carMake, carModel: carModel)
            try AuthFlowValidation.validateProfile(input)
            let generatedBadge = DriverBadge.generated(
                displayName: input.displayName,
                carMake: input.carMake,
                carModel: input.carModel,
                paletteIndex: abs(uid.hashValue)
            )
            let updatedProfile = UserProfile(
                displayName: input.displayName.trimmed,
                carMake: input.carMake.trimmed,
                carModel: input.carModel.trimmed,
                badge: DriverBadge(text: generatedBadge.text, colorHex: profile.badge.colorHex),
                homeClub: profile.homeClub,
                createdAt: profile.createdAt,
                updatedAt: nowMilliseconds(),
                stats: profile.stats
            )

            try await profileService.saveProfile(updatedProfile, uid: uid)
            profile = updatedProfile
            self.displayName = updatedProfile.displayName
            vehicleText = "\(updatedProfile.carMake) \(updatedProfile.carModel)"
            badge = updatedProfile.badge
            message = "Profile updated."
        } catch let error as FormValidationError {
            message = error.userMessage
        } catch {
            message = "Unable to update your profile."
        }
    }

    func resetPassword() async {
        isResettingPassword = true
        defer { isResettingPassword = false }

        do {
            guard let email = try await authService.currentUser()?.email, !email.trimmed.isEmpty else {
                message = "No email address is available for this account."
                return
            }

            try AuthFlowValidation.validatePasswordReset(PasswordResetInput(email: email))
            try await authService.resetPassword(email: email.trimmed)
            message = "Password reset email sent."
        } catch let error as FormValidationError {
            message = error.userMessage
        } catch {
            message = AuthErrorMessageMapper.message(for: error)
        }
    }

    func loadAccount() async {
        do {
            if let email = try await authService.currentUser()?.email, !email.trimmed.isEmpty {
                emailText = email
            } else {
                emailText = "Email unavailable"
            }
        } catch {
            emailText = "Email unavailable"
        }
    }

    func signOut() {
        onResetSession()
    }

    func carMakeSuggestions(query: String) -> [String] {
        SettingsCarCatalog.makeSuggestions(query: query)
    }

    func carModelSuggestions(make: String, query: String) -> [String] {
        SettingsCarCatalog.modelSuggestions(make: make, query: query)
    }

    func clearMessage() {
        message = nil
    }
}

enum SettingsCarCatalog {
    private static let makes = [
        "Audi",
        "BMW",
        "Ford",
        "Honda",
        "Hyundai",
        "Kia",
        "Mazda",
        "Mercedes-Benz",
        "Mini",
        "Nissan",
        "Polestar",
        "Porsche",
        "Subaru",
        "Suzuki",
        "Tesla",
        "Toyota",
        "Volkswagen",
        "Volvo"
    ]

    private static let modelsByMake: [String: [String]] = [
        "Audi": ["A3", "A4", "RS3", "RS4", "TT"],
        "BMW": ["M2", "M3", "M4", "M5", "X3"],
        "Ford": ["Fiesta ST", "Focus ST", "Mustang", "Ranger"],
        "Honda": ["Civic", "Civic Type R", "Jazz"],
        "Hyundai": ["i20 N", "i30 N", "Kona"],
        "Kia": ["Picanto", "Rio", "Stinger"],
        "Mazda": ["MX-5", "3", "CX-5"],
        "Mercedes-Benz": ["A45 AMG", "C63 AMG", "CLA45 AMG"],
        "Mini": ["Cooper", "Cooper S", "John Cooper Works"],
        "Nissan": ["350Z", "370Z", "GT-R", "Navara"],
        "Polestar": ["2", "3", "4"],
        "Porsche": ["718 Cayman", "911", "Boxster", "Cayenne", "Macan"],
        "Subaru": ["BRZ", "WRX", "Outback"],
        "Suzuki": ["Jimny", "Swift Sport", "Vitara"],
        "Tesla": ["Model 3", "Model S", "Model X", "Model Y"],
        "Toyota": ["86", "GR Corolla", "GR Yaris", "Supra"],
        "Volkswagen": ["Golf GTI", "Golf R", "Polo GTI"],
        "Volvo": ["C40", "EX30", "XC60"]
    ]

    static func makeSuggestions(query: String) -> [String] {
        filtered(makes, query: query)
    }

    static func modelSuggestions(make: String, query: String) -> [String] {
        filtered(modelsByMake[make] ?? [], query: query)
    }

    private static func filtered(_ values: [String], query: String) -> [String] {
        let trimmed = query.trimmed
        guard !trimmed.isEmpty else {
            return Array(values.prefix(6))
        }

        return values
            .filter { $0.localizedCaseInsensitiveContains(trimmed) }
            .prefix(6)
            .map { $0 }
    }
}

private struct SettingsDestinationView: View {
    @StateObject var viewModel: SettingsViewModel
    @State private var showsProfileEditor = false

    let onOpenSummary: (String) -> Void

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    BadgeView(badge: viewModel.badge)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(viewModel.displayName)
                            .font(.headline)
                        Text(viewModel.vehicleText)
                            .foregroundStyle(.secondary)
                    }
                }

                Button("Edit Profile") {
                    showsProfileEditor = true
                }
                .accessibilityIdentifier("settings.editProfileButton")
            }

            Section("Units") {
                Picker("Distance", selection: Binding(
                    get: { viewModel.selectedUnits },
                    set: { viewModel.updateUnits($0) }
                )) {
                    ForEach(RoutePreferredUnits.allCases) { units in
                        Text(units.label).tag(units)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("settings.unitsPicker")
            }

            Section("Drive Alerts") {
                Picker("Hazard Sound", selection: Binding(
                    get: { viewModel.selectedHazardAlertAudioMode },
                    set: { viewModel.updateHazardAlertAudioMode($0) }
                )) {
                    ForEach(HazardAlertAudioMode.allCases) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("settings.hazardAlertAudioModePicker")
            }

            Section("Account") {
                LabeledContent("Email", value: viewModel.emailText)

                Button("Send Password Reset Email") {
                    Task { await viewModel.resetPassword() }
                }
                .disabled(viewModel.isResettingPassword)
                .accessibilityIdentifier("settings.passwordResetButton")

                Button("Sign Out", role: .destructive) {
                    viewModel.signOut()
                }
                .accessibilityIdentifier("settings.signOutButton")
            }

            Section("History") {
                if viewModel.historyEntries.isEmpty {
                    Text("No completed drives yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(viewModel.historyEntries) { entry in
                        Button {
                            onOpenSummary(entry.runId)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(entry.runName)
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                Text("\(entry.distanceText) · \(entry.timeText)")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .accessibilityLabel("Open summary for \(entry.runName)")
                    }
                }
            }

            if viewModel.showsDiagnostics {
                Section("Debug") {
                    DisclosureGroup {
                        ForEach(viewModel.diagnosticsRows) { row in
                            LabeledContent(row.title, value: row.value)
                        }
                    } label: {
                        Label("Development Diagnostics", systemImage: "stethoscope")
                    }
                    .accessibilityIdentifier("settings.diagnosticsDisclosure")
                }
            }
        }
        .navigationTitle("Settings")
        .task {
            await viewModel.loadAccount()
            viewModel.refreshHistory()
        }
        .sheet(isPresented: $showsProfileEditor) {
            SettingsProfileEditView(viewModel: viewModel)
        }
        .alert(
            "Settings",
            isPresented: Binding(
                get: { viewModel.message != nil },
                set: { isPresented in
                    if !isPresented {
                        viewModel.clearMessage()
                    }
                }
            )
        ) {
            Button("OK", role: .cancel) {
                viewModel.clearMessage()
            }
        } message: {
            Text(viewModel.message ?? "")
        }
    }
}

private struct SettingsProfileEditView: View {
    @ObservedObject var viewModel: SettingsViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var displayName: String
    @State private var carMake: String
    @State private var carModel: String

    init(viewModel: SettingsViewModel) {
        self.viewModel = viewModel
        _displayName = State(initialValue: viewModel.displayName)
        let parts = viewModel.vehicleText.split(separator: " ", maxSplits: 1).map(String.init)
        _carMake = State(initialValue: parts.first ?? "")
        _carModel = State(initialValue: parts.dropFirst().first ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Display Name", text: $displayName)
                        .textContentType(.name)
                    TextField("Car Make", text: $carMake)
                    SettingsSuggestionRow(suggestions: viewModel.carMakeSuggestions(query: carMake)) { suggestion in
                        carMake = suggestion
                    }
                    TextField("Car Model", text: $carModel)
                    SettingsSuggestionRow(suggestions: viewModel.carModelSuggestions(make: carMake, query: carModel)) { suggestion in
                        carModel = suggestion
                    }
                }
            }
            .navigationTitle("Edit Profile")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await viewModel.saveProfile(displayName: displayName, carMake: carMake, carModel: carModel)
                            if viewModel.message == "Profile updated." {
                                dismiss()
                            }
                        }
                    }
                    .disabled(viewModel.isSavingProfile)
                }
            }
        }
    }
}

private struct SettingsSuggestionRow: View {
    let suggestions: [String]
    let onSelect: (String) -> Void

    var body: some View {
        if !suggestions.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(suggestions, id: \.self) { suggestion in
                        Button(suggestion) {
                            onSelect(suggestion)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .accessibilityLabel("Use \(suggestion)")
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }
}

private extension String {
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
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
