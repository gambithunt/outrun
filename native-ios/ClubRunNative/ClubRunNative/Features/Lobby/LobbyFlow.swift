import Foundation
import SwiftUI
import UIKit

enum LobbyDriverClassification: Equatable {
    case waiting
    case offline
    case left
}

struct LobbyDriverRow: Identifiable, Equatable {
    let id: String
    let displayName: String
    let vehicle: String
    let badge: DriverBadge?
    let classification: LobbyDriverClassification

    var statusText: String {
        switch classification {
        case .waiting:
            "Waiting"
        case .offline:
            "Offline"
        case .left:
            "Left"
        }
    }
}

struct LobbySnapshot: Equatable {
    let runId: String
    let run: Run
    let driverRows: [LobbyDriverRow]
}

enum LobbyDriverPresencePolicy {
    static func classification(for driver: DriverRecord) -> LobbyDriverClassification {
        if driver.finishState == .left || driver.leftAt != nil {
            return .left
        }

        if driver.presence == .online || driver.presence == .background {
            return .waiting
        }

        return .offline
    }
}

enum LobbyStartPolicy {
    static func readinessLabel(for run: Run) -> String {
        if run.status == .active {
            return "Drive active."
        }

        guard run.route != nil else {
            return "Add a route before starting."
        }

        return "Ready to start."
    }

    static func canStart(_ run: Run) -> Bool {
        run.route != nil && run.status != .active && run.status != .ended
    }

    static func requiresSoloConfirmation(_ run: Run) -> Bool {
        waitingDriverCount(in: run) == 0
    }

    static func waitingDriverCount(in run: Run) -> Int {
        (run.drivers ?? [:]).values.filter {
            LobbyDriverPresencePolicy.classification(for: $0) == .waiting
        }.count
    }
}

enum LobbySummaryFormatter {
    static func routeSummary(for route: RouteData?) -> String {
        guard let route else {
            return "Route not set"
        }

        let kilometres = route.distanceMetres / 1_000
        let minutes = Int((route.durationSeconds ?? 0) / 60)
        return "\(String(format: "%.1f", kilometres)) km · \(minutes) min · \(sourceText(route.source))"
    }

    static func driverSummary(for run: Run) -> String {
        let joined = run.drivers?.count ?? 0
        let waiting = LobbyStartPolicy.waitingDriverCount(in: run)
        return "\(joined) joined · \(waiting) waiting"
    }

    private static func sourceText(_ source: RouteSource) -> String {
        switch source {
        case .appleMaps:
            "Apple Maps"
        case .gpx:
            "GPX"
        case .drawn:
            "Drawn"
        }
    }
}

struct LobbyService: Sendable {
    let repository: RunRepositoring
    let nowMilliseconds: @Sendable () -> Int64

    init(
        repository: RunRepositoring,
        nowMilliseconds: @escaping @Sendable () -> Int64 = {
            Int64(Date().timeIntervalSince1970 * 1000)
        }
    ) {
        self.repository = repository
        self.nowMilliseconds = nowMilliseconds
    }

    func snapshot(runId: String) async throws -> LobbySnapshot {
        guard let run = try await repository.readRun(runId: runId) else {
            throw JoinRunError.runNotFound
        }

        return snapshot(run: run, runId: runId)
    }

    func snapshot(run: Run, runId: String) -> LobbySnapshot {
        let rows = (run.drivers ?? [:])
            .map { uid, record in
                LobbyDriverRow(
                    id: uid,
                    displayName: record.profile.displayName ?? record.profile.name,
                    vehicle: "\(record.profile.carMake) \(record.profile.carModel)",
                    badge: record.profile.badge,
                    classification: LobbyDriverPresencePolicy.classification(for: record)
                )
            }
            .sorted { $0.displayName < $1.displayName }

        return LobbySnapshot(runId: runId, run: run, driverRows: rows)
    }

    func startDrive(runId: String, adminUID: String? = nil, adminProfile: UserProfile? = nil) async throws {
        if let adminUID, let adminProfile {
            try await ensureAdminDriverRecord(runId: runId, adminUID: adminUID, adminProfile: adminProfile)
        }
        try await repository.updateRunStatus(.active, driveStartedAt: nowMilliseconds(), runId: runId)
    }

    func saveRoute(_ route: RouteData, runId: String) async throws {
        try await repository.saveRoute(route, runId: runId)
    }

    func updateRunStatus(_ status: RunStatus, driveStartedAt: Int64?, runId: String) async throws {
        try await repository.updateRunStatus(status, driveStartedAt: driveStartedAt, runId: runId)
    }

    func updatePresence(runId: String, uid: String, presence: DriverPresence) async throws {
        guard let run = try await repository.readRun(runId: runId),
              let existingDriver = run.drivers?[uid]
        else {
            return
        }

        let updatedDriver = DriverRecord(
            profile: existingDriver.profile,
            location: existingDriver.location,
            joinedAt: existingDriver.joinedAt,
            leftAt: existingDriver.leftAt,
            presence: presence,
            finishState: existingDriver.finishState,
            finishedAt: existingDriver.finishedAt,
            stats: existingDriver.stats
        )

        try await repository.writeDriver(updatedDriver, runId: runId, uid: uid)
    }

    private func ensureAdminDriverRecord(runId: String, adminUID: String, adminProfile: UserProfile) async throws {
        guard let run = try await repository.readRun(runId: runId),
              run.drivers?[adminUID] == nil else {
            return
        }

        let driver = DriverRecord(
            profile: DriverProfile(
                name: adminProfile.displayName,
                displayName: adminProfile.displayName,
                carMake: adminProfile.carMake,
                carModel: adminProfile.carModel,
                badge: adminProfile.badge,
                fuelType: .petrol
            ),
            joinedAt: nowMilliseconds(),
            leftAt: nil,
            presence: .online,
            finishState: .driving
        )

        try await repository.writeDriver(driver, runId: runId, uid: adminUID)
    }
}

@MainActor
final class AdminLobbyViewModel: ObservableObject {
    @Published private(set) var title = ""
    @Published private(set) var joinCode = ""
    @Published private(set) var routeSummary = "Route not set"
    @Published private(set) var driverSummary = "0 joined · 0 waiting"
    @Published private(set) var startReadinessLabel = "Loading"
    @Published private(set) var canStartDrive = false
    @Published private(set) var driverRows: [LobbyDriverRow] = []
    @Published private(set) var currentRoute: RouteData?
    @Published var showsDriversSheet = false
    @Published var showsSoloStartConfirmation = false
    @Published private(set) var message: String?

    let runId: String

    private let uid: String
    private let profile: UserProfile?
    private let service: LobbyService
    private let router: AppRouter?
    private let runObserver: RunObserving?
    private var runObservation: RunObservation?
    private var snapshot: LobbySnapshot?

    init(
        uid: String,
        runId: String,
        profile: UserProfile? = nil,
        service: LobbyService,
        router: AppRouter? = nil,
        runObserver: RunObserving? = nil
    ) {
        self.uid = uid
        self.profile = profile
        self.runId = runId
        self.service = service
        self.router = router
        self.runObserver = runObserver
    }

    func load() async {
        do {
            let snapshot = try await service.snapshot(runId: runId)
            self.snapshot = snapshot
            apply(snapshot)
            message = nil
        } catch {
            message = "Unable to load lobby."
        }
    }

    func startObservingRun() {
        guard runObservation == nil, let runObserver else {
            return
        }

        runObservation = runObserver.observeRun(runId: runId) { [weak self] result in
            Task { @MainActor in
                guard let self else {
                    return
                }

                switch result {
                case let .success(run?):
                    self.apply(self.service.snapshot(run: run, runId: self.runId))
                    self.message = nil
                case .success(nil):
                    self.message = "Unable to load lobby."
                case .failure:
                    self.message = "Unable to update lobby."
                }
            }
        }
    }

    func stopObservingRun() {
        runObservation?.cancel()
        runObservation = nil
    }

    func startDrive() async {
        guard let run = snapshot?.run, LobbyStartPolicy.canStart(run) else {
            return
        }

        if LobbyStartPolicy.requiresSoloConfirmation(run) {
            showsSoloStartConfirmation = true
            return
        }

        await confirmSoloStart()
    }

    func confirmSoloStart() async {
        do {
            try await service.startDrive(runId: runId, adminUID: uid, adminProfile: profile)
            await load()
            showsSoloStartConfirmation = false
            router?.present(.liveDrive(runId: runId, role: .admin))
        } catch {
            message = "Unable to start the drive."
        }
    }

    private func apply(_ snapshot: LobbySnapshot) {
        self.snapshot = snapshot
        title = snapshot.run.name
        joinCode = snapshot.run.joinCode
        currentRoute = snapshot.run.route
        routeSummary = LobbySummaryFormatter.routeSummary(for: snapshot.run.route)
        driverSummary = LobbySummaryFormatter.driverSummary(for: snapshot.run)
        startReadinessLabel = LobbyStartPolicy.readinessLabel(for: snapshot.run)
        canStartDrive = LobbyStartPolicy.canStart(snapshot.run)
        driverRows = snapshot.driverRows
        _ = uid
    }
}

@MainActor
final class DriverLobbyViewModel: ObservableObject {
    @Published private(set) var title = ""
    @Published private(set) var routeSummary = "Route not set"
    @Published private(set) var driverSummary = "0 joined · 0 waiting"
    @Published private(set) var driverRows: [LobbyDriverRow] = []
    @Published var showsDriversSheet = false
    @Published private(set) var message: String?

    let showsAdminControls = false

    private let uid: String
    private let runId: String
    private let service: LobbyService
    private let router: AppRouter?
    private let runObserver: RunObserving?
    private var runObservation: RunObservation?

    init(
        uid: String,
        runId: String,
        service: LobbyService,
        router: AppRouter? = nil,
        runObserver: RunObserving? = nil
    ) {
        self.uid = uid
        self.runId = runId
        self.service = service
        self.router = router
        self.runObserver = runObserver
    }

    func load() async {
        do {
            try await service.updatePresence(runId: runId, uid: uid, presence: .online)
            let snapshot = try await service.snapshot(runId: runId)
            apply(snapshot)
            message = nil
        } catch {
            message = "Unable to load lobby."
        }
    }

    func startObservingRun() {
        guard runObservation == nil, let runObserver else {
            return
        }

        runObservation = runObserver.observeRun(runId: runId) { [weak self] result in
            Task { @MainActor in
                guard let self else {
                    return
                }

                switch result {
                case let .success(run?):
                    self.apply(self.service.snapshot(run: run, runId: self.runId))
                case .success(nil):
                    self.message = "Unable to load lobby."
                case .failure:
                    self.message = "Unable to update lobby."
                }
            }
        }
    }

    func stopObservingRun() {
        runObservation?.cancel()
        runObservation = nil
    }

    private func apply(_ snapshot: LobbySnapshot) {
        title = snapshot.run.name
        routeSummary = LobbySummaryFormatter.routeSummary(for: snapshot.run.route)
        driverSummary = LobbySummaryFormatter.driverSummary(for: snapshot.run)
        driverRows = snapshot.driverRows

        if snapshot.run.status == .active, snapshot.run.drivers?[uid] != nil {
            router?.present(.liveDrive(runId: runId, role: .driver))
        }
    }
}

extension LobbyService: RoutePersisting {}

struct AdminLobbyView: View {
    @StateObject var viewModel: AdminLobbyViewModel
    let router: AppRouter
    let routeProvider: RouteProviding
    let routePersisting: RoutePersisting
    @State private var showsRouteSetup = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                adminHeader

                Button {
                    Task {
                        await viewModel.startDrive()
                    }
                } label: {
                    HStack {
                        Image(systemName: "flag.checkered")
                        Text("Start Drive")
                        Spacer()
                    }
                    .font(.title3.weight(.bold))
                    .foregroundStyle(viewModel.canStartDrive ? .white : .secondary)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 19)
                    .background(
                        viewModel.canStartDrive ? Color.accentColor : Color.lobbyDisabledFill,
                        in: RoundedRectangle(cornerRadius: 24, style: .continuous)
                    )
                    .overlay {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color.primary.opacity(viewModel.canStartDrive ? 0 : 0.08), lineWidth: 1)
                    }
                }
                .buttonStyle(.plain)
                .disabled(!viewModel.canStartDrive)
                .accessibilityLabel("Start Drive")
                .accessibilityIdentifier("adminLobby.startDriveButton")

                Button {
                    showsRouteSetup = true
                } label: {
                    LobbyInfoCard(
                        title: "Route",
                        value: viewModel.routeSummary,
                        systemImage: "map.fill",
                        tint: .blue
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Route")
                .accessibilityIdentifier("adminLobby.routeRow")

                Button {
                    viewModel.showsDriversSheet = true
                } label: {
                    LobbyInfoCard(
                        title: "Drivers",
                        value: viewModel.driverSummary,
                        systemImage: "person.2.fill",
                        tint: .green
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Drivers")
                .accessibilityIdentifier("adminLobby.driversRow")

                if let message = viewModel.message {
                    LobbyMessage(text: message)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 32)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Admin Lobby")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.load()
            viewModel.startObservingRun()
        }
        .onDisappear {
            viewModel.stopObservingRun()
        }
        .sheet(isPresented: $viewModel.showsDriversSheet) {
            DriversSheetView(rows: viewModel.driverRows)
        }
        .fullScreenCover(isPresented: $showsRouteSetup, onDismiss: {
            Task {
                await viewModel.load()
            }
        }) {
            RouteSetupView(
                viewModel: RouteSetupViewModel(
                    runId: viewModel.runId,
                    routeProvider: routeProvider,
                    repository: routePersisting,
                    router: router,
                    initialRoute: viewModel.currentRoute
                )
            )
            .ignoresSafeArea(.all)
            .presentationBackground(.clear)
        }
        .confirmationDialog("Start without other drivers?", isPresented: $viewModel.showsSoloStartConfirmation) {
            Button("Start Solo", role: .destructive) {
                Task {
                    await viewModel.confirmSoloStart()
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private var adminHeader: some View {
        AdminLobbyAccessCard(
            runName: viewModel.title.isEmpty ? "Run" : viewModel.title,
            joinCode: viewModel.joinCode,
            readinessLabel: viewModel.startReadinessLabel,
            canStartDrive: viewModel.canStartDrive
        )
    }
}

struct DriverLobbyView: View {
    @StateObject var viewModel: DriverLobbyViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                driverHeader

                LobbyInfoCard(
                    title: "Route",
                    value: viewModel.routeSummary,
                    systemImage: "map.fill",
                    tint: .blue
                )

                Button {
                    viewModel.showsDriversSheet = true
                } label: {
                    LobbyInfoCard(
                        title: "Drivers",
                        value: viewModel.driverSummary,
                        systemImage: "person.2.fill",
                        tint: .green
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Drivers")
                .accessibilityIdentifier("driverLobby.driversButton")

                if let message = viewModel.message {
                    LobbyMessage(text: message)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 32)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Driver Lobby")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.load()
            viewModel.startObservingRun()
        }
        .onDisappear {
            viewModel.stopObservingRun()
        }
        .sheet(isPresented: $viewModel.showsDriversSheet) {
            DriversSheetView(rows: viewModel.driverRows)
        }
    }

    private var driverHeader: some View {
        DriverLobbyStatusCard(runName: viewModel.title.isEmpty ? "Run" : viewModel.title)
    }
}

private struct DriversSheetView: View {
    let rows: [LobbyDriverRow]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Drivers")
                            .font(.system(size: 38, weight: .bold, design: .rounded))
                        Text(driverSummary)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.bottom, 8)

                    if rows.isEmpty {
                        DriversEmptyCard()
                    }

                    ForEach(rows) { row in
                        DriversSheetRow(row: row, statusColor: statusColor(row.classification))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 32)
            }
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var driverSummary: String {
        if rows.isEmpty {
            return "No drivers have joined yet."
        }

        let waiting = rows.filter { $0.classification == .waiting }.count
        return "\(rows.count) joined · \(waiting) waiting"
    }

    private func statusColor(_ classification: LobbyDriverClassification) -> Color {
        switch classification {
        case .waiting:
            .green
        case .offline:
            .secondary
        case .left:
            .orange
        }
    }
}

private struct DriversEmptyCard: View {
    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: "person.2.slash")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 54, height: 54)
                .background(Color.secondary, in: Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text("No Drivers Yet")
                    .font(.headline.weight(.bold))
                Text("Drivers will appear here after they join the run.")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.lobbyCardFill, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        }
    }
}

private struct DriversSheetRow: View {
    let row: LobbyDriverRow
    let statusColor: Color

    var body: some View {
        HStack(spacing: 14) {
            driverBadge

            VStack(alignment: .leading, spacing: 4) {
                Text(row.displayName)
                    .font(.headline.weight(.bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(row.vehicle)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 12)

            LobbyStatusPill(text: row.statusText, tint: statusColor)
        }
        .padding(18)
        .background(Color.lobbyCardFill, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var driverBadge: some View {
        if let badge = row.badge {
            Text(badge.text)
                .font(.headline.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(Color(hex: badge.colorHex), in: Circle())
        } else {
            Image(systemName: "person.fill")
                .font(.headline.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(Color.gray, in: Circle())
        }
    }
}

private struct LobbyInfoCard: View {
    let title: String
    let value: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(tint, in: Circle())

            VStack(alignment: .leading, spacing: 3) {
                Text(title.uppercased())
                    .font(.caption.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(18)
        .background(Color.lobbyCardFill, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        }
    }
}

private struct AdminLobbyAccessCard: View {
    let runName: String
    let joinCode: String
    let readinessLabel: String
    let canStartDrive: Bool

    var body: some View {
        VStack(spacing: 20) {
            HStack(alignment: .center) {
                Text("Lobby Access")
                    .font(.caption.weight(.bold))
                    .tracking(2.2)
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)

                Spacer()

                LobbyStatusPill(
                    text: statusText,
                    tint: statusTint
                )
            }

            VStack(spacing: 8) {
                Text(runName)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                Text(joinCode.isEmpty ? "------" : joinCode)
                    .font(.system(size: 58, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.55)
                    .frame(maxWidth: .infinity)
            }
            .padding(.vertical, 8)

            HStack(spacing: 18) {
                ShareLink(item: joinCode) {
                    AdminLobbyAccessAction(title: "Share", systemImage: "square.and.arrow.up")
                }
                .accessibilityLabel("Share")

                Button {
                    UIPasteboard.general.string = joinCode
                } label: {
                    AdminLobbyAccessAction(title: "Copy", systemImage: "doc.on.doc")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Copy")
            }

            Text(readinessLabel)
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("adminLobby.readinessLabel")
        }
        .padding(24)
        .background(Color.lobbyCardFill, in: RoundedRectangle(cornerRadius: 32, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        }
    }

    private var statusText: String {
        if readinessLabel == "Drive active." {
            return "Active"
        }

        return canStartDrive ? "Ready" : "Needs Route"
    }

    private var statusTint: Color {
        if readinessLabel == "Drive active." {
            return .blue
        }

        return canStartDrive ? .green : .orange
    }
}

private struct DriverLobbyStatusCard: View {
    let runName: String

    var body: some View {
        VStack(spacing: 20) {
            HStack(alignment: .center) {
                Text("Lobby Access")
                    .font(.caption.weight(.bold))
                    .tracking(2.2)
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)

                Spacer()

                LobbyStatusPill(text: "Waiting", tint: .orange)
            }

            VStack(spacing: 8) {
                Text(runName)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                HStack(spacing: 14) {
                    Image(systemName: "clock.fill")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 58, height: 58)
                        .background(Color.orange, in: Circle())

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Waiting for admin")
                            .font(.title2.weight(.bold))
                        Text("Live Drive opens when the run starts.")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(18)
                .background(Color.lobbyActionFill, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                }
                .accessibilityElement(children: .combine)
            }
            .frame(maxWidth: .infinity)

            Text("Stay on this screen. You will be moved into the drive automatically.")
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
        }
        .padding(24)
        .background(Color.lobbyCardFill, in: RoundedRectangle(cornerRadius: 32, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        }
    }
}

private struct LobbyStatusPill: View {
    let text: String
    let tint: Color

    var body: some View {
        Text(text.uppercased())
            .font(.caption2.weight(.bold))
            .tracking(1)
            .foregroundStyle(tint)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(tint.opacity(0.14), in: Capsule())
            .overlay {
                Capsule()
                    .stroke(tint.opacity(0.34), lineWidth: 1)
            }
    }
}

private struct AdminLobbyAccessAction: View {
    let title: String
    let systemImage: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.title3.weight(.semibold))
                .frame(width: 54, height: 54)
                .background(Color.lobbyActionFill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                }

            Text(title.uppercased())
                .font(.caption.weight(.bold))
                .tracking(1.1)
        }
        .foregroundStyle(Color.accentColor)
    }
}

private struct LobbyMessage: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.callout.weight(.medium))
            .foregroundStyle(.red)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private extension Color {
    static var lobbyCardFill: Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.115, alpha: 1)
                : UIColor.secondarySystemGroupedBackground
        })
    }

    static var lobbyActionFill: Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.16, alpha: 1)
                : UIColor.systemBackground
        })
    }

    static var lobbyDisabledFill: Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.075, alpha: 1)
                : UIColor.tertiarySystemFill
        })
    }

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
