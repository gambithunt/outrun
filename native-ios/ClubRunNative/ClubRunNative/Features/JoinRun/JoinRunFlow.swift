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
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Paste or type the six-digit code from the run admin.")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 20)

                VStack(spacing: 16) {
                    VStack(spacing: 10) {
                        Text("Join Code")
                            .font(.caption.weight(.bold))
                            .tracking(1.6)
                            .foregroundStyle(.secondary)
                            .textCase(.uppercase)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        TextField("000000", text: $viewModel.code)
                            .font(.system(size: 44, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.primary)
                            .tint(.accentColor)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 18)
                            .background(
                                Color.joinRunFieldFill,
                                in: RoundedRectangle(cornerRadius: 22, style: .continuous)
                            )
                            .overlay {
                                RoundedRectangle(cornerRadius: 22, style: .continuous)
                                    .stroke(Color.joinRunBorder, lineWidth: 1)
                            }
                            .accessibilityIdentifier("joinRun.codeField")
                    }

                    Button {
                        Task {
                            await viewModel.resolve()
                        }
                    } label: {
                        HStack {
                            Spacer()
                            if viewModel.isResolving {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Label("Find Run", systemImage: "magnifyingglass")
                                    .font(.headline.weight(.semibold))
                            }
                            Spacer()
                        }
                        .foregroundStyle(.white)
                        .padding(.vertical, 16)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .shadow(color: Color.accentColor.opacity(0.22), radius: 14, y: 8)
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.isResolving)
                    .accessibilityLabel("Find Run")
                    .accessibilityIdentifier("joinRun.resolveButton")
                }
                .padding(16)
                .background(
                    Color.joinRunCardFill,
                    in: RoundedRectangle(cornerRadius: 28, style: .continuous)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(Color.joinRunBorder, lineWidth: 1)
                }

                if let resolvedRunName = viewModel.resolvedRunName {
                    VStack(spacing: 18) {
                        HStack(alignment: .center) {
                            Text("Run Found")
                                .font(.caption.weight(.bold))
                                .tracking(1.6)
                                .foregroundStyle(.secondary)
                                .textCase(.uppercase)

                            Spacer()

                            Image(systemName: "checkmark.circle.fill")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(.green)
                        }

                        HStack(spacing: 14) {
                            Image(systemName: "flag.checkered")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(width: 48, height: 48)
                                .background(Color.accentColor, in: Circle())

                            Text(resolvedRunName)
                                .font(.system(size: 30, weight: .bold, design: .rounded))
                                .lineLimit(2)
                                .minimumScaleFactor(0.75)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .accessibilityIdentifier("joinRun.resolvedRunName")
                        }
                        .padding(16)
                        .background(Color.joinRunInlineFill, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .stroke(Color.joinRunBorder, lineWidth: 1)
                        }

                        Button {
                            Task {
                                await viewModel.join()
                            }
                        } label: {
                            HStack {
                                Spacer()
                                Text("Join Run")
                                    .font(.headline.weight(.semibold))
                                Spacer()
                            }
                            .foregroundStyle(.white)
                            .padding(.vertical, 16)
                            .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                            .shadow(color: Color.accentColor.opacity(0.22), radius: 14, y: 8)
                        }
                        .buttonStyle(.plain)
                        .disabled(viewModel.isJoining)
                        .accessibilityLabel("Join Run")
                        .accessibilityIdentifier("joinRun.submitButton")
                    }
                    .padding(20)
                    .background(
                        Color.joinRunCardFill,
                        in: RoundedRectangle(cornerRadius: 28, style: .continuous)
                    )
                    .overlay {
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .stroke(Color.joinRunBorder, lineWidth: 1)
                    }
                }

                if let message = viewModel.message {
                    Text(message)
                        .font(.callout.weight(.medium))
                        .foregroundStyle(.red)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.joinRunMessageFill, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(Color.red.opacity(0.22), lineWidth: 1)
                        }
                        .accessibilityIdentifier("joinRun.message")
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Join Run")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private extension Color {
    static var joinRunCardFill: Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.11, alpha: 1)
                : UIColor.secondarySystemGroupedBackground
        })
    }

    static var joinRunFieldFill: Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.065, alpha: 1)
                : UIColor.systemBackground
        })
    }

    static var joinRunInlineFill: Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.075, alpha: 1)
                : UIColor.systemBackground
        })
    }

    static var joinRunBorder: Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 1, alpha: 0.08)
                : UIColor(white: 0, alpha: 0.06)
        })
    }

    static var joinRunMessageFill: Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.28, green: 0.06, blue: 0.06, alpha: 1)
                : UIColor(red: 1, green: 0.92, blue: 0.92, alpha: 1)
        })
    }
}
