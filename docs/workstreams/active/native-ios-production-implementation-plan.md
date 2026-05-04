# Native iOS Production Implementation Plan

Parent workstream: [Native iOS Backend-Compatible App](native-ios-backend-compatible-app.md)

## Purpose

This document is the implementation action plan for building the new native iOS ClubRun app. It turns the parent workstream into a production-grade backlog with architecture boundaries, backend contracts, Red -> Green TDD tasks, verification gates, and release criteria.

The native iOS app is a new SwiftUI client that uses the same Firebase backend contract as the existing Expo/React Native app. It is not an incremental port of the Expo UI.

## Planning Principles

- Build the native iOS app as a separate client.
- Treat Firebase data shape and security rules as a public contract between clients.
- Write failing tests or explicit failing verification checks before implementation work.
- Prefer SwiftUI, MapKit, Core Location, and Apple-native interaction patterns.
- Use Liquid Glass through system components first; custom glass only where it improves the driving workflow.
- Keep the map as the primary surface for active run experiences.
- Do not rely on simulator-only testing for background location.
- Reuse the same Firebase backend contract, but do not optimize v1 for live Expo/native cross-client compatibility.

## Current Known Context

Existing app stack:

- Expo SDK 52
- React Native 0.76
- Expo Router
- Firebase Auth and Realtime Database
- MapLibre for current map implementation
- Zustand for session/location state
- Jest and Firebase rules tests

Existing backend rules already enforce:

- authenticated reads/writes
- anonymous-auth-compatible user ownership through `auth.uid`
- run creation by admin uid
- driver writes only to the driver's own node
- admin-only status transitions and summary/route writes
- hazard create/increment/dismiss rules
- track writes only while run is active

The native app must preserve these rules unless a backend migration is explicitly planned.

## Non-Goals

The first native production implementation should not include:

- Android parity
- web parity
- CarPlay
- Apple Watch
- App Clips
- social account login
- custom backend services
- offline map packs
- major Firebase schema redesign
- wholesale redesign of product scope

These can become later workstreams.

## Open Decisions Before Coding

These decisions should be made before Phase 0 begins. Resolved decisions are recorded here so implementation can proceed without re-litigating them.

1. Repository location
   - Recommended: create a new `native-ios/` directory in this repo.
   - Reason: keeps the new client close to backend rules and shared product documentation while avoiding conflict with the existing Expo-generated `ios/` directory.

2. Xcode project management
   - Recommended: start with a normal checked-in Xcode project under `native-ios/ClubRunNative/`.
   - Alternative: use XcodeGen later if the project file becomes noisy.

3. Minimum iOS version
   - Decision: target only the latest Liquid Glass-capable iOS version for the native app.
   - Rationale: the whole point of this client is a premium Apple-native experience. Supporting older iOS versions with fallback materials would add complexity and weaken the design direction before the app has proven itself.
   - Implementation effect: v1 does not need fallback UI paths for older iOS versions.

4. Native app bundle id
   - Decision: create a separate native iOS setup instead of replacing the existing Expo iOS setup.
   - Recommended development bundle id: `com.clubrun.native`.
   - Production bundle id can be finalized later, but implementation should assume a separate app target/configuration.

5. Cross-client compatibility
   - Decision: do not require live Expo/native cross-client compatibility for v1.
   - Requirement that remains: use the same Firebase backend contract unless a backend schema migration is explicitly approved.
   - Practical effect: the native app should not intentionally break current backend rules, but it does not need to support mixed Expo/native participants in the same run for the first production milestone.

6. CI provider
   - Decision needed: local-only initially, GitHub Actions, Xcode Cloud, or another system.

7. Apple Developer account and device matrix
   - Decision needed: which real devices are available for background location testing.

8. Routing provider
   - Decision: use Apple Maps/MapKit routing for native route generation.
   - Implementation note: keep routing behind a service abstraction so backend route storage remains provider-independent.

9. GPX import
   - Decision: include GPX import in the first native production milestone.
   - Implementation note: GPX parsing should be built as pure domain/infrastructure code with fixture-driven tests before UI integration.

## Working Assumptions Until Decisions Are Answered

Use these defaults to keep implementation moving if a decision has not been made yet:

- Create the native client under `native-ios/` in this repository.
- Use a separate native app setup and development bundle id.
- Preserve the Firebase backend contract, but do not require live Expo/native mixed-run compatibility for v1.
- Use MapKit for native map display and interaction.
- Use Apple Maps/MapKit routing for route generation, behind a provider abstraction.
- Include GPX import in the first native production milestone.
- Defer persistent garage, contacts, scheduled runs, and invites unless they are needed for create/join/live-drive parity.
- Treat physical-device background location testing as mandatory before TestFlight.

## Recommended Native Project Layout

Recommended directory:

```text
native-ios/
  ClubRunNative/
    ClubRunNative.xcodeproj/
    ClubRunNative/
      App/
      DesignSystem/
      Domain/
      Backend/
      Location/
      Mapping/
      Persistence/
      Features/
        Drive/
        CreateRun/
        JoinRun/
        RoutePlanner/
        LiveMap/
        Hazards/
        Summary/
        Settings/
      Resources/
      SupportingFiles/
    ClubRunNativeTests/
    ClubRunNativeUITests/
    TestSupport/
```

Use groups that mirror the filesystem. Keep feature code vertical, but keep domain models, backend clients, location tracking, mapping primitives, and design tokens shared.

## Target Architecture

### App Layer

Responsibilities:

- application entry point
- Firebase setup
- dependency container creation
- scene lifecycle handling
- deep link routing
- app-wide error presentation

Production requirements:

- Firebase initializes once.
- app launch works without network.
- app can restore enough local session state to resume an active run.
- app can distinguish development, emulator, staging, and production configuration.

### Domain Layer

Responsibilities:

- Swift models for backend data
- validation rules
- domain calculations
- route and location math
- summary calculations
- stable fixtures for tests

Core models:

- `Run`
- `RunStatus`
- `DriverProfile`
- `DriverRecord`
- `DriverLocation`
- `RouteData`
- `RouteStopDraft`
- `Hazard`
- `RunSummary`
- `TrackPoint`
- `UserProfile`
- `GarageCar`

Production requirements:

- Codable or explicit serialization tests prove compatibility with Firebase JSON.
- Optional fields match current TypeScript semantics.
- Numeric units are explicit in names or docs.
- Coordinates preserve `[lat, lng]` ordering to match the backend.
- Date/timestamp values use milliseconds since Unix epoch to match the current app.

### Backend Layer

Responsibilities:

- Firebase Auth wrapper
- Realtime Database wrapper
- typed references and paths
- atomic update helpers
- connectivity/error handling
- emulator connection support
- listener lifecycle management

Services:

- `AuthService`
- `RunRepository`
- `JoinCodeRepository`
- `DriverRepository`
- `RouteRepository`
- `HazardRepository`
- `TrackRepository`
- `SummaryRepository`
- `UserProfileRepository`

Production requirements:

- all database paths are centralized
- no view constructs raw Firebase paths
- listeners are removed deterministically
- writes surface user-actionable errors
- auth state is observable
- no backend call assumes the user is authenticated without enforcing it

### Location Layer

Responsibilities:

- Core Location authorization flow
- foreground updates
- background updates
- throttling
- distance filtering
- track point generation
- battery-aware accuracy policy
- permission diagnostics

Production requirements:

- use automotive-appropriate Core Location settings
- start location only during active run workflows
- stop location when no run is active or user leaves
- explicitly communicate background location usage
- handle reduced accuracy, denied permission, restricted permission, and global location disabled
- support app relaunch while an active run is in progress
- test on physical devices

### Mapping Layer

Responsibilities:

- MapKit view state
- camera state
- route polyline conversion
- driver annotation view models
- hazard annotation view models
- map fitting/bounds
- follow/free-pan behavior
- route planner map interaction
- Apple Maps route generation
- GPX parsing/import integration

Production requirements:

- map view models are testable without rendering MapKit
- route rendering works for empty, short, and large routes
- driver annotations remain readable over map content
- map controls do not obscure critical route information
- SwiftUI MapKit route editing limitations are validated before committing to final UX
- imported GPX routes use the same backend route shape as Apple Maps generated routes

### Persistence Layer

Responsibilities:

- saved driver profile
- current active session metadata
- recent run summaries if needed
- environment selection if needed

Recommended first implementation:

- `UserDefaults` for small non-sensitive preferences
- Keychain only if later adding non-anonymous credentials
- avoid SwiftData until a clear relational/local-query need exists

Production requirements:

- local data can be cleared from Settings
- stale active session state is invalidated safely
- no sensitive backend secrets are stored locally

### Design System Layer

Responsibilities:

- color roles
- typography roles
- spacing
- icon usage
- button styles
- glass surface rules
- map overlay control styles
- accessibility helpers

Production requirements:

- standard SwiftUI components first
- one primary action per screen
- no decorative glass-only surfaces
- dynamic type support
- Reduce Transparency, Increase Contrast, and Reduce Motion behavior verified
- touch targets meet iOS expectations

## Backend Compatibility Contract

The native app must read and write the following paths compatibly:

| Path | Native responsibility | Writer |
| --- | --- | --- |
| `/joinCodes/{code}` | resolve join code to run id | admin on run creation |
| `/runs/{runId}` | run root data | admin on create |
| `/runs/{runId}/status` | status transitions | admin only |
| `/runs/{runId}/startedAt` | route/session ready timestamp where retained | admin only |
| `/runs/{runId}/driveStartedAt` | active drive timestamp | admin only |
| `/runs/{runId}/endedAt` | ended timestamp | admin only |
| `/runs/{runId}/route` | route data | admin only |
| `/runs/{runId}/drivers/{uid}` | joined driver record | driver uid |
| `/runs/{runId}/drivers/{uid}/profile` | driver profile | driver uid |
| `/runs/{runId}/drivers/{uid}/location` | latest driver location | driver uid |
| `/runs/{runId}/drivers/{uid}/stats` | driver stats | driver uid or summary flow depending existing behavior |
| `/runs/{runId}/hazards/{hazardId}` | hazard reports | joined drivers/admin for dismiss |
| `/runs/{runId}/summary` | final summary | admin only |
| `/tracks/{runId}/{uid}/{pointId}` | track points | driver uid while active |
| `/users/{uid}` | persistent profile if used | same uid |
| `/garage/{uid}/{carId}` | persistent cars if used | same uid |
| `/contacts/{uid}/{otherUid}` | recent crew if used | same uid |
| `/userRuns/{uid}/{runId}` | scheduled/recent run metadata if used | same uid |
| `/runInvites/{uid}/{runId}` | invites if used | admin/invitee rules |

Compatibility test fixtures must include:

- minimal draft run
- ready run with route
- active run with two drivers
- ended run with summary
- driver with full optional profile fields
- driver with minimum required profile fields
- latest location
- track point
- hazard with `reportCount: 1`
- incremented hazard
- dismissed hazard
- route with stops
- imported GPX route
- route without optional duration
- scheduled/invited run if retained in the native scope

## Firebase Rules Test Strategy

Keep existing Firebase rules tests and add native-client-focused fixtures.

Required tests:

- anonymous user can create a draft run as admin
- anonymous user cannot create a run for another uid
- join code can be created only once
- unauthenticated user cannot read join codes
- driver can join by writing their own driver node
- driver cannot write another driver's node
- driver can write own location shape
- driver cannot write malformed location
- admin can write route
- non-admin cannot write route
- admin can transition `draft -> ready -> active -> ended`
- invalid status transitions are rejected
- driver can create hazard only after joining
- driver can increment valid existing hazard according to rules
- admin can dismiss hazard
- driver cannot dismiss hazard unless rules intentionally allow it
- track point writes only succeed while run is active
- ended run read behavior matches desired compatibility

## Testing Strategy

### Unit Tests

Use for:

- validation
- serialization
- path construction
- route math
- distance calculations
- throttling policy
- summary calculations
- stale driver classification
- hazard filtering and deduplication

### Integration Tests

Use for:

- Firebase Auth anonymous sign-in
- database emulator reads/writes
- repository writes
- realtime listener updates
- status transition flows
- offline/reconnect behavior where emulator can support it

### UI Tests

Use for:

- launch
- create run
- join run
- complete driver profile
- route planner shell
- live map shell
- hazard reporting sheet
- summary screen
- settings/permission education

UI tests should not attempt to prove background GPS reliability. Use manual physical-device checks for that.

### Manual Real-Device Tests

Required for:

- When In Use permission
- Always permission escalation
- precise vs reduced accuracy
- background location with app backgrounded
- background location with screen locked
- route tracking during drive simulation or real drive
- signal loss/reconnect
- battery impact smoke check
- map readability in daylight and dark mode

## Baseline Commands

Exact schemes will be created in Phase 0, but the implementation should support commands shaped like:

```bash
xcodebuild test \
  -project native-ios/ClubRunNative/ClubRunNative.xcodeproj \
  -scheme ClubRunNative \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro'
```

```bash
xcodebuild test \
  -project native-ios/ClubRunNative/ClubRunNative.xcodeproj \
  -scheme ClubRunNativeUITests \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro'
```

Existing backend verification should remain available:

```bash
npm run test:rules
```

```bash
npm run test:ci
```

## Build Phases and Red/Green Task Plan

### Phase 0: Project Foundation

Goal: create the native iOS project foundation without feature scope.

Red:

- Add a failing app launch test or smoke check.
- Add a failing test proving the app can load environment configuration.

Green:

- Create `native-ios/` project location.
- Add SwiftUI app entry.
- Add test target.
- Add UI test target.
- Add Firebase package dependencies.
- Add development Firebase config strategy.
- Add initial app icon/splash placeholders.
- Add basic app shell with one Drive screen.

Refactor:

- Establish folder/group conventions.
- Add shared test support target or folder.
- Document local setup.

Verify:

- app builds in Xcode
- unit tests run from command line
- UI launch test runs from command line
- no Expo runtime needed

Done:

- the native app can launch independently and has a repeatable test command.

### Phase 1: Domain Contract

Goal: make Swift data shape match the existing backend contract before UI work.

Red:

- Add failing serialization tests for every core backend model.
- Add failing validation tests for run creation, profile input, join code, route, location, hazard, and summary.
- Add failing fixture compatibility tests that compare Swift JSON output to committed JSON fixtures.

Green:

- Implement Swift models.
- Implement explicit Firebase encoding/decoding helpers where Codable is insufficient.
- Add timestamp helper using milliseconds.
- Add coordinate helpers preserving `[lat, lng]`.

Refactor:

- Split pure domain types from Firebase transport DTOs only if needed.
- Remove duplication in validation messages.

Verify:

- Swift fixtures match TypeScript/backend expectations.
- No UI code imports Firebase directly.

Done:

- domain data can round-trip to backend-compatible JSON.

### Phase 2: Firebase Foundation

Goal: establish authenticated backend access with testable repository boundaries.

Red:

- Add failing tests for anonymous sign-in.
- Add failing tests for database path construction.
- Add failing tests for run creation payload write.
- Add failing tests for join code lookup.
- Add failing listener lifecycle test using a fake or emulator-backed repository.

Green:

- Implement Firebase app configuration.
- Implement `AuthService`.
- Implement repository path layer.
- Implement emulator configuration.
- Implement typed error mapping.
- Implement listener registration/removal.

Refactor:

- Keep Firebase SDK types out of SwiftUI views.
- Centralize timeout/retry policy.

Verify:

- emulator-backed create/read smoke works.
- rules tests still pass.

Done:

- authenticated Firebase operations are available behind stable Swift protocols.

### Phase 3: App Navigation and Session State

Goal: define the shell and session orchestration before feature screens grow.

Red:

- Add failing tests for launch state with no active run.
- Add failing tests for active run restore.
- Add failing tests for deep link parsing.
- Add failing tests for role classification: admin vs driver.

Green:

- Implement app router/navigation state.
- Implement dependency container.
- Implement session store/coordinator.
- Implement deep link parser for `clubrun://join/{code}` and fallback URLs if retained.
- Implement active session persistence.

Refactor:

- Keep navigation decisions in coordinators, not views.
- Keep feature view models testable.

Verify:

- launch no-session path
- launch active-run path
- open join deep link in simulator

Done:

- the app can route to the right feature based on session and link state.

### Phase 4: Create Run

Goal: admin can create a draft run against Firebase.

Red:

- Add failing validation tests for name, description, max drivers.
- Add failing repository tests for unique join code generation and collision retry.
- Add failing UI test for create run form validation.

Green:

- Build Create Run SwiftUI form.
- Implement create run view model.
- Implement run creation repository call.
- Show loading, success, and error states.
- Navigate to route planner after success.

Refactor:

- Extract reusable form field components only when duplication appears.
- Keep one primary action.

Verify:

- create run in emulator
- inspect backend shape
- confirm rules pass

Done:

- native app creates backend-compatible draft runs.

### Phase 5: Join and Driver Profile

Goal: driver can join an existing run and persist a profile.

Red:

- Add failing tests for join code formatting and validation.
- Add failing tests for invalid join code handling.
- Add failing tests for profile validation.
- Add failing tests for local profile prefill.
- Add failing UI test for join code -> profile -> joined state.

Green:

- Build Join screen.
- Build Driver Profile form.
- Implement profile cache.
- Implement driver join write.
- Handle run full/ended cases if product rules require.

Refactor:

- Normalize fuel fields.
- Keep profile persistence independent from backend join write.

Verify:

- join native-created run
- confirm driver record shape

Done:

- native app can join compatible runs as a driver.

### Phase 6: MapKit Read-Only Live Map

Goal: render route, drivers, and hazards from backend state before adding tracking.

Red:

- Add failing tests for map view model with route only.
- Add failing tests for route bounds.
- Add failing tests for stale driver classification.
- Add failing tests for hazard filtering.

Green:

- Build full-screen MapKit live map.
- Render route polyline.
- Render local user placeholder.
- Render driver annotations.
- Render hazard annotations.
- Add fit-all and follow/free-pan view model behavior.

Refactor:

- Keep MapKit state conversion in Mapping layer.
- Avoid backend reads inside map views.

Verify:

- simulator renders non-empty map
- route line visible over multiple map styles
- annotations remain readable in light/dark mode

Done:

- active run state is readable on MapKit without tracking enabled.

### Phase 7: Foreground Location and Tracks

Goal: write current driver location and track points while the app is foregrounded.

Red:

- Add failing tests for location payload formatting.
- Add failing tests for throttling interval.
- Add failing tests for minimum movement/distance filtering.
- Add failing tests for track point id generation.

Green:

- Implement Core Location foreground session.
- Implement latest location writes.
- Implement track point writes while active.
- Show permission and tracking state in UI.
- Add pause/stop behavior when run ends.

Refactor:

- Separate raw Core Location updates from backend write policy.
- Make write policy testable with fake clocks and fake locations.

Verify:

- two-client foreground tracking
- track points written only while active

Done:

- foreground tracking works reliably and respects backend rules.

### Phase 8: Background Location

Goal: keep convoy tracking alive when the app is not foregrounded.

Red:

- Add a failing checklist item set before implementation begins.
- Add unit tests for background session state transitions.
- Add tests for restore-on-launch decision logic.

Green:

- Add background location capability.
- Add required `Info.plist` usage descriptions.
- Implement Always permission education.
- Implement background activity/session handling.
- Recreate required location services after background launch when an active run exists.
- Surface diagnostics for denied/restricted/reduced accuracy states.

Refactor:

- Keep user education copy clear and honest.
- Keep lifecycle handling out of view code.

Verify:

- physical device, app backgrounded
- physical device, screen locked
- physical device, temporary network loss
- physical device, app relaunched by system if applicable
- end run stops background location

Done:

- background tracking works on real hardware and is transparent to the user.

### Phase 9: Route Planner

Goal: admin can build and save a route using MapKit.

Red:

- Add failing tests for waypoint add/remove/reorder.
- Add failing tests for max waypoint enforcement.
- Add failing tests for route distance calculation.
- Add failing tests for Apple Maps routing request construction and route response normalization.
- Add failing GPX fixture tests for valid import, invalid XML, missing track data, metadata extraction, and oversized file rejection.
- Add failing tests for route save payload.

Green:

- Build route planner map.
- Add waypoint creation flow.
- Add Apple Maps route preview.
- Add GPX file import.
- Normalize drawn and imported routes into the same `RouteData` backend shape.
- Add save/start route action.
- Persist route to Firebase.
- Transition run to `ready` or active according to current backend rules.

Refactor:

- Validate SwiftUI MapKit editing quality.
- If needed, isolate any UIKit bridge to route planner internals.

Verify:

- create route with multiple waypoints
- edit route
- import representative GPX route
- save route
- confirm route renders on driver live map

Done:

- admins can create a route and drivers can consume it.

### Phase 10: Hazards

Goal: drivers can report and view hazards in realtime.

Red:

- Add failing tests for hazard creation payload.
- Add failing tests for stale hazard filtering.
- Add failing tests for report count increment behavior.
- Add failing tests for admin dismiss.
- Add failing UI test for hazard sheet.

Green:

- Build hazard report control.
- Build hazard selection sheet.
- Implement hazard repository create/increment.
- Implement undo if retained.
- Render hazards on MapKit.
- Implement admin dismiss if admin UI is present.

Refactor:

- Ensure hazard type names/icons are centralized.
- Keep reporting fast enough for driving context.

Verify:

- report hazard from one client and observe on another
- malformed hazard rejected by rules
- dismissed hazard disappears

Done:

- hazard workflow works in realtime and respects security rules.

### Phase 11: Run End and Summary

Goal: admin can end a run and all participants can view a shareable summary.

Red:

- Add failing tests for summary calculations.
- Add failing tests for fuel estimates.
- Add failing tests for hazard summary.
- Add failing tests for route preview generation.
- Add failing tests for admin-only end run behavior.

Green:

- Implement end run action.
- Generate summary from route/tracks/drivers/hazards.
- Write summary as admin.
- Navigate participants to summary when status becomes ended.
- Build native Summary screen.
- Add native share action.

Refactor:

- Keep summary computation pure and fixture-driven.
- Separate share rendering from calculation.

Verify:

- end multi-driver run
- participants see summary
- share sheet works
- ended run no longer writes location

Done:

- completed run lifecycle is production viable.

### Phase 12: Settings, Diagnostics, and Recovery

Goal: give users and developers enough visibility to diagnose production issues.

Red:

- Add failing tests for diagnostics view model.
- Add failing tests for clear local profile/session.
- Add failing tests for permission state labels.

Green:

- Build Settings screen.
- Show Firebase mode/project/auth uid.
- Show location permission and accuracy state.
- Add clear saved profile.
- Add leave current run if allowed.
- Add basic support/debug information.

Refactor:

- Keep diagnostics concise.
- Hide developer-only information in release if needed.

Verify:

- diagnostics reflect live state
- clearing local state works
- permission changes update after returning from Settings app

Done:

- support/debug workflows are possible without attaching a debugger.

### Phase 13: Liquid Glass and Accessibility Pass

Goal: apply final visual polish after core flows work.

Red:

- Add accessibility review checklist for every primary screen.
- Add snapshot or manual screenshot checklist for light/dark and transparency settings.

Green:

- Adopt system-provided Liquid Glass through standard SwiftUI components.
- Apply custom `glassEffect` only to map workflow controls that benefit from it.
- Tune typography and spacing.
- Tune map overlay placement.
- Add VoiceOver labels and traits.
- Add Dynamic Type behavior.
- Add Reduce Motion alternatives.

Refactor:

- Remove decorative surfaces.
- Simplify screens that have too many competing controls.

Verify:

- VoiceOver pass
- Dynamic Type pass
- Reduce Transparency pass
- Increase Contrast pass
- Dark Mode pass
- outdoor/daylight readability pass if possible

Done:

- the app feels native, readable, and accessible instead of merely styled.

### Phase 14: Release Hardening

Goal: prepare for TestFlight or production release.

Red:

- Add release checklist with blocking gates.
- Add privacy checklist.
- Add crash/logging decision.

Green:

- Configure signing.
- Configure app display name and icons.
- Configure privacy manifest and permission strings.
- Configure build settings.
- Add CI or documented local release process.
- Add TestFlight notes.

Refactor:

- Remove debug-only UI from release builds.
- Audit logs for sensitive data.

Verify:

- clean archive
- install on physical device
- TestFlight build if account is ready
- production Firebase smoke test with controlled run

Done:

- native app is ready for controlled external testing.

## MapKit Validation Plan

Validate these before building too much UI around assumptions:

- Can SwiftUI `Map` support the desired tap-to-add waypoint flow cleanly?
- Can selected annotations and custom controls remain stable while map camera changes?
- Can route overlays remain visually clear in standard, muted, hybrid, and dark map appearances?
- Can driver annotations avoid excessive overlap with 10 to 15 drivers?
- Is a UIKit `MKMapView` bridge needed for route planner editing only?
- Does MapKit place search satisfy route planning needs, or is another search/routing provider needed?
- Does Apple Maps route generation produce backend route geometry with enough fidelity for convoy use?
- Can GPX import produce the same route preview and save behavior as Apple Maps generated routes?

Initial recommendation:

- Use MapKit for display and interaction.
- Use Apple Maps routing for generated routes.
- Keep routing provider implementation behind a service abstraction.
- Do not bind the backend route format to MapKit-specific types.

## Background Location Production Checklist

Before background tracking is considered production-grade:

- `UIBackgroundModes` includes `location`.
- When In Use permission flow is clear.
- Always permission escalation is clear and contextual.
- permission copy explains convoy sharing in plain language.
- app starts background tracking only during active runs.
- app stops background tracking when run ends or user leaves.
- app handles denied permission.
- app handles restricted permission.
- app handles approximate/reduced accuracy.
- app handles global location services disabled.
- app handles network unavailable while locations continue.
- app queues or retries writes responsibly.
- app does not create unbounded track writes.
- app can restore active tracking state after relaunch when appropriate.
- app shows a user-visible indicator/diagnostic for active tracking.
- real-device locked-screen test passes.
- real-device backgrounded-app test passes.
- real-device end-run-stops-tracking test passes.

## Liquid Glass Implementation Rules

Use system components first:

- `NavigationStack`
- `TabView`
- toolbars
- sheets
- menus
- forms
- buttons
- segmented controls

Use custom glass only for:

- compact map control cluster
- hazard report control
- active run status capsule
- follow/free-pan control
- route planner action surface

Do not use custom glass for:

- large text-heavy forms
- every repeated row
- summary statistic cards by default
- decorative background panels
- content that must stay readable over detailed maps

Accessibility fallback:

- every glass surface must remain legible with Reduce Transparency enabled.
- do not encode state only through blur, transparency, or tint.

## Production Quality Gates

No phase is done unless:

- Red test/check exists first.
- Green implementation is minimal and direct.
- Refactor pass removed accidental complexity.
- Verification command/check is recorded in the workstream or PR.
- Firebase rules still pass when backend paths are touched.
- no backend rules or shared backend contract changes are made accidentally.
- no destructive changes are made without approval.

Release candidate gates:

- all unit tests pass
- all backend rules tests pass
- critical UI tests pass
- manual physical-device background location matrix passes
- accessibility checklist passes
- no known P0/P1 bugs
- privacy strings reviewed
- Firebase project/environment reviewed
- TestFlight archive succeeds

## Documentation To Add During Implementation

Add or update docs as implementation progresses:

- `native-ios/README.md`
- native local setup
- Firebase environment setup
- emulator setup
- app architecture overview
- backend compatibility fixtures
- manual background location test protocol
- release checklist
- troubleshooting guide

## Questions To Resolve With Product/Owner

1. Are persistent user profiles, garage cars, contacts, scheduled runs, and invites in scope for v1 native?
2. What physical devices are available for background location testing?
3. Should analytics/crash reporting be added before TestFlight?
4. What is the minimum acceptable feature set for the first TestFlight build?

Resolved:

- Target only the latest Liquid Glass-capable iOS version.
- Create a separate native iOS setup.
- Do not require live Expo/native mixed-run compatibility for v1.
- Use Apple Maps/MapKit routing for route generation.
- Include GPX import in the first native production milestone.

## Recommended First Implementation Slice

The first implementation slice should be intentionally small:

1. Create native project foundation.
2. Add test target and command-line test support.
3. Add Swift domain models for `Run`, `DriverProfile`, `RouteData`, `Hazard`, and `DriverLocation`.
4. Add JSON fixtures matching current backend shape.
5. Add Firebase anonymous auth and emulator-backed run read/write.
6. Add a minimal Drive screen showing authenticated uid and backend mode.

This slice proves the native app can stand up independently and talk to the backend correctly before any expensive UI or MapKit work begins.

## Official References

- Apple Liquid Glass overview: https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass
- Apple Adopting Liquid Glass: https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass
- SwiftUI `glassEffect`: https://developer.apple.com/documentation/swiftui/view/glasseffect%28_%3Ain%3A%29
- MapKit for SwiftUI: https://developer.apple.com/documentation/mapkit/mapkit-for-swiftui
- Core Location: https://developer.apple.com/documentation/corelocation
- Apple background location updates: https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background
- Firebase Apple setup: https://firebase.google.com/docs/ios/setup
- Firebase Apple installation methods: https://firebase.google.com/docs/ios/installation-methods
- Firebase Anonymous Auth on Apple platforms: https://firebase.google.com/docs/auth/ios/anonymous-auth
- Firebase Realtime Database on Apple platforms: https://firebase.google.com/docs/database/ios/start
