import Foundation
import SwiftUI

@MainActor
final class CreateRunViewModel: ObservableObject {
    @Published var name = ""
    @Published var description = ""
    @Published private(set) var message: String?
    @Published private(set) var isCreating = false

    private let uid: String
    private let service: RunCreationService
    private let activeRunStore: ActiveRunStoring
    private let router: AppRouter

    init(
        uid: String,
        service: RunCreationService,
        activeRunStore: ActiveRunStoring,
        router: AppRouter
    ) {
        self.uid = uid
        self.service = service
        self.activeRunStore = activeRunStore
        self.router = router
    }

    func create() async {
        guard !isCreating else {
            return
        }

        isCreating = true
        defer { isCreating = false }

        do {
            message = nil
            let created = try await service.createDraftRun(
                input: CreateRunInput(
                    name: name,
                    description: description
                ),
                adminUID: uid
            )
            activeRunStore.saveActiveRunSession(
                ActiveRunSessionMetadata(runId: created.runId, role: .admin),
                uid: uid
            )
            router.present(.adminLobby(runId: created.runId))
        } catch let error as CreateRunValidationError {
            message = error.userMessage
        } catch {
            message = "Unable to create the run. Try again."
        }
    }
}

struct CreateRunView: View {
    @StateObject var viewModel: CreateRunViewModel

    var body: some View {
        Form {
            Section {
                TextField("Run Name", text: $viewModel.name)
                    .textInputAutocapitalization(.words)
                    .accessibilityIdentifier("createRun.nameField")

                TextField("Short Description", text: $viewModel.description, axis: .vertical)
                    .lineLimit(2...4)
                    .accessibilityIdentifier("createRun.descriptionField")
            }

            if let message = viewModel.message {
                Text(message)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("createRun.message")
            }

            Section {
                Button {
                    Task {
                        await viewModel.create()
                    }
                } label: {
                    if viewModel.isCreating {
                        ProgressView()
                    } else {
                        Text("Create Run")
                    }
                }
                .disabled(viewModel.isCreating)
                .accessibilityIdentifier("createRun.submitButton")
            }
        }
        .navigationTitle("Create Run")
    }
}
