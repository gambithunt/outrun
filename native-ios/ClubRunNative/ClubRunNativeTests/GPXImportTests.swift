import XCTest
@testable import ClubRunNative

@MainActor
final class GPXImportTests: XCTestCase {
    func testValidGPXFixtureParsesTrackPoints() throws {
        let route = try GPXRouteParser().parseRouteData(from: fixtureData("valid-route.gpx"))

        XCTAssertEqual(route.source, .gpx)
        XCTAssertEqual(route.points.count, 3)
        XCTAssertEqual(route.points.first, [-33.9089, 18.3661])
        XCTAssertEqual(route.stops?.map(\.kind), [.start, .destination])
        XCTAssertEqual(route.stops?.first?.label, "GPX Start")
        XCTAssertEqual(route.stops?.last?.label, "GPX Finish")
    }

    func testInvalidXMLThrowsInvalidXML() throws {
        XCTAssertThrowsError(try GPXRouteParser().parseRouteData(from: fixtureData("invalid-route.gpx"))) { error in
            XCTAssertEqual(error as? GPXImportError, .invalidXML)
        }
    }

    func testMissingTrackPointsThrowsMissingTrackPoints() throws {
        XCTAssertThrowsError(try GPXRouteParser().parseRouteData(from: fixtureData("missing-track-points.gpx"))) { error in
            XCTAssertEqual(error as? GPXImportError, .missingTrackPoints)
        }
    }

    func testOversizedFileIsRejectedBeforeParsing() {
        let oversized = Data(repeating: 0, count: GPXRouteParser.maxFileBytes + 1)

        XCTAssertThrowsError(try GPXRouteParser().parseRouteData(from: oversized)) { error in
            XCTAssertEqual(error as? GPXImportError, .fileTooLarge)
        }
    }

    func testDistanceCalculationUsesTrackPointSegments() throws {
        let route = try GPXRouteParser().parseRouteData(from: fixtureData("valid-route.gpx"))

        XCTAssertEqual(route.distanceMetres, 1_939, accuracy: 5)
        XCTAssertNil(route.durationSeconds)
    }

    func testRouteSetupViewModelImportsAndSavesGPXPayload() async throws {
        let repository = InMemoryGPXRouteRepository()
        let router = AppRouter()
        let viewModel = RouteSetupViewModel(runId: "run_gpx", routeProvider: StubGPXRouteProvider(), repository: repository, router: router)

        try viewModel.importGPXData(fixtureData("valid-route.gpx"))
        await viewModel.saveRoute()

        XCTAssertEqual(repository.savedRoute?.source, .gpx)
        XCTAssertEqual(repository.savedRoute?.points.count, 3)
        XCTAssertEqual(repository.savedStatus, .ready)
        XCTAssertEqual(router.presentedRoute, AppRoute.adminLobby(runId: "run_gpx"))
    }

    func testRouteSetupViewModelCanDiscardGPXPreview() throws {
        let viewModel = RouteSetupViewModel(runId: "run_gpx", routeProvider: StubGPXRouteProvider(), repository: InMemoryGPXRouteRepository(), router: AppRouter())

        try viewModel.importGPXData(fixtureData("valid-route.gpx"))
        viewModel.discardGPXPreview()

        XCTAssertNil(viewModel.routeData)
        XCTAssertEqual(viewModel.summaryText, "Add start and destination")
    }

    private func fixtureData(_ name: String) throws -> Data {
        let fixtures = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures")
        return try Data(contentsOf: fixtures.appendingPathComponent(name))
    }
}

private struct StubGPXRouteProvider: RouteProviding {
    func route(for stops: [RouteStopDraft]) async throws -> GeneratedRoute {
        GeneratedRoute(points: [], distanceMetres: 0, durationSeconds: 0)
    }
}

private final class InMemoryGPXRouteRepository: RoutePersisting, @unchecked Sendable {
    var savedRoute: RouteData?
    var savedStatus: RunStatus?

    func saveRoute(_ route: RouteData, runId: String) async throws {
        savedRoute = route
    }

    func updateRunStatus(_ status: RunStatus, driveStartedAt: Int64?, runId: String) async throws {
        savedStatus = status
    }
}
