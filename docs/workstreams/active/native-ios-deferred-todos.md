# Native iOS Deferred Todos

Status: Active
Created: 2026-05-06

## Purpose

This workstream tracks native iOS work that is intentionally deferred because it is not needed for the current implementation phase, but should be revisited later.

Each todo includes a copy-ready implementation prompt. Copy from `START PROMPT` through `END PROMPT` when you are ready to implement that item.

## Rules

- Do not implement these items unless the prompt explicitly asks for this workstream or a specific todo in it.
- Keep each deferred todo scoped to one future implementation task.
- Add new deferred todos here when a decision is intentionally pushed later.
- Keep prompts self-contained and specific enough for a future agent to execute without re-litigating the original discussion.
- When a deferred todo is implemented, mark it complete and add the implementation date plus verification notes.

## Todo: Non-Blocking Email Verification

Status: Deferred
Reason: Email/password registration works and password reset email delivery was confirmed. Email verification is useful before wider beta/public launch, but blocking on it now would add friction while the core run flow is still under development.

Copy from here:

```text
START PROMPT

You are working in /Users/delon/Documents/code/projects/outrun.

Read and follow:
- AGENTS.md
- docs/workstreams/active/native-ios-app-flow-spec.md
- docs/workstreams/active/native-ios-implementation-phases.md
- docs/workstreams/active/native-ios-deferred-todos.md
- current native iOS auth/profile code

Goal:
Add non-blocking email verification support for native iOS email/password accounts.

Context:
- Email/password registration is already implemented.
- Password reset works.
- Email verification was intentionally deferred during Phase 2 to keep signup friction low.
- Do not require verified email before profile setup or Home Hub unless a new workstream explicitly changes that decision.

Requirements:
1. Extend `AuthServicing` with email verification support.
2. Implement Firebase email verification in `FirebaseAuthService` without exposing Firebase SDK calls to SwiftUI views.
3. Send a verification email after successful registration.
4. Add a resend verification action in a suitable account/profile/settings surface.
5. Show a clear non-blocking reminder when the signed-in email is unverified.
6. Keep errors user-actionable.
7. Add tests proving:
   - registration triggers verification email send
   - resend verification calls the auth service
   - unverified users are not blocked from completing profile or using the app
   - user-facing success/failure messages are clear
8. Do not add Sign in with Apple.
9. Do not alter unrelated Expo `ios/` behavior.

Verification:
Run native unit/UI tests:

xcodebuild -project native-ios/ClubRunNative/ClubRunNative.xcodeproj -scheme ClubRunNative -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.4.1' -derivedDataPath native-ios/DerivedData test

Also manually verify against a controlled Firebase project:
- Register a new account.
- Confirm the verification email is sent.
- Confirm app flow remains usable before verification.
- Confirm resend verification works.

When done:
- Summarize files changed.
- List verification commands and results.
- Call out Firebase Console email template requirements.
- Mark this todo complete in docs/workstreams/active/native-ios-deferred-todos.md.

END PROMPT
```

## Todo: Proximity-Based Hazard Confirmation UI

Status: Deferred
Reason: Hazard reporting, realtime visibility, admin dismiss, announced alerts, simple-alert preference, and mute are working. The data model already supports `still_there` and `gone` confirmations, but the nearby-driver confirmation prompt should wait until live drive/location behavior is stable enough for low-distraction prompts.

Copy from here:

```text
START PROMPT

You are working in /Users/delon/Documents/code/projects/outrun.

Read and follow:
- AGENTS.md
- docs/workstreams/active/native-ios-app-flow-spec.md
- docs/workstreams/active/native-ios-implementation-phases.md
- docs/workstreams/active/native-ios-deferred-todos.md
- current native iOS Live Drive, hazard, location, and Firebase repository code

Goal:
Implement proximity-based hazard confirmation UI for nearby drivers.

Context:
- Hazard reporting already works in realtime.
- Hazard markers appear across clients.
- Admin dismiss works.
- Hazard audio is announced by default, with a simple alert option in Settings.
- The `HazardConfirmation` model already supports `outcome: still_there` and `outcome: gone`.
- Do not redesign the hazard rail or audio flow unless needed for confirmation.

Requirements:
1. Prompt a driver only when they approach an active hazard within an actionable distance, initially 300 m.
2. Keep the prompt low-distraction and non-blocking.
3. Offer exactly two confirmation actions: "Still There" and "Gone".
4. Write the confirmation under the existing hazard confirmation payload shape without Firebase SDK calls in SwiftUI views.
5. Prevent repeated prompts for the same hazard after the driver has answered or dismissed the prompt.
6. Do not prompt the original reporter for their own hazard.
7. Do not prompt for dismissed or expired hazards.
8. Update marker/detail state after confirmations.
9. If rules must change, update rules tests in the same pass.
10. Add tests proving:
   - only nearby active hazards prompt
   - own hazards do not prompt
   - dismissed/expired hazards do not prompt
   - still_there writes the expected outcome
   - gone writes the expected outcome
   - answered hazards do not prompt again
   - SwiftUI views still have no Firebase SDK calls

Verification:
Run native unit tests:

xcodebuild -project native-ios/ClubRunNative/ClubRunNative.xcodeproj -scheme ClubRunNative -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5' -derivedDataPath native-ios/DerivedData test

If backend rules change, run:

npm run test:rules

Manual verification:
- Start two simulators in one run.
- Report a hazard from the lead/client simulator.
- Move the second simulator within 300 m.
- Confirm the prompt appears once.
- Tap "Still There" and verify Firebase writes `outcome: "still_there"`.
- Repeat with a different hazard and tap "Gone".
- Confirm no prompt appears for dismissed or expired hazards.

When done:
- Summarize files changed.
- List verification commands and results.
- Mark this todo complete in docs/workstreams/active/native-ios-deferred-todos.md.

END PROMPT
```

## Todo: GPX Export From Route Settings

Status: Deferred
Reason: Route Setup now shows the Route Settings surface with preferred units and GPX import/export placement. GPX import is implemented. GPX export requires a separate file generation/share flow and is not needed to manually validate route creation, GPX import, route save, or lobby/live-drive rendering.

Copy from here:

```text
START PROMPT

You are working in /Users/delon/Documents/code/projects/outrun.

Read and follow:
- AGENTS.md
- docs/workstreams/active/native-ios-app-flow-spec.md
- docs/workstreams/active/native-ios-implementation-phases.md
- docs/workstreams/active/native-ios-deferred-todos.md
- current Route Setup code under native-ios/ClubRunNative/ClubRunNative/Features/RouteSetup/

Goal:
Implement GPX export from the native iOS Route Settings sheet.

Context:
- Route Setup has a settings sheet with preferred units and GPX import/export placement.
- GPX import is already implemented as preview-and-save.
- GPX export is currently shown as a deferred/unavailable row.
- Do not change the Firebase `RouteData` shape.

Requirements:
1. Add a pure GPX exporter that converts saved/current `RouteData.points` into a valid GPX file.
2. Add fixture-driven unit tests for:
   - valid GPX XML output
   - route point count preservation
   - lat/lng precision
   - empty route rejection
   - source-independent export from Apple Maps and GPX routes
3. Enable the Route Settings "Export GPX" action only when route data exists.
4. Use a native iOS share/export flow.
5. Keep SwiftUI views free of Firebase SDK calls.
6. Keep GPX import behavior unchanged.
7. Show useful export errors if generation or sharing fails.

Verification:
Run:
xcrun --sdk iphonesimulator swiftc -typecheck -parse-as-library -target arm64-apple-ios26.0-simulator -strict-concurrency=complete -warn-concurrency $(rg --files native-ios/ClubRunNative/ClubRunNative -g '*.swift')

Run native tests:
xcodebuild -project native-ios/ClubRunNative/ClubRunNative.xcodeproj -scheme ClubRunNative -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.4.1' -derivedDataPath native-ios/DerivedData test

Manual verification:
- Create or import a route.
- Open Route Settings.
- Export GPX.
- Confirm the exported file opens as valid GPX.

When done:
- Summarize files changed.
- List verification commands and results.
- Mark this todo complete in docs/workstreams/active/native-ios-deferred-todos.md.

END PROMPT
```
