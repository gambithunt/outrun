# Native iOS Foundation Configuration Audit

Status: Phase 0 audit note
Date: 2026-05-05

## Native Xcode Project

- Project: `native-ios/ClubRunNative/ClubRunNative.xcodeproj`
- App target: `ClubRunNative`
- Firebase Swift package: `firebase-ios-sdk`
- Native target package products linked:
  - `FirebaseAuth`
  - `FirebaseCore`
  - `FirebaseDatabase`

## Firebase Plists

The native Xcode project includes one `GoogleService-Info.plist` in the app target resources:

- Included in target: `native-ios/ClubRunNative/GoogleService-Info.plist`

There is a second matching plist on disk:

- Duplicate on disk, not referenced by the native Xcode project: `native-ios/ClubRunNative/ClubRunNative/GoogleService-Info.plist`

The files compared equal during the Phase 0 audit. This duplicate was intentionally left in place for now because removing configuration files is destructive and should be approved separately.

## Old Expo iOS Project

The old Expo-generated iOS project still has a Firebase package reference:

- Project: `ios/ClubRun.xcodeproj`
- Package reference: `firebase-ios-sdk`

The audit did not find Firebase package products linked to the old Expo target, only the package reference. This was intentionally left untouched because the native iOS workstream must not make destructive changes to old Expo behavior without explicit approval.

## Bootstrap Decision

Firebase startup is centralized through `FirebaseBootstrapService`. The app entry point calls the shared bootstrap service once at launch, and the service guards repeated Firebase app and emulator configuration calls.

Development configuration keeps Realtime Database emulator support available at:

- host: `127.0.0.1`
- port: `9000`

Auth emulator constants are also retained for later use:

- host: `127.0.0.1`
- port: `9099`
