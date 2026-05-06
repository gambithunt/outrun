# Native iOS Verification Checkpoints

Status: Active
Created: 2026-05-05
Companion plan: [Native iOS Implementation Phases](native-ios-implementation-phases.md)
Product flow source: [Native iOS App Flow Spec](native-ios-app-flow-spec.md)

## Purpose

This workstream tracks when to run the simulator, when to use a physical device, and what to check after each implementation phase.

Use it during implementation so issues are caught while the relevant code is still fresh.

## Baseline Rule

After every implementation phase:

- [ ] Run relevant unit tests.
- [ ] Run Swift typecheck or native build.
- [ ] Record commands and results in the implementation notes.

After every phase that changes UI, navigation, MapKit, or backend-visible behavior:

- [ ] Run the app in the simulator.
- [ ] Check the screen/flow manually.
- [ ] Capture issues immediately.

After every phase involving GPS, background tracking, physical readability, or battery behavior:

- [ ] Test on a physical device.

## Common Commands

Build:

```bash
xcodebuild \
  -project native-ios/ClubRunNative/ClubRunNative.xcodeproj \
  -scheme ClubRunNative \
  -destination 'generic/platform=iOS' \
  -derivedDataPath native-ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Unit tests:

```bash
xcodebuild \
  -project native-ios/ClubRunNative/ClubRunNative.xcodeproj \
  -scheme ClubRunNative \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.4.1' \
  -derivedDataPath native-ios/DerivedData \
  test
```

UI launch tests:

```bash
xcodebuild \
  -project native-ios/ClubRunNative/ClubRunNative.xcodeproj \
  -scheme ClubRunNative \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.4.1' \
  -derivedDataPath native-ios/DerivedData \
  test \
  -only-testing:ClubRunNativeUITests
```

Database emulator:

```bash
npm run emulators:database
```

Firebase rules tests, when rules/backend paths change:

```bash
npm run test:rules
```

## Phase Checkpoints

### Phase 0: Reconcile Foundation And Configuration

Run simulator: Yes

Check:

- [ ] App launches.
- [ ] Firebase config warning is gone.
- [ ] Auth/backend diagnostics display correctly.
- [ ] Database emulator write/read smoke shows OK.
- [ ] No duplicate plist/runtime configuration issue appears.

Physical device: Not required unless Firebase config behaves differently on device.

### Phase 1: Domain Models And Backend Contract Upgrade

Run simulator: Optional

Check:

- [ ] Unit tests cover new models.
- [ ] JSON fixtures round-trip.
- [ ] Backend path tests pass.
- [ ] Rules tests pass if schema/rules changed.

Physical device: Not required.

### Phase 2: Email/Password Auth And User Profile

Run simulator: Yes

Check:

- [ ] Login screen appears when signed out.
- [ ] Register screen validates fields.
- [ ] Account registration works.
- [ ] Forgot password flow works as far as environment allows.
- [ ] Profile setup requires display name, car make, car model.
- [ ] Generated badge/color appears.
- [ ] Session restore returns signed-in user to the correct screen.

Physical device: Optional.

### Phase 3: Home Hub And Session Restore

Run simulator: Yes

Check:

- [ ] Signed-in user lands on Home Hub.
- [ ] Identity row shows display name, badge, car make/model.
- [ ] Create Run opens create flow.
- [ ] Join Run opens code-entry screen.
- [ ] Active run card appears when applicable.
- [ ] Tapping active run card opens the run.
- [ ] Settings/profile entry opens correctly.

Physical device: Not required.

### Phase 4: Create Run Flow

Run simulator: Yes

Check:

- [ ] Create form asks only for name and optional description.
- [ ] Validation works.
- [ ] Create loading state appears.
- [ ] Successful create writes run and join code.
- [ ] Admin lands in Admin Lobby.
- [ ] Join code is visible.
- [ ] Error state is understandable.

Physical device: Not required.

### Phase 5: Join Run Flow

Run simulator: Yes

Check:

- [ ] Six-digit code field is large and focused.
- [ ] Paste works.
- [ ] Invalid code shows a clear error.
- [ ] Valid code resolves run name.
- [ ] Join writes driver record.
- [ ] Driver lands in Driver Lobby or Live Drive depending status.
- [ ] Joined user can return to lobby/route details.

Physical device: Not required.

### Phase 6: Admin Lobby And Driver Lobby

Run simulator: Yes

Check:

- [ ] Admin lobby shows run name, code, share/copy, start, readiness.
- [ ] Start is disabled without route.
- [ ] Solo-start confirmation appears when no other drivers are waiting.
- [ ] Route row shows no-route state.
- [ ] Drivers row opens Drivers sheet.
- [ ] Drivers sheet shows badge, display name, car make/model, status.
- [ ] Driver lobby excludes admin setup controls.
- [ ] Presence/waiting state updates where testable.

Physical device: Optional.

### Phase 7: Route Setup With MapKit And Apple Maps Routing

Run simulator: Yes, heavy check

Check:

- [ ] Map renders correctly.
- [ ] Map is the dominant screen element.
- [ ] Start can be selected.
- [ ] Destination can be selected.
- [ ] Apple Maps generated route appears.
- [ ] Waypoint can be added.
- [ ] Waypoint can be reordered.
- [ ] Route recalculates after stop changes.
- [ ] Route summary updates.
- [ ] Save route works.
- [ ] Admin returns to lobby.
- [ ] Lobby route row shows distance/duration/stops/source.

Physical device: Recommended for map interaction feel, not mandatory yet.

### Phase 8: GPX Import

Run simulator: Yes

Check:

- [ ] GPX import affordance is secondary/minimal.
- [ ] Document picker opens.
- [ ] Valid GPX previews on map.
- [ ] Invalid GPX shows clear error.
- [ ] Save route works.
- [ ] Discard returns to route setup.
- [ ] Lobby route row shows GPX source.

Physical device: Optional.

### Phase 9: Live Drive Map Shell

Run simulator: Yes, heavy check

Check:

- [ ] Live Drive map renders nonblank.
- [ ] Route line is visible.
- [ ] Own marker appears.
- [ ] Other driver generated badges appear.
- [ ] Other drivers do not show live speed.
- [ ] Hazard markers appear.
- [ ] Top status overlay is readable.
- [ ] Next waypoint/distance display is readable.
- [ ] Bottom controls are reachable.
- [ ] Hazard button is bottom-right.
- [ ] Controls do not obscure critical route content.
- [ ] Light and dark mode are readable.

Physical device: Recommended for map readability, not mandatory yet.

### Phase 10: Foreground Location, Presence, And Tracks

Run simulator: Yes

Simulator check:

- [ ] Permission UI appears.
- [ ] Denied/restricted/reduced accuracy states are handled where simulatable.
- [ ] Simulated location updates display.
- [ ] Latest location writes.
- [ ] Track points write only while active.
- [ ] Leave/finish stops writes.

Physical device: Required sanity check

- [ ] Foreground location works on device.
- [ ] Location updates are accurate enough.
- [ ] Battery impact is not obviously extreme.

### Phase 11: Background Location

Run simulator: Limited only

Simulator check:

- [ ] Permission copy and settings flows display correctly.
- [ ] Restore logic can be simulated where practical.

Physical device: Mandatory

- [ ] App backgrounded while driving/tracking.
- [ ] Screen locked while driving/tracking.
- [ ] App relaunched with active run.
- [ ] Temporary network loss.
- [ ] End run stops background tracking.
- [ ] Leave/finish stops background tracking.
- [ ] Location indicator/diagnostic is understandable.
- [ ] Battery impact smoke check completed.

### Phase 12: Hazard Reporting

Run simulator: Yes

Check:

- [ ] Bottom-right hazard button opens sheet.
- [ ] Sheet has large hazard type buttons.
- [ ] Includes police and mobile camera.
- [ ] Selecting type writes hazard.
- [ ] Sheet dismisses.
- [ ] Confirmation appears.
- [ ] Hazard marker appears at reported location.
- [ ] Hazard detail opens.
- [ ] Fade/hide timer works.
- [ ] Admin dismiss works if implemented.

Physical device: Recommended during live-drive testing.

### Phase 13: End Run, Driver Finish, And Summaries

Run simulator: Yes

Check:

- [ ] Admin end requires confirmation.
- [ ] Driver can finish/leave personally.
- [ ] Driver finish does not end global run.
- [ ] Arrival prompt appears where testable.
- [ ] Tracking stops after finish/end.
- [ ] Summary screen opens.
- [ ] Summary remains available after restart.
- [ ] Share/copy summary works.
- [ ] Max speed/max g-force show but are not ranked.

Physical device: Required during full drive matrix.

### Phase 14: Settings, Account, History, And Diagnostics

Run simulator: Yes

Check:

- [ ] Profile edit works.
- [ ] Car edit supports suggestions and free text fallback.
- [ ] Unit preferences save.
- [ ] Unit preferences affect displayed values.
- [ ] Password reset flow works.
- [ ] Sign out returns to Login.
- [ ] History lists past runs/summaries.
- [ ] Debug diagnostics are visible only where intended.

Physical device: Optional.

### Phase 15: Liquid Glass, Accessibility, And UI Polish

Run simulator: Yes, full visual QA

Check:

- [ ] Light mode screenshots.
- [ ] Dark mode screenshots.
- [ ] Dynamic Type.
- [ ] VoiceOver.
- [ ] Reduce Transparency.
- [ ] Increase Contrast.
- [ ] Reduce Motion.
- [ ] Text does not overflow.
- [ ] Buttons remain tappable.
- [ ] Map overlays remain readable.
- [ ] No decorative glass hurts readability.

Physical device: Recommended

- [ ] Outdoor/daylight readability smoke check.
- [ ] Live Drive controls readable while mounted.

### Phase 16: Firebase Rules, Privacy, And Production Hardening

Run simulator: Yes

Check:

- [ ] Rules tests pass.
- [ ] Native unit tests pass.
- [ ] Native UI tests pass.
- [ ] Privacy strings appear correctly.
- [ ] Emails are not shown in run lobbies.
- [ ] Debug UI is hidden/tucked for release.
- [ ] Clean archive succeeds.
- [ ] Controlled Firebase smoke run works.

Physical device: Required for install/archive smoke.

### Phase 17: TestFlight Readiness And Real-World Drive Matrix

Run simulator: Yes, but not enough

Physical device: Mandatory

Check:

- [ ] One admin + one driver test.
- [ ] One admin + multiple drivers test if devices are available.
- [ ] App backgrounded.
- [ ] Screen locked.
- [ ] Admin disconnect.
- [ ] Driver finishes independently.
- [ ] Hazard report and visibility.
- [ ] Apple Maps route setup.
- [ ] GPX import.
- [ ] Summary availability after restart.
- [ ] Battery/network behavior acceptable.
- [ ] Known limitations documented.
- [ ] TestFlight archive/upload succeeds if account is ready.

## Quick Cadence

Use this cadence during development:

```text
Every phase:
  unit tests
  build/typecheck

Every UI/backend phase:
  simulator run

Every map phase:
  simulator visual check
  physical device if interaction/readability matters

Every location phase:
  physical device

Phase 15:
  full visual/accessibility QA

Phase 17:
  real-world drive matrix
```

