# Native iOS Backend-Compatible App Workstream

## Status

Active investigation and new-app planning.

## Goal

Create a new fully native iOS app for ClubRun using SwiftUI components, Apple platform services, and the Liquid Glass design language. This is a new iOS client with a separate native setup that uses the same Firebase backend contract as the existing Expo/React Native app.

The current Expo app remains the existing cross-platform client. The native iOS app should be developed as a separate client against the same backend. The first native milestone does not need to support live mixed Expo/native participants in the same run.

## Product Direction

ClubRun should feel like a native Apple driving companion, not a cross-platform shell. The live drive map is the main experience, with navigation, controls, route tools, hazard reporting, and run status layered over map content using native SwiftUI controls and selective Liquid Glass surfaces.

The app should prioritize:

- fast create/join flow for real car club runs
- reliable live location sharing
- route clarity while driving
- low-friction hazard reporting
- transparent background location behavior
- shareable post-run summaries

## Core Technical Decisions

### Native App Platform

Build a new SwiftUI iOS app target/project. Treat it as a new app client, not as an incremental port of the Expo UI.

Use SwiftUI as the primary UI framework. UIKit should only be used where Apple frameworks require it or where SwiftUI has a clear platform gap.

### Maps

Use MapKit for the native iOS app.

This intentionally chooses MapKit for the new native iOS client instead of carrying forward the current MapLibre-based map layer. MapKit better matches the Apple-native aesthetic, supports SwiftUI map composition, and visually fits the Liquid Glass direction better than the current cross-platform map stack.

Expected MapKit usage:

- `Map` for the full-screen map surface
- `MapPolyline` for planned routes and completed tracks
- `Annotation` or `Marker` for drivers and hazards
- `UserAnnotation` for the local driver
- native map controls where appropriate
- Apple Maps/MapKit routing for generated routes
- custom SwiftUI annotations for driver initials, stale status, and hazard icons

Open question: waypoint drag/edit behavior may need validation in SwiftUI MapKit. If SwiftUI-only interactions are too limited, use a minimal UIKit bridge for the route planner only, while keeping user-facing components SwiftUI.

### Backend

Keep Firebase as the backend.

Use the Firebase Apple SDK through Swift Package Manager:

- Firebase Auth for anonymous sign-in
- Firebase Realtime Database for runs, join codes, drivers, locations, hazards, routes, and summaries

The current Firebase schema should be treated as the compatibility contract between clients. The native app should be able to interoperate with existing runs unless a deliberate backend schema migration is planned.

### Location

Use Core Location directly.

The native app should support:

- foreground location tracking during active runs
- background location updates while a run is active
- automotive-oriented accuracy and power behavior
- explicit user-facing permission education
- recovery after app suspension or relaunch

The existing Expo location behavior should be used as product reference, not as implementation reference.

### Local State

Use Swift-native state management:

- `Observable` models or equivalent SwiftUI-native observable state
- actors or main-actor services for async Firebase/location coordination
- local persistence with `UserDefaults`, SwiftData, or file storage depending on data shape

Avoid copying Zustand concepts directly into Swift. Preserve the domain behavior, not the JavaScript architecture.

### Testing

Follow Red -> Green -> Refactor -> Verify.

Native test layers:

- Swift Testing or XCTest for domain logic
- Firebase emulator or isolated test project strategy for backend integration
- focused UI tests for create/join/map-critical flows
- real-device smoke tests for background location

No feature is complete until the failing test/check exists first.

## Liquid Glass Design Direction

Liquid Glass should support the driving experience, not become decoration.

Use system-provided Liquid Glass by default through native controls:

- navigation bars
- tab bars
- toolbars
- sheets
- menus
- buttons
- segmented controls

Use custom glass sparingly for high-value controls:

- map action cluster
- hazard report control
- follow/free-pan control
- route planning tools
- active run status capsule

Avoid:

- applying glass to every card
- decorative glass panels that obscure the map
- custom backgrounds that fight system materials
- dense translucent text surfaces over visually busy map areas
- relying on glass effects where accessibility settings may reduce transparency

Every screen must remain readable with Reduce Transparency, Increase Contrast, Dark Mode, and Reduce Motion enabled.

## Target Native Information Architecture

### Home / Drive

Primary purpose: get the user into a run.

Content:

- current or recent run state
- create run action
- join run action
- active run resume action
- Firebase/location diagnostics when needed

### Create Run

Primary purpose: create a draft run quickly.

Content:

- run name
- optional description
- max driver setting if still needed
- create action

After creation, route planning becomes the next step.

### Route Planner

Primary purpose: define and start a route.

Content:

- full-screen MapKit map
- waypoint actions
- route preview
- distance/estimated duration
- save/start action
- GPX import support

Use a sheet or bottom accessory for waypoint details rather than permanent heavy panels.

### Join Run

Primary purpose: resolve a join code and capture driver profile.

Content:

- six-digit code entry
- deep link prefill
- profile form
- saved local profile prefill
- join action

### Live Map

Primary purpose: safely understand the convoy while driving.

Content:

- full-screen map
- route polyline
- local driver
- other drivers
- stale/offline driver state
- hazards
- follow/free-pan
- fit all
- report hazard
- run status

The map is the content. Chrome should stay minimal and contextual.

### Summary

Primary purpose: make the completed run easy to understand and share.

Content:

- run stats
- route snapshot
- driver highlights
- hazards encountered
- fuel/efficiency estimates where available
- native share action

## Build Phases

### Phase 0: Native App Foundation

Red:

- Add a native app boot test/check that expects the SwiftUI app shell to launch.

Green:

- Create the native iOS project/target.
- Configure bundle identifier, app icon placeholders, privacy strings, background modes, and Firebase config loading.

Verify:

- Build and launch on iOS Simulator.
- Confirm the native app starts independently from the React Native or Expo runtime.

### Phase 1: Domain Model Parity

Red:

- Add tests for Swift equivalents of `Run`, `RunStatus`, `DriverProfile`, `RouteData`, `Hazard`, `RunSummary`, and location payloads.

Green:

- Implement Swift domain models and Firebase serialization.
- Create fixtures that mirror the existing TypeScript tests.

Verify:

- Confirm Swift payloads match current Firebase data shape.

### Phase 2: Firebase Auth and Database

Red:

- Add tests/checks for anonymous auth, database initialization, join code read, and run read/write.

Green:

- Implement Firebase bootstrap, auth service, and database client.
- Preserve timeout/error handling behavior from the current app.

Verify:

- Run against emulator or controlled Firebase test environment.

### Phase 3: Create and Join Flow

Red:

- Add tests for run draft validation, join code validation, profile validation, and successful join persistence.

Green:

- Build SwiftUI create, join, and profile flows.
- Persist local profile prefill.

Verify:

- Create a run and join it from the native app.
- Confirm the written data still follows the shared Firebase backend contract.

### Phase 4: MapKit Route Rendering

Red:

- Add tests for route coordinate conversion, bounds calculation, route serialization, and map view model state.

Green:

- Render planned routes with MapKit.
- Render driver and hazard annotations from test data.

Verify:

- Use simulator previews and device/simulator checks for route visibility and annotation clarity.

### Phase 5: Route Planning

Red:

- Add tests for waypoint creation, ordering, max waypoint limits, route request formatting, and route persistence.

Green:

- Build route planner around MapKit.
- Validate SwiftUI-only waypoint interaction quality.
- Add a minimal UIKit bridge only if SwiftUI MapKit cannot support required editing ergonomics.

Verify:

- Create and save a route from the native app.
- Confirm route data remains compatible with current Firebase rules and services.

### Phase 6: Live Tracking

Red:

- Add tests for location throttling, payload formatting, stale driver detection, and subscription updates.

Green:

- Implement Core Location foreground tracking.
- Implement Firebase driver location writes.
- Subscribe to driver roster/location updates.

Verify:

- Test with two clients and confirm live marker updates.

### Phase 7: Background Location

Red:

- Add explicit manual verification checklist before implementation is considered complete.

Green:

- Add background location capability and lifecycle handling.
- Recreate required location sessions after relaunch where appropriate.
- Add clear permission education.

Verify:

- Real-device test with screen locked.
- Real-device test with app backgrounded.
- Real-device test after temporary signal loss.

### Phase 8: Hazards

Red:

- Add tests for hazard creation, deduplication rules if retained, stale filtering, and realtime subscription updates.

Green:

- Build native hazard reporting UI.
- Render hazards on MapKit.
- Add undo affordance if retained from the product spec.

Verify:

- Report hazards from one client and observe them on another.

### Phase 9: Summary and Sharing

Red:

- Add tests for summary calculations and share payload generation.

Green:

- Port summary service behavior.
- Build native SwiftUI summary view.
- Use native share APIs.

Verify:

- End a run and view/share the summary.

### Phase 10: Liquid Glass Polish and Accessibility

Red:

- Add UI/accessibility review checklist for every primary screen.

Green:

- Apply system-native Liquid Glass through standard SwiftUI components.
- Add custom glass only where it improves the map workflow.
- Tune typography, contrast, touch targets, and motion.

Verify:

- Test Light Mode, Dark Mode, Reduce Transparency, Increase Contrast, Dynamic Type, and Reduce Motion.
- Confirm controls remain readable over map content.

## Backend Compatibility Checklist

The native app must preserve backend compatibility for:

- `/runs/{runId}`
- `/joinCodes/{joinCode}`
- `/runs/{runId}/drivers/{driverId}`
- `/runs/{runId}/drivers/{driverId}/profile`
- `/runs/{runId}/drivers/{driverId}/location`
- `/runs/{runId}/route`
- `/runs/{runId}/hazards/{hazardId}`
- `/runs/{runId}/summary`
- admin-only status transitions
- driver ownership rules
- no global run listing

Any backend schema change requires:

- backend migration plan
- Firebase rules update
- emulator-backed rule tests
- explicit decision on how the separate Expo client is affected

## Key Risks

### iOS Version Target

Full Liquid Glass adoption requires targeting the latest Liquid Glass-capable iOS version. This native app should target only that latest platform for v1 rather than dilute the design with older-material fallbacks.

### MapKit Feature Parity

MapKit fits the native aesthetic better than MapLibre, but route editing interactions must be validated. Rendering routes and annotations is straightforward; rich waypoint editing may require extra work.

Decision needed: accept SwiftUI MapKit constraints, or allow a narrow UIKit map bridge for route planning.

### Background Location Reliability

Simulator testing is insufficient. Background location must be validated on physical devices because iOS can suspend or relaunch apps depending on state, permissions, and power conditions.

Decision needed: define the physical-device test matrix.

### Dual-Client Maintenance

Running Expo and native iOS in parallel increases maintenance. This is acceptable while the native client is being built, but should not become permanent without a clear reason.

Decision: build as a separate native iOS setup. Whether it eventually supersedes Expo on iOS remains a later product/release decision.

## Acceptance Criteria

The native iOS app is viable as a backend-compatible production client when:

- users can create a run
- users can join with a code or deep link
- drivers can complete a profile
- admins can plan and start a route
- all drivers can view the live MapKit route
- driver locations update in realtime
- background tracking works on real devices
- hazards sync between clients
- admins can end a run
- summaries are generated and shareable
- Firebase rules remain enforced
- key flows have Red/Green tests
- primary screens pass Liquid Glass and accessibility review

## Immediate Next Steps

1. Create the separate native iOS setup under the chosen repo location.
2. Target only the latest Liquid Glass-capable iOS version.
3. Use Apple Maps/MapKit routing for generated routes.
4. Include GPX import in the native production milestone.
5. Start with domain model parity and Firebase compatibility tests before building UI.
