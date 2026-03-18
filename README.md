# ClubRun

ClubRun is a real-time group driving tracker for car clubs built with React Native, Expo Router, Firebase Realtime Database, MapLibre, Expo Location, and Zustand.

## Status

The app includes:

- run creation and join codes
- driver profiles
- route planning
- live map tracking
- hazard reporting
- run summaries and sharing
- Firebase auth and Realtime Database rules

## Development

Install dependencies and run the app:

```bash
npm install
npm run dev
```

For Firebase setup, follow [docs/firebase-hookup.md](docs/firebase-hookup.md).

## Local Testing

ClubRun targets iOS and Android development builds first. The web build is useful for quick UI checks, but it is not the best place to validate the real app flow.

Why:

- MapLibre is native-first
- location permissions are mobile-specific
- background tracking is mobile-specific
- sharing and print flows are native-first
- the web app uses a fallback map experience instead of the real native map

## Recommended Test Path

Use the iOS Simulator on your Mac for the most realistic local testing short of a physical iPhone.

### Prerequisites

- Xcode installed from the Mac App Store
- iOS Simulator available through Xcode
- Firebase configured in `.env`
- latest Realtime Database rules deployed

Before testing against live Firebase, deploy the database rules:

```bash
npx firebase deploy --only database --project outrun-9c9db
```

## Run On iOS Simulator

1. Install dependencies:

```bash
npm install
```

2. Build the iOS development client:

```bash
npx expo run:ios
```

This should:

- open the iOS Simulator
- build the native app
- install the ClubRun development build on the simulator

3. Start Metro:

```bash
npm run dev
```

4. Open the `ClubRun` app inside the iOS Simulator.

How to find it:

- look for the `ClubRun` icon on the simulator home screen
- if you do not see it, use simulator Spotlight with `Cmd+Space`

Important:

- open `ClubRun`, not `Expo Go`
- the native development build is the correct app for MapLibre and location testing

## If The App Is Installed But Not Updating

In the iOS Simulator:

- press `Cmd+D`
- or use `Device -> Shake`

Then use the developer menu to reload the app.

If the app did not install, run:

```bash
npx expo run:ios
```

again and wait for the native build to finish.

## Verify Firebase In The App

After the app opens:

1. Go to `Settings`
2. Confirm the Firebase diagnostics card shows:
   - `Mode: Live Firebase`
   - `Project: outrun-9c9db`
   - `Auth: Signed in as <uid>`

If auth does not show a uid:

- check that Anonymous Auth is enabled in Firebase
- confirm your `.env` values are correct
- restart Metro after env changes

## Suggested Manual Test Flow

Use this order for a realistic local smoke test:

1. Open `Settings` and confirm Firebase diagnostics.
2. Create a run.
3. Confirm a join code is generated.
4. Plan a route.
5. Save the route.
6. Open a second client:
   - another simulator
   - a browser tab
   - or a physical phone
7. Join the run with the join code.
8. Complete the driver profile.
9. Open the live map.
10. Enable location tracking.
11. Report a hazard.
12. End the run from the admin device.
13. Open the summary screen.

## Simulate Location In iOS Simulator

To test movement on the map:

1. In the iOS Simulator menu, open `Features -> Location`
2. Choose one of:
   - `Custom Location...`
   - `City Bicycle Ride`
   - `City Run`
   - `Freeway Drive`

This helps test:

- driver marker updates
- route/map rendering
- convoy presence
- foreground tracking behavior

Note:

- background location behavior is limited in Simulator compared with a real iPhone
- for true convoy and lock-screen testing, use a physical iPhone later

## Web Testing

Web is still useful for:

- fast UI checks
- form validation
- basic Firebase flow checks

But web is not the right environment to validate:

- the real MapLibre map
- background tracking
- mobile permission behavior

If you do use web, start with a clean cache:

```bash
npx expo start --web -c
```
