# ClubRun Task List

Implementation source of truth for ClubRun. This file converts the product spec in `plan.md` into a dependency-ordered, red/green TDD execution plan for a solo developer using AI assistance.

## Working Rules

- Always follow `Red -> Green -> Refactor -> Verify -> Done`.
- No feature task is complete until the planned failing test exists first.
- Prefer Firebase Emulator Suite for automated development and TDD.
- Use a real Firebase project only for device smoke tests that cannot run against the emulator.
- Default to Expo development builds once native dependencies are introduced; do not optimize for Expo Go compatibility.
- Every user-critical control and screen should get stable `testID` values before UI work is considered done.
- Every milestone should leave the app in a runnable state.

## Definition of Done

- The failing test or check for the task was written first.
- The minimum implementation to satisfy the test is in place.
- The code was cleaned up without changing behavior.
- Verification was run and recorded locally.
- Any follow-on work is captured as a new task instead of being hidden inside the current one.

## Milestone 0: Foundation and TDD Harness

Goal: establish a reliable local development loop before feature work.

### 0.1 Bootstrap app shell

- [ ] Red: add a minimal app boot smoke test that expects the root layout and placeholder home content to render.
- [ ] Green: initialize Expo SDK 52 + Expo Router v4 + TypeScript app shell with a bootable root layout and placeholder home screen.
- [ ] Refactor: normalize folder structure for `app`, `components`, `lib`, `stores`, `hooks`, `contexts`, `types`, and `docs`.
- [ ] Verify: boot the app locally and run the smoke test suite.
- [ ] Done when the app launches and the smoke test passes.

### 0.2 Install testing stack

- [ ] Red: add placeholder failing tests for a sample component render, a sample service test, and a sample navigation assertion.
- [ ] Green: configure `jest-expo`, React Native Testing Library, jest-native matchers, and test setup files.
- [ ] Refactor: centralize test helpers and shared render utilities.
- [ ] Verify: run the full Jest suite successfully.
- [ ] Done when component and service tests run without custom manual setup.

### 0.3 Add Firebase emulator workflow

- [ ] Red: add a failing integration test that expects a Firebase round-trip against the emulator.
- [ ] Green: configure Firebase Emulator Suite, local config loading, and environment separation for emulator vs production projects.
- [ ] Refactor: isolate Firebase bootstrap logic behind a single config layer.
- [ ] Verify: confirm emulator-backed read/write tests pass and no real project is touched by default.
- [ ] Done when local automated tests can run against Firebase without network-side manual cleanup.

### 0.4 Add E2E harness early

- [ ] Red: define a failing Maestro smoke flow for app launch and home screen visibility.
- [ ] Green: add Maestro config, baseline script docs, and required `testID` conventions for the initial shell.
- [ ] Refactor: document naming conventions for screens, primary buttons, and form inputs.
- [ ] Verify: run the smoke flow against a local simulator or emulator.
- [ ] Done when a basic app-open scenario can be exercised through automation.

### 0.5 Lock app-level engineering rules

- [ ] Red: add a repo docs check or checklist entry that fails review if a task closes without `Red/Green/Refactor/Verify`.
- [ ] Green: document coding rules in this file and, if needed later, mirror them into repo docs.
- [ ] Refactor: keep the rules concise and specific to ClubRun.
- [ ] Verify: ensure future tasks in this file all follow the same structure.
- [ ] Done when this task list can be used directly as the execution backlog.

## Milestone 1: App Shell, Theme, and Reusable UI

Goal: build a stable, themed shell that later features can compose.

### 1.1 Set up route skeleton

- [ ] Red: write a failing navigation test for home, settings, create, join, route planning, live map, and summary route mounting.
- [ ] Green: create Expo Router file structure and minimal screen stubs for all core flows.
- [ ] Refactor: standardize shared screen containers and header behavior.
- [ ] Verify: navigate between routes locally and confirm deep-link path structure is recognized.
- [ ] Done when route scaffolding exists for every planned primary flow.

### 1.2 Implement theme system

- [ ] Red: write failing tests for system theme usage, manual override persistence, and hook-based theme access.
- [ ] Green: implement central theme tokens, provider, settings-backed mode override, and a `useTheme` hook.
- [ ] Refactor: keep raw colors out of leaf components.
- [ ] Verify: switch system mode and manual override, then confirm persistence across restart.
- [ ] Done when dark/light/system theming works consistently.

### 1.3 Build UI primitives

- [ ] Red: write component tests for Button variants, TextInput states, Card, Badge, LoadingSpinner, Toast, and BottomSheet wrapper behavior.
- [ ] Green: implement the UI primitives with theme support.
- [ ] Refactor: align spacing, typography, and token usage across primitives.
- [ ] Verify: render all primitives on a temporary gallery screen in both themes.
- [ ] Done when base UI blocks are reusable and tested.

### 1.4 Add settings screen

- [ ] Red: write a failing screen test for changing theme mode through settings.
- [ ] Green: implement the Settings screen with System, Dark, and Light options.
- [ ] Refactor: extract small reusable setting-row components if needed.
- [ ] Verify: confirm the selection persists and updates the app immediately.
- [ ] Done when settings are usable without touching future feature work.

## Milestone 2: Firebase, Run Creation, Join, and Status

Goal: create and join runs with reliable backend contracts before maps or tracking.

### 2.1 Define core types and data contracts

- [ ] Red: add failing type-level or fixture-based tests for `Run`, `RunStatus`, `DriverProfile`, `RouteData`, `Hazard`, and `RunSummary` shapes.
- [ ] Green: implement shared types and normalized fixture builders for tests.
- [ ] Refactor: remove duplicate inline shapes from components and services.
- [ ] Verify: use fixtures in service and component tests without shape drift.
- [ ] Done when the app has a single source of truth for its core contracts.

### 2.2 Configure Firebase client

- [ ] Red: write a failing service test for initializing database access through a shared Firebase module.
- [ ] Green: implement `lib/firebase` with safe environment-driven initialization.
- [ ] Refactor: prevent accidental multiple Firebase app initialization.
- [ ] Verify: pass emulator-backed read/write smoke tests.
- [ ] Done when Firebase access is centralized and testable.

### 2.3 Build home screen

- [ ] Red: write a failing component test for Create Run and Join Run CTAs plus recent-run placeholders.
- [ ] Green: implement the home screen with app branding, CTAs, and local recent-run section scaffolding.
- [ ] Refactor: separate presentational home sections from navigation wiring.
- [ ] Verify: run the route smoke flow and manually tap both CTAs.
- [ ] Done when users can reliably enter either the admin or driver path.

### 2.4 Implement run creation service

- [ ] Red: write emulator-backed tests for push-key run creation, unique 6-digit join code creation, join-code collision retry, and run skeleton persistence.
- [ ] Green: implement `runService.createRun`.
- [ ] Refactor: isolate code generation and payload construction helpers.
- [ ] Verify: create multiple test runs and confirm data shape in emulator matches spec.
- [ ] Done when a valid draft run can be created repeatably.

### 2.5 Build run creation screen

- [ ] Red: write failing form tests for required name validation, optional description handling, loading state, and success navigation.
- [ ] Green: implement the run creation form and success state with share payload preparation.
- [ ] Refactor: reuse input and feedback primitives instead of inline form controls.
- [ ] Verify: create a run through the UI and confirm the join code is shown and share-ready.
- [ ] Done when admin run creation works end to end against the emulator.

### 2.6 Implement join code lookup

- [ ] Red: write emulator-backed tests for valid join-code resolution, invalid code handling, and deep-link prefill behavior.
- [ ] Green: implement join code lookup service and the join entry flow.
- [ ] Refactor: separate formatting logic for the 6-digit code input from lookup logic.
- [ ] Verify: test typed entry and deep-link entry for both valid and invalid codes.
- [ ] Done when a user can resolve a run from a code without ambiguity.

### 2.7 Build driver profile capture

- [ ] Red: write failing tests for profile validation, required fuel type handling, optional engine/fuel efficiency fields, and AsyncStorage prefill behavior.
- [ ] Green: implement the driver profile form, local profile caching, and profile write to Firebase.
- [ ] Refactor: centralize profile validation rules and input formatting helpers.
- [ ] Verify: submit profiles for multiple mock drivers and confirm the Firebase shape matches the plan.
- [ ] Done when joining a run creates a usable driver record.

### 2.8 Add run/session store

- [ ] Red: write failing store tests for current run state, role assignment, status subscription updates, and driver roster hydration.
- [ ] Green: implement the Zustand run/session store and wire it to Firebase listeners.
- [ ] Refactor: keep transient UI state separate from persisted run state.
- [ ] Verify: simulate admin and driver clients and confirm status changes propagate.
- [ ] Done when the app can track the current run reliably across screens.

### 2.9 Enforce run status transitions

- [ ] Red: write emulator-backed tests for `draft -> active -> ended` transitions and rejection of invalid transitions.
- [ ] Green: implement run status update service logic for admin-driven changes.
- [ ] Refactor: move status guards into shared helpers used by both services and UI.
- [ ] Verify: change run status from the app and confirm all subscribers update quickly.
- [ ] Done when status transitions are explicit and synchronized.

### 2.10 Add initial E2E happy path

- [ ] Red: define a failing Maestro flow for create run, capture code, join run, and land on the next expected state.
- [ ] Green: wire missing `testID` values and navigation hooks until the flow passes.
- [ ] Refactor: reduce brittle selectors and duplicate steps in the Maestro script.
- [ ] Verify: rerun the happy path after any join-flow changes.
- [ ] Done when the basic multiplayer funnel has automated coverage.

## Milestone 3: Map Foundation and Route Planning

Goal: let admins define a route and drivers read it.

### 3.1 Integrate MapLibre wrapper

- [ ] Red: add failing wrapper tests for theme-based style selection and prop-driven map rendering boundaries.
- [ ] Green: integrate MapLibre through a thin `MapView` wrapper with light and dark style selection.
- [ ] Refactor: keep native-specific setup isolated from feature screens.
- [ ] Verify: smoke test map rendering on both platforms using a dev build.
- [ ] Done when a full-screen themed map loads and responds to gestures.

### 3.2 Add geo utility layer

- [ ] Red: write failing tests for Haversine distance, bounds calculation, and coordinate normalization utilities.
- [ ] Green: implement shared geo helpers used by route, map, and summary work.
- [ ] Refactor: deduplicate any map math from feature services.
- [ ] Verify: validate helper outputs against known fixtures.
- [ ] Done when all geographic calculations share one tested utility layer.

### 3.3 Build route drawing workflow

- [ ] Red: write failing tests for waypoint creation, waypoint ordering, max 25 waypoint enforcement, and OSRM request formatting.
- [ ] Green: implement map tap-to-add waypoints and route retrieval from OSRM.
- [ ] Refactor: separate waypoint state management from fetch and decode logic.
- [ ] Verify: place 3 or more waypoints and confirm a road-snapped route renders.
- [ ] Done when a drawn route can be previewed and edited.

### 3.4 Add waypoint editing

- [ ] Red: write failing tests for drag-to-update behavior and route recalculation after edits or deletes.
- [ ] Green: implement draggable/editable waypoints with recalculated route output.
- [ ] Refactor: stabilize re-render behavior to avoid unnecessary full map refreshes.
- [ ] Verify: move existing waypoints and confirm the route recomputes correctly.
- [ ] Done when route editing is predictable and responsive.

### 3.5 Build GPX import pipeline

- [ ] Red: add fixture-driven failing tests for valid GPX parse, invalid XML handling, oversize file rejection, and metadata extraction.
- [ ] Green: implement document picking and GPX parsing.
- [ ] Refactor: keep parser output independent from UI concerns.
- [ ] Verify: import representative GPX samples and confirm parsed data shape.
- [ ] Done when GPX routes can be loaded safely.

### 3.6 Add route simplification

- [ ] Red: write failing tests for Douglas-Peucker simplification thresholds and over-limit warnings.
- [ ] Green: implement route simplification for imported GPX tracks.
- [ ] Refactor: co-locate simplification config with parser/domain helpers rather than UI.
- [ ] Verify: compare pre/post point counts on sample GPX files and confirm visual fidelity remains acceptable.
- [ ] Done when imported routes stay performant for Firebase and map rendering.

### 3.7 Persist and activate routes

- [ ] Red: write emulator-backed tests for route serialization, distance persistence, source flag persistence, and status change to `active`.
- [ ] Green: implement route save/confirm behavior for drawn and GPX routes.
- [ ] Refactor: unify save flow so both route sources produce the same backend shape.
- [ ] Verify: confirm route data in Firebase matches the spec and the run becomes active.
- [ ] Done when admins can finalize a route and start the run.

### 3.8 Render route for drivers

- [ ] Red: write failing screen tests for active-run route display on the driver map screen.
- [ ] Green: subscribe to route data and render the route polyline read-only for drivers.
- [ ] Refactor: separate route rendering from live driver/hazard layers.
- [ ] Verify: join an active run as a driver and confirm the full route appears.
- [ ] Done when route consumption works for non-admin participants.

## Milestone 4: Live Location Tracking and Driver Presence

Goal: share live driver positions with acceptable battery and UX behavior.

### 4.1 Implement foreground tracking service

- [ ] Red: write failing tests for throttled location writes, payload mapping from `expo-location`, and local history buffering for later stats.
- [ ] Green: implement foreground location tracking with 2-second writes.
- [ ] Refactor: isolate platform APIs behind testable adapters.
- [ ] Verify: confirm foreground updates appear in Firebase at the expected cadence.
- [ ] Done when a foreground session continuously updates location.

### 4.2 Implement background tracking registration

- [ ] Red: add failing tests for background task registration decisions and permission gating.
- [ ] Green: configure background location task wiring and required app config for iOS and Android.
- [ ] Refactor: centralize background task identifiers and registration guards.
- [ ] Verify: perform device-only checks for lock-screen and app-background updates.
- [ ] Done when the app remains trackable outside the foreground.

### 4.3 Add adaptive tracking throttling

- [ ] Red: write failing tests for speed-threshold state changes, stationary detection, and cadence switching.
- [ ] Green: implement adaptive accuracy and interval changes for stopped vs moving states.
- [ ] Refactor: keep threshold constants explicit and easy to tune.
- [ ] Verify: simulate stationary and moving updates and confirm the tracking mode changes correctly.
- [ ] Done when battery-saving behavior is deterministic and tested.

### 4.4 Render driver markers

- [ ] Red: write failing tests for driver-to-marker mapping, initials generation, assigned color stability, and stale-state detection.
- [ ] Green: render driver markers from `/drivers` subscription data.
- [ ] Refactor: keep marker presentation separate from subscription normalization.
- [ ] Verify: connect multiple simulated drivers and confirm markers appear accurately.
- [ ] Done when all active participants are visible on the map.

### 4.5 Animate marker movement

- [ ] Red: add failing tests for interpolation timing inputs and stale marker opacity logic.
- [ ] Green: implement smooth marker transitions and stale indicator visuals.
- [ ] Refactor: minimize re-renders across large marker sets.
- [ ] Verify: observe 2+ moving drivers and confirm marker updates feel stable rather than jumpy.
- [ ] Done when live movement reads clearly on the map.

### 4.6 Add driver info sheet

- [ ] Red: write failing tests for marker selection and displayed driver details.
- [ ] Green: implement tap-to-open driver info bottom sheet with name, car, speed, and last update time.
- [ ] Refactor: extract formatting helpers for speed and relative timestamps.
- [ ] Verify: tap several markers and confirm the correct data appears each time.
- [ ] Done when driver metadata is inspectable from the map.

### 4.7 Build map controls

- [ ] Red: write failing tests for Follow Me, Free Pan, Recenter, Fit All, and driver count badge state changes.
- [ ] Green: implement map control UI and camera behaviors.
- [ ] Refactor: isolate camera state logic from presentational controls.
- [ ] Verify: exercise each control manually on simulator/emulator and confirm expected behavior.
- [ ] Done when map navigation is usable while driving or observing.

### 4.8 Extend automated and manual multi-device coverage

- [ ] Red: add Maestro steps for the non-native portions of the live map flow and create a failing manual checklist entry for background tracking.
- [ ] Green: add automation where feasible and document required multi-device manual validation for native GPS behavior.
- [ ] Refactor: keep device-only checks concise and repeatable.
- [ ] Verify: complete one two-device live-tracking run.
- [ ] Done when live tracking has both automated regression coverage and a repeatable manual validation path.

## Milestone 5: Hazard Reporting

Goal: enable fast, shared hazard reporting without cluttering the map.

### 5.1 Implement hazard domain types and helpers

- [ ] Red: write failing tests for allowed hazard types, time-window filtering, and display formatting.
- [ ] Green: add hazard domain constants, icon mapping data, and helper functions.
- [ ] Refactor: keep hazard UI independent from persistence rules.
- [ ] Verify: use fixture-driven rendering tests for all hazard types.
- [ ] Done when hazard behavior is driven from shared domain definitions.

### 5.2 Build hazard reporting flow

- [ ] Red: write failing tests for FAB opening, picker selection, hazard payload creation, and undo timing.
- [ ] Green: implement hazard FAB, picker UI, create call, and 3-second undo path.
- [ ] Refactor: decouple transient undo state from permanent hazard persistence.
- [ ] Verify: report a hazard and undo it within the allowed window.
- [ ] Done when a user can submit or cancel a hazard cleanly.

### 5.3 Add hazard deduplication

- [ ] Red: write emulator-backed tests for same-type merge within 100m and 60 seconds, and non-merge behavior outside those limits.
- [ ] Green: implement deduplication logic and `reportCount` increments.
- [ ] Refactor: isolate comparison and distance logic into pure helpers.
- [ ] Verify: simulate overlapping reports from two drivers and confirm only one effective hazard remains.
- [ ] Done when duplicate hazard spam is reduced without hiding distinct events.

### 5.4 Render hazard markers

- [ ] Red: write failing tests for hazard visibility filtering, time-ago badge formatting, dismissed hazard hiding, and report-count display.
- [ ] Green: render map markers for hazards with the correct iconography and age handling.
- [ ] Refactor: separate hazard filtering from marker presentation.
- [ ] Verify: create hazards with different timestamps and dismissal states and confirm only valid markers show.
- [ ] Done when the hazard layer is clear and current.

### 5.5 Add hazard toasts

- [ ] Red: write failing tests for toast display on other-driver reports and suppression for the reporter's own events.
- [ ] Green: implement animated hazard notification toasts that avoid blocking map controls.
- [ ] Refactor: route event-to-toast logic through a small notification adapter.
- [ ] Verify: report hazards from one client and confirm others see the toast promptly.
- [ ] Done when hazard awareness extends beyond the map icon alone.

### 5.6 Enable admin dismissal

- [ ] Red: write failing tests for admin-only dismissal affordance and backend update behavior.
- [ ] Green: implement admin dismissal controls and `dismissed` persistence.
- [ ] Refactor: keep admin-only UI checks close to shared role logic.
- [ ] Verify: dismiss a hazard and confirm it disappears for all clients.
- [ ] Done when admins can clean up stale or incorrect reports.

## Milestone 6: End Run, Summary, and Sharing

Goal: convert the completed drive into useful stats and shareable output.

### 6.1 Add end-run orchestration

- [ ] Red: write failing tests for stop-tracking order, per-driver stat persistence, status transition to `ended`, and summary trigger behavior.
- [ ] Green: implement end-run orchestration and confirmation flow.
- [ ] Refactor: isolate orchestration from summary calculation logic.
- [ ] Verify: end a test run and confirm tracking stops and the run status changes cleanly.
- [ ] Done when runs can be ended without leaving listeners or trackers in a bad state.

### 6.2 Build summary calculations

- [ ] Red: write pure-function tests for total distance, total drive time, top speed selection, fuel estimates by fuel type, mixed-fuel totals, and hazard aggregation.
- [ ] Green: implement summary calculation helpers and summary object creation.
- [ ] Refactor: keep calculations pure and independent from screen concerns.
- [ ] Verify: compare summary outputs against fixed fixtures and hand-checked expectations.
- [ ] Done when summary generation is deterministic and well covered.

### 6.3 Persist summary data

- [ ] Red: write emulator-backed tests for writing the final summary to `/runs/{runId}/summary`.
- [ ] Green: wire summary persistence into the end-run flow.
- [ ] Refactor: unify serialization logic for future reuse by readers and sharers.
- [ ] Verify: inspect emulator data after ending a run and confirm the summary matches the expected shape.
- [ ] Done when all clients can rely on Firebase as the summary source of truth.

### 6.4 Build summary screen

- [ ] Red: write failing screen tests for run metadata, per-driver stats table, collective fuel totals, hazard breakdown, and empty-state handling.
- [ ] Green: implement the summary screen with themed cards and fixture-backed rendering.
- [ ] Refactor: split large summary sections into focused presentational components.
- [ ] Verify: render seeded summary fixtures and a real generated summary through the app.
- [ ] Done when participants can review the completed run clearly.

### 6.5 Generate route thumbnail

- [ ] Red: write failing tests around thumbnail generation inputs and fallback behavior when capture fails.
- [ ] Green: implement route snapshot generation and temp-file storage.
- [ ] Refactor: isolate platform-specific map capture details from screen state.
- [ ] Verify: confirm a route image is generated and displayed on the summary screen.
- [ ] Done when the summary includes a visual route artifact.

### 6.6 Add image sharing

- [ ] Red: write failing tests for share card data composition and image-share trigger behavior.
- [ ] Green: implement summary share-as-image flow.
- [ ] Refactor: keep the share card layout reusable and separate from the interactive summary screen.
- [ ] Verify: generate an image share on-device and confirm the share sheet opens with the expected asset.
- [ ] Done when users can export a polished visual recap.

### 6.7 Add PDF sharing

- [ ] Red: write failing tests for PDF payload composition and share trigger behavior.
- [ ] Green: implement summary share-as-PDF flow.
- [ ] Refactor: keep image and PDF share paths aligned on shared summary data formatting.
- [ ] Verify: generate a PDF on-device and inspect the result for layout integrity.
- [ ] Done when users can export a print-friendly summary.

## Milestone 7: Hardening, Offline, Security, and Release Prep

Goal: close functional gaps and prepare the app for real-world testing and distribution.

### 7.1 Add Firebase security rules

- [ ] Red: write failing rules tests for join-code write-once behavior, own-driver location writes only, admin-only status and summary writes, and blocked global listing patterns.
- [ ] Green: implement Firebase Realtime Database rules matching the app contract.
- [ ] Refactor: remove overly broad allowances and keep rules readable.
- [ ] Verify: run the emulator rules suite and confirm expected denials as well as allowed writes.
- [ ] Done when core backend access constraints are enforceable.

### 7.2 Implement offline handling

- [ ] Red: write failing tests for connection-banner state and queued-write UI behavior where practical.
- [ ] Green: add NetInfo-driven reconnection banner and enable Firebase offline behavior intentionally.
- [ ] Refactor: centralize connectivity state for app-wide consumption.
- [ ] Verify: simulate disconnect/reconnect and confirm queued writes eventually flush.
- [ ] Done when temporary signal loss is visible and non-destructive.

### 7.3 Add permission education flow

- [ ] Red: write failing screen tests for pre-permission education, denial messaging, and settings-link fallback copy.
- [ ] Green: implement polished permission request flows for foreground and background location.
- [ ] Refactor: keep permission copy and permission API handling separate.
- [ ] Verify: deny permissions on-device and confirm the app degrades gracefully.
- [ ] Done when permission handling is clear and recoverable.

### 7.4 Implement run expiry cleanup

- [ ] Red: write emulator-backed tests for deleting runs and join codes older than 24 hours while preserving fresh runs.
- [ ] Green: implement expiry cleanup checks on app open for admin-owned stale runs.
- [ ] Refactor: keep age calculation and deletion logic in isolated helpers.
- [ ] Verify: seed stale test data and confirm cleanup removes the right records.
- [ ] Done when expired run data does not linger indefinitely.

### 7.5 Add driver list sidebar

- [ ] Red: write failing tests for driver list rendering, stale/active status indicators, and admin-only remove actions.
- [ ] Green: implement the driver list sidebar and role-aware actions.
- [ ] Refactor: share active/stale indicator logic with map markers where possible.
- [ ] Verify: join several drivers and confirm the sidebar matches live map state.
- [ ] Done when the roster is accessible without tapping every marker.

### 7.6 Enforce max 15 drivers

- [ ] Red: write emulator-backed transaction tests for preventing a 16th join and avoiding race conditions.
- [ ] Green: implement transaction-based driver count enforcement.
- [ ] Refactor: keep capacity checks inside the join path rather than duplicated in UI only.
- [ ] Verify: simulate contested joins and confirm no more than 15 drivers persist.
- [ ] Done when room capacity is enforced at the backend boundary.

### 7.7 Add admin driver removal

- [ ] Red: write failing tests for admin-only removal and client update propagation.
- [ ] Green: implement driver removal from the sidebar and any necessary UI messaging.
- [ ] Refactor: align removal permissions with shared role and status guards.
- [ ] Verify: remove a driver during a test run and confirm all clients update consistently.
- [ ] Done when admins can manage disruptive or departed participants.

### 7.8 Performance pass

- [ ] Red: define measurable performance targets and a failing checklist for map responsiveness under 15-driver load.
- [ ] Green: optimize marker rendering, map state updates, screen splitting, and lazy loading where profiling shows need.
- [ ] Refactor: remove speculative optimizations that add complexity without proven benefit.
- [ ] Verify: profile the live map with a realistic seeded load and record results.
- [ ] Done when the app remains responsive under intended usage.

### 7.9 Complete automated regression pack

- [ ] Red: list all missing critical flows not yet covered by Jest, emulator tests, or Maestro.
- [ ] Green: extend automation to cover create, join, activate route, report hazard, end run, and open summary.
- [ ] Refactor: reduce duplication across flows and stabilize selectors.
- [ ] Verify: run the regression pack cleanly before any release build.
- [ ] Done when the highest-value user paths have repeatable regression coverage.

### 7.10 Finish manual multi-device validation

- [ ] Red: define a failing manual test matrix for iOS and Android, foreground and background, online and offline, single-device and multi-device.
- [ ] Green: execute the manual matrix on real hardware and capture findings.
- [ ] Refactor: turn any recurring manual defect into an automated test where practical.
- [ ] Verify: rerun affected scenarios after fixes.
- [ ] Done when the app has been exercised in the conditions that matter for real convoy use.

### 7.11 Prepare release assets and build config

- [ ] Red: create a release-readiness checklist covering icons, splash, metadata, EAS config, and beta build criteria.
- [ ] Green: add app icons, splash assets, store copy inputs, `eas.json`, and production build settings.
- [ ] Refactor: remove debug-only config from release paths.
- [ ] Verify: produce installable test builds for iOS and Android and smoke test both.
- [ ] Done when ClubRun is ready for private beta distribution.

## Acceptance Gates By Capability

### Core platform

- [ ] App boots reliably in development builds on iOS and Android.
- [ ] Theme, navigation, and UI primitives are stable enough to support later work.

### Run lifecycle

- [ ] Admin can create a run, obtain a join code, and activate a route-backed run.
- [ ] Driver can resolve a join code, submit a profile, and enter the run.
- [ ] Run status changes synchronize across clients.

### Live map

- [ ] Drivers, routes, and hazards render correctly on the map.
- [ ] Foreground and background tracking keep location reasonably fresh.
- [ ] Stale state and connectivity loss are visible to the user.

### Summary and sharing

- [ ] Ending a run produces a persisted summary object.
- [ ] Summary screen reads correctly from Firebase.
- [ ] Sharing works for both image and PDF outputs on real devices.

### Hardening

- [ ] Security rules enforce the intended trust model.
- [ ] Capacity, cleanup, and permission edge cases are covered.
- [ ] Automated and manual test coverage is strong enough for a private beta.

## Deferred Unless The Spec Changes

- No user accounts or persistent club membership.
- No custom backend beyond Firebase services already in scope.
- No web admin panel in this implementation plan.
- No V2 enhancements such as moderation systems, advanced replay timelines, or richer social features.
