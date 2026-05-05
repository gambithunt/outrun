# ClubRun Native iOS

This is the separate native SwiftUI iOS client for ClubRun. It uses the same Firebase backend contract as the existing Expo app, but it is not an incremental port of the Expo UI.

## First Slice

The current foundation includes:

- SwiftUI app target
- unit test target
- UI test target
- backend-compatible Swift domain models
- Firebase path centralization
- Firebase Auth/Realtime Database protocol boundaries
- JSON fixtures matching the existing backend shape
- minimal Drive screen with backend diagnostics

## Firebase SDK

The backend layer uses conditional Firebase Apple SDK imports:

- `FirebaseCore`
- `FirebaseAuth`
- `FirebaseDatabase`

The concrete Firebase adapters compile when those SDK products are added to the Xcode target. They are currently isolated behind protocols so the first native foundation can build in constrained environments where Swift Package Manager package resolution is unavailable.

## Verification

```bash
xcodebuild build \
  -project native-ios/ClubRunNative/ClubRunNative.xcodeproj \
  -scheme ClubRunNative \
  -destination 'generic/platform=iOS'
```

```bash
xcodebuild test \
  -project native-ios/ClubRunNative/ClubRunNative.xcodeproj \
  -scheme ClubRunNative \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro'
```
