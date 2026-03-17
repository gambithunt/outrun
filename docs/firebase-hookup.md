# ClubRun Firebase Hookup

This guide takes ClubRun from the current codebase state to a real Firebase-backed device test.

Use it in order. Do not skip the emulator verification step. The app now has:

- Firebase anonymous auth bootstrap
- Realtime Database rules checked into the repo
- Emulator-backed rules tests
- In-app Firebase diagnostics on the Settings screen

## 1. Prerequisites

Install or confirm these tools first:

```bash
node -v
npm -v
java -version
firebase --version
```

Expected notes:

- Java must be JDK 21 or newer for the Firebase emulator
- `npm install` should already be complete in this repo
- If `firebase` is missing, install it with:

```bash
npm install -g firebase-tools
```

If your shell still resolves Java 17 after installing 21, add this to `~/.zshrc`:

```bash
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
```

Then restart the shell and verify:

```bash
java -version
```

## 2. Create The Firebase Project

In the Firebase Console:

1. Create a new project.
2. Name it something like `clubrun-dev` or `clubrun-prod`.
3. Skip Google Analytics unless you specifically want it.
4. Add a Web App to the project.

When you add the web app, Firebase will show the config values you need later:

- `apiKey`
- `authDomain`
- `databaseURL`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

Keep that page open or copy those values somewhere temporary.

## 3. Enable Firebase Products

### Authentication

In Firebase Console:

1. Open `Authentication`.
2. Click `Get started`.
3. Open `Sign-in method`.
4. Enable `Anonymous`.

ClubRun currently relies on anonymous auth so the app can obtain a stable `uid` for:

- admin ownership
- driver identity
- rules enforcement

### Realtime Database

In Firebase Console:

1. Open `Realtime Database`.
2. Click `Create database`.
3. Choose a region close to your expected users.
4. Start in locked mode if prompted.

The app uses Realtime Database, not Firestore.

## 4. Add Local Environment Variables

Copy the example env file:

```bash
cp .env.example .env
```

Open `.env` and fill in:

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_DATABASE_URL=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=false
EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1
EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT=9099
EXPO_PUBLIC_FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1
EXPO_PUBLIC_FIREBASE_DATABASE_EMULATOR_PORT=9000
```

For real Firebase hookup, keep:

```bash
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=false
```

## 5. Verify The App Sees Firebase

Before launching a device build, run:

```bash
npm run typecheck
npm run test:ci
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:rules
```

Expected result:

- typecheck passes
- unit/component/integration tests pass
- rules emulator suite passes

Then start the app locally:

```bash
npm run dev
```

Open the app and go to `Settings`.

In the new Firebase diagnostics card, confirm:

- `Mode: Live Firebase`
- `Project: <your project id>`
- `Database: <your database URL>`
- `Auth: Signed in as <uid>`

If `Mode` says `Not configured`, your `.env` values are missing or not loaded.

If `Auth` does not show a uid, check:

- Anonymous auth is enabled
- Firebase config values are correct
- You rebuilt after changing native config or installed packages

## 6. Log In To Firebase CLI

If you want to deploy rules from the terminal:

```bash
firebase login
firebase use --add
```

Pick the project you created and set it for this repo when prompted.

If you prefer not to set a default project, you can deploy with `--project <project-id>`.

## 7. Deploy Realtime Database Rules

From the repo root:

```bash
firebase deploy --only database
```

Or:

```bash
firebase deploy --only database --project <your-project-id>
```

This deploys the rules from:

- `firebase.json`
- `database.rules.json`

Do this only after `npm run test:rules` is green.

## 8. Build A Development Client

ClubRun uses native dependencies that do not work in Expo Go alone, including:

- MapLibre
- background location
- sharing/print modules

Build a dev client:

### iOS

```bash
npx expo run:ios
```

### Android

```bash
npx expo run:android
```

After the native build is installed, start Metro:

```bash
npm run dev
```

## 9. First Real Firebase Smoke Test

Follow this exact flow on a device or simulator:

1. Open `Settings`.
2. Confirm Firebase diagnostics show:
   - live Firebase mode
   - the correct project
   - a signed-in auth uid
3. Go back home.
4. Create a run.
5. Confirm a join code is generated.
6. Plan a route.
7. Save the route.
8. From a second device or simulator, join with the code.
9. Complete the driver profile.
10. Open the live map.
11. Tap `Enable Location Tracking`.
12. Confirm the tracking state changes.
13. Report a hazard.
14. End the run from the admin device.
15. Open the summary screen.
16. Test PNG and PDF sharing.

## 10. Database Checks During Smoke Test

In Firebase Console, verify data appears under:

- `/joinCodes/{code}`
- `/runs/{runId}`
- `/runs/{runId}/drivers/{uid}`
- `/runs/{runId}/route`
- `/runs/{runId}/hazards`
- `/runs/{runId}/summary`

Important checks:

- `adminId` should be a Firebase auth uid, not a random local string
- driver ids should be Firebase auth uids
- status should move `draft -> active -> ended`
- `startedAt` and `endedAt` should populate correctly

## 11. Common Problems

### Settings shows `Not configured`

Cause:

- `.env` is missing values
- wrong env variable names
- Metro needs restart

Fix:

```bash
npm run dev
```

Restart Metro after correcting `.env`.

### Settings shows auth error or no signed-in uid

Cause:

- Anonymous auth not enabled
- invalid Firebase config

Fix:

- Enable anonymous auth in Firebase Console
- recheck `authDomain`, `apiKey`, `appId`, and `projectId`

### Rules deploy succeeds but app writes fail

Cause:

- project mismatch
- app pointed at different Firebase project than CLI deploy target

Fix:

- compare `EXPO_PUBLIC_FIREBASE_PROJECT_ID` with the CLI project
- verify the app’s Settings diagnostics card

### Map works but background tracking does not

Cause:

- OS permission level is foreground-only
- iOS/Android background permission not granted

Fix:

- open the live map
- tap `Enable Location Tracking`
- if denied, use `Open Settings`
- set location access to the highest allowed level on the device

## 12. Emulator Mode Later

If you want to switch back to local emulator testing:

Set in `.env`:

```bash
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true
EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1
EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT=9099
EXPO_PUBLIC_FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1
EXPO_PUBLIC_FIREBASE_DATABASE_EMULATOR_PORT=9000
```

Then run:

```bash
PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:rules
```

And confirm Settings shows:

- `Mode: Local emulator`

## 13. Ready For Real Use

You are ready for real Firebase device testing when all of these are true:

- `npm run typecheck` passes
- `npm run test:ci` passes
- `PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" npm run test:rules` passes
- Settings diagnostics show live Firebase mode and a signed-in uid
- You can complete the create -> route -> join -> live map -> hazard -> end run -> summary flow on real devices
