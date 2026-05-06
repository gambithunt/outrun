import Foundation
import SwiftUI

enum JoinRunError: Error, Equatable {
    case missingCode
    case invalidCode
    case codeNotFound
    case runNotFound
    case runEnded
    case runFull

    var userMessage: String {
        switch self {
        case .missingCode:
            "Enter a six-digit code."
        case .invalidCode:
            "Enter the six-digit join code."
        case .codeNotFound:
            "No run found for that code."
        case .runNotFound:
            "That run is no longer available."
        case .runEnded:
            "This run has already ended."
        case .runFull:
            "This run is full."
        }
    }
}

enum JoinCodeNormalizer {
    static func normalize(_ value: String) throws -> String {
        let digits = value.filter(\.isNumber)

        guard !digits.isEmpty else {
            throw JoinRunError.missingCode
        }

        guard digits.count == 6 else {
            throw JoinRunError.invalidCode
        }

        return String(digits)
    }
}

struct ResolvedJoinRun: Equatable {
    let runId: String
    let run: Run
}

struct JoinedRun: Equatable {
    let runId: String
    let run: Run
    let driver: DriverRecord
}

struct JoinRunService: Sendable {
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

    func resolve(code: String) async throws -> ResolvedJoinRun {
        let normalizedCode = try JoinCodeNormalizer.normalize(code)

        guard let joinCode = try await repository.readJoinCode(code: normalizedCode) else {
            throw JoinRunError.codeNotFound
        }

        guard let run = try await repository.readRun(runId: joinCode.runId) else {
            throw JoinRunError.runNotFound
        }

        guard run.status != .ended else {
            throw JoinRunError.runEnded
        }

        return ResolvedJoinRun(runId: joinCode.runId, run: run)
    }

    func join(resolved: ResolvedJoinRun, uid: String, profile: UserProfile) async throws -> JoinedRun {
        let existingDrivers = resolved.run.drivers ?? [:]
        if existingDrivers[uid] == nil, existingDrivers.count >= resolved.run.maxDrivers {
            throw JoinRunError.runFull
        }

        let driver = driverRecord(from: profile, joinedAt: nowMilliseconds())
        try await repository.writeDriver(driver, runId: resolved.runId, uid: uid)

        return JoinedRun(runId: resolved.runId, run: resolved.run, driver: driver)
    }

    static func driverRecord(from profile: UserProfile, joinedAt: Int64) -> DriverRecord {
        DriverRecord(
            profile: DriverProfile(
                name: profile.displayName,
                displayName: profile.displayName,
                carMake: profile.carMake,
                carModel: profile.carModel,
                badge: profile.badge,
                fuelType: .petrol
            ),
            joinedAt: joinedAt,
            leftAt: nil,
            presence: .online,
            finishState: .driving
        )
    }

    private func driverRecord(from profile: UserProfile, joinedAt: Int64) -> DriverRecord {
        Self.driverRecord(from: profile, joinedAt: joinedAt)
    }
}

@MainActor
final class JoinRunViewModel: ObservableObject {
    @Published var code = ""
    @Published private(set) var resolvedRunName: String?
    @Published private(set) var message: String?
    @Published private(set) var isResolving = false
    @Published private(set) var isJoining = false

    private let uid: String
    private let profile: UserProfile
    private let service: JoinRunService
    private let activeRunStore: ActiveRunStoring
    private let router: AppRouter
    private var resolvedRun: ResolvedJoinRun?

    init(
        uid: String,
        profile: UserProfile,
        service: JoinRunService,
        activeRunStore: ActiveRunStoring,
        router: AppRouter
    ) {
        self.uid = uid
        self.profile = profile
        self.service = service
        self.activeRunStore = activeRunStore
        self.router = router
    }

    func resolve() async {
        guard !isResolving else {
            return
        }

        isResolving = true
        defer { isResolving = false }

        do {
            message = nil
            let resolved = try await service.resolve(code: code)
            resolvedRun = resolved
            resolvedRunName = resolved.run.name
        } catch let error as JoinRunError {
            clearResolvedRun()
            message = error.userMessage
        } catch {
            clearResolvedRun()
            message = "Unable to find the run. Try again."
        }
    }

    func join() async {
        guard !isJoining else {
            return
        }

        do {
            if resolvedRun == nil {
                try await resolveBeforeJoin()
            }

            guard let resolvedRun else {
                return
            }

            isJoining = true
            defer { isJoining = false }

            message = nil
            let joined = try await service.join(resolved: resolvedRun, uid: uid, profile: profile)
            activeRunStore.saveActiveRunSession(
                ActiveRunSessionMetadata(runId: joined.runId, role: .driver),
                uid: uid
            )
            route(afterJoining: joined)
        } catch let error as JoinRunError {
            message = error.userMessage
        } catch {
            message = "Unable to join the run. Try again."
        }
    }

    private func resolveBeforeJoin() async throws {
        let resolved = try await service.resolve(code: code)
        resolvedRun = resolved
        resolvedRunName = resolved.run.name
    }

    private func route(afterJoining joined: JoinedRun) {
        switch joined.run.status {
        case .draft, .ready:
            router.present(.driverLobby(runId: joined.runId))
        case .active:
            router.present(.liveDrive(runId: joined.runId, role: .driver))
        case .ended:
            message = JoinRunError.runEnded.userMessage
        }
    }

    private func clearResolvedRun() {
        resolvedRun = nil
        resolvedRunName = nil
    }
}

struct JoinRunView: View {
    @StateObject var viewModel: JoinRunViewModel

    var body: some View {
        Form {
            Section {
                TextField("Join Code", text: $viewModel.code)
                    .font(.system(size: 34, weight: .semibold, design: .rounded))
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("joinRun.codeField")

                Button("Find Run") {
                    Task {
                        await viewModel.resolve()
                    }
                }
                .disabled(viewModel.isResolving)
                .accessibilityIdentifier("joinRun.resolveButton")
            }

            if let resolvedRunName = viewModel.resolvedRunName {
                Section("Run") {
                    Text(resolvedRunName)
                        .font(.headline)
                        .accessibilityIdentifier("joinRun.resolvedRunName")

                    Button("Join Run") {
                        Task {
                            await viewModel.join()
                        }
                    }
                    .disabled(viewModel.isJoining)
                    .accessibilityIdentifier("joinRun.submitButton")
                }
            }

            if let message = viewModel.message {
                Text(message)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("joinRun.message")
            }
        }
        .navigationTitle("Join Run")
    }
}
