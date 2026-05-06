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
