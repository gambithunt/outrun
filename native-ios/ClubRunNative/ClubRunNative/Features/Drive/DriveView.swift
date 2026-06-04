import SwiftUI

struct DriveView: View {
    let viewModel: DriveViewModel
    let createdRun: CreatedRun?
    let createRunStatus: String
    let isCreatingRun: Bool
    let onResetSession: () -> Void
    let onCreateRun: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                if viewModel.showsBackendDiagnostics {
                    VStack(alignment: .leading, spacing: 22) {
                        diagnosticsHeader

                        DiagnosticsCard(title: "Backend", systemImage: "stethoscope") {
                            DiagnosticsValueRow(title: "Auth", value: viewModel.authProvider)
                                .accessibilityIdentifier("diagnostics.auth")
                            DiagnosticsDivider()
                            DiagnosticsValueRow(title: "Database", value: viewModel.databaseMode)
                                .accessibilityIdentifier("diagnostics.database")
                            DiagnosticsDivider()
                            DiagnosticsValueRow(title: "UID", value: viewModel.authenticatedUID)
                                .accessibilityIdentifier("diagnostics.uid")
                            DiagnosticsDivider()
                            DiagnosticsValueRow(title: "Run write/read", value: viewModel.runRoundTripStatus)
                                .accessibilityIdentifier("diagnostics.runRoundTrip")
                        }
                        .accessibilityIdentifier("diagnostics.section")

                        DiagnosticsCard(title: "Backend Smoke", systemImage: "flame") {
                            Button {
                                onCreateRun()
                            } label: {
                                HStack(spacing: 10) {
                                    if isCreatingRun {
                                        ProgressView()
                                            .tint(.white)
                                    } else {
                                        Image(systemName: "plus.circle.fill")
                                            .font(.headline)
                                    }

                                    Text(isCreatingRun ? "Creating test run" : "Create test run")
                                        .font(.headline.weight(.semibold))
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .foregroundStyle(.white)
                                .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .disabled(isCreatingRun)
                            .accessibilityIdentifier("backendSmoke.createRunButton")

                            DiagnosticsValueRow(title: "Status", value: createRunStatus)
                                .accessibilityIdentifier("backendSmoke.status")

                            if let createdRun {
                                DiagnosticsDivider()
                                DiagnosticsValueRow(title: "Run ID", value: createdRun.runId)
                                    .accessibilityIdentifier("backendSmoke.runID")
                                DiagnosticsDivider()
                                DiagnosticsValueRow(title: "Join Code", value: createdRun.joinCode)
                                    .accessibilityIdentifier("backendSmoke.joinCode")
                            }
                        }
                        .accessibilityIdentifier("backendSmoke.section")

                        #if DEBUG
                        DiagnosticsCard(title: "Session", systemImage: "person.crop.circle.badge.xmark") {
                            Button(role: .destructive) {
                                onResetSession()
                            } label: {
                                HStack {
                                    Image(systemName: "rectangle.portrait.and.arrow.right")
                                    Text("Sign Out")
                                        .fontWeight(.semibold)
                                    Spacer()
                                }
                                .font(.headline)
                                .foregroundStyle(.red)
                                .padding(18)
                                .background(Color.diagnosticsInsetFill, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("session.signOutButton")
                        }
                        #endif
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, 28)
                    .padding(.bottom, 36)
                } else {
                    ContentUnavailableView {
                        Label("Diagnostics Hidden", systemImage: "eye.slash")
                    } description: {
                        Text("Development diagnostics are disabled.")
                    }
                    .frame(maxWidth: .infinity, minHeight: 360)
                    .padding(.horizontal, 22)
                }
            }
            .background(Color.diagnosticsBackground.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            #if DEBUG
            .toolbar {
                if viewModel.showsBackendDiagnostics {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Sign Out", role: .destructive) {
                            onResetSession()
                        }
                        .accessibilityIdentifier("session.signOutButton")
                    }
                }
            }
            #endif
        }
    }

    private var diagnosticsHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("ClubRun")
                .font(.system(size: 52, weight: .bold, design: .default))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            Text("Development Diagnostics")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(.top, 20)
    }
}

private struct DiagnosticsCard<Content: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.headline)
                    .foregroundStyle(.secondary)
                Text(title)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
            }

            VStack(spacing: 0) {
                content
            }
        }
        .padding(20)
        .background(Color.diagnosticsCardFill, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.diagnosticsBorder, lineWidth: 1)
        }
    }
}

private struct DiagnosticsValueRow: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value.isEmpty ? "Unavailable" : value)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.primary)
                .textSelection(.enabled)
                .lineLimit(3)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 14)
    }
}

private struct DiagnosticsDivider: View {
    var body: some View {
        Rectangle()
            .fill(Color.diagnosticsBorder)
            .frame(height: 1)
    }
}

private extension Color {
    static var diagnosticsBackground: Color {
        #if canImport(UIKit)
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor.black
                : UIColor.systemGroupedBackground
        })
        #else
        Color.black
        #endif
    }

    static var diagnosticsCardFill: Color {
        #if canImport(UIKit)
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.105, alpha: 1)
                : UIColor.secondarySystemGroupedBackground
        })
        #else
        Color(white: 0.105)
        #endif
    }

    static var diagnosticsInsetFill: Color {
        #if canImport(UIKit)
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.075, alpha: 1)
                : UIColor.systemGroupedBackground
        })
        #else
        Color(white: 0.075)
        #endif
    }

    static var diagnosticsBorder: Color {
        #if canImport(UIKit)
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 1, alpha: 0.08)
                : UIColor(white: 0, alpha: 0.06)
        })
        #else
        Color.white.opacity(0.08)
        #endif
    }
}
