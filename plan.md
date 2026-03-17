# CLUBRUN

**Real-Time Group Driving Tracker for Car Clubs**

*Product Specification & Development Plan*

*Version 1.0 • March 2026*

**CONFIDENTIAL**

## Table of Contents

1. Executive Summary
2. Technical Architecture
3. Feature Specification
4. Firebase Data Structure
5. Phased Development Task List
6. Risks, Gotchas & Mitigations
7. Appendices

---

# 1. Executive Summary

ClubRun is a cross-platform mobile application that enables car clubs to coordinate and track group drives in real time. An Admin creates a run session, plans or imports a route, and shares a join code with club members. Drivers join anonymously by entering their name and car details, then see every participant live on an OpenStreetMap-powered map. Any driver can flag road hazards that instantly appear for the whole group. When the run ends, every participant receives a rich post-run summary with statistics, fuel estimates, and a route replay.

## 1.1 Product Goals

- Zero-friction onboarding: no accounts, no logins, no app store barriers beyond the initial install.

- Real-time situational awareness: every driver knows where every other driver is and what hazards lie ahead.

- Post-drive social currency: shareable summaries encourage repeat use and club growth.

- Cost-zero infrastructure: Firebase Spark (free) tier is sufficient for the projected load of up to 15 concurrent drivers per run.

## 1.2 Target Users

Car club organisers (Admins) who plan weekend drives, track days, or charity convoys. Club members (Drivers) who want to follow the group without needing WhatsApp live-location or a separate GPS app.

## 1.3 Tech Stack Summary

| **Layer**    | **Technology**                                        | **Rationale**                                                                                 |
|--------------|-------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| Frontend     | React Native + Expo SDK 52+                           | Single codebase for iOS and Android; Expo managed workflow simplifies builds and OTA updates. |
| Navigation   | Expo Router v4                                        | File-based routing with deep linking support for run join links.                              |
| Maps         | MapLibre GL (react-native-maplibre-gl) with OSM tiles | No API key needed; free tile servers; vector tiles for offline caching.                       |
| Location     | expo-location with background mode                    | Foreground and background GPS tracking with configurable accuracy.                            |
| Backend / DB | Firebase Realtime Database (Spark plan)               | Real-time sync with sub-second latency; generous free tier for small groups.                  |
| Hosting      | Firebase Hosting                                      | Static hosting for any future web admin panel.                                                |
| State Mgmt   | Zustand                                               | Lightweight, minimal boilerplate; ideal for location and session state.                       |

# 2. Technical Architecture

## 2.1 High-Level Data Flow

The app follows a hub-and-spoke real-time sync pattern. Every driver's device writes its GPS coordinates to a Firebase Realtime Database path. Every other device in the same run subscribes to that path via an onValue listener. Firebase handles fan-out; there is no custom server.

**Write path:** Driver device → expo-location callback → throttle (2s) → Firebase set() to /runs/{runId}/drivers/{driverId}/location

**Read path:** Firebase onValue(/runs/{runId}/drivers) → Zustand store update → MapLibre marker re-render

## 2.2 Offline & Intermittent Signal Strategy

Firebase Realtime Database has built-in offline persistence. When a driver loses signal, writes queue locally and sync on reconnect. The map tiles are cached in MapLibre's tile cache for the visible area. Specific behaviours:

- Location writes queue in Firebase's local cache and flush when connectivity returns.

- Hazard flags also queue locally; they appear on other devices only after the reporter regains signal.

- The map shows the last-known positions of other drivers with a visual staleness indicator (a greyed-out marker or a clock badge showing time since last update).

- A banner at the top of the map screen reads 'Reconnecting…' when the Firebase connection drops.

- Post-run summary generation waits until the Admin device has connectivity before computing and writing final stats.

## 2.3 Background GPS Architecture

Background location is the single most platform-sensitive feature. The app must continue tracking when the phone is screen-off or another app is in the foreground, because drivers typically mount their phone on the dash.

**iOS:** Request 'Always' location permission (NSLocationAlwaysAndWhenInUseUsageDescription). Use expo-location's startLocationUpdatesAsync with a foreground service notification. iOS will throttle updates to roughly every 5–15 seconds in background, which is acceptable. Must declare location UIBackgroundModes in app.json.

**Android:** Request ACCESS_BACKGROUND_LOCATION permission (Android 10+). Use expo-location's startLocationUpdatesAsync which creates a foreground service with a persistent notification ('ClubRun is tracking your drive'). This prevents the OS from killing the process. On Android 12+, foreground service type must be declared as 'location' in app.json.

**Battery considerations:** Use Accuracy.High only while the run is active. Throttle writes to Firebase to once every 2 seconds. When the app detects speed \< 5 km/h for more than 30 seconds (likely stopped at traffic), reduce accuracy to Balanced and increase interval to 5 seconds. Resume High accuracy when speed exceeds 10 km/h.

## 2.4 Security Model

Since there are no user accounts, Firebase Security Rules are the only protection layer. The rules enforce:

- Runs are readable only if the client knows the runId (effectively a secret; the 6-digit code maps to a runId via a separate /joinCodes lookup).

- A driver can only write to their own /drivers/{driverId}/location path.

- The Admin's driverId is stored at /runs/{runId}/adminId; only that driverId can write to /runs/{runId}/status or /runs/{runId}/summary.

- No global listing of runs is exposed; there is no /runs readable at the root level.

- Write size limits: location objects capped at 200 bytes; hazard objects capped at 500 bytes.

# 3. Feature Specification

## 3.1 Run Creation (Admin Only)

**Purpose:** Allow an Admin to set up a new group drive session, define or import a route, and generate sharing credentials for Drivers.

### 3.1.1 Behaviour

The Admin taps 'Create Run' from the home screen. A form collects the run name (required, max 60 characters) and an optional description (max 250 characters). On submission, the app generates a unique runId (Firebase push key) and a random 6-digit numeric join code. The join code is checked for uniqueness against /joinCodes before being stored. A shareable deep link is also generated in the format clubrun://join/{joinCode} with a web fallback URL.

After creation, the Admin lands on the Route Planning screen, which shows a full-screen map. The Admin has two options for defining the route:

**Option A — Draw on map:** The Admin taps waypoints on the map. Each tap places a numbered marker. The app requests a route between sequential waypoints using the OSRM public routing API (router.project-osrm.org). The returned polyline snaps to roads and is displayed as the planned route. The Admin can drag waypoints to adjust, and the route re-calculates. A maximum of 25 waypoints is enforced to stay within OSRM's free-tier limits.

**Option B — Import GPX:** The Admin taps 'Import GPX' and selects a .gpx file from the device's file picker (expo-document-picker). The app parses the GPX XML, extracts the \<trk\>/\<trkseg\>/\<trkpt\> elements, and renders the track as a polyline on the map. If the GPX contains \<rte\>/\<rtept\> route points, those are used instead. Metadata (name, description) from the GPX is pre-filled into the run name if the field is empty. Files larger than 5 MB are rejected with a user-friendly error. Malformed XML triggers a toast: 'Could not read this GPX file. Please check the format.'

The finalised route is stored as an array of \[latitude, longitude\] coordinate pairs in Firebase at /runs/{runId}/route. The array is compressed by applying the Douglas-Peucker algorithm with a tolerance of 0.0001 degrees (roughly 11 metres) to reduce point count and stay within Firebase's 10 MB per-node write limit.

### 3.1.2 Edge Cases

- Duplicate join code: The app retries generation up to 5 times. If all collide (astronomically unlikely with 1M possible codes), it falls back to an 8-character alphanumeric code.

- Admin closes app during route planning: The run exists in Firebase in 'draft' status. On next app open, the Admin is prompted to resume or discard the draft.

- GPX file with no track or route data: Toast error, route remains undefined, Admin must draw manually.

- Route too large (\>10,000 points after simplification): Further simplify with a larger tolerance, or warn the Admin to use a shorter route.

### 3.1.3 UX Decisions

- The share sheet offers: copy join code, copy link, share via system share sheet (WhatsApp, iMessage, etc.).

- The Admin can edit the run name and route up until the first Driver joins. After that, the route is locked and a 'Route locked' badge appears.

- The 6-digit code is displayed in large, monospaced, grouped digits (e.g., 483 927) for easy verbal communication.

## 3.2 Live Tracking Map

**Purpose:** Provide every participant with a shared, real-time view of all drivers' positions overlaid on the planned route.

### 3.2.1 Behaviour

Once a run is in 'active' status, every joined driver sees the Live Map screen. The map renders the planned route as a bold coloured polyline. Each driver is shown as a circular marker at their current GPS position. Markers contain the driver's initials (first letter of first and last name, or first two letters if only one name given). Each driver is assigned a deterministic colour from a palette of 15 distinguishable colours, derived from a hash of their driverId.

Location updates flow as follows: the local device's expo-location watcher fires a callback with new coordinates. The app throttles these to one write every 2 seconds. Each write updates /runs/{runId}/drivers/{driverId}/location with latitude, longitude, heading, speed, and a timestamp. All other devices subscribed to /runs/{runId}/drivers receive the update and animate the corresponding marker to the new position using a 1-second linear interpolation for smooth movement.

The map auto-centres on the user's own position by default. A toggle button ('Follow Me' / 'Free Pan') lets the user lock or unlock auto-centring. When in Free Pan mode, a floating button appears to re-centre. A 'Fit All' button zooms the map to show all active drivers.

### 3.2.2 Marker Details

Tapping a driver marker opens a bottom sheet showing: driver name, car make/model, current speed (km/h, derived from GPS speed field), and 'last updated X seconds ago'. If a driver has not updated in more than 15 seconds, their marker is shown at 50% opacity with a '?' badge, indicating potential signal loss.

### 3.2.3 Performance Considerations

- With 15 drivers updating every 2 seconds, Firebase receives roughly 7.5 writes/second. This is well within the Spark plan's concurrent-connection limit (100) and write throughput.

- Map tile caching: MapLibre's default tile cache (50 MB) is sufficient for most drive areas. No explicit offline tile pack is downloaded.

- Marker rendering: 15 SVG markers with initials is lightweight; no bitmap atlas needed.

- Firebase listener: a single onValue on /runs/{runId}/drivers is more efficient than per-driver listeners, as it results in one WebSocket frame per batch of near-simultaneous writes.

### 3.2.4 Edge Cases

- Driver with no GPS fix yet: marker is not rendered; driver appears in the driver list sidebar as 'Waiting for GPS…'.

- Two drivers at the exact same coordinates: markers stack; the topmost is the most recently updated. Tapping cycles through stacked markers.

- Admin ends run while drivers are still on the map: the map freezes, a modal appears: 'Run ended by Admin', and after acknowledgement the user is taken to the Post-Run Summary.

## 3.3 Hazard Flagging

**Purpose:** Enable drivers to warn the group about road hazards in real time.

### 3.3.1 Behaviour

A floating action button (FAB) labelled with a warning triangle icon is visible on the Live Map screen. Tapping it opens a quick-select radial menu or bottom sheet with six hazard types: Pothole, Roadworks, Police/Speed Trap, Debris/Gravel, Animal on Road, Broken Down Car. Each type has a distinct icon.

On selection, the hazard is immediately written to /runs/{runId}/hazards/{hazardId} with the reporter's driverId, GPS coordinates at the moment of reporting, hazard type, and a server timestamp. All other devices' Firebase listeners pick up the new hazard and render an icon on the map at those coordinates. A toast notification also briefly appears on every device: '{Driver Name} flagged: {Hazard Type}'.

Hazard icons on the map show a small badge with the time since reporting (e.g., '2m ago'). Tapping a hazard icon shows who reported it. Hazards older than 30 minutes are automatically hidden from the map (client-side filter) but remain in the database for the post-run summary. The Admin can manually dismiss any hazard from the map.

### 3.3.2 Edge Cases

- Driver reports hazard while offline: the hazard queues in Firebase's local cache and syncs when connectivity returns. The GPS coordinates are captured at the moment of reporting, so they are accurate even if sync is delayed.

- Rapid duplicate reporting: if two drivers report the same hazard type within 100 metres and 60 seconds of each other, the second report is silently merged into the first (client-side deduplication) and the first hazard's icon shows '2 reports'.

- Accidental flag: the radial menu has a 'Cancel' option. Once submitted, a 3-second undo toast appears.

## 3.4 Driver Car Profiles

**Purpose:** Collect vehicle data for fuel estimation and social display, without requiring persistent accounts.

### 3.4.1 Behaviour

When a driver taps the join link or enters the 6-digit code, they land on the Join Screen. This screen collects:

| **Field**       | **Input Type**                            | **Validation**                                                 | **Required** |
|-----------------|-------------------------------------------|----------------------------------------------------------------|--------------|
| Display Name    | Text input                                | 1–30 characters, no special chars                              | Yes          |
| Car Make        | Text input with autocomplete              | Max 30 characters                                              | Yes          |
| Car Model       | Text input with autocomplete              | Max 40 characters                                              | Yes          |
| Engine Size     | Numeric input + unit toggle (cc / litres) | Range: 0.1–10.0 L or 50–10000 cc                               | No           |
| Fuel Type       | Segmented picker                          | Petrol / Diesel / Electric / Hybrid                            | Yes          |
| Fuel Efficiency | Numeric input                             | Petrol/Diesel/Hybrid: MPG (1–150); Electric: mi/kWh (1.0–10.0) | No           |

Data is stored at /runs/{runId}/drivers/{driverId}/profile. When the run ends and the post-run summary is generated, this data is used for fuel calculations. No data persists beyond the run session. When the run is deleted (or expires after 24 hours), all driver profile data is removed.

The app caches the driver's last-entered profile locally on-device (AsyncStorage) as a convenience pre-fill for the next run they join. This is purely local; no cross-device persistence.

## 3.5 Post-Run Summary

**Purpose:** Deliver a rich statistical recap of the completed drive to all participants.

### 3.5.1 Trigger & Computation

When the Admin taps 'End Run', the app sets /runs/{runId}/status to 'ended' and computes the summary on the Admin's device. The computed summary object is written to /runs/{runId}/summary. All driver devices, which are listening to the run status, detect the change to 'ended' and navigate to the Summary Screen, reading the summary data from Firebase.

Computation details:

- **Total route distance:** Calculated from the route polyline using the Haversine formula between consecutive coordinate pairs, summed.

- **Per-driver top speed:** The maximum GPS speed value recorded in each driver's location history during the run. Location history is stored locally on each device as an array (not in Firebase, to save bandwidth). The Admin's device requests each driver's max speed via a one-time Firebase node at /runs/{runId}/drivers/{driverId}/stats/topSpeed, which each driver's device writes when the run ends.

- **Per-driver fuel estimate:** (Route distance in miles) / (driver's stated MPG) = gallons used. Converted to litres (x 3.785). For electric vehicles: (Route distance in miles) / (stated mi/kWh) = kWh used. If MPG/mi-per-kWh is not provided, show 'N/A'.

- **Collective fuel used:** Sum of all individual fuel estimates (in litres for petrol/diesel/hybrid, kWh for electric). Displayed as two separate totals if mixed fuel types are present.

- **Total drive time:** Difference between the run's startedAt and endedAt timestamps.

- **Hazard report breakdown:** Count of hazards by type from /runs/{runId}/hazards.

- **Route replay thumbnail:** A static map image generated client-side by rendering the route polyline onto a MapLibre static snapshot (captureViewToUri). This image is included in the shareable summary.

### 3.5.2 Shareable Output

The summary screen has a 'Share' button that generates either an image (PNG) or a PDF. The image version is a styled card (1080x1920 px, portrait) rendered via react-native-view-shot, containing the run name, date, key stats, and the route thumbnail. The PDF version uses react-native-pdf-lib or a similar library to produce a one-page A4 document with the same content. Both are shared via the system share sheet (expo-sharing).

### 3.5.3 Edge Cases

- Driver leaves before run ends: their data remains in Firebase; they appear in the summary with a 'Left early' tag, and their stats reflect only the portion they participated in.

- Admin loses connectivity when ending the run: the status change queues locally; summary computation is deferred until connectivity returns. Other drivers see the run as still active until the sync completes.

- No drivers provided fuel data: the fuel section of the summary shows 'No fuel data available' instead of zeros.

## 3.6 UI & Theming

**Purpose:** Deliver a polished, automotive-themed visual experience in both dark and light modes.

### 3.6.1 Theme Architecture

The app uses React Native's useColorScheme hook to detect the device system setting and applies the corresponding theme by default. A manual toggle in the Settings screen (accessible from a gear icon on the home screen) allows overriding with 'System', 'Dark', or 'Light'. The preference is persisted in AsyncStorage.

Theme tokens are stored in a central theme.ts file. All components reference tokens, never raw colour values. Key tokens:

| **Token**       | **Dark Value**          | **Light Value**                 |
|-----------------|-------------------------|---------------------------------|
| background      | \#0D1117                | \#F8FAFC                        |
| surface         | \#161B22                | \#FFFFFF                        |
| surfaceElevated | \#21262D                | \#F1F5F9                        |
| textPrimary     | \#F0F6FC                | \#0F172A                        |
| textSecondary   | \#8B949E                | \#64748B                        |
| accent          | \#E63946                | \#E63946                        |
| accentMuted     | \#E63946 at 20%         | \#E63946 at 10%                 |
| success         | \#3FB950                | \#16A34A                        |
| warning         | \#D29922                | \#CA8A04                        |
| danger          | \#F85149                | \#DC2626                        |
| border          | \#30363D                | \#E2E8F0                        |
| mapStyle        | Dark OSM / CartoDB Dark | Standard OSM / CartoDB Positron |

### 3.6.2 Typography

Primary font: Inter (loaded via expo-font). Fallback: system default. Headings use Inter Bold (700). Body text uses Inter Regular (400). Monospaced elements (join codes, stats) use JetBrains Mono or system monospace. Font sizes follow an 8-point scale: 12, 14, 16, 20, 24, 32, 40.

### 3.6.3 Map Theming

The map style switches between a dark tile set (CartoDB Dark Matter or a custom dark OSM style) and a light tile set (CartoDB Positron or standard OSM). The route polyline uses the accent colour (#E63946) at 80% opacity with a 4px stroke. Driver markers use solid filled circles with a 2px white border for contrast in both themes. Hazard icons use high-contrast warning colours (yellow, orange, red) that work on both backgrounds.

# 4. Firebase Data Structure

Below is the complete JSON schema for the Firebase Realtime Database. All paths are relative to the database root.

## 4.1 /joinCodes

A flat lookup mapping 6-digit codes to run IDs for quick join resolution.

> {
>
> "joinCodes": {
>
> "483927": {
>
> "runId": "-NxABC123def456",
>
> "createdAt": 1711929600000
>
> }
>
> }
>
> }

## 4.2 /runs/{runId}

Each run is a self-contained node. Below is the full structure with sample data:

> {
>
> "runs": {
>
> "-NxABC123def456": {
>
> "name": "Peak District Sunday",
>
> "description": "Scenic run through the Peaks",
>
> "joinCode": "483927",
>
> "adminId": "driver_a1b2c3",
>
> "status": "active", // draft \| active \| ended
>
> "createdAt": 1711929600000,
>
> "startedAt": 1711933200000,
>
> "endedAt": null,
>
> "maxDrivers": 15,
>
> "route": {
>
> "points": \[
>
> \[53.2274, -1.6920\],
>
> \[53.2310, -1.6855\],
>
> // ... compressed coordinate array
>
> \],
>
> "distanceMetres": 84200,
>
> "source": "drawn" // drawn \| gpx
>
> },
>
> "drivers": {
>
> "driver_a1b2c3": {
>
> "profile": {
>
> "name": "James H",
>
> "carMake": "BMW",
>
> "carModel": "M3 Competition",
>
> "engineSize": "3.0",
>
> "engineUnit": "litres",
>
> "fuelType": "petrol",
>
> "fuelEfficiency": 28,
>
> "fuelUnit": "mpg"
>
> },
>
> "location": {
>
> "lat": 53.2305,
>
> "lng": -1.6870,
>
> "heading": 145.2,
>
> "speed": 22.5,
>
> "accuracy": 4.2,
>
> "timestamp": 1711934000000
>
> },
>
> "joinedAt": 1711933200000,
>
> "leftAt": null,
>
> "stats": {
>
> "topSpeed": 38.7
>
> }
>
> }
>
> },
>
> "hazards": {
>
> "-NxHAZ001": {
>
> "type": "pothole",
>
> "reportedBy": "driver_a1b2c3",
>
> "reporterName": "James H",
>
> "lat": 53.2298,
>
> "lng": -1.6845,
>
> "timestamp": 1711934500000,
>
> "dismissed": false,
>
> "reportCount": 1
>
> }
>
> },
>
> "summary": {
>
> "totalDistanceKm": 84.2,
>
> "totalDriveTimeMinutes": 105,
>
> "driverStats": {
>
> "driver_a1b2c3": {
>
> "name": "James H",
>
> "carMake": "BMW",
>
> "carModel": "M3 Competition",
>
> "topSpeedKmh": 139.3,
>
> "fuelUsedLitres": 13.6,
>
> "fuelType": "petrol"
>
> }
>
> },
>
> "collectiveFuel": {
>
> "petrolLitres": 45.2,
>
> "dieselLitres": 12.1,
>
> "electricKwh": 18.4
>
> },
>
> "hazardSummary": {
>
> "total": 5,
>
> "byType": {
>
> "pothole": 2,
>
> "roadworks": 1,
>
> "police": 1,
>
> "debris": 1
>
> }
>
> },
>
> "generatedAt": 1711937400000
>
> }
>
> }
>
> }
>
> }

## 4.3 Firebase Security Rules (Pseudocode)

> {
>
> "rules": {
>
> "joinCodes": {
>
> "\$code": {
>
> ".read": true,
>
> ".write": "!data.exists()" // write-once only
>
> }
>
> },
>
> "runs": {
>
> "\$runId": {
>
> ".read": true, // readable if you know runId
>
> ".write": false, // no wildcard writes
>
> "status": {
>
> ".write": "data.parent().child('adminId').val()
>
> === newData.parent().child('adminId').val()"
>
> },
>
> "drivers": {
>
> "\$driverId": {
>
> "location": {
>
> ".write": true, // any driver can update own loc
>
> ".validate": "newData.hasChildren(
>
> \['lat','lng','timestamp'\])
>
> && newData.child('lat').isNumber()
>
> && newData.child('lng').isNumber()"
>
> }
>
> }
>
> },
>
> "hazards": {
>
> "\$hazardId": {
>
> ".write": true,
>
> ".validate": "newData.child('type').isString()
>
> && newData.child('lat').isNumber()"
>
> }
>
> }
>
> }
>
> }
>
> }
>
> }

# 5. Phased Development Task List

Each phase builds on the previous. Tasks are sized for a solo developer with AI assistance to complete in 1–4 hours each. 'Done' criteria are explicit and testable.

## 5.1 Phase 1 — Project Foundation

*Goal: Bootable app with navigation, theming, and Firebase connected. No features yet.*

**Task 1.1: Initialise Expo project**

Run 'npx create-expo-app ClubRun --template tabs'. Configure app.json with app name, slug, iOS/Android bundle IDs, and required permissions (location background, foreground service). Install core deps: expo-router, expo-location, react-native-maplibre-gl, firebase (JS SDK), zustand.

**Files:** *app.json, package.json, tsconfig.json*

**Done:** App boots on iOS simulator and Android emulator showing a placeholder home screen. All deps install without errors.

**Task 1.2: Set up Expo Router file structure**

Create the file-based routing layout: app/\_layout.tsx (root layout with ThemeProvider), app/(tabs)/\_layout.tsx (tab navigator), app/(tabs)/index.tsx (home), app/join/\[code\].tsx (deep link handler), app/run/\[id\]/map.tsx, app/run/\[id\]/summary.tsx.

**Files:** *app/ directory tree*

**Done:** Navigating between screens works. Deep link clubrun://join/123456 opens the join screen.

**Task 1.3: Implement theme system**

Create lib/theme.ts with all tokens for dark and light themes. Create a ThemeProvider context that reads useColorScheme and AsyncStorage override. Build a useTheme hook. Create a Settings screen with a 3-way toggle (System/Dark/Light).

**Files:** *lib/theme.ts, contexts/ThemeContext.tsx, app/settings.tsx*

**Done:** Toggling device dark mode switches the app theme. Manual override in Settings persists across restarts.

**Task 1.4: Configure Firebase**

Create a Firebase project in the console. Add a Realtime Database in test mode. Create lib/firebase.ts that initialises the Firebase JS SDK with the project config. Add a .env file for Firebase keys (not committed to git). Verify connectivity by writing and reading a test node.

**Files:** *lib/firebase.ts, .env, firebase.json*

**Done:** Console log confirms a round-trip write/read to Firebase Realtime Database succeeds.

**Task 1.5: Build reusable UI primitives**

Create a component library: Button (primary, secondary, ghost variants), TextInput with label and error state, Card, Badge, BottomSheet wrapper, Toast/Snackbar, and a LoadingSpinner. All themed.

**Files:** *components/ui/ directory*

**Done:** A test screen renders all primitives correctly in both dark and light mode.

## 5.2 Phase 2 — Run Creation & Join Flow

*Goal: Admin can create a run and Drivers can join via code. No map or tracking yet.*

**Task 2.1: Build Home Screen**

Two large CTA buttons: 'Create a Run' (Admin) and 'Join a Run' (Driver). A recent runs section shows the last 3 runs from local AsyncStorage (for the Admin only, since they don't have accounts). App logo and tagline at the top.

**Files:** *app/(tabs)/index.tsx, components/HomeScreen/*

**Done:** Home screen renders with both CTAs. Tapping each navigates to the correct screen.

**Task 2.2: Build Run Creation form**

Screen with name input, optional description, and a 'Create' button. On submit: generate a Firebase push key (runId), generate a random 6-digit code, check /joinCodes for uniqueness, write the run skeleton to /runs/{runId} with status 'draft', and write the code to /joinCodes/{code}. Show success screen with the code and share options.

**Files:** *app/create.tsx, lib/runService.ts*

**Done:** Creating a run writes correct data to Firebase. The 6-digit code is unique. The share sheet opens with the code and link.

**Task 2.3: Build Join Screen**

Screen with a large 6-digit input (auto-advancing cells). On entry of 6 digits: look up /joinCodes/{code} to get runId. If found, navigate to the Driver Profile form. If not, show error. Also handle deep link entry from app/join/\[code\].tsx.

**Files:** *app/join/\[code\].tsx, app/join/index.tsx, components/CodeInput.tsx*

**Done:** Entering a valid code navigates to profile form. Invalid code shows error. Deep link pre-fills the code.

**Task 2.4: Build Driver Profile form**

Collect name, car make/model (with local autocomplete from a bundled list of 200 popular makes/models), engine size, fuel type, and efficiency. Validate inputs. On submit: generate a driverId (UUID), write profile to /runs/{runId}/drivers/{driverId}/profile. Cache inputs in AsyncStorage for next time.

**Files:** *app/join/profile.tsx, lib/carData.ts, components/FuelTypePicker.tsx*

**Done:** Submitting the form writes correct profile data to Firebase. Re-opening the form on a new run pre-fills cached values.

**Task 2.5: Implement run status management**

Create a Zustand store (stores/runStore.ts) that holds the current runId, run status, driver list, and role (admin/driver). Subscribe to /runs/{runId}/status changes. Admin can transition: draft → active → ended. Drivers are notified of status changes.

**Files:** *stores/runStore.ts, lib/runService.ts*

**Done:** Admin tapping 'Start Run' changes status to active in Firebase. All connected clients' Zustand stores update within 1 second.

## 5.3 Phase 3 — Map & Route Planning

*Goal: Admin can draw or import a route. Map renders with OSM tiles in both themes.*

**Task 3.1: Integrate MapLibre**

Install react-native-maplibre-gl. Create a MapView wrapper component that accepts a style URL prop (dark or light tile server). Render a full-screen map on the route planning screen. Ensure gesture handling (pinch zoom, pan, rotate) works on both platforms.

**Files:** *components/Map/MapView.tsx, lib/mapStyles.ts*

**Done:** A full-screen map renders on both iOS and Android with correct theme-matched tiles. Gestures are smooth.

**Task 3.2: Build route drawing tool**

On the route planning screen, taps on the map place waypoint markers (numbered). After 2+ waypoints, call the OSRM API (GET http://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson) to get a road-snapped route. Decode the polyline and render it on the map. Allow dragging waypoints to recalculate. Max 25 waypoints.

**Files:** *app/create/route.tsx, lib/routeService.ts, components/Map/Waypoint.tsx*

**Done:** Placing 3 waypoints on the map shows a road-snapped route polyline between them. Moving a waypoint recalculates the route.

**Task 3.3: Build GPX import**

Add an 'Import GPX' button that opens expo-document-picker. Parse the selected file's XML (using fast-xml-parser) to extract track points. Apply Douglas-Peucker simplification. Render the imported route on the map. Pre-fill run name from GPX metadata if available.

**Files:** *lib/gpxParser.ts, lib/simplify.ts*

**Done:** Importing a Komoot-exported GPX file renders the correct route on the map. Files \> 5 MB show an error.

**Task 3.4: Save route to Firebase**

When the Admin confirms the route, serialize the coordinate array and write to /runs/{runId}/route along with the distance (computed via Haversine sum) and the source (drawn/gpx). Transition run status to active.

**Files:** *lib/routeService.ts, lib/geo.ts*

**Done:** Route data appears in Firebase with correct coordinates, distance in metres, and source type.

**Task 3.5: Display route on Driver's map**

When a Driver joins an active run, read /runs/{runId}/route and render the polyline on their map using the accent colour. The route is read-only for Drivers.

**Files:** *app/run/\[id\]/map.tsx, components/Map/RouteLine.tsx*

**Done:** A Driver joining the run sees the complete route polyline on their map.

## 5.4 Phase 4 — Live Location Tracking

*Goal: All drivers see each other in real time on the map.*

**Task 4.1: Implement foreground location tracking**

Use expo-location's watchPositionAsync with Accuracy.High and a 2-second interval. On each update, write to /runs/{runId}/drivers/{driverId}/location. Store a local array of all location updates for later stats.

**Files:** *lib/locationService.ts, hooks/useLocationTracking.ts*

**Done:** While the app is in the foreground, the driver's GPS coordinates update in Firebase every 2 seconds.

**Task 4.2: Implement background location tracking**

Use expo-location's startLocationUpdatesAsync with a TaskManager task. Configure foreground service notification ('ClubRun is tracking your drive'). Declare required permissions and background modes in app.json. On each background update, write to Firebase.

**Files:** *lib/backgroundLocation.ts, app.json config*

**Done:** Switching to another app or locking the screen continues to update location in Firebase. A persistent notification is visible.

**Task 4.3: Render driver markers on map**

Subscribe to /runs/{runId}/drivers with onValue. For each driver, render a circular marker with their initials and assigned colour. Animate marker position changes with a 1-second linear interpolation. Show staleness indicator (50% opacity + '?' badge) if no update in 15 seconds.

**Files:** *components/Map/DriverMarker.tsx, lib/colorAssigner.ts*

**Done:** With 2+ test devices, all drivers appear as coloured markers that move smoothly. Disconnecting one device shows the stale indicator after 15 seconds.

**Task 4.4: Build driver info bottom sheet**

Tapping a driver marker opens a bottom sheet showing: name, car make/model, current speed, last updated timestamp. Pull data from the Zustand store.

**Files:** *components/Map/DriverInfoSheet.tsx*

**Done:** Tapping a marker shows the correct driver info. Dismissing the sheet returns to the map.

**Task 4.5: Add map controls**

Implement 'Follow Me' toggle (auto-centres on user), 'Free Pan' mode with a re-centre button, and 'Fit All' button that zooms to show all drivers. Add a driver count badge in the top corner.

**Files:** *components/Map/MapControls.tsx*

**Done:** Follow Me keeps the map centred. Free Pan allows manual exploration. Fit All shows all markers. Driver count is accurate.

**Task 4.6: Implement adaptive accuracy throttling**

When GPS speed \< 5 km/h for 30+ seconds, switch to Accuracy.Balanced and 5-second interval. When speed \> 10 km/h, switch back to Accuracy.High and 2-second interval. This saves battery during stops.

**Files:** *lib/locationService.ts*

**Done:** Battery usage drops measurably during a stationary period. Accuracy ramps back up when driving resumes.

## 5.5 Phase 5 — Hazard Flagging

*Goal: Drivers can report and see hazards in real time on the map.*

**Task 5.1: Build hazard reporting UI**

Add a FAB with a warning icon on the map screen. Tapping opens a bottom sheet with 6 hazard type buttons, each with an icon and label. Selecting one immediately writes to /runs/{runId}/hazards/{pushKey}. Show a 3-second undo toast.

**Files:** *components/Map/HazardFAB.tsx, components/Map/HazardPicker.tsx*

**Done:** Tapping the FAB and selecting a hazard type writes the correct data to Firebase. The undo toast cancels the write if tapped.

**Task 5.2: Render hazard markers on map**

Subscribe to /runs/{runId}/hazards. Render each hazard as an icon marker on the map at its coordinates. Show a time-ago badge (e.g., '2m'). Hide hazards older than 30 minutes. Different icons for each hazard type.

**Files:** *components/Map/HazardMarker.tsx, lib/hazardIcons.ts*

**Done:** Hazard markers appear on all devices within 2 seconds of reporting. Old hazards auto-hide.

**Task 5.3: Implement hazard deduplication**

Client-side logic: before writing a new hazard, query recent hazards of the same type within 100m. If a match is found within the last 60 seconds, increment the match's reportCount instead of creating a new entry.

**Files:** *lib/hazardService.ts*

**Done:** Two drivers flagging the same pothole within 100m results in one marker with reportCount: 2.

**Task 5.4: Add hazard toast notifications**

When a new hazard is written by another driver, show a brief toast: '{Name} flagged: {Type}'. Use a custom animated toast component that does not obstruct the map controls.

**Files:** *components/ui/HazardToast.tsx*

**Done:** A toast appears on all other devices when a hazard is reported. It auto-dismisses after 3 seconds.

**Task 5.5: Admin hazard dismissal**

Admin sees a small 'X' button on each hazard marker. Tapping sets dismissed: true in Firebase, which hides the marker on all devices.

**Files:** *components/Map/HazardMarker.tsx (admin variant)*

**Done:** Admin can dismiss hazards; they disappear on all devices within 1 second.

## 5.6 Phase 6 — Post-Run Summary

*Goal: Rich summary screen with shareable output.*

**Task 6.1: Build 'End Run' flow**

Admin sees an 'End Run' button (with confirmation modal). On confirm: stop all location tracking, write each driver's topSpeed to /runs/{runId}/drivers/{driverId}/stats, set status to 'ended', compute summary, write to /runs/{runId}/summary.

**Files:** *lib/summaryService.ts, components/EndRunModal.tsx*

**Done:** Ending a run writes the complete summary object to Firebase. All drivers' location tracking stops.

**Task 6.2: Build Summary Screen**

A scrollable screen displaying: run name, date, total distance, total time, a table of per-driver stats (name, car, top speed, fuel used), collective fuel totals, hazard breakdown, and a static route map image. Use themed card components.

**Files:** *app/run/\[id\]/summary.tsx, components/Summary/*

**Done:** Summary screen displays all stats correctly. Data matches what was written to Firebase.

**Task 6.3: Generate route replay thumbnail**

Use MapLibre's captureViewToUri to render the route polyline on a static map at a fixed zoom. Save the image to the device's temp directory. Display it on the summary screen.

**Files:** *lib/mapCapture.ts*

**Done:** A static map image showing the route appears on the summary screen.

**Task 6.4: Implement share as image**

Use react-native-view-shot to capture the summary screen as a 1080x1920 PNG. Style the captured view as a branded card with the ClubRun logo. Share via expo-sharing.

**Files:** *lib/shareService.ts, components/Summary/ShareCard.tsx*

**Done:** Tapping 'Share as Image' generates a styled PNG and opens the system share sheet.

**Task 6.5: Implement share as PDF**

Use a lightweight PDF generation approach (e.g., html-to-pdf via expo-print, or react-native-pdf-lib) to produce a one-page A4 PDF with the same summary content. Share via expo-sharing.

**Files:** *lib/pdfService.ts*

**Done:** Tapping 'Share as PDF' generates a correctly formatted PDF and opens the system share sheet.

## 5.7 Phase 7 — Polish, Edge Cases & Testing

*Goal: Handle all edge cases, improve UX, and prepare for release.*

**Task 7.1: Implement offline handling**

Add a network status banner ('Reconnecting…') using NetInfo. Ensure Firebase offline persistence is enabled. Test the full flow: join run, lose signal, regain signal. Verify queued writes sync correctly.

**Files:** *components/ui/ConnectionBanner.tsx, lib/firebase.ts*

**Done:** Losing and regaining signal does not crash the app. Queued location writes sync. The banner shows/hides correctly.

**Task 7.2: Add permission request flows**

Create polished permission request screens for location (foreground + background). Explain why the permission is needed with clear copy. Handle denial gracefully (disable tracking, show permanent banner explaining the app cannot function without location).

**Files:** *components/Permissions/LocationPermission.tsx*

**Done:** First launch shows a clear explanation before the OS permission dialog. Denial shows a helpful message with a link to settings.

**Task 7.3: Implement run expiry cleanup**

Runs older than 24 hours should be cleaned up. Since there is no backend, the Admin's device checks on app open and deletes expired runs from Firebase. Also delete the corresponding joinCode.

**Files:** *lib/cleanupService.ts*

**Done:** Opening the app 25 hours after a run deletes the run and its join code from Firebase.

**Task 7.4: Add driver list sidebar**

A swipeable or toggleable sidebar on the map screen listing all drivers with their name, car, and connection status (green dot = active, grey = stale). Admin sees a 'Remove' button next to each driver.

**Files:** *components/Map/DriverList.tsx*

**Done:** The sidebar shows all drivers with correct statuses. Admin can remove a driver, which deletes their node from Firebase.

**Task 7.5: Implement max 15 driver enforcement**

Before writing a new driver to Firebase, check the current driver count. If \>= 15, show 'Run is full' error and do not join. Use a Firebase transaction to prevent race conditions.

**Files:** *lib/runService.ts (join logic)*

**Done:** The 16th driver attempting to join sees a 'Run is full' message. No more than 15 driver nodes exist.

**Task 7.6: Performance optimisation pass**

Profile the app with React DevTools and Flipper. Optimise: memoize marker components, debounce map re-renders, use InteractionManager for non-urgent updates, lazy-load the summary screen.

**Files:** *Various components*

**Done:** Map screen maintains 60fps with 15 drivers updating. No jank when opening bottom sheets or toggling controls.

**Task 7.7: End-to-end testing**

Write test scenarios covering: create run, join run, drive with tracking, report hazard, end run, view summary, share summary. Test on physical iOS and Android devices. Test with 2–3 real devices simultaneously.

**Files:** *docs/test-plan.md*

**Done:** All scenarios pass on both platforms with no crashes or data inconsistencies.

**Task 7.8: App Store preparation**

Create app icons (1024x1024 + all sizes), splash screen, and App Store screenshots. Write store listing copy. Configure EAS Build for production. Run a TestFlight/Internal Testing build.

**Files:** *assets/, app.json, eas.json*

**Done:** A production build installs and runs correctly from TestFlight (iOS) and Internal Testing (Android).

# 6. Risks, Gotchas & Mitigations

**Background GPS on iOS** **\[Critical\]**

**Risk:** iOS aggressively throttles background location to save battery. Updates may come every 5–15 seconds instead of the desired 2 seconds. On iOS 17+, Apple requires the 'Always' permission for background tracking, which triggers a second permission dialog that many users miss.

**Mitigation:** Accept the lower update frequency on iOS (5–15s is still usable). Use the significant-change monitoring API as a fallback if continuous background mode is suspended. Provide clear onboarding guidance for the 'Always' permission step. Consider a foreground-service-style approach using a continuous audio session (silent audio) as a keep-alive, though this may risk App Store rejection.

**Background GPS on Android** **\[High\]**

**Risk:** Android 10+ requires ACCESS_BACKGROUND_LOCATION, which since Android 11 is only grantable from the Settings app (not an in-app dialog). Some OEMs (Xiaomi, Huawei, Samsung) have aggressive battery optimisation that kills foreground services.

**Mitigation:** Use expo-location's foreground service, which is more resilient than background tasks. Provide a 'Battery Optimisation' screen that detects the OEM and links to dontkillmyapp.com instructions. Test on at least Samsung and Xiaomi devices.

**Firebase Spark Plan Limits** **\[High\]**

**Risk:** The free tier allows 100 simultaneous connections, 1 GB storage, 10 GB/month download. With 15 drivers each holding 2 connections (location write + data listen), that is 30 connections per run. Running more than 3 simultaneous runs could approach the limit. Download bandwidth is the tightest constraint: 15 drivers x 2-second updates x ~200 bytes = ~1.3 MB/minute per run. A 2-hour run consumes ~156 MB. At 10 GB/month, you could run roughly 64 two-hour runs before hitting the cap.

**Mitigation:** Monitor bandwidth usage in the Firebase console. Reduce update frequency to 3 seconds if approaching limits. Compress location payloads (e.g., omit accuracy and heading when unchanged). Consider upgrading to Blaze (pay-as-you-go) if the app gains traction; costs would be minimal (pennies per run).

**OSRM Public Server Limits** **\[Medium\]**

**Risk:** The public OSRM demo server (router.project-osrm.org) has no SLA and may rate-limit or go down. It is not intended for production use.

**Mitigation:** Cache route responses aggressively. If the OSRM server is down, degrade gracefully: allow the Admin to place waypoints as straight-line segments instead of road-snapped routes. Consider self-hosting OSRM (single Docker container, ~2 GB RAM for UK data) if reliability becomes an issue.

**GPX Import Variability** **\[Medium\]**

**Risk:** GPX files from different sources (Komoot, Strava, Garmin) have varying structures. Some use \<trk\>, some use \<rte\>, some include elevation data, some do not. Namespace handling varies.

**Mitigation:** Support both \<trk\> and \<rte\> elements. Ignore elevation data. Use a lenient XML parser (fast-xml-parser with ignoreAttributes: false). Test with GPX exports from the top 5 sources: Komoot, Strava, Garmin Connect, RideWithGPS, and Google My Maps.

**Map Tile Server Reliability** **\[Medium\]**

**Risk:** Free OpenStreetMap tile servers (tile.openstreetmap.org) have a strict usage policy and may block high-frequency requests. CartoDB/CARTO free tiles may have usage limits.

**Mitigation:** Use multiple tile server options as fallbacks. Consider Protomaps (free, self-hosted PMTiles) or MapTiler's free tier (100k tile requests/month) as alternatives. Cache tiles aggressively via MapLibre's built-in cache.

**No Authentication = No Abuse Protection** **\[Medium\]**

**Risk:** Without user accounts, there is no way to ban abusive users, and anyone with the run code can join and spam hazard reports or fake locations.

**Mitigation:** The Admin can remove any driver from the run (Task 7.4). Rate-limit hazard reports to 1 per 10 seconds per driver (client-side). Firebase Security Rules limit write payload size. For V2, consider optional Firebase Anonymous Auth to enable basic banning.

**Large Route Data in Firebase** **\[Low\]**

**Risk:** A complex GPX route with 50,000 points would exceed Firebase's 10 MB per-write limit and slow down sync.

**Mitigation:** Douglas-Peucker simplification (Task 3.3) reduces points to typically \< 2,000 for any real-world driving route. Warn the Admin if the simplified route still exceeds 5,000 points.

**Expo Managed Workflow Constraints** **\[Low\]**

**Risk:** Some native modules (especially MapLibre) may require a development build rather than Expo Go. This adds friction to the development cycle.

**Mitigation:** Use EAS Development Builds from the start. Create a custom dev client that includes all native modules. This is a one-time setup cost.

**Coordinate Privacy** **\[Low\]**

**Risk:** Drivers' real-time GPS coordinates are visible to all run participants. In theory, someone could track another driver after the run if they cached the data.

**Mitigation:** Data is deleted 24 hours after the run (Task 7.3). Firebase Security Rules prevent reading runs you do not have the ID for. The join code expires with the run. For V2, consider obfuscating exact coordinates when a driver leaves the run.

# 7. Appendices

## 7.1 Appendix A — Phase Summary Timeline

| **Phase** | **Name**                 | **Tasks** | **Est. Duration** |
|-----------|--------------------------|-----------|-------------------|
| 1         | Project Foundation       | 5 tasks   | 2–3 days          |
| 2         | Run Creation & Join Flow | 5 tasks   | 3–4 days          |
| 3         | Map & Route Planning     | 5 tasks   | 4–5 days          |
| 4         | Live Location Tracking   | 6 tasks   | 5–7 days          |
| 5         | Hazard Flagging          | 5 tasks   | 3–4 days          |
| 6         | Post-Run Summary         | 5 tasks   | 4–5 days          |
| 7         | Polish & Testing         | 8 tasks   | 5–7 days          |

**Total estimated duration:** 26–35 working days for a solo developer with AI assistance.

## 7.2 Appendix B — Hazard Icon Reference

| **Hazard Type**     | **Icon**             | **Map Colour**    | **Firebase Key** |
|---------------------|----------------------|-------------------|------------------|
| Pothole             | ⚠ Circle with crack  | \#EF4444 (red)    | pothole          |
| Roadworks           | 🚧 Barrier           | \#F97316 (orange) | roadworks        |
| Police / Speed Trap | 🚔 Car silhouette    | \#3B82F6 (blue)   | police           |
| Debris / Gravel     | ◆ Diamond scatter    | \#EAB308 (yellow) | debris           |
| Animal on Road      | 🦌 Animal silhouette | \#22C55E (green)  | animal           |
| Broken Down Car     | 🚗 Car + triangle    | \#A855F7 (purple) | brokendown       |

## 7.3 Appendix C — Fuel Calculation Formula

For petrol, diesel, and hybrid vehicles:

*Fuel (litres) = (Route distance in miles) ÷ (Driver's MPG) × 3.78541*

For electric vehicles:

*Energy (kWh) = (Route distance in miles) ÷ (Driver's miles per kWh)*

If a driver did not provide fuel efficiency data, their fuel estimate is shown as 'N/A' in the summary. The collective total only includes drivers who provided data.

## 7.4 Appendix D — Key Dependencies & Versions

| **Package**              | **Purpose**        | **Min Version** |
|--------------------------|--------------------|-----------------|
| expo                     | Framework          | ~52.0.0         |
| expo-router              | Navigation         | ~4.0.0          |
| expo-location            | GPS tracking       | ~17.0.0         |
| expo-document-picker     | GPX file import    | ~12.0.0         |
| expo-sharing             | Share sheet        | ~12.0.0         |
| react-native-maplibre-gl | Map rendering      | ~10.0.0         |
| firebase                 | Backend (JS SDK)   | ~10.12.0        |
| zustand                  | State management   | ~4.5.0          |
| fast-xml-parser          | GPX parsing        | ~4.3.0          |
| react-native-view-shot   | Summary screenshot | ~4.0.0          |

*End of document.*
