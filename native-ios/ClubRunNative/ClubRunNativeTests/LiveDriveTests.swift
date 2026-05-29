import XCTest
@testable import ClubRunNative

@MainActor
final class LiveDriveTests: XCTestCase {
    func testRouteMapStateUsesRunRoutePoints() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.routeCoordinates, [
            RouteCoordinate(lat: -33.9, lng: 18.4),
            RouteCoordinate(lat: -33.95, lng: 18.45),
            RouteCoordinate(lat: -34.0, lng: 18.5)
        ])
    }

    func testRouteEndpointMarkersUseStartAndFinishStops() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.routeEndpointMarkers, [
            LiveDriveRouteEndpointMarker(
                id: "start",
                kind: .start,
                title: "Start",
                coordinate: RouteCoordinate(lat: -33.9, lng: 18.4),
                iconSystemName: "flag.fill"
            ),
            LiveDriveRouteEndpointMarker(
                id: "destination",
                kind: .destination,
                title: "Finish",
                coordinate: RouteCoordinate(lat: -34.0, lng: 18.5),
                iconSystemName: "flag.checkered"
            )
        ])
    }

    func testDriverMarkerModelsUseBadgesAndHideOtherDriverSpeed() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()

        let otherDriver = viewModel.driverMarkers.first { $0.id == "uid_driver_2" }
        XCTAssertEqual(otherDriver?.displayName, "Sam")
        XCTAssertEqual(otherDriver?.vehicle, "BMW M2")
        XCTAssertEqual(otherDriver?.badgeText, "S")
        XCTAssertEqual(otherDriver?.badgeColorHex, "#43A047")
        XCTAssertNil(otherDriver?.speedText)
    }

    func testDriverMarkerStatesClassifyCurrentStaleAndOffline() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            nowMilliseconds: { 1_800_000_121_000 }
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.driverMarkers.first { $0.id == "uid_driver_1" }?.state, .current)
        XCTAssertEqual(viewModel.driverMarkers.first { $0.id == "uid_driver_2" }?.state, .stale)
        XCTAssertEqual(viewModel.driverMarkers.first { $0.id == "uid_driver_3" }?.state, .offline)
    }

    func testDriverMarkerTimeoutMarksSilentOnlineDriversOffline() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: Self.makeRun(
                samLocation: DriverLocation(
                    lat: -33.93,
                    lng: 18.43,
                    heading: 90,
                    speed: 12,
                    accuracy: 6,
                    timestamp: 1_800_000_000_000
                )
            )),
            nowMilliseconds: { 1_800_000_301_000 }
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.driverMarkers.first { $0.id == "uid_driver_2" }?.state, .offline)
    }

    func testCurrentUserMarkerIsExposedFromLatestDriverLocation() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()

        XCTAssertEqual(
            viewModel.currentUserMarker,
            LiveDriveCurrentUserMarker(
                coordinate: RouteCoordinate(lat: -33.9, lng: 18.4),
                heading: 90,
                accuracy: 5
            )
        )
    }

    func testLocateCurrentUserEnablesFollowCameraWhenLocationExists() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        viewModel.locateCurrentUser()

        XCTAssertEqual(
            viewModel.cameraTarget,
            LiveDriveCameraTarget(
                center: RouteCoordinate(lat: -33.9, lng: 18.4),
                heading: 90,
                distanceMetres: 1_100
            )
        )
        XCTAssertTrue(viewModel.isFollowingCurrentUser)
    }

    func testLocateCurrentUserShowsMessageWhenNoLocationExists() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: Self.makeRun(currentDriverLocation: nil))
        )

        await viewModel.load()
        viewModel.locateCurrentUser()

        XCTAssertNil(viewModel.cameraTarget)
        XCTAssertFalse(viewModel.isFollowingCurrentUser)
        XCTAssertEqual(viewModel.message, "Waiting for your location.")
    }

    func testFollowCameraTracksNewCurrentUserLocations() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        viewModel.locateCurrentUser()
        await viewModel.ingestLocation(makeLocationSample(lat: -33.91, lng: 18.41, timestamp: 1_800_000_010_000))

        XCTAssertEqual(
            viewModel.currentUserMarker,
            LiveDriveCurrentUserMarker(
                coordinate: RouteCoordinate(lat: -33.91, lng: 18.41),
                heading: 90,
                accuracy: 4
            )
        )
        XCTAssertEqual(viewModel.cameraTarget?.center.lat ?? 0, -33.91, accuracy: 0.001)
        XCTAssertGreaterThan(viewModel.cameraTarget?.center.lng ?? 0, 18.41)
    }

    func testMovementAboveThresholdStartsFollowModeAutomatically() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        await viewModel.ingestLocation(makeLocationSample(speed: 9, timestamp: 1_800_000_010_000))

        XCTAssertTrue(viewModel.isFollowingCurrentUser)
        XCTAssertEqual(viewModel.cameraTarget?.distanceMetres, 1_250)
    }

    func testSlowLocationUpdateDoesNotStartFollowModeAutomatically() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        await viewModel.ingestLocation(makeLocationSample(speed: 1.5, timestamp: 1_800_000_010_000))

        XCTAssertFalse(viewModel.isFollowingCurrentUser)
        XCTAssertNil(viewModel.cameraTarget)
    }

    func testManualMapInteractionPausesFollowMode() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        viewModel.locateCurrentUser()
        viewModel.recordMapInteraction(nowMilliseconds: 1_800_000_010_000)
        await viewModel.ingestLocation(makeLocationSample(lat: -33.91, lng: 18.41, speed: 10, timestamp: 1_800_000_011_000))

        XCTAssertFalse(viewModel.isFollowingCurrentUser)
        XCTAssertNotEqual(viewModel.cameraTarget?.center, RouteCoordinate(lat: -33.91, lng: 18.41))
    }

    func testDelayedFollowResumesAfterNoInteractionWhileMoving() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        await viewModel.ingestLocation(makeLocationSample(speed: 10, timestamp: 1_800_000_010_000))
        viewModel.recordMapInteraction(nowMilliseconds: 1_800_000_011_000)
        viewModel.resumeFollowAfterInteractionDelay(nowMilliseconds: 1_800_000_019_999)
        XCTAssertFalse(viewModel.isFollowingCurrentUser)

        viewModel.resumeFollowAfterInteractionDelay(nowMilliseconds: 1_800_000_020_000)

        XCTAssertTrue(viewModel.isFollowingCurrentUser)
        XCTAssertEqual(viewModel.cameraTarget?.center.lat ?? 0, -33.9, accuracy: 0.001)
        XCTAssertGreaterThan(viewModel.cameraTarget?.center.lng ?? 0, 18.4)
    }

    func testRepeatedMapInteractionResetsDelayedFollow() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        await viewModel.ingestLocation(makeLocationSample(speed: 10, timestamp: 1_800_000_010_000))
        viewModel.recordMapInteraction(nowMilliseconds: 1_800_000_011_000)
        viewModel.recordMapInteraction(nowMilliseconds: 1_800_000_017_000)
        viewModel.resumeFollowAfterInteractionDelay(nowMilliseconds: 1_800_000_025_999)
        XCTAssertFalse(viewModel.isFollowingCurrentUser)

        viewModel.resumeFollowAfterInteractionDelay(nowMilliseconds: 1_800_000_026_000)

        XCTAssertTrue(viewModel.isFollowingCurrentUser)
    }

    func testLocateButtonForcesFollowImmediatelyAfterManualInteraction() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        viewModel.locateCurrentUser()
        viewModel.recordMapInteraction(nowMilliseconds: 1_800_000_010_000)
        viewModel.locateCurrentUser()

        XCTAssertTrue(viewModel.isFollowingCurrentUser)
        XCTAssertEqual(viewModel.cameraTarget?.center, RouteCoordinate(lat: -33.9, lng: 18.4))
    }

    func testCurrentUserMarkerHeadingIsRelativeToMapHeading() {
        let marker = LiveDriveCurrentUserMarker(
            coordinate: RouteCoordinate(lat: -33.9, lng: 18.4),
            heading: 270,
            accuracy: 4
        )

        XCTAssertEqual(marker.screenHeading(relativeToMapHeading: 270), 0)
        XCTAssertEqual(marker.screenHeading(relativeToMapHeading: 90), 180)
    }

    func testHazardMarkerModelsUseTypeAndLocation() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.hazardMarkers, [
            LiveDriveHazardMarker(
                id: "hazard_1",
                type: .pothole,
                title: "Pothole",
                detail: "Reported by Alex",
                reportedBy: "uid_driver_1",
                reporterName: "Alex",
                reportedAt: 1_800_000_003_000,
                reportCount: 1,
                coordinate: RouteCoordinate(lat: -33.94, lng: 18.44),
                iconSystemName: "exclamationmark.triangle.fill",
                colorHex: "#FFB000"
            )
        ])
    }

    func testHazardMarkerSelectionExposesDetails() async throws {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        let marker = try XCTUnwrap(viewModel.hazardMarkers.first)
        viewModel.selectHazard(marker)

        XCTAssertEqual(viewModel.selectedHazard?.title, "Pothole")
        XCTAssertEqual(viewModel.selectedHazard?.reporterName, "Alex")
        XCTAssertEqual(viewModel.selectedHazard?.reportCount, 1)
        XCTAssertEqual(viewModel.selectedHazard?.reportedAt, 1_800_000_003_000)
    }

    func testHazardMarkersHideExpiredHazardsWithoutDeletingBackendRecord() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: Self.makeRun(
                hazards: [
                    "fresh_hazard": Hazard(
                        type: .police,
                        reportedBy: "uid_driver_1",
                        reporterName: "Alex",
                        lat: -33.94,
                        lng: 18.44,
                        timestamp: 1_800_000_100_000,
                        dismissed: false,
                        reportCount: 1
                    ),
                    "expired_hazard": Hazard(
                        type: .roadworks,
                        reportedBy: "uid_driver_2",
                        reporterName: "Sam",
                        lat: -33.95,
                        lng: 18.45,
                        timestamp: 1_799_998_000_000,
                        dismissed: false,
                        reportCount: 1
                    )
                ]
            )),
            nowMilliseconds: { 1_800_000_200_000 }
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.hazardMarkers.map(\.id), ["fresh_hazard"])
    }

    func testHazardExpiryPolicyKeepsBoundaryHazardVisible() {
        let hazard = Hazard(
            type: .pothole,
            reportedBy: "uid_driver_1",
            reporterName: "Alex",
            lat: -33.94,
            lng: 18.44,
            timestamp: 1_800_000_000_000,
            dismissed: false,
            reportCount: 1
        )

        XCTAssertTrue(LiveDriveHazardExpiryPolicy.isVisible(hazard, nowMilliseconds: 1_800_001_800_000))
        XCTAssertFalse(LiveDriveHazardExpiryPolicy.isVisible(hazard, nowMilliseconds: 1_800_001_800_001))
    }

    func testHazardAlertPolicyReturnsRemoteHazardsWithinActionableDistance() {
        let events = LiveDriveHazardAlertPolicy.actionableRemoteHazards(
            from: [
                LiveDriveHazardMarkerFactory.marker(
                    id: "near_remote",
                    hazard: Hazard(
                        type: .police,
                        reportedBy: "uid_driver_2",
                        reporterName: "Sam",
                        lat: -33.9005,
                        lng: 18.4005,
                        timestamp: 1_800_000_030_000,
                        dismissed: false,
                        reportCount: 1
                    )
                ),
                LiveDriveHazardMarkerFactory.marker(
                    id: "near_own",
                    hazard: Hazard(
                        type: .pothole,
                        reportedBy: "uid_driver_1",
                        reporterName: "Alex",
                        lat: -33.9005,
                        lng: 18.4005,
                        timestamp: 1_800_000_030_000,
                        dismissed: false,
                        reportCount: 1
                    )
                ),
                LiveDriveHazardMarkerFactory.marker(
                    id: "far_remote",
                    hazard: Hazard(
                        type: .roadworks,
                        reportedBy: "uid_driver_2",
                        reporterName: "Sam",
                        lat: -33.96,
                        lng: 18.46,
                        timestamp: 1_800_000_030_000,
                        dismissed: false,
                        reportCount: 1
                    )
                )
            ],
            currentLocation: RouteCoordinate(lat: -33.9, lng: 18.4),
            currentUID: "uid_driver_1",
            alertedHazardIds: []
        )

        XCTAssertEqual(events.map(\.hazardId), ["near_remote"])
        XCTAssertLessThan(events.first?.distanceMetres ?? 999, 300)
    }

    func testInitialHazardSnapshotDoesNotPlayAlert() async {
        let audioAlert = RecordingHazardAudioAlert()
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: Self.makeRun(hazards: [
                "near_remote": Hazard(
                    type: .police,
                    reportedBy: "uid_driver_2",
                    reporterName: "Sam",
                    lat: -33.9005,
                    lng: 18.4005,
                    timestamp: 1_800_000_030_000,
                    dismissed: false,
                    reportCount: 1
                )
            ])),
            hazardAudioAlert: audioAlert
        )

        await viewModel.load()

        XCTAssertEqual(audioAlert.playCount, 0)
    }

    func testObservedRemoteHazardWithinActionableDistancePlaysAlertOnce() async {
        let observer = ManualRunObserver()
        let audioAlert = RecordingHazardAudioAlert()
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: Self.makeRun(hazards: [:])),
            runObserver: observer,
            hazardAudioAlert: audioAlert
        )

        await viewModel.load()
        viewModel.startObservingRun()
        observer.emit(Self.makeRun(hazards: [
            "near_remote": Hazard(
                type: .police,
                reportedBy: "uid_driver_2",
                reporterName: "Sam",
                lat: -33.9005,
                lng: 18.4005,
                timestamp: 1_800_000_030_000,
                dismissed: false,
                reportCount: 1
            )
        ]))
        await Task.yield()
        observer.emit(Self.makeRun(hazards: [
            "near_remote": Hazard(
                type: .police,
                reportedBy: "uid_driver_2",
                reporterName: "Sam",
                lat: -33.9005,
                lng: 18.4005,
                timestamp: 1_800_000_030_000,
                dismissed: false,
                reportCount: 1
            )
        ]))
        await Task.yield()

        XCTAssertEqual(audioAlert.playCount, 1)
        XCTAssertEqual(audioAlert.playedEvents.first?.type, .police)
        XCTAssertEqual(audioAlert.playedEvents.first?.mode, .announced)
    }

    func testLiveDriveUsesSimpleHazardAlertModeWhenConfigured() async {
        let observer = ManualRunObserver()
        let audioAlert = RecordingHazardAudioAlert()
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: Self.makeRun(hazards: [:])),
            runObserver: observer,
            hazardAudioAlert: audioAlert,
            hazardAlertAudioMode: .simple
        )

        await viewModel.load()
        viewModel.startObservingRun()
        observer.emit(Self.makeRun(hazards: [
            "near_remote": Hazard(
                type: .mobileCamera,
                reportedBy: "uid_driver_2",
                reporterName: "Sam",
                lat: -33.9005,
                lng: 18.4005,
                timestamp: 1_800_000_030_000,
                dismissed: false,
                reportCount: 1
            )
        ]))
        await Task.yield()

        XCTAssertEqual(audioAlert.playCount, 1)
        XCTAssertEqual(audioAlert.playedEvents.first?.type, .mobileCamera)
        XCTAssertEqual(audioAlert.playedEvents.first?.mode, .simple)
    }

    func testMutedHazardAudioDoesNotPlayForActionableHazard() async {
        let observer = ManualRunObserver()
        let audioAlert = RecordingHazardAudioAlert()
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: Self.makeRun(hazards: [:])),
            runObserver: observer,
            hazardAudioAlert: audioAlert
        )

        await viewModel.load()
        viewModel.toggleHazardAudioMuted()
        viewModel.startObservingRun()
        observer.emit(Self.makeRun(hazards: [
            "near_remote": Hazard(
                type: .police,
                reportedBy: "uid_driver_2",
                reporterName: "Sam",
                lat: -33.9005,
                lng: 18.4005,
                timestamp: 1_800_000_030_000,
                dismissed: false,
                reportCount: 1
            )
        ]))
        await Task.yield()

        XCTAssertTrue(viewModel.isHazardAudioMuted)
        XCTAssertEqual(audioAlert.playCount, 0)
    }

    func testHazardOptionsExposeV1Types() {
        XCTAssertEqual(LiveDriveHazardOption.v1.map(\.type), [
            .pothole,
            .roadworks,
            .police,
            .mobileCamera,
            .debris,
            .brokenDownCar
        ])
    }

    func testHazardOptionsUseDistinctColors() {
        XCTAssertEqual(Set(LiveDriveHazardOption.v1.map(\.colorHex)).count, LiveDriveHazardOption.v1.count)
    }

    func testReportHazardRequiresCurrentUserLocation() async {
        let repository = InMemoryHazardRepository()
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: Self.makeRun(currentDriverLocation: nil)),
            hazardRepository: repository
        )

        await viewModel.load()
        await viewModel.reportHazard(.pothole)

        XCTAssertTrue(repository.writes.isEmpty)
        XCTAssertEqual(viewModel.message, "Waiting for your location.")
    }

    func testReportHazardWritesPayloadAndAddsLocalMarker() async throws {
        let repository = InMemoryHazardRepository()
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            hazardRepository: repository,
            nowMilliseconds: { 1_800_000_020_000 }
        )

        await viewModel.load()
        await viewModel.reportHazard(.roadworks)

        let write = try XCTUnwrap(repository.writes.first)
        XCTAssertEqual(write.runId, "run_1")
        XCTAssertEqual(write.hazardId, "hazard_1800000020000_roadworks")
        XCTAssertEqual(
            write.hazard,
            Hazard(
                type: .roadworks,
                reportedBy: "uid_driver_1",
                reporterName: "Alex",
                lat: -33.9,
                lng: 18.4,
                timestamp: 1_800_000_020_000,
                dismissed: false,
                reportCount: 1
            )
        )
        XCTAssertTrue(viewModel.hazardMarkers.contains {
            $0.id == "hazard_1800000020000_roadworks" && $0.type == .roadworks
        })
        XCTAssertEqual(viewModel.hazardConfirmationText, "Roadworks reported")
    }

    func testReportHazardBlocksPoorAccuracyLocation() async {
        let repository = InMemoryHazardRepository()
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: Self.makeRun(currentDriverLocation: nil)),
            hazardRepository: repository
        )

        await viewModel.load()
        await viewModel.ingestLocation(makeLocationSample(accuracy: 95, timestamp: 1_800_000_020_000))
        await viewModel.reportHazard(.pothole)

        XCTAssertTrue(repository.writes.isEmpty)
        XCTAssertEqual(viewModel.message, "Location accuracy is too low to report a hazard.")
    }

    func testLiveDriveShowsLowAccuracyStatus() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        await viewModel.ingestLocation(makeLocationSample(accuracy: 95, timestamp: 1_800_000_020_000))
        XCTAssertEqual(viewModel.locationAccuracyMessage, "Location accuracy low")

        await viewModel.ingestLocation(makeLocationSample(accuracy: 6, timestamp: 1_800_000_030_000))
        XCTAssertNil(viewModel.locationAccuracyMessage)
    }

    func testReportHazardShowsErrorOnWriteFailure() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            hazardRepository: FailingHazardRepository()
        )

        await viewModel.load()
        await viewModel.reportHazard(.debris)

        XCTAssertEqual(viewModel.message, "Unable to report hazard.")
    }

    func testHazardConfirmationCanBeCleared() async {
        let repository = InMemoryHazardRepository()
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            hazardRepository: repository
        )

        await viewModel.load()
        await viewModel.reportHazard(.police)
        viewModel.clearHazardConfirmation()

        XCTAssertNil(viewModel.hazardConfirmationText)
    }

    func testObservedRunSnapshotRefreshesDriverAndHazardMarkers() async {
        let observer = ManualRunObserver()
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            runObserver: observer,
            nowMilliseconds: { 1_800_000_010_000 }
        )

        await viewModel.load()
        viewModel.startObservingRun()
        observer.emit(Self.makeRun(
            samLocation: DriverLocation(lat: -33.96, lng: 18.46, heading: 120, speed: 10, accuracy: 5, timestamp: 1_800_000_009_000),
            hazards: [
                "hazard_2": Hazard(
                    type: .police,
                    reportedBy: "uid_driver_2",
                    reporterName: "Sam",
                    lat: -33.97,
                    lng: 18.47,
                    timestamp: 1_800_000_008_000,
                    dismissed: false,
                    reportCount: 2
                )
            ]
        ))
        await Task.yield()

        XCTAssertEqual(viewModel.driverMarkers.first { $0.id == "uid_driver_2" }?.coordinate, RouteCoordinate(lat: -33.96, lng: 18.46))
        XCTAssertEqual(viewModel.driverMarkers.first { $0.id == "uid_driver_2" }?.state, .live)
        XCTAssertEqual(viewModel.hazardMarkers.map(\.id), ["hazard_2"])
        XCTAssertEqual(viewModel.hazardMarkers.first?.type, .police)
    }

    func testObservedRunFailureShowsRecoverableMessage() async {
        let observer = ManualRunObserver()
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            runObserver: observer
        )

        viewModel.startObservingRun()
        observer.fail()
        await Task.yield()

        XCTAssertTrue(viewModel.message?.hasPrefix("Unable to update drive.") == true)
    }

    func testStoppingRunObservationCancelsActiveListener() {
        let observer = ManualRunObserver()
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            runObserver: observer
        )

        viewModel.startObservingRun()
        viewModel.stopObservingRun()

        XCTAssertTrue(observer.lastObservation?.isCancelled == true)
    }

    func testTopStatusOverlayText() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.statusTitle, "Sunday Run · Active")
    }

    func testNextWaypointDistanceLabel() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()

        XCTAssertEqual(viewModel.nextWaypointText, "Next stop: Scenic View · 2.9 km")
    }

    func testLocationSampleBuildsLatestLocationAndTrackPointPayloads() {
        let sample = makeLocationSample(timestamp: 1_800_000_001_000)

        XCTAssertEqual(sample.driverLocation, DriverLocation(lat: -33.9, lng: 18.4, heading: 90, speed: 12, accuracy: 4, timestamp: 1_800_000_001_000))
        XCTAssertEqual(sample.trackPoint, TrackPoint(lat: -33.9, lng: 18.4, heading: 90, speed: 12, accuracy: 4, timestamp: 1_800_000_001_000))
    }

    func testLocationWritePolicyUsesTimestampMillisecondsForPointId() {
        let policy = LiveLocationWritePolicy()
        let decision = policy.decision(previous: nil, current: makeLocationSample(timestamp: 1_800_000_001_000))

        XCTAssertEqual(
            decision,
            LiveLocationWriteDecision(
                shouldWriteLatestLocation: true,
                shouldWriteTrackPoint: true,
                pointId: "point_1800000001000"
            )
        )
    }

    func testLocationWritePolicyThrottlesByInterval() {
        let policy = LiveLocationWritePolicy(minimumIntervalMilliseconds: 5_000, minimumDistanceMetres: 10)
        let previous = makeLocationSample(lat: -33.9000, lng: 18.4000, timestamp: 1_800_000_001_000)
        let current = makeLocationSample(lat: -33.9020, lng: 18.4020, timestamp: 1_800_000_004_000)

        XCTAssertFalse(policy.decision(previous: previous, current: current).shouldWrite)
    }

    func testLocationWritePolicyFiltersSmallMovement() {
        let policy = LiveLocationWritePolicy(minimumIntervalMilliseconds: 5_000, minimumDistanceMetres: 10)
        let previous = makeLocationSample(lat: -33.900000, lng: 18.400000, timestamp: 1_800_000_001_000)
        let current = makeLocationSample(lat: -33.900001, lng: 18.400001, timestamp: 1_800_000_007_000)

        XCTAssertFalse(policy.decision(previous: previous, current: current).shouldWrite)
    }

    func testLocationWritePolicyWritesLatestOnlyForDegradedAccuracy() {
        let policy = LiveLocationWritePolicy()
        let previous = makeLocationSample(lat: -33.9000, lng: 18.4000, accuracy: 8, timestamp: 1_800_000_001_000)
        let current = makeLocationSample(lat: -33.9020, lng: 18.4020, accuracy: 90, timestamp: 1_800_000_022_000)

        let decision = policy.decision(previous: previous, current: current)

        XCTAssertTrue(decision.shouldWriteLatestLocation)
        XCTAssertFalse(decision.shouldWriteTrackPoint)
        XCTAssertNil(decision.pointId)
    }

    func testLocationWritePolicyRejectsUnusableAccuracy() {
        let policy = LiveLocationWritePolicy()
        let decision = policy.decision(
            previous: nil,
            current: makeLocationSample(accuracy: 250, timestamp: 1_800_000_001_000)
        )

        XCTAssertFalse(decision.shouldWrite)
        XCTAssertNil(decision.pointId)
    }

    func testLocationTrackingWritesPresenceLatestLocationAndTrackPoint() async {
        let repository = InMemoryLiveLocationRepository()
        let controller = LiveLocationTrackingController(runId: "run_1", uid: "uid_driver_1", repository: repository)

        controller.updatePermissionState(.allowed)
        await controller.start()
        await controller.ingest(makeLocationSample(timestamp: 1_800_000_001_000), runStatus: .active, finishState: .driving)

        XCTAssertEqual(repository.presenceUpdates, [.online])
        XCTAssertEqual(repository.latestLocations.count, 1)
        XCTAssertEqual(repository.trackPoints.map(\.pointId), ["point_1800000001000"])
    }

    func testLocationTrackingUpdatesDriverStatsSnapshotFromTrackWrites() async throws {
        let repository = InMemoryLiveLocationRepository()
        let controller = LiveLocationTrackingController(runId: "run_1", uid: "uid_driver_1", repository: repository)

        controller.updatePermissionState(.allowed)
        await controller.start()
        await controller.ingest(makeLocationSample(lat: -33.9000, lng: 18.4000, speed: 0, timestamp: 1_800_000_001_000), runStatus: .active, finishState: .driving)
        await controller.ingest(makeLocationSample(lat: -33.9005, lng: 18.4005, speed: 10, timestamp: 1_800_000_007_000), runStatus: .active, finishState: .driving)
        await controller.ingest(makeLocationSample(lat: -33.9010, lng: 18.4010, speed: 20, timestamp: 1_800_000_013_000), runStatus: .active, finishState: .driving)

        let stats = try XCTUnwrap(repository.statsUpdates.last)
        XCTAssertEqual(stats.topSpeed, 20)
        XCTAssertEqual(stats.avgMovingSpeedMs, 15)
        XCTAssertEqual(stats.stopCount, 1)
        XCTAssertEqual(stats.maxGForce ?? 0, 0.17, accuracy: 0.01)
        XCTAssertGreaterThan(stats.totalDistanceKm ?? 0, 0)
    }

    func testLocationTrackingDoesNotWriteTrackPointForDegradedAccuracy() async {
        let repository = InMemoryLiveLocationRepository()
        let controller = LiveLocationTrackingController(runId: "run_1", uid: "uid_driver_1", repository: repository)

        controller.updatePermissionState(.allowed)
        await controller.start()
        await controller.ingest(
            makeLocationSample(accuracy: 95, timestamp: 1_800_000_001_000),
            runStatus: .active,
            finishState: .driving
        )

        XCTAssertEqual(repository.latestLocations.count, 1)
        XCTAssertTrue(repository.trackPoints.isEmpty)
        XCTAssertTrue(repository.statsUpdates.isEmpty)
    }

    func testLiveDriveStartsLocationWritesWhenPermissionAlreadyAllowed() async {
        let repository = InMemoryLiveLocationRepository()
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            liveLocationRepository: repository
        )

        await viewModel.load()
        await viewModel.updateLocationPermission(.allowed)
        await viewModel.ingestLocation(makeLocationSample(timestamp: 1_800_000_030_000))

        XCTAssertEqual(repository.presenceUpdates, [.online])
        XCTAssertEqual(repository.latestLocations.count, 1)
        XCTAssertEqual(repository.trackPoints.map(\.pointId), ["point_1800000030000"])
    }

    func testLocationTrackingStopsWritingWhenRunIsNotActiveOrDriverFinished() async {
        let repository = InMemoryLiveLocationRepository()
        let controller = LiveLocationTrackingController(runId: "run_1", uid: "uid_driver_1", repository: repository)

        controller.updatePermissionState(.allowed)
        await controller.start()
        await controller.ingest(makeLocationSample(timestamp: 1_800_000_001_000), runStatus: .ready, finishState: .driving)
        await controller.ingest(makeLocationSample(timestamp: 1_800_000_008_000), runStatus: .active, finishState: .finished)
        await controller.ingest(makeLocationSample(timestamp: 1_800_000_016_000), runStatus: .ended, finishState: .driving)

        XCTAssertTrue(repository.latestLocations.isEmpty)
        XCTAssertTrue(repository.trackPoints.isEmpty)
    }

    func testLocationTrackingStopUpdatesPresenceOffline() async {
        let repository = InMemoryLiveLocationRepository()
        let controller = LiveLocationTrackingController(runId: "run_1", uid: "uid_driver_1", repository: repository)

        controller.updatePermissionState(.allowed)
        await controller.start()
        await controller.stop()

        XCTAssertEqual(repository.presenceUpdates, [.online, .offline])
    }

    func testAdminEndDriveWritesEndedStatusClearsActiveSessionAndDismisses() async {
        let ending = InMemoryRunEnding()
        let summaryStore = InMemoryRunSummaryStore()
        let activeRunStore = InMemoryLiveDriveActiveRunStore()
        let router = AppRouter()
        activeRunStore.saveActiveRunSession(ActiveRunSessionMetadata(runId: "run_1", role: .admin), uid: "uid_admin_1")
        router.present(.liveDrive(runId: "run_1", role: .admin))
        let viewModel = LiveDriveViewModel(
            uid: "uid_admin_1",
            runId: "run_1",
            role: .admin,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            runEnding: ending,
            summaryPersisting: summaryStore,
            activeRunStore: activeRunStore,
            router: router,
            nowMilliseconds: { 1_800_000_090_000 }
        )

        await viewModel.endDrive()

        XCTAssertEqual(ending.endedRuns.count, 1)
        XCTAssertEqual(ending.endedRuns.first?.runId, "run_1")
        XCTAssertEqual(ending.endedRuns.first?.endedAt, 1_800_000_090_000)
        XCTAssertEqual(summaryStore.persistedSummaries.first?.runId, "run_1")
        XCTAssertEqual(summaryStore.persistedSummaries.first?.summary.totalDistanceKm, 12.3)
        XCTAssertEqual(summaryStore.persistedSummaries.first?.summary.hazardSummary.total, 1)
        XCTAssertNil(activeRunStore.readActiveRunSession(uid: "uid_admin_1"))
        XCTAssertEqual(router.presentedRoute, .summary(runId: "run_1"))
    }

    func testAdminEndDriveRoutesToSummaryWhenSummaryPersistenceFails() async {
        let ending = InMemoryRunEnding()
        let activeRunStore = InMemoryLiveDriveActiveRunStore()
        let router = AppRouter()
        activeRunStore.saveActiveRunSession(ActiveRunSessionMetadata(runId: "run_1", role: .admin), uid: "uid_admin_1")
        router.present(.liveDrive(runId: "run_1", role: .admin))
        let viewModel = LiveDriveViewModel(
            uid: "uid_admin_1",
            runId: "run_1",
            role: .admin,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            runEnding: ending,
            summaryPersisting: FailingRunSummaryStore(),
            activeRunStore: activeRunStore,
            router: router,
            nowMilliseconds: { 1_800_000_090_000 }
        )

        await viewModel.endDrive()

        XCTAssertEqual(ending.endedRuns.first?.runId, "run_1")
        XCTAssertNil(activeRunStore.readActiveRunSession(uid: "uid_admin_1"))
        XCTAssertEqual(router.presentedRoute, .summary(runId: "run_1"))
        XCTAssertNil(viewModel.message)
    }

    func testDriverFinishUpdatesOnlyDriverStopsTrackingClearsActiveSessionAndDismisses() async {
        let updater = InMemoryDriverDriveSessionUpdater()
        let personalSummaryStore = InMemoryPersonalSummaryStore()
        let locationRepository = InMemoryLiveLocationRepository()
        let activeRunStore = InMemoryLiveDriveActiveRunStore()
        let router = AppRouter()
        activeRunStore.saveActiveRunSession(ActiveRunSessionMetadata(runId: "run_1", role: .driver), uid: "uid_driver_1")
        router.present(.liveDrive(runId: "run_1", role: .driver))
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            personalSummaryPersisting: personalSummaryStore,
            driverSessionUpdater: updater,
            activeRunStore: activeRunStore,
            router: router,
            liveLocationRepository: locationRepository,
            nowMilliseconds: { 1_800_000_095_000 }
        )

        await viewModel.updateLocationPermission(.allowed)
        await viewModel.finishDriverDrive()
        await viewModel.ingestLocation(makeLocationSample(timestamp: 1_800_000_096_000))

        XCTAssertEqual(updater.finishedDrivers.first?.runId, "run_1")
        XCTAssertEqual(updater.finishedDrivers.first?.uid, "uid_driver_1")
        XCTAssertEqual(updater.finishedDrivers.first?.finishedAt, 1_800_000_095_000)
        XCTAssertEqual(personalSummaryStore.persistedSummaries.first?.runId, "run_1")
        XCTAssertEqual(personalSummaryStore.persistedSummaries.first?.uid, "uid_driver_1")
        XCTAssertEqual(personalSummaryStore.persistedSummaries.first?.summary.name, "Alex")
        XCTAssertEqual(personalSummaryStore.persistedSummaries.first?.summary.totalDistanceKm, 12.3)
        XCTAssertEqual(locationRepository.presenceUpdates, [.online, .offline])
        XCTAssertTrue(locationRepository.latestLocations.isEmpty)
        XCTAssertTrue(locationRepository.trackPoints.isEmpty)
        XCTAssertNil(activeRunStore.readActiveRunSession(uid: "uid_driver_1"))
        XCTAssertEqual(router.presentedRoute, .summary(runId: "run_1"))
    }

    func testDriverLeaveUpdatesOnlyDriverStopsTrackingClearsActiveSessionAndDismisses() async {
        let updater = InMemoryDriverDriveSessionUpdater()
        let personalSummaryStore = InMemoryPersonalSummaryStore()
        let locationRepository = InMemoryLiveLocationRepository()
        let activeRunStore = InMemoryLiveDriveActiveRunStore()
        let router = AppRouter()
        activeRunStore.saveActiveRunSession(ActiveRunSessionMetadata(runId: "run_1", role: .driver), uid: "uid_driver_1")
        router.present(.liveDrive(runId: "run_1", role: .driver))
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            personalSummaryPersisting: personalSummaryStore,
            driverSessionUpdater: updater,
            activeRunStore: activeRunStore,
            router: router,
            liveLocationRepository: locationRepository,
            nowMilliseconds: { 1_800_000_097_000 }
        )

        await viewModel.updateLocationPermission(.allowed)
        await viewModel.leaveDriverDrive()
        await viewModel.ingestLocation(makeLocationSample(timestamp: 1_800_000_098_000))

        XCTAssertEqual(updater.leftDrivers.first?.runId, "run_1")
        XCTAssertEqual(updater.leftDrivers.first?.uid, "uid_driver_1")
        XCTAssertEqual(updater.leftDrivers.first?.leftAt, 1_800_000_097_000)
        XCTAssertEqual(personalSummaryStore.persistedSummaries.first?.runId, "run_1")
        XCTAssertEqual(personalSummaryStore.persistedSummaries.first?.uid, "uid_driver_1")
        XCTAssertEqual(personalSummaryStore.persistedSummaries.first?.summary.name, "Alex")
        XCTAssertEqual(locationRepository.presenceUpdates, [.online, .offline])
        XCTAssertTrue(locationRepository.latestLocations.isEmpty)
        XCTAssertTrue(locationRepository.trackPoints.isEmpty)
        XCTAssertNil(activeRunStore.readActiveRunSession(uid: "uid_driver_1"))
        XCTAssertEqual(router.presentedRoute, .summary(runId: "run_1"))
    }

    func testDriverLeavesLiveDriveWhenRunObservationEnds() async {
        let activeRunStore = InMemoryLiveDriveActiveRunStore()
        let router = AppRouter()
        let observer = ManualRunObserver()
        activeRunStore.saveActiveRunSession(ActiveRunSessionMetadata(runId: "run_1", role: .driver), uid: "uid_driver_1")
        router.present(.liveDrive(runId: "run_1", role: .driver))
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            runObserver: observer,
            activeRunStore: activeRunStore,
            router: router
        )

        viewModel.startObservingRun()
        observer.emit(Self.makeRun(status: .ended))
        await Task.yield()

        XCTAssertNil(activeRunStore.readActiveRunSession(uid: "uid_driver_1"))
        XCTAssertEqual(router.presentedRoute, .summary(runId: "run_1"))
        XCTAssertTrue(observer.lastObservation?.isCancelled == true)
    }

    func testRunEndObservationStopsLocationWrites() async {
        let activeRunStore = InMemoryLiveDriveActiveRunStore()
        let router = AppRouter()
        let observer = ManualRunObserver()
        let locationRepository = InMemoryLiveLocationRepository()
        activeRunStore.saveActiveRunSession(ActiveRunSessionMetadata(runId: "run_1", role: .driver), uid: "uid_driver_1")
        router.present(.liveDrive(runId: "run_1", role: .driver))
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            runObserver: observer,
            activeRunStore: activeRunStore,
            router: router,
            liveLocationRepository: locationRepository
        )

        await viewModel.updateLocationPermission(.allowed)
        viewModel.startObservingRun()
        observer.emit(Self.makeRun(status: .ended))
        await Task.yield()
        await viewModel.ingestLocation(makeLocationSample(timestamp: 1_800_000_101_000))

        XCTAssertEqual(locationRepository.presenceUpdates, [.online, .offline])
        XCTAssertTrue(locationRepository.latestLocations.isEmpty)
        XCTAssertTrue(locationRepository.trackPoints.isEmpty)
    }

    func testLateRunObservationFailureAfterRouteOutDoesNotShowError() async {
        let activeRunStore = InMemoryLiveDriveActiveRunStore()
        let router = AppRouter()
        let observer = ManualRunObserver()
        activeRunStore.saveActiveRunSession(ActiveRunSessionMetadata(runId: "run_1", role: .driver), uid: "uid_driver_1")
        router.present(.liveDrive(runId: "run_1", role: .driver))
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun()),
            runObserver: observer,
            activeRunStore: activeRunStore,
            router: router
        )

        viewModel.startObservingRun()
        observer.emit(Self.makeRun(status: .ended))
        await Task.yield()
        observer.fail()
        await Task.yield()

        XCTAssertNil(viewModel.message)
        XCTAssertEqual(router.presentedRoute, .summary(runId: "run_1"))
    }

    func testDestinationArrivalPromptsDriverToFinish() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        await viewModel.ingestLocation(makeLocationSample(lat: -34.0002, lng: 18.5001, timestamp: 1_800_000_102_000))

        XCTAssertEqual(viewModel.arrivalPrompt, .driverFinish)
    }

    func testDestinationArrivalDoesNotPromptWithPoorAccuracy() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_driver_1",
            runId: "run_1",
            role: .driver,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        await viewModel.ingestLocation(
            makeLocationSample(
                lat: -34.0002,
                lng: 18.5001,
                accuracy: 95,
                timestamp: 1_800_000_102_000
            )
        )

        XCTAssertNil(viewModel.arrivalPrompt)
    }

    func testDestinationArrivalPromptsAdminToEndGroupDrive() async {
        let viewModel = LiveDriveViewModel(
            uid: "uid_admin_1",
            runId: "run_1",
            role: .admin,
            runReader: InMemoryLiveDriveRunReader(run: makeRun())
        )

        await viewModel.load()
        await viewModel.ingestLocation(makeLocationSample(lat: -34.0002, lng: 18.5001, timestamp: 1_800_000_102_000))

        XCTAssertEqual(viewModel.arrivalPrompt, .adminEndGroup)
    }

    func testSummaryCalculatorBuildsGroupAndPersonalSummary() {
        let summary = RunSummaryCalculator.summary(
            for: Self.makeRun(),
            generatedAt: 1_800_000_090_000
        )

        XCTAssertEqual(summary.totalDistanceKm, 12.3)
        XCTAssertEqual(summary.totalDriveTimeMinutes, 1.48, accuracy: 0.01)
        XCTAssertEqual(summary.hazardSummary.byType[.pothole], 1)
        XCTAssertEqual(summary.driverStats["uid_driver_1"]?.name, "Alex")
        XCTAssertNil(summary.driverStats["uid_driver_1"]?.totalDistanceKm)
        XCTAssertEqual(summary.driverStats["uid_driver_1"]?.driverStatus, .active)
        XCTAssertEqual(summary.driverStats["uid_driver_3"]?.driverStatus, .offline)
        XCTAssertEqual(summary.routePreview?.points.count, 3)
    }

    func testPersonalSummaryCalculatorBuildsDriverSummary() throws {
        let summary = RunSummaryCalculator.personalSummary(
            for: "uid_driver_1",
            in: Self.makeRun(),
            generatedAt: 1_800_000_090_000
        )

        let unwrappedSummary = try XCTUnwrap(summary)
        let totalDistanceKm = try XCTUnwrap(unwrappedSummary.totalDistanceKm)
        let totalDriveTimeMinutes = try XCTUnwrap(unwrappedSummary.totalDriveTimeMinutes)
        XCTAssertEqual(unwrappedSummary.name, "Alex")
        XCTAssertEqual(unwrappedSummary.carMake, "Porsche")
        XCTAssertEqual(unwrappedSummary.carModel, "911")
        XCTAssertEqual(unwrappedSummary.fuelType, .petrol)
        XCTAssertEqual(totalDistanceKm, 12.3)
        XCTAssertEqual(totalDriveTimeMinutes, 1.48, accuracy: 0.01)
    }

    func testGroupSummaryKeepsPersonalStatsPrivateByDefault() throws {
        let run = Self.makeRun(driverStats: [
            "uid_driver_1": DriverStats(topSpeed: 38, avgMovingSpeedMs: 16, totalDistanceKm: 41.2, totalDriveTimeMinutes: 58, movingTimeMinutes: 51, stoppedTimeMinutes: 7, stopCount: 2, avgStopTimeSec: 210, maxGForce: 0.44),
            "uid_driver_2": DriverStats(topSpeed: 42, avgMovingSpeedMs: 15, totalDistanceKm: 40.8, totalDriveTimeMinutes: 59, movingTimeMinutes: 52, stoppedTimeMinutes: 7, stopCount: 1, avgStopTimeSec: 420, maxGForce: 0.51)
        ])

        let summary = RunSummaryCalculator.summary(for: run, generatedAt: 1_800_000_090_000)
        let alex = try XCTUnwrap(summary.driverStats["uid_driver_1"])
        let sam = try XCTUnwrap(summary.driverStats["uid_driver_2"])

        XCTAssertEqual(alex.name, "Alex")
        XCTAssertEqual(alex.carMake, "Porsche")
        XCTAssertEqual(alex.driverStatus, .active)
        XCTAssertNil(alex.topSpeedKmh)
        XCTAssertNil(alex.maxGForce)
        XCTAssertNil(alex.movingTimeMinutes)
        XCTAssertNil(alex.stoppedTimeMinutes)
        XCTAssertNil(alex.totalDistanceKm)
        XCTAssertNil(sam.topSpeedKmh)
        XCTAssertEqual(summary.driverStats.keys.sorted(), ["uid_driver_1", "uid_driver_2", "uid_driver_3"])
    }

    func testPersonalSummaryIncludesMaxSpeedAndMaxGWithoutRankingDrivers() throws {
        let run = Self.makeRun(driverStats: [
            "uid_driver_1": DriverStats(topSpeed: 38, avgMovingSpeedMs: 16, totalDistanceKm: 41.2, totalDriveTimeMinutes: 58, movingTimeMinutes: 51, stoppedTimeMinutes: 7, stopCount: 2, avgStopTimeSec: 210, maxGForce: 0.44)
        ])

        let summary = try XCTUnwrap(RunSummaryCalculator.personalSummary(
            for: "uid_driver_1",
            in: run,
            generatedAt: 1_800_000_090_000
        ))

        XCTAssertEqual(summary.topSpeedKmh ?? 0, 136.8, accuracy: 0.01)
        XCTAssertEqual(summary.maxGForce, 0.44)
        XCTAssertEqual(summary.movingTimeMinutes, 51)
        XCTAssertEqual(summary.stoppedTimeMinutes, 7)
        XCTAssertEqual(summary.totalDistanceKm, 41.2)
    }

    func testSummaryCalculatorClassifiesStaleAndOfflineDriversByTimeout() throws {
        let summary = RunSummaryCalculator.summary(
            for: Self.makeRun(),
            generatedAt: 1_800_000_301_000
        )

        XCTAssertEqual(summary.driverStats["uid_driver_1"]?.driverStatus, .stale)
        XCTAssertEqual(summary.driverStats["uid_driver_2"]?.driverStatus, .offline)
        XCTAssertEqual(summary.driverStats["uid_driver_3"]?.driverStatus, .offline)
    }

    func testSummaryCalculatorLabelsActiveDriversEndedWithGroupAfterRunEnds() {
        let summary = RunSummaryCalculator.summary(
            for: Self.makeRun(status: .ended),
            generatedAt: 1_800_000_301_000
        )

        XCTAssertEqual(summary.driverStats["uid_driver_1"]?.driverStatus, .endedWithGroup)
        XCTAssertEqual(summary.driverStats["uid_driver_2"]?.driverStatus, .endedWithGroup)
        XCTAssertEqual(summary.driverStats["uid_driver_3"]?.driverStatus, .offline)
    }

    private static func makeRun(
        status: RunStatus = .active,
        currentDriverLocation: DriverLocation? = DriverLocation(lat: -33.9, lng: 18.4, heading: 90, speed: 18, accuracy: 5, timestamp: 1_800_000_004_000),
        samLocation: DriverLocation? = DriverLocation(lat: -33.93, lng: 18.43, heading: 90, speed: 12, accuracy: 6, timestamp: 1_800_000_000_000),
        hazards: [String: Hazard]? = nil,
        driverStats: [String: DriverStats] = [:]
    ) -> Run {
        Run(
            name: "Sunday Run",
            description: nil,
            joinCode: "123456",
            adminId: "uid_admin_1",
            status: status,
            createdAt: 1_800_000_000_000,
            startedAt: nil,
            driveStartedAt: 1_800_000_001_000,
            endedAt: status == .ended ? 1_800_000_090_000 : nil,
            maxDrivers: 15,
            route: RouteData(
                points: [[-33.9, 18.4], [-33.95, 18.45], [-34.0, 18.5]],
                distanceMetres: 12_300,
                durationSeconds: 1_440,
                source: .appleMaps,
                stops: [
                    RouteStopDraft(id: "start", kind: .start, order: 0, label: "Start", lat: -33.9, lng: 18.4, source: .search),
                    RouteStopDraft(id: "waypoint", kind: .waypoint, order: 1, label: "Scenic View", lat: -33.92, lng: 18.42, source: .search),
                    RouteStopDraft(id: "destination", kind: .destination, order: 2, label: "Finish", lat: -34.0, lng: 18.5, source: .search)
                ]
            ),
            drivers: [
                "uid_driver_1": makeDriver(
                    name: "Alex",
                    badge: DriverBadge(text: "A", colorHex: "#1E88E5"),
                    location: currentDriverLocation,
                    presence: .online,
                    stats: driverStats["uid_driver_1"]
                ),
                "uid_driver_2": makeDriver(
                    name: "Sam",
                    badge: DriverBadge(text: "S", colorHex: "#43A047"),
                    location: samLocation,
                    presence: .online,
                    stats: driverStats["uid_driver_2"]
                ),
                "uid_driver_3": makeDriver(
                    name: "Lee",
                    badge: DriverBadge(text: "L", colorHex: "#F4511E"),
                    location: DriverLocation(lat: -33.91, lng: 18.41, heading: 90, speed: 0, accuracy: 6, timestamp: 1_800_000_004_000),
                    presence: .offline,
                    stats: driverStats["uid_driver_3"]
                )
            ],
            hazards: hazards ?? [
                "hazard_1": Hazard(
                    type: .pothole,
                    reportedBy: "uid_driver_1",
                    reporterName: "Alex",
                    lat: -33.94,
                    lng: 18.44,
                    timestamp: 1_800_000_003_000,
                    dismissed: false,
                    reportCount: 1
                )
            ]
        )
    }

    private func makeRun() -> Run {
        Self.makeRun()
    }

    private func makeLocationSample(
        lat: Double = -33.9,
        lng: Double = 18.4,
        speed: Double = 12,
        accuracy: Double = 4,
        timestamp: Int64
    ) -> LiveLocationSample {
        LiveLocationSample(lat: lat, lng: lng, heading: 90, speed: speed, accuracy: accuracy, timestamp: timestamp)
    }

    private static func makeDriver(
        name: String,
        badge: DriverBadge,
        location: DriverLocation?,
        presence: DriverPresence,
        stats: DriverStats? = nil
    ) -> DriverRecord {
        DriverRecord(
            profile: DriverProfile(
                name: name,
                displayName: name,
                carMake: name == "Sam" ? "BMW" : "Porsche",
                carModel: name == "Sam" ? "M2" : "911",
                badge: badge,
                fuelType: .petrol
            ),
            location: location,
            joinedAt: 1_800_000_000_000,
            leftAt: nil,
            presence: presence,
            finishState: .driving,
            stats: stats
        )
    }
}

private final class InMemoryLiveLocationRepository: LiveLocationPersisting, @unchecked Sendable {
    var latestLocations: [DriverLocation] = []
    var trackPoints: [(pointId: String, point: TrackPoint)] = []
    var statsUpdates: [DriverStats] = []
    var presenceUpdates: [DriverPresence] = []

    func writeLatestLocation(_ location: DriverLocation, runId: String, uid: String) async throws {
        latestLocations.append(location)
    }

    func writeTrackPoint(_ point: TrackPoint, pointId: String, runId: String, uid: String) async throws {
        trackPoints.append((pointId: pointId, point: point))
    }

    func updateDriverStats(_ stats: DriverStats, runId: String, uid: String) async throws {
        statsUpdates.append(stats)
    }

    func updatePresence(_ presence: DriverPresence, runId: String, uid: String) async throws {
        presenceUpdates.append(presence)
    }
}

private final class InMemoryHazardRepository: HazardPersisting, @unchecked Sendable {
    var writes: [(hazard: Hazard, hazardId: String, runId: String)] = []

    func writeHazard(_ hazard: Hazard, hazardId: String, runId: String) async throws {
        writes.append((hazard: hazard, hazardId: hazardId, runId: runId))
    }
}

private final class RecordingHazardAudioAlert: LiveDriveHazardAudioAlerting, @unchecked Sendable {
    var playedEvents: [(type: HazardType, mode: HazardAlertAudioMode)] = []

    var playCount: Int {
        playedEvents.count
    }

    func playHazardAlert(for type: HazardType, mode: HazardAlertAudioMode) {
        playedEvents.append((type: type, mode: mode))
    }
}

private struct FailingHazardRepository: HazardPersisting {
    func writeHazard(_ hazard: Hazard, hazardId: String, runId: String) async throws {
        throw NSError(domain: "hazard", code: 1)
    }
}

private final class InMemoryRunEnding: RunEnding, @unchecked Sendable {
    var endedRuns: [(runId: String, endedAt: Int64)] = []

    func endDrive(runId: String, endedAt: Int64) async throws {
        endedRuns.append((runId: runId, endedAt: endedAt))
    }
}

private final class InMemoryRunSummaryStore: RunSummaryPersisting, @unchecked Sendable {
    var persistedSummaries: [(summary: RunSummary, runId: String)] = []

    func writeRunSummary(_ summary: RunSummary, runId: String) async throws {
        persistedSummaries.append((summary: summary, runId: runId))
    }
}

private struct FailingRunSummaryStore: RunSummaryPersisting {
    func writeRunSummary(_ summary: RunSummary, runId: String) async throws {
        throw NSError(domain: "summary", code: 1)
    }
}

private final class InMemoryPersonalSummaryStore: PersonalSummaryPersisting, @unchecked Sendable {
    var persistedSummaries: [(summary: PersonalSummary, runId: String, uid: String)] = []

    func writePersonalSummary(_ summary: PersonalSummary, runId: String, uid: String) async throws {
        persistedSummaries.append((summary: summary, runId: runId, uid: uid))
    }
}

private final class InMemoryDriverDriveSessionUpdater: DriverDriveSessionUpdating, @unchecked Sendable {
    var finishedDrivers: [(runId: String, uid: String, finishedAt: Int64)] = []
    var leftDrivers: [(runId: String, uid: String, leftAt: Int64)] = []

    func finishDriver(runId: String, uid: String, finishedAt: Int64) async throws {
        finishedDrivers.append((runId: runId, uid: uid, finishedAt: finishedAt))
    }

    func leaveDriver(runId: String, uid: String, leftAt: Int64) async throws {
        leftDrivers.append((runId: runId, uid: uid, leftAt: leftAt))
    }
}

private final class InMemoryLiveDriveActiveRunStore: ActiveRunStoring, @unchecked Sendable {
    private var sessions: [String: ActiveRunSessionMetadata] = [:]

    func readActiveRunSession(uid: String) -> ActiveRunSessionMetadata? {
        sessions[uid]
    }

    func saveActiveRunSession(_ session: ActiveRunSessionMetadata, uid: String) {
        sessions[uid] = session
    }

    func clearActiveRunSession(uid: String) {
        sessions.removeValue(forKey: uid)
    }
}

private struct InMemoryLiveDriveRunReader: RunReading {
    let run: Run?

    func readRun(runId: String) async throws -> Run? {
        run
    }
}

private final class ManualRunObservation: RunObservation, @unchecked Sendable {
    var isCancelled = false

    func cancel() {
        isCancelled = true
    }
}

private final class ManualRunObserver: RunObserving, @unchecked Sendable {
    var lastObservation: ManualRunObservation?
    private var onChange: (@Sendable (Result<Run?, Error>) -> Void)?

    func observeRun(
        runId: String,
        onChange: @escaping @Sendable (Result<Run?, Error>) -> Void
    ) -> RunObservation {
        self.onChange = onChange
        let observation = ManualRunObservation()
        lastObservation = observation
        return observation
    }

    func emit(_ run: Run?) {
        onChange?(.success(run))
    }

    func fail() {
        onChange?(.failure(NSError(domain: "run-observer", code: 1)))
    }
}
