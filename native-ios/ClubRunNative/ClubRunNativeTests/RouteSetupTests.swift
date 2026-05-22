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

    func testWaypointReorderByIDKeepsStartAndDestinationFixed() {
        var editor = RouteStopEditor()
        editor.setStart(makeStop(id: "start", kind: .start, order: 0, label: "Start"))
        editor.setDestination(makeStop(id: "finish", kind: .destination, order: 3, label: "Finish"))
        editor.addWaypoint(makeStop(id: "wp1", kind: .waypoint, order: 1, label: "One"))
        editor.addWaypoint(makeStop(id: "wp2", kind: .waypoint, order: 2, label: "Two"))

        editor.moveWaypoint(id: "wp2", beforeWaypointID: "wp1")

        XCTAssertEqual(editor.orderedStops.map(\.id), ["start", "wp2", "wp1", "finish"])
        XCTAssertEqual(editor.orderedStops.map(\.order), [0, 1, 2, 3])
    }

    func testWaypointReorderByIndexKeepsStartAndDestinationFixed() {
        var editor = RouteStopEditor()
        editor.setStart(makeStop(id: "start", kind: .start, order: 0, label: "Start"))
        editor.setDestination(makeStop(id: "finish", kind: .destination, order: 4, label: "Finish"))
        editor.addWaypoint(makeStop(id: "wp1", kind: .waypoint, order: 1, label: "One"))
        editor.addWaypoint(makeStop(id: "wp2", kind: .waypoint, order: 2, label: "Two"))
        editor.addWaypoint(makeStop(id: "wp3", kind: .waypoint, order: 3, label: "Three"))

        editor.moveWaypoint(id: "wp1", toWaypointIndex: 2)

        XCTAssertEqual(editor.orderedStops.map(\.id), ["start", "wp2", "wp3", "wp1", "finish"])
        XCTAssertEqual(editor.orderedStops.map(\.order), [0, 1, 2, 3, 4])
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
        XCTAssertTrue(viewModel.didSaveRoute)
        XCTAssertEqual(router.presentedRoute, AppRoute.adminLobby(runId: "run_1"))
    }

    func testRouteSetupViewModelHydratesExistingSavedRoute() {
        let route = makeSavedRoute()
        let viewModel = RouteSetupViewModel(
            runId: "run_1",
            routeProvider: StubRouteProvider(),
            repository: InMemoryRouteRepository(),
            router: AppRouter(),
            initialRoute: route
        )

        XCTAssertEqual(viewModel.routeData, route)
        XCTAssertEqual(viewModel.stops.map(\.id), ["start", "wp1", "finish"])
        XCTAssertEqual(viewModel.summaryText, "12.3 km · 24 min")
        XCTAssertFalse(viewModel.routeNeedsRecalculation)
        XCTAssertFalse(viewModel.isGPXPreview)
    }

    func testRouteSetupViewModelRequestsExistingRouteMapFocus() {
        let route = makeSavedRoute()
        let viewModel = RouteSetupViewModel(
            runId: "run_1",
            routeProvider: StubRouteProvider(),
            repository: InMemoryRouteRepository(),
            router: AppRouter(),
            initialRoute: route
        )

        viewModel.focusExistingRoute()

        XCTAssertEqual(viewModel.mapFocusRequest?.coordinate, RouteCoordinate(lat: -33.95, lng: 18.45))
        XCTAssertEqual(viewModel.mapFocusRequest?.latitudeDelta ?? 0, 0.15, accuracy: 0.001)
        XCTAssertEqual(viewModel.mapFocusRequest?.longitudeDelta ?? 0, 0.15, accuracy: 0.001)
    }

    func testRouteSetupViewModelPublishesSummary() async {
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: StubRouteProvider(), repository: InMemoryRouteRepository(), router: AppRouter())
        viewModel.setStart(makeStop(id: "start", kind: .start, order: 0))
        viewModel.setDestination(makeStop(id: "finish", kind: .destination, order: 1))

        await viewModel.recalculateRoute()

        XCTAssertEqual(viewModel.summaryText, "12.3 km · 24 min")
    }

    func testRouteSetupViewModelShowsActionableRouteFailure() async {
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: FailingRouteProvider(), repository: InMemoryRouteRepository(), router: AppRouter())
        viewModel.setStart(makeStop(id: "start", kind: .start, order: 0, label: "Big Bay"))
        viewModel.setDestination(makeStop(id: "finish", kind: .destination, order: 1, label: "Tokai"))

        await viewModel.recalculateRoute()

        XCTAssertEqual(viewModel.message, "No driving route found from Big Bay to Tokai. Move that stop closer to a road and try again.")
    }

    func testPreferredUnitsExposeReadableLabels() {
        XCTAssertEqual(RoutePreferredUnits.kilometres.label, "Kilometres")
        XCTAssertEqual(RoutePreferredUnits.kilometres.distanceLabel, "km")
        XCTAssertEqual(RoutePreferredUnits.miles.label, "Miles")
        XCTAssertEqual(RoutePreferredUnits.miles.distanceLabel, "mi")
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
        let result = RouteStopSearchResult(
            id: "start_place",
            title: "Start Place",
            subtitle: "Cape Town",
            coordinate: RouteCoordinate(lat: -33.9, lng: 18.4),
            placeId: "start_place"
        )

        viewModel.previewSearchResult(result)

        XCTAssertNil(viewModel.activeStopSelectionKind)
        XCTAssertEqual(viewModel.pendingStopConfirmation?.result, result)
        XCTAssertEqual(viewModel.pendingStopConfirmation?.kind, .start)
        XCTAssertEqual(viewModel.mapFocusRequest?.coordinate, result.coordinate)
    }

    func testRouteSetupViewModelConfirmsSearchResultAtAdjustedCoordinate() {
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: StubRouteProvider(), repository: InMemoryRouteRepository(), router: AppRouter())
        viewModel.beginStopSelection(.start)
        viewModel.previewSearchResult(RouteStopSearchResult(
            id: "start_place",
            title: "Start Place",
            subtitle: "Cape Town",
            coordinate: RouteCoordinate(lat: -33.9, lng: 18.4),
            placeId: "start_place"
        ))
        viewModel.confirmPendingSearchResult(at: RouteCoordinate(lat: -33.95, lng: 18.45))

        XCTAssertNil(viewModel.pendingStopConfirmation)
        XCTAssertNil(viewModel.activeStopSelectionKind)
        XCTAssertEqual(viewModel.stops.map(\.label), ["Start Place"])
        XCTAssertEqual(viewModel.stops.map(\.kind), [.start])
        XCTAssertEqual(viewModel.stops.first?.lat, -33.95)
        XCTAssertEqual(viewModel.stops.first?.lng, 18.45)
        XCTAssertEqual(viewModel.stops.first?.source, .search)
        XCTAssertEqual(viewModel.stops.first?.placeId, "start_place")
    }

    func testRouteSetupViewModelMarksRouteStaleWhenStopsChangeAfterCalculation() async {
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: StubRouteProvider(), repository: InMemoryRouteRepository(), router: AppRouter())
        viewModel.setStart(makeStop(id: "start", kind: .start, order: 0))
        viewModel.setDestination(makeStop(id: "finish", kind: .destination, order: 1))
        await viewModel.recalculateRoute()

        viewModel.addWaypoint(makeStop(id: "wp1", kind: .waypoint, order: 1))

        XCTAssertTrue(viewModel.routeNeedsRecalculation)
        XCTAssertNotNil(viewModel.routeData)
    }

    func testRouteSetupViewModelRecalculatesStaleRouteInStopOrder() async {
        let provider = RecordingRouteProvider()
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: provider, repository: InMemoryRouteRepository(), router: AppRouter())
        viewModel.setStart(makeStop(id: "start", kind: .start, order: 0))
        viewModel.setDestination(makeStop(id: "finish", kind: .destination, order: 1))
        await viewModel.recalculateRoute()

        viewModel.addWaypoint(makeStop(id: "wp1", kind: .waypoint, order: 1, label: "Middle"))
        await viewModel.recalculateRoute()

        XCTAssertFalse(viewModel.routeNeedsRecalculation)
        XCTAssertEqual(provider.recordedStops.last?.map(\.id), ["start", "wp1", "finish"])
    }

    func testRouteSetupViewModelMarksRouteStaleWhenWaypointOrderChangesAfterCalculation() async {
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: StubRouteProvider(), repository: InMemoryRouteRepository(), router: AppRouter())
        viewModel.setStart(makeStop(id: "start", kind: .start, order: 0))
        viewModel.addWaypoint(makeStop(id: "wp1", kind: .waypoint, order: 1, label: "One"))
        viewModel.addWaypoint(makeStop(id: "wp2", kind: .waypoint, order: 2, label: "Two"))
        viewModel.setDestination(makeStop(id: "finish", kind: .destination, order: 3))
        await viewModel.recalculateRoute()

        viewModel.moveWaypoint(id: "wp2", beforeWaypointID: "wp1")

        XCTAssertTrue(viewModel.routeNeedsRecalculation)
        XCTAssertEqual(viewModel.stops.map(\.id), ["start", "wp2", "wp1", "finish"])
    }

    func testRouteSetupViewModelAppliesPinnedCoordinateAndExitsPinMode() async {
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: StubRouteProvider(), repository: InMemoryRouteRepository(), router: AppRouter(), pinNamer: FallbackOnlyPinNamer())
        viewModel.beginPinDrop(.waypoint)
        await viewModel.confirmPinDrop(at: RouteCoordinate(lat: -33.93, lng: 18.44))

        XCTAssertNil(viewModel.pinDropKind)
        XCTAssertEqual(viewModel.stops.map(\.kind), [.waypoint])
        XCTAssertEqual(viewModel.stops.first?.label, "Waypoint 1")
        XCTAssertEqual(viewModel.stops.first?.source, .pin)
    }

    func testRouteSetupViewModelUsesResolvedPinName() async {
        let viewModel = RouteSetupViewModel(
            runId: "run_1",
            routeProvider: StubRouteProvider(),
            repository: InMemoryRouteRepository(),
            router: AppRouter(),
            pinNamer: FixedPinNamer(name: "Beach Road")
        )

        viewModel.beginPinDrop(.waypoint)
        await viewModel.confirmPinDrop(at: RouteCoordinate(lat: -33.93, lng: 18.44))

        XCTAssertEqual(viewModel.stops.map(\.label), ["Beach Road"])
    }

    func testRouteSetupViewModelNumbersWaypointFallbackByPosition() async {
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: StubRouteProvider(), repository: InMemoryRouteRepository(), router: AppRouter(), pinNamer: FallbackOnlyPinNamer())

        viewModel.beginPinDrop(.waypoint)
        await viewModel.confirmPinDrop(at: RouteCoordinate(lat: -33.93, lng: 18.44))
        viewModel.beginPinDrop(.waypoint)
        await viewModel.confirmPinDrop(at: RouteCoordinate(lat: -33.94, lng: 18.45))

        XCTAssertEqual(viewModel.stops.map(\.label), ["Waypoint 1", "Waypoint 2"])
    }

    func testRouteSetupViewModelUsesStartAndFinishFallbackNames() async {
        let viewModel = RouteSetupViewModel(runId: "run_1", routeProvider: StubRouteProvider(), repository: InMemoryRouteRepository(), router: AppRouter(), pinNamer: FallbackOnlyPinNamer())

        viewModel.beginPinDrop(.start)
        await viewModel.confirmPinDrop(at: RouteCoordinate(lat: -33.93, lng: 18.44))
        viewModel.beginPinDrop(.destination)
        await viewModel.confirmPinDrop(at: RouteCoordinate(lat: -34.00, lng: 18.50))

        XCTAssertEqual(viewModel.stops.map(\.label), ["Pinned Start", "Pinned Finish"])
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

    private func makeSavedRoute() -> RouteData {
        RouteData(
            points: [[-33.9, 18.4], [-33.95, 18.45], [-34.0, 18.5]],
            distanceMetres: 12_300,
            durationSeconds: 1_440,
            source: .appleMaps,
            stops: [
                makeStop(id: "start", kind: .start, order: 0, label: "Big Bay"),
                makeStop(id: "wp1", kind: .waypoint, order: 1, label: "Tokai"),
                makeStop(id: "finish", kind: .destination, order: 2, label: "Wellington")
            ]
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

private struct FailingRouteProvider: RouteProviding {
    func route(for stops: [RouteStopDraft]) async throws -> GeneratedRoute {
        throw RouteSetupError.routeLegUnavailable(from: stops[0].label, to: stops[1].label)
    }
}

private struct FixedPinNamer: RoutePinNaming {
    let name: String

    func name(for coordinate: RouteCoordinate, kind: RouteStopKind, existingStops: [RouteStopDraft]) async -> String {
        name
    }
}

private struct FallbackOnlyPinNamer: RoutePinNaming {
    func name(for coordinate: RouteCoordinate, kind: RouteStopKind, existingStops: [RouteStopDraft]) async -> String {
        RoutePinFallbackName.name(for: kind, existingStops: existingStops)
    }
}

private final class RecordingRouteProvider: RouteProviding, @unchecked Sendable {
    var recordedStops: [[RouteStopDraft]] = []

    func route(for stops: [RouteStopDraft]) async throws -> GeneratedRoute {
        recordedStops.append(stops)
        return GeneratedRoute(
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
