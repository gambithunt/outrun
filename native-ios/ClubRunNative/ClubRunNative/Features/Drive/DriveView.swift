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
            List {
                if viewModel.showsBackendDiagnostics {
                    Section("Development Diagnostics") {
                        LabeledContent("Auth", value: viewModel.authProvider)
                            .accessibilityIdentifier("diagnostics.auth")
                        LabeledContent("Database", value: viewModel.databaseMode)
                            .accessibilityIdentifier("diagnostics.database")
                        LabeledContent("UID", value: viewModel.authenticatedUID)
                            .accessibilityIdentifier("diagnostics.uid")
                        LabeledContent("Run write/read", value: viewModel.runRoundTripStatus)
                            .accessibilityIdentifier("diagnostics.runRoundTrip")
                    }
                    .accessibilityIdentifier("diagnostics.section")

                    Section("Backend Smoke") {
                        Button {
                            onCreateRun()
                        } label: {
                            if isCreatingRun {
                                ProgressView()
                            } else {
                                Text("Create test run")
                            }
                        }
                        .disabled(isCreatingRun)
                        .accessibilityIdentifier("backendSmoke.createRunButton")

                        LabeledContent("Status", value: createRunStatus)
                            .accessibilityIdentifier("backendSmoke.status")

                        if let createdRun {
                            LabeledContent("Run ID", value: createdRun.runId)
                                .accessibilityIdentifier("backendSmoke.runID")
                            LabeledContent("Join Code", value: createdRun.joinCode)
                                .accessibilityIdentifier("backendSmoke.joinCode")
                        }
                    }
                    .accessibilityIdentifier("backendSmoke.section")

                    #if DEBUG
                    Section("Session") {
                        Button(role: .destructive) {
                            onResetSession()
                        } label: {
                            Text("Sign Out")
                        }
                        .accessibilityIdentifier("session.signOutButton")
                    }
                    #endif
                }
            }
            .navigationTitle("ClubRun")
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
}
