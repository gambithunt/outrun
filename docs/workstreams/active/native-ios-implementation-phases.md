# Native iOS Implementation Phases

Status: Active
Created: 2026-05-05
Source of truth for product flow: [Native iOS App Flow Spec](native-ios-app-flow-spec.md)
Related prior implementation plan: [Native iOS Production Implementation Plan](native-ios-production-implementation-plan.md)

## Purpose

This workstream turns the native iOS app flow spec into an executable production implementation plan.

The goal is to build the native iOS-only ClubRun app with production-grade SwiftUI, MapKit, Core Location, and Firebase code. Each phase should follow Red -> Green -> Refactor -> Verify wherever possible.

This document is a checklist. Mark tasks complete as implementation proceeds.

## Product Direction Locked For This Plan

- Native iOS only going forward.
- SwiftUI primary UI framework.
- Latest Liquid Glass-capable iOS version only.
- MapKit for native maps.
- Apple Maps/MapKit route generation as primary route creation method.
- GPX import as secondary preview-and-save route creation method.
- Firebase Auth with email/password for v1.
- Password reset support.
- Required user profile: display name, car make, car model.
- Generated driver badge/color for v1 instead of uploaded profile pictures or car-logo assets.
- Join codes remain the v1 invite mechanism.
- Admin-only global run ending.
- Drivers can finish/leave their own drive session independently.
- Max speed and max g-force can be shown in summaries, but not ranked.
- Background location physical-device testing is mandatory before production/TestFlight readiness.

## Architecture Rules

- SwiftUI views must not call Firebase SDKs directly.
- Firebase paths must remain centralized.
- Feature view models should depend on protocols, not concrete Firebase adapters.
- Domain calculations should be pure and unit-tested.
- MapKit conversion/rendering should live in mapping/view-model layers, not backend models.
- Core Location raw updates should be separated from write/throttle policy.
- Keep one primary action per screen.
- Use Apple-native components before custom controls.
- Custom glass should be reserved for map overlays and compact action surfaces.
- Add abstractions only when they remove real complexity or match an established local pattern.
- Do not make destructive changes or alter unrelated Expo behavior unless explicitly approved.

## Required Verification Commands

Use the available simulator destination on the current machine.

```bash
xcodebuild \
  -project native-ios/ClubRunNative/ClubRunNative.xcodeproj \
  -scheme ClubRunNative \
  -destination 'generic/platform=iOS' \
  -derivedDataPath native-ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  build
```

```bash
xcodebuild \
  -project native-ios/ClubRunNative/ClubRunNative.xcodeproj \
  -scheme ClubRunNative \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.4.1' \
  -derivedDataPath native-ios/DerivedData \
  test
```

```bash
xcodebuild \
  -project native-ios/ClubRunNative/ClubRunNative.xcodeproj \
  -scheme ClubRunNative \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.4.1' \
  -derivedDataPath native-ios/DerivedData \
  test \
  -only-testing:ClubRunNativeUITests
```

When backend rules or shared backend contract are touched:

```bash
npm run test:rules
```

Database emulator:

```bash
npm run emulators:database
```

## Current Foundation Snapshot

The native foundation already exists and has proven:

- SwiftUI app target exists under `native-ios/`.
- Firebase Apple SDK products were added to the native target.
- `GoogleService-Info.plist` was added.
- Firebase anonymous auth previously worked.
- Database emulator write/read smoke worked.
- Minimal Drive diagnostics screen exists.
- Basic run creation service exists for a test run and join code.

Important update required:

- Auth must move from anonymous-only foundation to email/password account flow.
- The current debug Drive screen should evolve into real Auth Gate, Home Hub, Create Run, Join Run, Lobby, Route Setup, Live Drive, Hazards, Summary, and Settings flows.

## Phase 0: Reconcile Foundation And Configuration

Goal: make the existing native foundation clean, predictable, and ready for product implementation.

### Red

- [ ] Add or update tests proving Firebase configuration happens once at app startup.
- [ ] Add tests proving app environment exposes auth mode, database mode, and current authenticated user state.
- [ ] Add tests proving debug-only backend diagnostics can be hidden or isolated later.

### Green

- [ ] Audit native project Firebase package products.
- [ ] Ensure `GoogleService-Info.plist` is included once in the native app target.
- [ ] Remove or document duplicate plist copies.
- [ ] Decide whether to remove accidental Firebase package reference from old Expo `ios/` project.
- [ ] Centralize Firebase configuration into one bootstrap/service.
- [ ] Add environment configuration for development/emulator and production modes.
- [ ] Keep database emulator support available.
- [ ] Replace temporary smoke UI naming with a development diagnostics section.

### Refactor

- [ ] Move any debug-only code behind clear flags or build configuration checks.
- [ ] Keep app startup small and dependency-injection friendly.
- [ ] Make emulator host/port constants easy to change.

### Verify

- [ ] Native app builds.
- [ ] Unit tests pass.
- [ ] UI launch test passes.
- [ ] Database emulator smoke still shows run write/read OK.

### Done

- [ ] The native app foundation is clean and ready for real account/profile work.

## Phase 1: Domain Models And Backend Contract Upgrade

Goal: update Swift domain/backend models to support the full flow spec before building UI.

### Red

- [ ] Add failing serialization tests for `UserProfile`.
- [ ] Add failing serialization tests for generated badge fields.
- [ ] Add failing tests for run root with `draft`, `ready`, `active`, and `ended` states.
- [ ] Add failing tests for `JoinCodeRecord`.
- [ ] Add failing tests for `DriverRecord` with profile snapshot, presence, and finish state.
- [ ] Add failing tests for latest location and track point payloads.
- [ ] Add failing tests for `RouteData` with `apple_maps` source.
- [ ] Add failing tests for `RouteData` with `gpx` source.
- [ ] Add failing tests for route stops: start, waypoint, destination.
- [ ] Add failing tests for hazard payload with police and mobile camera.
- [ ] Add failing tests for hazard confirmation fields, even if confirmation UI is deferred.
- [ ] Add failing tests for group summary and personal summary payloads.

### Green

- [ ] Implement `UserProfile`.
- [ ] Implement generated badge model/helpers.
- [ ] Update `DriverProfile`/driver snapshot to include display name, car make/model, badge color, badge text.
- [ ] Add `DriverPresence`.
- [ ] Add driver finish/session state.
- [ ] Add `TrackPoint`.
- [ ] Add route source enum values `apple_maps` and `gpx`.
- [ ] Add route stop ordering.
- [ ] Add hazard types: pothole, roadworks, police, mobile camera, debris, broken-down car.
- [ ] Add hazard confidence/expiry fields.
- [ ] Add group and personal summary models.
- [ ] Keep JSON key names compatible with Firebase rules or update rules/tests intentionally.

### Refactor

- [ ] Split domain models into files by domain if `ClubRunModels.swift` becomes too large.
- [ ] Keep Firebase DTOs separate only if pure domain models need different semantics.
- [ ] Add fixture helpers for reading/writing JSON fixtures.

### Verify

- [ ] All serialization tests pass.
- [ ] Existing backend path tests pass.
- [ ] If database rules are touched, `npm run test:rules` passes.

### Done

- [ ] Swift models represent the full v1 backend contract for auth/profile, runs, route, live drive, hazards, and summaries.

## Phase 2: Email/Password Auth And User Profile

Goal: replace anonymous-only participation with simple account registration, login, password reset, and persistent profile.

### Red

- [x] Add failing tests for registration input validation.
- [x] Add failing tests for login input validation.
- [x] Add failing tests for password reset email validation.
- [x] Add failing tests for profile validation: display name, car make, car model.
- [x] Add failing tests for badge generation from display name and/or car initials.
- [x] Add failing repository tests for writing `/users/{uid}`.
- [x] Add failing repository tests for reading `/users/{uid}`.
- [x] Add failing auth-state routing tests: signed out, signed in incomplete profile, signed in complete profile.

### Green

- [x] Extend `AuthServicing` to support email/password sign-up.
- [x] Extend `AuthServicing` to support email/password login.
- [x] Add password reset method.
- [x] Add sign-out method.
- [x] Add current-user/session observation.
- [x] Add `UserProfileRepository`.
- [x] Build Auth Gate view model.
- [x] Build Login screen.
- [x] Build Register screen.
- [x] Build Forgot Password screen.
- [x] Build Profile Setup/Edit Profile form.
- [x] Generate and persist badge color/text during profile creation.
- [x] Cache profile locally for fast launch, with backend as source of truth.

### Refactor

- [x] Keep FirebaseAuth SDK out of SwiftUI views.
- [x] Keep profile validation pure and testable.
- [x] Use reusable form components only after duplication appears.
- [x] Keep account errors user-actionable.

### Verify

- [x] Register account on emulator or controlled Firebase project.
- [x] Login works.
- [x] Password reset sends successfully.
- [x] App routes signed-out users to Login.
- [x] App routes incomplete users to Profile Setup.
- [x] App routes complete users to Home Hub.
- [x] Unit tests pass.
- [x] UI tests cover Login/Register happy path where practical.

### Done

- [x] Users can create an account, sign in, reset password, and maintain the required driver profile.

## Phase 3: Home Hub And Session Restore

Goal: build the first post-login experience and restore active runs without blocking create/join.

### Red

- [x] Add failing tests for Home Hub view model with no active run.
- [x] Add failing tests for Home Hub with one active run card.
- [x] Add failing tests for active run role classification: admin vs driver.
- [x] Add failing tests for stored active run id validation.
- [x] Add failing UI test proving Create Run and Join Run are visible after login/profile.

### Green

- [x] Build Home Hub screen.
- [x] Add identity row with display name, generated badge, car make/model.
- [x] Add primary Create Run action.
- [x] Add primary Join Run action.
- [x] Add compact active run card showing run name and status.
- [x] Make active run card tappable without needing "Resume" wording.
- [x] Add settings/profile entry.
- [x] Add local active-session persistence.
- [x] Add app router/navigation state for auth/home/create/join/lobby/live/summary.

### Refactor

- [x] Keep navigation decisions in a coordinator/router.
- [x] Keep Home Hub visual surface clean and operational.
- [x] Avoid dashboard cards beyond the active run card.

### Verify

- [ ] Logged-in complete-profile user lands on Home Hub.
- [ ] Create Run opens create flow.
- [ ] Join Run opens code screen.
- [ ] Active run card opens the correct role-specific screen.

### Done

- [ ] Home Hub is the stable anchor for the native app.

## Phase 4: Create Run Flow

Goal: admin can create a named run and arrive at the admin lobby.

### Red

- [x] Add failing tests for run name validation.
- [x] Add failing tests for optional description validation.
- [x] Add failing tests for unique join code generation and collision retry.
- [x] Add failing tests for `/runs/{runId}` write payload.
- [x] Add failing tests for `/joinCodes/{joinCode}` write payload.
- [x] Add failing tests for create-run failure states.
- [x] Add failing UI test for create run form validation.

### Green

- [x] Build Create Run sheet or compact full-screen form.
- [x] Fields: run name, optional short description.
- [x] Default max drivers to 15.
- [x] Create run as `draft`.
- [x] Generate six-digit join code.
- [x] Write `/runs/{runId}`.
- [x] Write `/joinCodes/{joinCode}`.
- [x] Store active session as admin.
- [x] Navigate to Admin Lobby after success.
- [x] Show loading and recoverable error states.

### Refactor

- [x] Keep create-run service pure around payload construction.
- [x] Keep repository write sequencing clear.
- [x] Avoid route setup fields in create-run form.

### Verify

- [ ] Create run against emulator.
- [ ] Inspect `/runs/{runId}`.
- [ ] Inspect `/joinCodes/{joinCode}`.
- [ ] Admin lands in lobby.
- [ ] Existing backend rules tests pass if rules touched.

### Done

- [ ] A registered user can create a v1-compatible draft run.

## Phase 5: Join Run Flow

Goal: driver can enter a code, resolve the run, join with their profile snapshot, and enter the correct run state.

### Red

- [x] Add failing tests for six-digit code formatting.
- [x] Add failing tests for paste handling/normalization.
- [x] Add failing tests for missing join code.
- [x] Add failing tests for ended run behavior.
- [x] Add failing tests for driver profile snapshot payload.
- [x] Add failing tests for driver join write.
- [x] Add failing tests for post-join routing: lobby vs live drive.

### Green

- [x] Build full Join Run code-entry screen.
- [x] Add large, focused six-digit input.
- [x] Support paste.
- [x] Resolve `/joinCodes/{joinCode}`.
- [x] Read `/runs/{runId}`.
- [x] Show run name once resolved.
- [x] Write `/runs/{runId}/drivers/{uid}` with profile snapshot.
- [x] Store active session as driver.
- [x] Route to Driver Lobby for draft/ready.
- [x] Route to Live Drive if active joining is allowed.
- [x] Show clear invalid/expired code states.

### Refactor

- [x] Keep code normalization pure.
- [x] Keep driver snapshot creation reusable for reconnect/update flows.

### Verify

- [ ] Join a native-created run.
- [ ] Driver record shape is correct.
- [ ] Invalid code is handled cleanly.
- [ ] UI remains focused and fast.

### Done

- [ ] Registered users can join runs using six-digit codes.

## Phase 6: Admin Lobby And Driver Lobby

Goal: create role-specific lobbies that organize run setup without crowding the screen.

### Red

- [x] Add failing view model tests for admin lobby no-route state.
- [x] Add failing view model tests for route-ready state.
- [x] Add failing tests for start-drive readiness labels.
- [x] Add failing tests for solo-start confirmation requirement.
- [x] Add failing tests for driver count/waiting count summaries.
- [x] Add failing tests for driver presence/stale classification.
- [x] Add failing UI test for admin lobby showing code/share/start/route/drivers/status.
- [x] Add failing UI test for driver lobby not showing admin controls.

### Green

- [x] Build Admin Lobby screen.
- [x] Header: run name, join code, share, copy, start drive, readiness label.
- [x] Route row: not set or distance/duration/stop/source summary.
- [x] Drivers row: joined count, waiting count, badge cluster.
- [x] Drivers sheet with badge, display name, car make/model, status.
- [x] Run status row with plain explanation.
- [x] Build Driver Lobby screen.
- [x] Driver lobby shows run name, admin, route summary, driver count, waiting state, route details entry, driver list entry.
- [x] Add ShareLink/share sheet for join code.
- [x] Add copy-code affordance if share alone is insufficient.
- [x] Implement presence updates for lobby entry/exit.
- [x] Implement start-drive status transition once route exists.

### Refactor

- [x] Keep admin/driver lobby components shared only where it stays clear.
- [x] Keep start-drive rules in a testable policy.
- [x] Keep presence policy separate from UI.

### Verify

- [ ] Admin sees setup controls.
- [ ] Driver does not see setup controls.
- [ ] Driver sheet updates as drivers join.
- [ ] Start is disabled without route.
- [ ] Solo-start confirmation appears when no other drivers are waiting.

### Done

- [ ] Lobbies are production-usable and ready to connect route setup/live drive.

## Phase 7: Route Setup With MapKit And Apple Maps Routing

Goal: admin can create a route by choosing start, destination, and optional waypoints.

### Red

- [x] Add failing tests for route stop validation.
- [x] Add failing tests for start/destination required.
- [x] Add failing tests for waypoint add/remove/reorder.
- [x] Add failing tests for route recalculation trigger policy.
- [x] Add failing tests for MapKit route request construction.
- [x] Add failing tests for Apple Maps route response normalization.
- [x] Add failing tests for route save payload.
- [x] Add failing view model tests for route summary.
- [x] Add failing UI test for opening Route Setup from lobby.

### Green

- [x] Build full-screen Route Setup map.
- [x] Add compact bottom route editor panel.
- [x] Add start row.
- [x] Add waypoint rows.
- [x] Add destination row.
- [x] Add search flow for stops.
- [x] Add current location option for start.
- [x] Add pin-drop/move-pin flow.
- [ ] Add waypoint drag reorder.
- [x] Recalculate route when stops change.
- [x] Show route polyline.
- [x] Show distance/duration summary.
- [x] Save route to `/runs/{runId}/route`.
- [x] Transition run to `ready` when route is saved.
- [x] Return to Admin Lobby.

### Refactor

- [x] Keep MapKit types out of Firebase models.
- [x] Keep routing provider behind a protocol.
- [x] Validate whether SwiftUI `Map` is sufficient or route editor needs a small `MKMapView` bridge.

### Verify

- [ ] Create start/destination route.
- [ ] Add waypoint.
- [ ] Reorder waypoint.
- [ ] Route updates.
- [ ] Save route.
- [ ] Lobby route row shows distance/duration/stops/source.
- [ ] Driver lobby can open route details.

### Done

- [ ] Admin can create and save an Apple Maps generated route.

## Phase 8: GPX Import

Goal: admin can import a GPX route as the secondary route creation method.

### Red

- [x] Add failing GPX fixture tests for valid GPX.
- [x] Add failing tests for invalid XML.
- [x] Add failing tests for missing track points.
- [x] Add failing tests for oversized GPX rejection.
- [x] Add failing tests for GPX distance calculation.
- [x] Add failing tests for GPX route save payload with `source: gpx`.

### Green

- [x] Add secondary GPX import affordance in Route Setup.
- [x] Use document picker for GPX.
- [x] Parse GPX into route points.
- [x] Preview imported route on map.
- [x] Show distance summary.
- [x] Save or discard.
- [x] Save imported route using same backend route shape.

### Refactor

- [x] Keep GPX parser pure and fixture-driven.
- [x] Do not add GPX editing in v1.
- [x] Share route preview rendering with Apple Maps routes.

### Verify

- [ ] Import representative GPX.
- [ ] Preview route.
- [ ] Save route.
- [ ] Route row shows GPX source.
- [ ] Live map renders imported route.

### Done

- [ ] GPX import is available without complicating the primary route builder.

## Phase 9: Live Drive Map Shell

Goal: render the active drive map from run state before enabling full tracking complexity.

### Red

- [x] Add failing map view model tests for route rendering state.
- [x] Add failing tests for driver marker models.
- [x] Add failing tests for stale/offline/current driver states.
- [x] Add failing tests for hazard marker models.
- [x] Add failing tests for top status overlay text.
- [x] Add failing tests for next waypoint/distance label.

### Green

- [x] Build full-screen Live Drive screen.
- [x] Render MapKit route polyline.
- [x] Render own location marker.
- [x] Render other driver generated badges/colors.
- [x] Do not show live speed for other drivers.
- [x] Render hazards at reported locations.
- [x] Add top glass status overlay with run name/status and next waypoint/distance.
- [x] Add bottom controls: recenter, route overview, lobby/details.
- [x] Add bottom-right hazard button.
- [x] Add admin end-drive control.
- [x] Add driver marker tap details: display name, car make/model, location freshness.

### Refactor

- [x] Keep annotation view models independent of MapKit rendering.
- [x] Keep overlays large and glanceable.
- [x] Avoid dense panels while driving.

### Verify

- [ ] Map is nonblank on simulator.
- [ ] Route line visible.
- [ ] Driver markers readable.
- [ ] Hazard markers visible.
- [ ] Controls do not obscure route-critical content.
- [ ] Light/dark mode readable.

### Done

- [ ] Active run state is visible in a map-first live drive UI.

## Phase 10: Foreground Location, Presence, And Tracks

Goal: write live driver location and track points while the app is foregrounded.

### Red

- [ ] Add failing tests for latest location payload.
- [ ] Add failing tests for track point payload.
- [ ] Add failing tests for timestamp milliseconds.
- [ ] Add failing tests for throttling interval.
- [ ] Add failing tests for minimum movement filtering.
- [ ] Add failing tests for presence updates.
- [ ] Add failing tests for stop-writing after leave/finish/end.

### Green

- [ ] Implement Core Location permission request.
- [ ] Implement foreground location service.
- [ ] Implement throttle/write policy.
- [ ] Write latest location to `/runs/{runId}/drivers/{uid}/location`.
- [ ] Write track points to `/tracks/{runId}/{uid}/{pointId}` while active.
- [ ] Update driver presence.
- [ ] Stop updates when driver leaves/finishes.
- [ ] Surface denied/restricted/reduced accuracy states.

### Refactor

- [ ] Keep raw Core Location separate from backend write policy.
- [ ] Make write policy testable with fake clock/location.
- [ ] Avoid unbounded writes.

### Verify

- [ ] Foreground tracking works on simulator where possible.
- [ ] Two devices/simulators can observe location updates where practical.
- [ ] Track writes happen only while run is active.
- [ ] End/leave stops writes.

### Done

- [ ] Foreground live tracking is reliable and backend-compatible.

## Phase 11: Background Location

Goal: keep convoy tracking working when the app is backgrounded, with honest permission handling.

### Red

- [ ] Add tests for active-run background eligibility.
- [ ] Add tests for restore-after-launch decision logic.
- [ ] Add tests for denied/restricted/reduced accuracy labels.
- [ ] Add a manual physical-device checklist before coding is marked complete.

### Green

- [ ] Add background location capability.
- [ ] Add required `Info.plist` usage descriptions.
- [ ] Add When In Use permission education.
- [ ] Add Always permission escalation only when needed.
- [ ] Restart/restore location session when app relaunches into an active run.
- [ ] Continue responsible track/latest-location writes in background.
- [ ] Stop background location on finish/leave/admin end.
- [ ] Add visible diagnostics for active background tracking.

### Refactor

- [ ] Keep lifecycle code out of views.
- [ ] Keep permission copy plain and truthful.
- [ ] Avoid always-on tracking outside active drive.

### Verify

- [ ] Physical device: app foreground.
- [ ] Physical device: app backgrounded.
- [ ] Physical device: screen locked.
- [ ] Physical device: temporary network loss.
- [ ] Physical device: end run stops location.
- [ ] Battery impact smoke test.

### Done

- [ ] Background location is production-grade enough for TestFlight.

## Phase 12: Hazard Reporting

Goal: drivers can report and view route hazards in realtime.

### Red

- [ ] Add failing tests for hazard type enum including police and mobile camera.
- [ ] Add failing tests for hazard create payload.
- [ ] Add failing tests for hazard expiry/fade policy.
- [ ] Add failing tests for report count/confidence behavior.
- [ ] Add failing tests for admin dismiss.
- [ ] Add failing tests for confirmation data model: still there, gone.
- [ ] Add failing UI test for hazard report sheet.

### Green

- [ ] Add bottom-right hazard button to Live Drive.
- [ ] Build hazard report bottom sheet.
- [ ] Hazard types: pothole, roadworks, police, mobile camera, debris, broken-down car.
- [ ] Tap hazard type writes report and dismisses sheet.
- [ ] Show confirmation toast/banner.
- [ ] Render hazard markers on map.
- [ ] Tap hazard marker for type, reporter, time ago, report count.
- [ ] Implement v1 fade/hide timer.
- [ ] Implement admin dismiss if supported cleanly.
- [ ] Keep data model ready for later nearby-driver confirmation.

### Refactor

- [ ] Centralize hazard icons/labels/colors.
- [ ] Keep report flow fast but not accidental.
- [ ] Defer nearby-driver prompts until live map/location is stable.

### Verify

- [ ] Report hazard on one client and observe on another.
- [ ] Hazard appears at report location.
- [ ] Hazard fades/hides according to timer.
- [ ] Malformed hazard is rejected by rules.

### Done

- [ ] Hazard reporting works in realtime with low distraction.

## Phase 13: End Run, Driver Finish, And Summaries

Goal: support admin group end, individual driver finish/leave, persistent summaries, and shareable post-drive output.

### Red

- [ ] Add failing tests for admin-only global end.
- [ ] Add failing tests for driver personal finish.
- [ ] Add failing tests for destination arrival finish prompt policy.
- [ ] Add failing tests for stale/offline timeout classification.
- [ ] Add failing tests for summary calculations: distance, moving time, stopped time.
- [ ] Add failing tests for max speed and max g-force calculations.
- [ ] Add failing tests for no ranking by max speed/g-force.
- [ ] Add failing tests for shareText generation.
- [ ] Add failing tests for summary persistence paths.

### Green

- [ ] Add admin End Group Drive action with confirmation.
- [ ] Write global ended status and `endedAt` as admin.
- [ ] Let drivers finish/leave their own session.
- [ ] Stop tracking on personal finish/leave.
- [ ] Detect arrival at final destination and show finish prompt.
- [ ] Support admin destination arrival prompt: End Group Drive.
- [ ] Generate personal summaries.
- [ ] Generate group summary when admin ends.
- [ ] Persist summaries.
- [ ] Build Summary screen.
- [ ] Add share/copy summary format.
- [ ] Add post-drive history entry.

### Refactor

- [ ] Keep summary calculation pure and fixture-driven.
- [ ] Keep share text generation independent from UI.
- [ ] Keep personal stats private by default.

### Verify

- [ ] Driver can finish independently.
- [ ] Admin can end group run.
- [ ] Summary remains available after app restart.
- [ ] Summary share/copy works.
- [ ] No location writes after finish/end.

### Done

- [ ] Run completion and summary experience is production-usable.

## Phase 14: Settings, Account, History, And Diagnostics

Goal: provide profile/account maintenance, history access, and development diagnostics.

### Red

- [ ] Add failing tests for Settings view model.
- [ ] Add failing tests for profile edit validation.
- [ ] Add failing tests for unit preference persistence.
- [ ] Add failing tests for password reset action.
- [ ] Add failing tests for sign-out behavior.
- [ ] Add failing tests for history list loading.
- [ ] Add failing tests for debug diagnostics visibility by build config.

### Green

- [ ] Build Settings screen as grouped settings list.
- [ ] Profile section: display name, badge preview, regenerate color if allowed.
- [ ] Car section: make/model searchable suggestions with free text fallback.
- [ ] Units section: km/kmh and mi/mph.
- [ ] Account section: email, reset password, sign out.
- [ ] History section: past runs and summaries.
- [ ] Debug section: backend mode, auth uid, database/emulator status, latest smoke result.
- [ ] Hide or tuck debug information away for production builds.

### Refactor

- [ ] Avoid dashboard-like settings cards.
- [ ] Keep destructive account actions out until data deletion behavior is defined.
- [ ] Keep history loading separate from profile settings.

### Verify

- [ ] Edit profile updates backend and local cache.
- [ ] Unit preferences affect displayed distances/speeds.
- [ ] Reset password works.
- [ ] Sign out returns to Login.
- [ ] History opens summary.

### Done

- [ ] Account/profile/history/diagnostic workflows are complete enough for v1.

## Phase 15: Liquid Glass, Accessibility, And UI Polish

Goal: turn working flows into a premium Apple-native app without sacrificing clarity.

### Red

- [ ] Add accessibility checklist items for every major screen.
- [ ] Add screenshot checklist for light/dark mode.
- [ ] Add checklist for Reduce Transparency, Increase Contrast, Reduce Motion.
- [ ] Add map readability checklist for daylight/dark conditions.

### Green

- [ ] Apply system Liquid Glass where available through standard SwiftUI components.
- [ ] Add custom glass only to compact map overlays and action surfaces.
- [ ] Tune Home Hub.
- [ ] Tune Admin/Driver Lobby.
- [ ] Tune Route Setup panel.
- [ ] Tune Live Drive overlays.
- [ ] Tune Hazard sheet.
- [ ] Tune Summary share presentation.
- [ ] Add VoiceOver labels.
- [ ] Add Dynamic Type support.
- [ ] Add high-contrast and reduce-transparency fallbacks.

### Refactor

- [ ] Remove decorative surfaces that do not help driving workflows.
- [ ] Simplify any crowded screen.
- [ ] Ensure buttons/text do not overflow on small devices.

### Verify

- [ ] VoiceOver pass.
- [ ] Dynamic Type pass.
- [ ] Light/dark screenshots.
- [ ] Reduce Transparency pass.
- [ ] Increase Contrast pass.
- [ ] Reduce Motion pass.

### Done

- [ ] App feels native, readable, and ready for external testers.

## Phase 16: Firebase Rules, Privacy, And Production Hardening

Goal: harden backend/security/privacy behavior before TestFlight.

### Red

- [ ] Add/update Firebase rules tests for email-auth user profile writes.
- [ ] Add/update rules tests for run creation.
- [ ] Add/update rules tests for join flow.
- [ ] Add/update rules tests for route write admin-only.
- [ ] Add/update rules tests for driver location/track writes.
- [ ] Add/update rules tests for hazards.
- [ ] Add/update rules tests for summary writes.
- [ ] Add privacy checklist.
- [ ] Add release checklist.

### Green

- [ ] Update Firebase rules intentionally if schema changes require it.
- [ ] Add backend fixtures matching native data.
- [ ] Add privacy strings for location and background location.
- [ ] Add privacy manifest if required.
- [ ] Audit logs for sensitive data.
- [ ] Ensure no email is exposed in run lobbies.
- [ ] Ensure debug UI is not prominent in release.
- [ ] Configure signing/display name/icons.
- [ ] Document emulator and production Firebase setup.

### Refactor

- [ ] Remove obsolete anonymous-auth-only assumptions.
- [ ] Remove stale debug-only code or isolate it.
- [ ] Document schema migrations if any were made.

### Verify

- [ ] `npm run test:rules` passes.
- [ ] Native unit tests pass.
- [ ] Native UI tests pass.
- [ ] Clean archive succeeds.
- [ ] Install on physical device succeeds.
- [ ] Controlled production Firebase smoke run succeeds.

### Done

- [ ] Native app is ready for controlled TestFlight.

## Phase 17: TestFlight Readiness And Real-World Drive Matrix

Goal: prove the app behaves correctly outside the simulator.

### Red

- [ ] Create manual real-drive test protocol.
- [ ] Create TestFlight blocker checklist.
- [ ] Create known-risk log.

### Green

- [ ] Run one admin + one driver physical-device drive test.
- [ ] Run one admin + multiple drivers physical-device test if devices are available.
- [ ] Test app backgrounded.
- [ ] Test screen locked.
- [ ] Test admin disconnect.
- [ ] Test driver finish independently.
- [ ] Test hazard report and visibility.
- [ ] Test route setup with Apple Maps route.
- [ ] Test GPX import.
- [ ] Test summary availability after restart.

### Refactor

- [ ] Fix P0/P1 issues.
- [ ] Reduce battery/network hot spots.
- [ ] Tighten confusing copy or controls found during testing.

### Verify

- [ ] All release candidate gates pass.
- [ ] TestFlight archive/upload succeeds if Apple account is ready.
- [ ] Release notes identify known limitations.

### Done

- [ ] App is ready for controlled external testing.

## Cross-Phase Backlog

- [ ] Decide exact production bundle id.
- [ ] Decide Apple Developer/TestFlight account setup.
- [ ] Decide crash reporting before TestFlight.
- [ ] Decide analytics before TestFlight.
- [ ] Decide account deletion behavior.
- [ ] Decide whether admin can remove drivers in v1.
- [ ] Decide exact hazard expiry timing after physical testing.
- [ ] Decide if nearby-driver hazard confirmation ships in v1.5.
- [ ] Decide if GPX route import requires size limits beyond initial parser protections.
- [ ] Decide if route search needs fallback beyond MapKit search.
