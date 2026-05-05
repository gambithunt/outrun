# Native iOS Implementation Prompt Pack

Status: Active
Created: 2026-05-05
Companion plan: [Native iOS Implementation Phases](native-ios-implementation-phases.md)
Product flow source: [Native iOS App Flow Spec](native-ios-app-flow-spec.md)

## How To Use This File

Copy one prompt at a time into an implementation agent.

Each prompt is intentionally scoped to one phase. Do not ask an agent to jump ahead unless the previous phase is complete and verified.

Each agent should:

- read the referenced workstreams first
- follow `AGENTS.md`
- use Red -> Green -> Refactor -> Verify
- avoid destructive changes
- keep SwiftUI views free of raw Firebase SDK calls
- centralize Firebase paths
- summarize changed files and verification results

---

## Prompt 0: Reconcile Foundation And Configuration

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- `docs/workstreams/active/native-ios-production-implementation-plan.md`

Goal:

Complete Phase 0 from `native-ios-implementation-phases.md`: reconcile the existing native iOS foundation and configuration.

Important context:

- The native app already exists under `native-ios/ClubRunNative/`.
- Firebase Apple SDK is linked to the native target.
- `GoogleService-Info.plist` was added.
- Firebase auth and Realtime Database emulator smoke have worked.
- There may be a duplicate plist and an accidental Firebase package reference in the old Expo `ios/` project. Do not remove either without clearly identifying and explaining it.

Tasks:

1. Inspect the native Xcode project, Firebase package products, plist references, and current app bootstrap.
2. Add or update tests proving Firebase configuration happens once at app startup where practical.
3. Add or update tests proving the app environment exposes auth mode, database mode, and current authenticated user state.
4. Ensure Firebase bootstrap is centralized.
5. Ensure database emulator configuration remains available.
6. Isolate debug diagnostics so they can later be hidden from production.
7. Do not make destructive changes to the old Expo app.

Verification:

- Run native Swift typecheck if full `xcodebuild` is blocked.
- Run native `xcodebuild build` if possible.
- Run native unit/UI tests if possible.
- If verification is blocked by sandbox/Xcode permissions, state the exact blocker and provide the local command to run.

When done:

- Summarize files changed.
- List verification commands and results.
- Call out any cleanup decisions still needed.

### END PROMPT

---

## Prompt 1: Domain Models And Backend Contract Upgrade

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- existing Swift domain/backend files under `native-ios/ClubRunNative/ClubRunNative/`
- existing native tests under `native-ios/ClubRunNative/ClubRunNativeTests/`
- `database.rules.json`
- `types/domain.ts` if present

Goal:

Complete Phase 1 from `native-ios-implementation-phases.md`: update Swift domain/backend models to support the full native iOS flow spec.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add failing tests first for:
   - `UserProfile`
   - generated badge fields
   - run states: `draft`, `ready`, `active`, `ended`
   - `JoinCodeRecord`
   - `DriverRecord` with profile snapshot, presence, and finish state
   - latest location and track point payloads
   - route data with `apple_maps` and `gpx`
   - route stops: start, waypoint, destination
   - hazards: pothole, roadworks, police, mobile camera, debris, broken-down car
   - hazard confidence/expiry/confirmation-ready fields
   - group summary and personal summary payloads
2. Implement the minimum Swift models and codable support to pass those tests.
3. Keep backend JSON shapes compatible with Firebase rules unless intentionally updating rules.
4. Split model files only if the current model file becomes too large or unclear.

Verification:

- Run native unit tests.
- Run Swift typecheck if Xcode test is blocked.
- Run `npm run test:rules` only if rules/backend contract changed.

When done:

- Summarize model changes.
- Summarize fixture/test coverage.
- Identify any backend rules/schema decisions still open.

### END PROMPT

---

## Prompt 2: Email/Password Auth And User Profile

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current native app/bootstrap/auth/backend code

Goal:

Complete Phase 2 from `native-ios-implementation-phases.md`: implement email/password auth, password reset, and required user profile.

Product decisions:

- Use email/password auth for v1.
- Do not use Sign in with Apple in v1.
- Required profile fields: display name, car make, car model.
- Generate badge color/text for v1.
- Password reset requires email.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add failing tests for registration validation.
2. Add failing tests for login validation.
3. Add failing tests for password reset validation.
4. Add failing tests for profile validation.
5. Add failing tests for badge generation.
6. Add failing tests for writing and reading `/users/{uid}`.
7. Extend auth service protocol for:
   - register
   - login
   - reset password
   - sign out
   - current user/session state
8. Add `UserProfileRepository`.
9. Build Auth Gate view model.
10. Build Login screen.
11. Build Register screen.
12. Build Forgot Password screen.
13. Build Profile Setup/Edit Profile form.
14. Cache profile locally for fast launch while keeping backend as source of truth.

Constraints:

- SwiftUI views must not call Firebase SDK directly.
- Keep validation pure and testable.
- Keep errors user-actionable.

Verification:

- Register and login against emulator or controlled Firebase project if available.
- Verify password reset flow as far as the environment allows.
- Run unit/UI tests.
- Run Swift typecheck if Xcode is blocked.

When done:

- Summarize auth/profile files changed.
- List verification commands and results.
- Call out Firebase Console/Auth configuration requirements.

### END PROMPT

---

## Prompt 3: Home Hub And Session Restore

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- native auth/profile code from Phase 2

Goal:

Complete Phase 3: build the post-login Home Hub and active-session restore behavior.

Product decisions:

- Home Hub shows identity row, Create Run, Join Run, and active run card if available.
- Identity row shows display name, generated badge, car make/model.
- Active run card shows run name/status and opens directly when tapped.
- Do not label active run card as "Resume" unless needed later.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add failing tests for Home Hub view model with no active run.
2. Add failing tests for Home Hub with active run card.
3. Add failing tests for role classification: admin vs driver.
4. Add failing tests for stored active run validation.
5. Add UI test proving Create Run and Join Run are visible after login/profile.
6. Implement app router/navigation state.
7. Implement Home Hub screen.
8. Add Create Run navigation.
9. Add Join Run navigation.
10. Add active run card navigation.
11. Add settings/profile entry.
12. Persist active session metadata locally.

Constraints:

- Keep navigation decisions in coordinator/router code, not scattered in views.
- Keep Home Hub operational and uncluttered.

Verification:

- Launch as signed-in profile-complete user.
- Create Run opens create flow.
- Join Run opens code entry.
- Active run card opens correct run screen.
- Run unit/UI tests where possible.

When done:

- Summarize changed files.
- List verification commands and results.
- Call out any navigation decisions still open.

### END PROMPT

---

## Prompt 4: Create Run Flow

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current run creation/backend repository code

Goal:

Complete Phase 4: implement the real Create Run flow.

Product decisions:

- Create Run asks only for run name and optional short description.
- Deeper setup belongs in the admin lobby after the run exists.
- Default max drivers to 15.
- New run starts as `draft`.
- Generate a unique six-digit join code.
- Write `/runs/{runId}` and `/joinCodes/{joinCode}`.
- Navigate to Admin Lobby after success.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add failing validation tests for run name and description.
2. Add failing tests for join-code collision retry.
3. Add failing tests for create-run payload.
4. Add failing tests for create-run failure states.
5. Add failing UI test for create-run form validation.
6. Build Create Run sheet or compact full-screen form.
7. Implement Create Run view model.
8. Implement repository/service write flow.
9. Store active session as admin.
10. Navigate to Admin Lobby.
11. Show loading and recoverable errors.

Constraints:

- No route fields in Create Run.
- No Firebase SDK calls in views.

Verification:

- Create run against emulator.
- Inspect `/runs/{runId}` and `/joinCodes/{joinCode}`.
- Confirm Admin Lobby opens.
- Run rules tests if backend rules changed.

When done:

- Summarize changes.
- List verification results.
- Include any backend shape examples if useful.

### END PROMPT

---

## Prompt 5: Join Run Flow

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current profile/session/run repository code

Goal:

Complete Phase 5: implement Join Run with six-digit code resolution and driver profile snapshot.

Product decisions:

- Join Run is a full code-entry screen.
- Code entry should be large, focused, fast, and paste-friendly.
- Once code resolves, show the run name.
- Write driver record under `/runs/{runId}/drivers/{uid}`.
- Drivers can revisit lobby/route details after joining.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add failing tests for code formatting/normalization.
2. Add failing tests for paste normalization.
3. Add failing tests for invalid/missing code.
4. Add failing tests for ended run handling.
5. Add failing tests for driver profile snapshot payload.
6. Add failing tests for post-join routing.
7. Build Join Run screen.
8. Resolve `/joinCodes/{joinCode}`.
9. Read `/runs/{runId}`.
10. Show run name after resolve.
11. Write driver record with profile snapshot.
12. Store active session as driver.
13. Route to Driver Lobby or Live Drive based on run status.

Verification:

- Join a native-created run.
- Confirm driver record shape.
- Invalid code shows useful error.
- Run unit/UI tests where possible.

When done:

- Summarize files changed.
- List verification commands and results.
- Call out any run-full/ended policy decisions.

### END PROMPT

---

## Prompt 6: Admin Lobby And Driver Lobby

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current create/join/session code

Goal:

Complete Phase 6: build role-specific Admin and Driver lobbies.

Product decisions:

- Admin lobby is a compact hub, not one overloaded screen.
- Header has run name, join code, share/copy, start button, readiness label.
- Route row shows not-set or route summary.
- Drivers row opens Drivers sheet.
- Driver lobby is simpler and has no admin setup controls.
- No explicit driver ready toggle in v1; presence/currently waiting is enough.
- Admin can start solo with confirmation if no other drivers are waiting.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add failing tests for admin lobby no-route state.
2. Add failing tests for route-ready state.
3. Add failing tests for start readiness labels.
4. Add failing tests for solo-start confirmation.
5. Add failing tests for driver count/waiting summary.
6. Add failing tests for stale/offline/current driver classification.
7. Add UI tests for admin controls.
8. Add UI tests proving driver does not see admin controls.
9. Build Admin Lobby screen.
10. Build Driver Lobby screen.
11. Build Drivers sheet.
12. Add share/copy join code.
13. Add route row navigation.
14. Add start-drive action and status transition once route exists.
15. Add lobby presence updates.

Verification:

- Admin sees setup controls.
- Driver sees no admin controls.
- Driver sheet updates with joined drivers.
- Start disabled without route.
- Solo-start confirmation appears when appropriate.

When done:

- Summarize UI/backend changes.
- List verification commands and results.
- Call out any rules changes required for admin remove/presence.

### END PROMPT

---

## Prompt 7: Route Setup With MapKit And Apple Maps Routing

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current route/domain/backend code

Goal:

Complete Phase 7: implement primary route setup using MapKit and Apple Maps generated driving routes.

Product decisions:

- Primary route creation method is start + destination + optional waypoints.
- Admin can add stops by search, current location, or pin drop.
- Waypoints can be reordered with drag handles.
- Route recalculates when stops change.
- Map should be the largest element.
- Bottom editor panel contains route controls.
- Save route writes points, distance, duration, source, and stops.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add failing tests for route stop validation.
2. Add failing tests for start/destination required.
3. Add failing tests for waypoint add/remove/reorder.
4. Add failing tests for route recalculation triggers.
5. Add failing tests for MapKit route request construction.
6. Add failing tests for route response normalization.
7. Add failing tests for route save payload.
8. Build Route Setup full-screen map.
9. Add bottom route editor panel.
10. Add start/waypoint/destination rows.
11. Add search flow.
12. Add current location option.
13. Add pin-drop/move-pin flow.
14. Add drag reorder.
15. Render route polyline and summary.
16. Save route to Firebase.
17. Transition run to ready.
18. Return to Admin Lobby.

Constraints:

- Keep MapKit types out of Firebase models.
- Keep route provider behind protocol.
- Validate whether SwiftUI Map is enough; use UIKit bridge only if necessary and contained.

Verification:

- Create route with start/destination.
- Add and reorder waypoint.
- Route updates.
- Save route.
- Lobby summary updates.
- Driver can view route details.

When done:

- Summarize route architecture.
- List verification results.
- Call out MapKit limitations or UIKit bridge decisions.

### END PROMPT

---

## Prompt 8: GPX Import

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current route setup code

Goal:

Complete Phase 8: implement GPX import as the secondary route creation method.

Product decisions:

- GPX import is secondary and visually minimal.
- GPX is preview-and-save only in v1.
- No GPX editing in v1.
- GPX saves into the same backend `RouteData` shape as Apple Maps routes.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add GPX fixtures.
2. Add failing parser tests for valid GPX.
3. Add failing parser tests for invalid XML.
4. Add failing tests for missing track points.
5. Add failing tests for oversized file rejection.
6. Add failing tests for distance calculation.
7. Add failing tests for `source: gpx` save payload.
8. Add secondary GPX import affordance.
9. Use document picker.
10. Parse GPX.
11. Preview imported route on map.
12. Save or discard.
13. Persist route.

Verification:

- Import representative GPX.
- Preview route.
- Save route.
- Lobby shows GPX route summary.
- Live map renders GPX route.

When done:

- Summarize parser and UI changes.
- List verification results.
- Call out GPX size/format limits.

### END PROMPT

---

## Prompt 9: Live Drive Map Shell

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current MapKit/route/lobby code

Goal:

Complete Phase 9: build the Live Drive map shell before full tracking complexity.

Product decisions:

- Live Drive is map-first.
- Top status overlay shows run name/status and next waypoint/distance.
- Hazard button sits bottom-right.
- Driver markers use generated badge/color.
- Do not show live speed for other drivers.
- Hazard markers appear at reported route/location.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add failing tests for route map state.
2. Add failing tests for driver marker models.
3. Add failing tests for stale/offline/current states.
4. Add failing tests for hazard marker models.
5. Add failing tests for top status overlay text.
6. Add failing tests for next waypoint/distance label.
7. Build full-screen Live Drive screen.
8. Render route polyline.
9. Render own location marker.
10. Render driver markers.
11. Render hazard markers.
12. Add top status overlay.
13. Add bottom controls.
14. Add bottom-right hazard button.
15. Add admin end-drive control placeholder.
16. Add driver marker tap details.

Verification:

- Simulator map renders nonblank.
- Route line visible.
- Markers readable.
- Hazard marker visible.
- Controls do not obscure critical route.
- Light/dark mode readable.

When done:

- Summarize map shell changes.
- Include screenshots if possible.
- List verification commands and results.

### END PROMPT

---

## Prompt 10: Foreground Location, Presence, And Tracks

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current Live Drive and backend code

Goal:

Complete Phase 10: implement foreground location, presence, and track writes.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add failing tests for latest location payload.
2. Add failing tests for track point payload.
3. Add failing tests for timestamp milliseconds.
4. Add failing tests for throttling.
5. Add failing tests for movement filtering.
6. Add failing tests for presence updates.
7. Add failing tests for stopping writes after finish/leave/end.
8. Implement Core Location foreground service.
9. Request permissions with clear UI state.
10. Implement throttle/write policy.
11. Write latest location.
12. Write track points while active.
13. Update presence.
14. Stop updates when leaving/finishing.
15. Surface denied/restricted/reduced accuracy states.

Constraints:

- Separate raw Core Location from backend write policy.
- Avoid unbounded writes.
- Do not begin background location work in this phase.

Verification:

- Foreground tracking works.
- Latest location writes.
- Track points write only while active.
- End/leave stops writes.

When done:

- Summarize location architecture.
- List verification results.
- Call out physical-device checks still required.

### END PROMPT

---

## Prompt 11: Background Location

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current foreground location code

Goal:

Complete Phase 11: implement background location safely and transparently.

Important:

This phase cannot be considered done without physical-device testing.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add tests for active-run background eligibility.
2. Add tests for restore-after-launch logic.
3. Add tests for permission state labels.
4. Add manual physical-device checklist before implementing.
5. Add background location capability.
6. Add required `Info.plist` usage descriptions.
7. Add When In Use permission education.
8. Add Always permission escalation when needed.
9. Restore location session after relaunch if active run exists.
10. Continue responsible writes in background.
11. Stop background location on finish/leave/admin end.
12. Add diagnostics for active background tracking.

Verification:

- Physical device foreground.
- Physical device app backgrounded.
- Physical device screen locked.
- Physical device network interruption.
- End run stops tracking.
- Battery smoke check.

When done:

- Summarize implementation.
- Include physical-device results.
- List any limitations or risks.

### END PROMPT

---

## Prompt 12: Hazard Reporting

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current Live Drive/hazard backend code

Goal:

Complete Phase 12: implement realtime hazard reporting.

Product decisions:

- Hazard button is bottom-right.
- Button opens bottom sheet, not pure one-tap report.
- Selecting a hazard type writes immediately, dismisses sheet, and shows confirmation.
- Include police and mobile camera.
- Confirmation model later has only: still there, gone.
- Ignoring confirmation prompt does nothing.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add failing tests for hazard enum.
2. Add failing tests for hazard payload.
3. Add failing tests for expiry/fade policy.
4. Add failing tests for report count/confidence.
5. Add failing tests for admin dismiss.
6. Add failing tests for confirmation-ready model.
7. Add UI test for hazard sheet.
8. Build hazard bottom-right button.
9. Build hazard report sheet.
10. Implement create/report write.
11. Show confirmation toast/banner.
12. Render hazards on map.
13. Add hazard marker details.
14. Implement v1 fade/hide timer.
15. Implement admin dismiss if supported cleanly.

Verification:

- Report hazard from one client and observe on another.
- Hazard appears at report location.
- Hazard fades/hides.
- Malformed hazard rejected by rules.

When done:

- Summarize files changed.
- List verification results.
- Call out whether nearby-driver confirmation remains deferred.

### END PROMPT

---

## Prompt 13: End Run, Driver Finish, And Summaries

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current live drive/location/summary code

Goal:

Complete Phase 13: implement admin group end, individual driver finish/leave, persistent summaries, and share/copy summary.

Product decisions:

- Only admin can end the global run.
- Admin end requires confirmation.
- Drivers can end/leave their own session without ending the group run.
- If admin disconnects, drivers can still finish individually.
- Summary remains available post-drive.
- Max speed and max g-force are shown but not ranked.
- Summary should have clean share/copy text.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add failing tests for admin-only global end.
2. Add failing tests for driver personal finish.
3. Add failing tests for destination arrival prompt policy.
4. Add failing tests for stale/offline timeout classification.
5. Add failing summary calculation tests.
6. Add failing tests for max speed/max g-force.
7. Add failing tests proving no ranking by max speed/g-force.
8. Add failing tests for shareText generation.
9. Add failing persistence tests.
10. Implement admin End Group Drive.
11. Implement driver Finish/Leave.
12. Stop tracking on finish/leave/end.
13. Detect arrival at final destination.
14. Generate personal summaries.
15. Generate group summary.
16. Persist summaries.
17. Build Summary screen.
18. Add share/copy summary.
19. Add history entry.

Verification:

- Driver can finish independently.
- Admin can end group run.
- Summary remains after restart.
- Share/copy works.
- No location writes after finish/end.

When done:

- Summarize summary calculations and UI.
- List verification results.
- Call out privacy decisions.

### END PROMPT

---

## Prompt 14: Settings, Account, History, And Diagnostics

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current auth/profile/history code

Goal:

Complete Phase 14: implement Settings, Account, History, and Diagnostics.

Product decisions:

- Settings is a grouped list.
- Sections: Profile, Car, Units, Account, History, Debug.
- Car make/model uses searchable suggestions plus free text fallback.
- Units support kilometres/kmh and miles/mph.
- Delete account is deferred until data deletion behavior is defined.
- Debug information is development/TestFlight-oriented.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add failing tests for Settings view model.
2. Add failing tests for profile edit validation.
3. Add failing tests for unit preference persistence.
4. Add failing tests for password reset.
5. Add failing tests for sign-out.
6. Add failing tests for history loading.
7. Add failing tests for debug visibility by config.
8. Build Settings screen.
9. Add Profile section.
10. Add Car section.
11. Add Units section.
12. Add Account section.
13. Add History section.
14. Add Debug section.
15. Hide/tuck debug in production builds.

Verification:

- Edit profile updates backend and cache.
- Units affect displayed values.
- Password reset works.
- Sign out returns to Login.
- History opens summary.

When done:

- Summarize changed files.
- List verification results.
- Call out remaining account deletion work.

### END PROMPT

---

## Prompt 15: Liquid Glass, Accessibility, And UI Polish

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current completed native feature screens

Goal:

Complete Phase 15: make the completed flows feel premium, native, readable, and accessible.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Create accessibility checklist for every major screen.
2. Create screenshot checklist for light/dark mode.
3. Create checklist for Reduce Transparency, Increase Contrast, Reduce Motion.
4. Apply system Liquid Glass through standard SwiftUI components where available.
5. Use custom glass only for compact map overlays/action surfaces.
6. Tune Home Hub.
7. Tune Admin/Driver Lobby.
8. Tune Route Setup panel.
9. Tune Live Drive overlays.
10. Tune Hazard sheet.
11. Tune Summary share presentation.
12. Add VoiceOver labels.
13. Add Dynamic Type support.
14. Add high-contrast and reduce-transparency fallbacks.

Constraints:

- Do not add decorative glass surfaces.
- Do not make text-heavy forms translucent if readability suffers.
- Keep map screens glanceable.

Verification:

- VoiceOver pass.
- Dynamic Type pass.
- Light/dark screenshots.
- Reduce Transparency pass.
- Increase Contrast pass.
- Reduce Motion pass.

When done:

- Summarize polish changes.
- Include screenshots if possible.
- List accessibility verification results.

### END PROMPT

---

## Prompt 16: Firebase Rules, Privacy, And Production Hardening

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- `database.rules.json`
- native backend/domain code

Goal:

Complete Phase 16: harden backend security, privacy behavior, and release configuration before TestFlight.

Use Red -> Green -> Refactor -> Verify.

Tasks:

1. Add/update rules tests for email-auth profile writes.
2. Add/update rules tests for run creation.
3. Add/update rules tests for join flow.
4. Add/update rules tests for route admin-only writes.
5. Add/update rules tests for location/track writes.
6. Add/update rules tests for hazards.
7. Add/update rules tests for summaries.
8. Add privacy checklist.
9. Add release checklist.
10. Update Firebase rules intentionally if required.
11. Add backend fixtures matching native data.
12. Add/review privacy strings.
13. Add privacy manifest if required.
14. Audit logs for sensitive data.
15. Ensure email is not exposed in run lobbies.
16. Configure signing/display name/icons.
17. Document emulator and production Firebase setup.

Verification:

- `npm run test:rules` passes.
- Native unit tests pass.
- Native UI tests pass.
- Clean archive succeeds.
- Physical-device install succeeds.
- Controlled production Firebase smoke succeeds.

When done:

- Summarize rules/privacy/release changes.
- List verification results.
- Call out TestFlight blockers.

### END PROMPT

---

## Prompt 17: TestFlight Readiness And Real-World Drive Matrix

### BEGIN PROMPT

You are working in `/Users/delon/Documents/code/projects/outrun`.

Read and follow:

- `AGENTS.md`
- `docs/workstreams/active/native-ios-app-flow-spec.md`
- `docs/workstreams/active/native-ios-implementation-phases.md`
- current native release/hardening state

Goal:

Complete Phase 17: prove the app behaves correctly outside the simulator and prepare for controlled external testing.

Tasks:

1. Create manual real-drive test protocol.
2. Create TestFlight blocker checklist.
3. Create known-risk log.
4. Run one admin + one driver physical-device drive test.
5. Run one admin + multiple drivers physical-device test if devices are available.
6. Test app backgrounded.
7. Test screen locked.
8. Test admin disconnect.
9. Test driver finish independently.
10. Test hazard report and visibility.
11. Test Apple Maps route setup.
12. Test GPX import.
13. Test summary availability after restart.
14. Fix P0/P1 issues found.
15. Reduce battery/network hot spots.
16. Tighten confusing copy or controls found during testing.

Verification:

- All release candidate gates pass.
- TestFlight archive/upload succeeds if Apple account is ready.
- Release notes identify known limitations.

When done:

- Summarize test matrix results.
- List known risks.
- State whether app is ready for controlled TestFlight.

### END PROMPT

