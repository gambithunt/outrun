import SwiftUI

@main
struct ClubRunNativeApp: App {
    @State private var environment = AppEnvironment.development()
    @State private var createdRun: CreatedRun?
    @State private var createRunStatus = "Not created"
    @State private var isCreatingRun = false

    init() {
        #if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseDatabase)
        FirebaseBootstrap.configure(.development)
        #endif
    }

    var body: some Scene {
        WindowGroup {
            DriveView(
                viewModel: DriveViewModel(session: environment.session),
                createdRun: createdRun,
                createRunStatus: createRunStatus,
                isCreatingRun: isCreatingRun,
                onCreateRun: {
                    Task {
                        await createDraftRun()
                    }
                }
            )
                .task {
                    await bootstrapBackendSession()
                }
        }
    }

    @MainActor
    private func bootstrapBackendSession() async {
        let configuration = FirebaseConfiguration.development

        #if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseDatabase)
        environment = await AppEnvironment.authenticated(
            configuration: configuration,
            authService: FirebaseAuthService(),
            runRepository: FirebaseRunRepository()
        )
        #else
        environment = AppEnvironment.development()
        #endif
    }

    @MainActor
    private func createDraftRun() async {
        guard !isCreatingRun else {
            return
        }

        guard environment.session.authenticatedUID != "Not signed in",
              environment.session.authenticatedUID != "Auth failed" else {
            createRunStatus = "Sign in first"
            return
        }

        isCreatingRun = true
        createRunStatus = "Creating"

        #if canImport(FirebaseCore) && canImport(FirebaseAuth) && canImport(FirebaseDatabase)
        do {
            let service = RunCreationService(repository: FirebaseRunRepository())
            createdRun = try await service.createDraftRun(
                adminUID: environment.session.authenticatedUID
            )
            createRunStatus = "Created"
        } catch {
            createRunStatus = "Failed"
        }
        #else
        createRunStatus = "Unavailable"
        #endif

        isCreatingRun = false
    }
}
