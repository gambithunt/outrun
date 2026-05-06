import XCTest
@testable import ClubRunNative

@MainActor
final class RouteSetupTests: XCTestCase {
    func testRouteStopValidationRequiresStartAndDestination() {
        XCTAssertThrowsError(try RouteStopValidator.validate([])) { error in
            XCTAssertEqual(error as? RouteSetupError, .missingStart)
        }
        XCTAssertThrowsError(try RouteStopValidator.validate([makeStop(id: "start", kind: .start, order: 0)])) { error in
            XCTAssertEqual(error as? RouteSetupError, .missingDestination)
        }
    }

    func testRouteStopValidationRequiresCoordinatesAndLabels() {
        XCTAssertThrowsError(try RouteStopValidator.validate([
            RouteStopDraft(id: "start", kind: .start, order: 0, label: "", lat: -33.9, lng: 18.4, source: .search),
            makeStop(id: "finish", kind: .destination, order: 1)
        ])) { error in
            XCTAssertEqual(error as? RouteSetupError, .invalidStop)
        }
        XCTAssertThrowsError(try RouteStopValidator.validate([
            RouteStopDraft(id: "start", kind: .start, order: 0, label: "Start", lat: nil, lng: 18.4, source: .search),
            makeStop(id: "finish", kind: .destination, order: 1)
        ])) { error in
            XCTAssertEqual(error as? RouteSetupError, .invalidStop)
        }
    }

    func testWaypointAddRemoveAndReorder() {
        var editor = RouteStopEditor()
        editor.setStart(makeStop(id: "start", kind: .start, order: 0, label: "Start"))
        editor.setDestination(makeStop(id: "finish", kind: .destination, order: 1, label: "Finish"))
        editor.addWaypoint(makeStop(id: "wp1", kind: .waypoint, order: 1, label: "One"))
        editor.addWaypoint(makeStop(id: "wp2", kind: .waypoint, order: 2, label: "Two"))

        editor.moveWaypoint(fromOffsets: IndexSet(integer: 1), toOffset: 0)
        editor.removeWaypoint(id: "wp1")

        XCTAssertEqual(editor.orderedStops.map(\.id), ["start", "wp2", "finish"])
        XCTAssertEqual(editor.orderedStops.map(\.order), [0, 1, 2])
    }

    func testRouteRecalculationTriggersWhenStopsChange() {
        var policy = RouteRecalculationPolicy()
        XCTAssertTrue(policy.shouldRecalculate(after: [makeStop(id: "start", kind: .start, order: 0), makeStop(id: "finish", kind: .destination, order: 1)]))
        XCTAssertFalse(policy.shouldRecalculate(after: [makeStop(id: "start", kind: .start, order: 0), makeStop(id: "finish", kind: .destination, order: 1)]))
        XCTAssertTrue(policy.shouldRecalculate(after: [makeStop(id: "start", kind: .start, order: 0), makeStop(id: "wp1", kind: .waypoint, order: 1), makeStop(id: "finish", kind: .destination, order: 2)]))
    }

    func testMapKitRouteRequestConstructionKeepsMapKitTypesOutOfRouteData() throws {
        let stops = try RouteStopValidator.validate([
            makeStop(id: "start", kind: .start, order: 0),
            makeStop(id: "wp1", kind: .waypoint, order: 1),
            makeStop(id: "finish", kind: .destination, order: 2, label: "Finish")
        ])

        let request = AppleMapsRouteRequest(stops: stops)

        XCTAssertEqual(request.transportType, .automobile)
        XCTAssertEqual(request.source.label, "Start")
        XCTAssertEqual(request.destination.label, "Finish")
        XCTAssertEqual(request.waypoints.map(\.label), ["Waypoint"])
    }

    func testRouteResponseNormalizationCreatesFirebasePayload() throws {
        let stops = try RouteStopValidator.validate([
            makeStop(id: "start", kind: .start, order: 0),
            makeStop(id: "finish", kind: .destination, order: 1)
        ])
        let response = GeneratedRoute(points: [RouteCoordinate(lat: -33.9, lng: 18.4), RouteCoordinate(lat: -34.0, lng: 18.5)], distanceMetres: 12_300, durationSeconds: 1_440)

        let route = RouteResponseNormalizer.routeData(from: response, stops: stops)

        XCTAssertEqual(route.source, .appleMaps)
        XCTAssertEqual(route.points, [[-33.9, 18.4], [-34.0, 18.5]])
        XCTAssertEqual(route.distanceMetres, 12_300)
        XCTAssertEqual(route.durationSeconds, 1_440)
        XCTAssertEqual(route.stops?.map(\.id), ["start", "finish"])
    }

    func testRouteSetupViewModelSavesRouteAndMarksRunReady() async {
        let repository = InMemoryRouteRepository()
        let provider = StubRouteProvider()
        let router = AppRouter()
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: provider, repository: repository, router: router)
        viewModel.setStart(makeStop(id: "start", kind: .start, order: 0))
        viewModel.setDestination(makeStop(id: "finish", kind: .destination, order: 1))

        await viewModel.recalculateRoute()
        await viewModel.saveRoute()

        XCTAssertEqual(repository.savedRoute?.source, .appleMaps)
        XCTAssertEqual(repository.savedStatus, .ready)
        XCTAssertEqual(router.presentedRoute, AppRoute.adminLobby(runId: "run_1"))
    }

    func testRouteSetupViewModelPublishesSummary() async {
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: StubRouteProvider(), repository: InMemoryRouteRepository(), router: AppRouter())
        viewModel.setStart(makeStop(id: "start", kind: .start, order: 0))
        viewModel.setDestination(makeStop(id: "finish", kind: .destination, order: 1))

        await viewModel.recalculateRoute()

        XCTAssertEqual(viewModel.summaryText, "12.3 km · 24 min")
    }

    func testSearchResultCreatesStopForSelectionKind() {
        let result = RouteStopSearchResult(
            id: "place_1",
            title: "Chapman's Peak",
            subtitle: "Cape Town",
            coordinate: RouteCoordinate(lat: -34.088, lng: 18.358),
            placeId: "place_1"
        )

        let stop = result.routeStop(kind: .destination)

        XCTAssertEqual(stop.kind, .destination)
        XCTAssertEqual(stop.label, "Chapman's Peak")
        XCTAssertEqual(stop.lat, -34.088)
        XCTAssertEqual(stop.lng, 18.358)
        XCTAssertEqual(stop.source, .search)
        XCTAssertEqual(stop.placeId, "place_1")
    }

    func testRouteSetupViewModelAppliesSearchResultToActiveSelection() {
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: StubRouteProvider(), repository: InMemoryRouteRepository(), router: AppRouter())
        viewModel.beginStopSelection(.start)
        viewModel.applySearchResult(
            RouteStopSearchResult(
                id: "start_place",
                title: "Start Place",
                subtitle: "Cape Town",
                coordinate: RouteCoordinate(lat: -33.9, lng: 18.4),
                placeId: "start_place"
            )
        )

        XCTAssertNil(viewModel.activeStopSelectionKind)
        XCTAssertEqual(viewModel.stops.map(\.label), ["Start Place"])
        XCTAssertEqual(viewModel.stops.map(\.kind), [.start])
    }

    func testRouteSetupViewModelAppliesPinnedCoordinateAndExitsPinMode() {
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: StubRouteProvider(), repository: InMemoryRouteRepository(), router: AppRouter())
        viewModel.beginPinDrop(.waypoint)
        viewModel.confirmPinDrop(at: RouteCoordinate(lat: -33.93, lng: 18.44))

        XCTAssertNil(viewModel.pinDropKind)
        XCTAssertEqual(viewModel.stops.map(\.kind), [.waypoint])
        XCTAssertEqual(viewModel.stops.first?.label, "Pinned Waypoint")
        XCTAssertEqual(viewModel.stops.first?.source, .pin)
    }

    private func makeStop(id: String, kind: RouteStopKind, order: Int?, label: String? = nil) -> RouteStopDraft {
        RouteStopDraft(
            id: id,
            kind: kind,
            order: order,
            label: label ?? (kind == .waypoint ? "Waypoint" : kind.rawValue.capitalized),
            lat: kind == .destination ? -34.0 : -33.9,
            lng: kind == .destination ? 18.5 : 18.4,
            source: .search,
            placeId: nil
        )
    }
}

private struct StubRouteProvider: RouteProviding {
    func route(for stops: [RouteStopDraft]) async throws -> GeneratedRoute {
        GeneratedRoute(
            points: [RouteCoordinate(lat: -33.9, lng: 18.4), RouteCoordinate(lat: -34.0, lng: 18.5)],
            distanceMetres: 12_300,
            durationSeconds: 1_440
        )
    }
}

private final class InMemoryRouteRepository: RoutePersisting, @unchecked Sendable {
    var savedRoute: RouteData?
    var savedStatus: RunStatus?

    func saveRoute(_ route: RouteData, runId: String) async throws {
        savedRoute = route
    }

    func updateRunStatus(_ status: RunStatus, driveStartedAt: Int64?, runId: String) async throws {
        savedStatus = status
    }
}
