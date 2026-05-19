# Agent Instructions

## Scope

This repository contains the existing Expo/React Native ClubRun app and a separate native SwiftUI iOS client.

- `native-ios/ClubRunNative/` owns the native iOS app, tests, Xcode project, Firebase Apple SDK integration, SwiftUI flows, MapKit route setup, GPX import, live drive shell, and native iOS documentation work.
- `ios/` is the Expo-generated native shell for the existing app. Do not treat it as the new native iOS app unless the prompt explicitly asks for Expo/iOS shell work.
- `docs/workstreams/active/` contains the only active workstream sources of truth.

## Workflows

### Native iOS Implementation

1. Read the named active workstream first. If none is named, start with `docs/workstreams/active/native-ios-implementation-phases.md` and `docs/workstreams/active/native-ios-app-flow-spec.md`.
2. Confirm the current phase and done criteria before editing.
3. Write or update a failing XCTest or explicit failing verification check first.
4. Implement the smallest Swift/SwiftUI change that makes the test pass.
5. Keep SwiftUI views free of Firebase SDK calls; route backend work through protocols/services.
6. Run the relevant native test or build command from `docs/workstreams/active/native-ios-verification-checkpoints.md`.
7. Summarize changed files, verification commands, and any deferred work.

### Native iOS Bug Fixes

1. Reproduce or identify the specific failing behavior.
2. Add a focused regression test for that behavior.
3. Fix only the failing path.
4. Do not refactor working code nearby unless the fix cannot be made safely without it.
5. Run the narrow test first, then broaden verification if the touched area is shared.

### Deferred Native iOS Work

1. Use `docs/workstreams/active/native-ios-deferred-todos.md` for intentionally postponed native iOS work.
2. Add a self-contained todo with `START PROMPT` and `END PROMPT` markers.
3. Include docs to read, goal, constraints, verification commands, and done criteria.
4. Do not implement deferred todos unless the user explicitly asks for that todo or names the deferred todos workstream.

### Completing Workstreams

1. Treat the named active workstream as the source of truth.
2. Do not infer requirements from similarly named archived, legacy, or completed files.
3. When a workstream is complete, move it to the completed directory and update any active references.

## Decisions

| Situation | Use | Avoid |
| --- | --- | --- |
| Native iOS app work | `native-ios/ClubRunNative/` | `ios/` Expo shell |
| Native iOS source of truth | Named file in `docs/workstreams/active/` | Archived, legacy, or completed workstreams |
| Native UI work | `ui-design` skill for creation, `ui-review` skill for evaluation/revision | Marketing-style screens for operational flows |
| SwiftUI architecture | Small state-driven views plus view models/services | Firebase calls directly from SwiftUI views |
| Backend paths | `BackendPaths` | Raw Firebase path strings in features |
| Firebase behavior | Protocol-backed repositories/services | SDK-specific logic in domain or UI code |
| Maps and routing | MapKit and Apple Maps route provider abstractions | Carrying over MapLibre patterns from Expo |
| Route import | GPX parser and route setup view model | Ad hoc XML/string parsing in views |
| Location sharing | Core Location service plus write/throttle policy | Starting location outside active run workflows |
| Validation and calculations | Pure tested domain helpers | UI-only validation that cannot be unit tested |

## Patterns

Follow these existing native iOS boundaries:

```swift
protocol RunReading: Sendable {
    func readRun(runId: String) async throws -> Run?
}
```

Use protocols for feature dependencies so view models can be tested without Firebase.

```swift
enum BackendPaths {
    static func run(_ runId: String) -> String {
        "runs/\(runId)"
    }
}
```

Centralize backend paths instead of composing strings inside features.

```swift
struct RouteData: Codable, Equatable {
    let points: [[Double]]
    let distanceMetres: Double
    let durationSeconds: Double?
    let source: RouteSource
    let stops: [RouteStopDraft]?
}
```

Keep Firebase-compatible DTO shape explicit. Route points preserve the backend `[lat, lng]` ordering.

## Gotchas

- Do not edit `ios/` for native SwiftUI app work. Work in `native-ios/ClubRunNative/` instead.
- Do not use workstreams from `docs/workstreams/archive/`, `docs/workstreams/archived/`, `docs/workstreams/legacy/`, or `docs/workstreams/completed/` unless the prompt explicitly names one.
- Do not leave native iOS deferred work only in chat. Add it to `docs/workstreams/active/native-ios-deferred-todos.md`.
- Do not make destructive changes without approval.
- Do not broad-refactor while fixing an error. Focus on the specific failing behavior and preserve working code.
- Do not add Sign in with Apple, CarPlay, Apple Watch, App Clips, offline map packs, or major Firebase schema redesign unless a workstream explicitly adds that scope.
- Do not optimize v1 for live Expo/native mixed-run compatibility. Preserve the shared Firebase contract unless a migration is explicitly approved.
- Do not always agree with the user. If a requested approach is likely to make the code worse, say so and propose the safer path.

## Verification

Use the available simulator destination on the current machine. Prefer commands from `docs/workstreams/active/native-ios-verification-checkpoints.md`.

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

When backend rules or the shared backend contract are touched:

```bash
npm run test:rules
```

## References

- `native-ios/ClubRunNative/README.md`: read for native app setup and baseline build/test commands.
- `docs/workstreams/active/native-ios-app-flow-spec.md`: read before changing native iOS product flow, identity, create/join, lobby, route, live drive, or settings behavior.
- `docs/workstreams/active/native-ios-implementation-phases.md`: read before implementing native iOS backlog tasks or marking phase progress.
- `docs/workstreams/active/native-ios-verification-checkpoints.md`: read before choosing verification commands or manual simulator/device checks.
- `docs/workstreams/active/native-ios-deferred-todos.md`: read before deferring or implementing postponed native iOS work.
- `docs/workstreams/active/native-ios-backend-compatible-app.md`: read before changing backend contract, MapKit direction, location architecture, or native information architecture.
- `docs/native-ios/foundation-configuration-audit.md`: read before changing Firebase setup, plist inclusion, package products, or app configuration.
