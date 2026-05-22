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

    func startDrive(runId: String) async throws {
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
    private let service: LobbyService
    private let router: AppRouter?
    private let runObserver: RunObserving?
    private var runObservation: RunObservation?
    private var snapshot: LobbySnapshot?

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
            try await service.startDrive(runId: runId)
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
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(viewModel.title)
                        .font(.headline)
                    HStack {
                        Text("Code \(viewModel.joinCode)")
                            .font(.title2.weight(.semibold))
                        Spacer()
                        ShareLink(item: viewModel.joinCode) {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }
                        Button {
                            UIPasteboard.general.string = viewModel.joinCode
                        } label: {
                            Label("Copy", systemImage: "doc.on.doc")
                        }
                    }
                    Text(viewModel.startReadinessLabel)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("adminLobby.readinessLabel")
                }
            }

            Section {
                Button {
                    Task {
                        await viewModel.startDrive()
                    }
                } label: {
                    Label("Start Drive", systemImage: "flag.checkered")
                }
                .disabled(!viewModel.canStartDrive)
                .accessibilityIdentifier("adminLobby.startDriveButton")
            }

            Section {
                Button {
                    showsRouteSetup = true
                } label: {
                    LabeledContent("Route", value: viewModel.routeSummary)
                }
                .accessibilityIdentifier("adminLobby.routeRow")

                Button {
                    viewModel.showsDriversSheet = true
                } label: {
                    LabeledContent("Drivers", value: viewModel.driverSummary)
                }
                .accessibilityIdentifier("adminLobby.driversRow")
            }

            if let message = viewModel.message {
                Text(message)
                    .foregroundStyle(.red)
            }
        }
        .navigationTitle("Admin Lobby")
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
}

struct DriverLobbyView: View {
    @StateObject var viewModel: DriverLobbyViewModel

    var body: some View {
        List {
            Section {
                Text(viewModel.title)
                    .font(.headline)
                LabeledContent("Route", value: viewModel.routeSummary)
                LabeledContent("Drivers", value: viewModel.driverSummary)
            }

            Section {
                Button {
                    viewModel.showsDriversSheet = true
                } label: {
                    Label("Drivers", systemImage: "person.2.fill")
                }
                .accessibilityIdentifier("driverLobby.driversButton")
            }

            if let message = viewModel.message {
                Text(message)
                    .foregroundStyle(.red)
            }
        }
        .navigationTitle("Driver Lobby")
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
}

private struct DriversSheetView: View {
    let rows: [LobbyDriverRow]

    var body: some View {
        NavigationStack {
            List(rows) { row in
                HStack(spacing: 12) {
                    if let badge = row.badge {
                        Text(badge.text)
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(width: 38, height: 38)
                            .background(Color(hex: badge.colorHex), in: Circle())
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.displayName)
                            .font(.headline)
                        Text(row.vehicle)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(row.statusText)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Drivers")
        }
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
