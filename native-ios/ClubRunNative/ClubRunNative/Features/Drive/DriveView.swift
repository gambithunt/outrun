import SwiftUI

struct DriveView: View {
    let viewModel: DriveViewModel
    let createdRun: CreatedRun?
    let createRunStatus: String
    let isCreatingRun: Bool
    let onCreateRun: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section("Backend") {
                    LabeledContent("Auth", value: viewModel.authProvider)
                    LabeledContent("Database", value: viewModel.databaseMode)
                    LabeledContent("UID", value: viewModel.authenticatedUID)
                    LabeledContent("Run write/read", value: viewModel.runRoundTripStatus)
                }

                Section("Create Run") {
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

                    LabeledContent("Status", value: createRunStatus)

                    if let createdRun {
                        LabeledContent("Run ID", value: createdRun.runId)
                        LabeledContent("Join Code", value: createdRun.joinCode)
                    }
                }
            }
            .navigationTitle("ClubRun")
        }
    }
}
