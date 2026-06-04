import Foundation
import SwiftUI
import UIKit

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
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Name the drive now. Route setup happens in the admin lobby.")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 20)

                VStack(spacing: 12) {
                    CreateRunField(label: "Run name") {
                        TextField("Sunday morning drive", text: $viewModel.name)
                            .textInputAutocapitalization(.words)
                            .accessibilityLabel("Run Name")
                            .accessibilityIdentifier("createRun.nameField")
                    }

                    CreateRunField(label: "Description", caption: "Optional") {
                        TextField("Short description", text: $viewModel.description, axis: .vertical)
                            .lineLimit(2...4)
                            .accessibilityLabel("Short Description")
                            .accessibilityIdentifier("createRun.descriptionField")
                    }
                }
                .padding(16)
                .background(
                    Color.createRunFormFill,
                    in: RoundedRectangle(cornerRadius: 26, style: .continuous)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                }

                if let message = viewModel.message {
                    Text(message)
                        .font(.callout.weight(.medium))
                        .foregroundStyle(.red)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .accessibilityIdentifier("createRun.message")
                }

                Button {
                    Task {
                        await viewModel.create()
                    }
                } label: {
                    HStack {
                        Spacer()
                        if viewModel.isCreating {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Create Run")
                                .font(.headline.weight(.semibold))
                        }
                        Spacer()
                    }
                    .foregroundStyle(.white)
                    .padding(.vertical, 16)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(viewModel.isCreating)
                .accessibilityLabel("Create Run")
                .accessibilityIdentifier("createRun.submitButton")
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Create Run")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct CreateRunField<Field: View>: View {
    let label: String
    var caption: String?
    @ViewBuilder let field: Field

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.primary.opacity(0.72))
                if let caption {
                    Spacer()
                    Text(caption)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }

            field
                .font(.body.weight(.medium))
                .foregroundStyle(.primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(
                    Color.createRunFieldFill,
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.primary.opacity(0.16), lineWidth: 1)
                }
        }
    }
}

private extension Color {
    static var createRunFormFill: Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.12, alpha: 1)
                : UIColor.secondarySystemGroupedBackground
        })
    }

    static var createRunFieldFill: Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(white: 0.075, alpha: 1)
                : UIColor.systemBackground
        })
    }
}
