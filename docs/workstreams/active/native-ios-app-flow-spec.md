# Native iOS App Flow Spec

Status: Active planning
Created: 2026-05-05

This workstream captures the product flow, user identity model, and screen behavior for the native iOS-only ClubRun app. It is the planning source for UI, navigation, and implementation sequencing.

This app is no longer planned as an Expo UI port. Going forward, the product direction is native iOS only, with SwiftUI, Apple-native patterns, MapKit, Apple Maps routing, GPX import, and Firebase as the backend.

## 1. Current Product Direction

ClubRun is an iOS app for real-world group drives.

The core loop is:

1. A run organizer creates a drive.
2. The organizer shares a join code.
3. Drivers join with that code.
4. Drivers enter or reuse their driver profile.
5. The group follows the route together.
6. Drivers can see each other, report hazards, and finish the drive.

The app should feel fast and event-oriented. Creating or joining a run should not feel like signing up for a social network.

## 2. Identity And Registration Decision

### Current Decision

Use simple account registration for v1:

- email/password authentication
- password reset support
- required public display name
- required car make and car model
- local session restore after login

Do not use Sign in with Apple for v1.

Important implementation note:

- password reset requires an email address, so the auth credential should be email/password rather than a username-only password login.
- the user-facing identity should be a display name.
- if a separate unique username is desired later, add it as profile metadata rather than using it as the auth credential.

### Why Registration Is Acceptable Here

Registration is acceptable because the product benefits from persistent driver identity:

- saved profile details across runs
- reusable car make/model
- profile picture later for map markers
- future run history
- future saved garage/preferences
- password reset and account recovery

The create/join flow still needs to stay fast. Registration should be a short setup step, not a long onboarding sequence.

### Planning Decision

For v1, require account login/registration before creating or joining a run.

Keep the registration flow minimal:

1. email
2. password
3. display name
4. car make
5. car model

Optional profile fields can be added after the account is created.

## 3. Profile Model

### Required Driver Profile

The user should provide:

- display name
- car make
- car model

The display name is the name shown in lobbies, maps, hazard reports, and summaries.

The car make/model should be enough for v1. Fuel and engine details are not needed for the first production app unless summary/fuel calculations become a confirmed feature.

### Optional Profile Fields

Useful optional fields:

- profile photo
- generated car badge/color
- preferred units
- emergency contact

Recommendation:

- profile photo: defer until account/profile polish unless it becomes central to live-map identity
- generated car badge/color: include in v1 as the default map/lobby identity marker
- preferred units: include in settings/profile because it affects map and distance display
- emergency contact: defer unless the product explicitly includes safety workflows

Generated car badge direction:

- assign each driver a generated color and compact badge
- badge can use display-name initials or car initials
- use the badge in the lobby, driver list, and live map markers
- avoid depending on user-uploaded photos for v1
- keep colors accessible and distinguishable on Apple Maps
- profile pictures are not in v1 unless revisited later
- uploaded/custom car badges are not needed for v1
- pre-created car badge assets may be revisited later if licensing, coverage, and maintenance are solved

Car selection direction:

- use searchable text entry with suggestions, not a fixed dropdown
- make/model lists are too large and too incomplete for a plain dropdown
- allow free text fallback for rare, custom, or modified cars
- later, add curated common make/model suggestions and normalize entries where possible

### Storage

The app should save the profile to the backend account profile and cache it locally for fast launch.

Local cached profile data should never be treated as the only source of truth once account login exists.

## 4. First Launch Direction

First launch should check for an existing authenticated session.

The first user-visible screen should offer two primary choices:

- Create Run
- Join Run

If no authenticated session exists, the app should show login/register first.

If a previous active run exists locally, the app may show a resume affordance above or below those actions, but it should not block create/join.

Open decision:

- Should active-run restore take priority over Create/Join, or appear as a secondary resume banner?

## 5. Create Run Flow

Initial direction:

1. User taps Create Run.
2. If no local profile exists, ask for display name, car make, and car model.
3. App creates the run and marks the user as admin.
4. App generates a six-digit join code.
5. App shows the run lobby with share controls.
6. Admin adds or imports the route.
7. Admin opens the run for drivers.
8. Admin starts the drive.

Backend writes:

- `/runs/{runId}`
- `/joinCodes/{joinCode}`
- later: `/runs/{runId}/route`
- later: `/runs/{runId}/status`

## 6. Join Run Flow

Initial direction:

1. User taps Join Run.
2. User enters a six-digit join code.
3. App resolves the code to a run.
4. If no local profile exists, ask for display name, car make, and car model.
5. App writes the driver record to the run.
6. App enters the lobby or active drive depending on run status.

Backend reads/writes:

- read `/joinCodes/{joinCode}`
- read `/runs/{runId}`
- write `/runs/{runId}/drivers/{uid}`

## 7. Registration And Invite Implications

Join codes are the preferred v1 invite mechanism.

Registered-user invites should be treated as a later layer because they require:

- searchable users or contacts
- privacy decisions
- invite acceptance state
- push notifications or inbox UI
- account recovery and profile sync behavior

This should not block v1.

## 8. UI Planning Notes

The first production UI should prioritize:

- fast create/join actions
- clear profile setup
- visible join code sharing
- route preview before drive start
- map-first live drive
- low-friction hazard reporting

Avoid building a polished marketing-style home screen. The app should open directly into the operational experience.

## 9. Proposed Screen Flow

### 9.1 Auth Gate

Purpose:

- decide whether the user is already authenticated
- send unauthenticated users into login/register
- send authenticated users into the main create/join hub

States:

- checking session
- signed out
- signed in with complete profile
- signed in with incomplete profile

Routes:

- signed out -> Login
- signed in with incomplete profile -> Profile Setup
- signed in with complete profile -> Home Hub

### 9.2 Login

Purpose:

- existing users sign in quickly

Fields:

- email
- password

Actions:

- Log In
- Create Account
- Forgot Password

Failure states:

- invalid email/password
- network unavailable
- account disabled or missing

### 9.3 Register

Purpose:

- create a minimal account and profile

Fields:

- email
- password
- confirm password
- display name
- car make
- car model

Actions:

- Create Account
- Back to Log In

Validation:

- valid email
- password minimum length
- password confirmation match
- display name required
- car make required
- car model required

Post-success route:

- Home Hub

### 9.4 Forgot Password

Purpose:

- reset password by email

Fields:

- email

Actions:

- Send Reset Link
- Back to Log In

Success state:

- show confirmation that a reset email was sent if the account exists

### 9.5 Profile Setup / Edit Profile

Purpose:

- complete or update driver identity

Required fields:

- display name
- car make
- car model

Optional fields:

- profile photo
- preferred units
- emergency contact, deferred unless safety features are in v1

Entry points:

- after registration if profile is incomplete
- Settings/Profile
- before create/join if profile is missing required fields

### 9.6 Home Hub

Purpose:

- primary post-login screen
- fast access to create or join a drive

Primary actions:

- Create Run
- Join Run

Secondary content:

- resume active run if one exists
- recent runs later
- profile/settings entry

Recommended first layout:

- top: user identity row with display name, generated badge, and car make/model
- middle: two large actions, Create Run and Join Run
- lower: active run card if applicable

Active run card:

- compact card
- show run name and status
- tapping the card opens the run directly
- do not label it "Resume" unless later usability testing shows the action is unclear

### 9.7 Create Run

Purpose:

- create the run shell and join code

Initial v1 fields:

- run name
- optional short description

Defaults:

- max drivers can default to 15
- status starts as draft

Actions:

- Create Run
- Cancel

Presentation:

- keep this simple
- only ask for run name and optional description
- use a sheet or compact full-screen form
- all deeper setup belongs in the admin lobby/admin panel after the run exists

Backend writes:

- `/runs/{runId}`
- `/joinCodes/{joinCode}`

Post-success route:

- Run Lobby as admin

### 9.8 Join Run

Purpose:

- enter a code and join an existing run
- make joining possible at any time without friction

Fields:

- six-digit join code

Actions:

- Join
- scan/link support later

Presentation:

- full code-entry screen
- large, focused six-digit input
- once the code resolves, show the run name above or near the confirmation state

Backend operations:

- read `/joinCodes/{joinCode}`
- read `/runs/{runId}`
- write `/runs/{runId}/drivers/{uid}`

Post-success route:

- Run Lobby if run is draft/ready
- Live Drive if run is already active and joining active runs is allowed

Design notes:

- code entry should be very fast and forgiving
- support paste from clipboard if a code is copied
- auto-advance six code cells or use a large single code field with clear grouping
- once joined, the user should be able to revisit the lobby at any time to see route/admin/run details

### 9.9 Run Lobby

Purpose:

- waiting/setup space before the live drive

Lobby should not become one overloaded screen. Treat it as a compact hub with sections that open deeper views.

Main admin lobby layout:

1. Header / Code and Start
2. Route Setup summary row
3. Drivers summary row
4. Run readiness/status row
5. Secondary settings/details as needed

Admin lobby sections:

- Code and Start
- Route Setup
- Drivers
- Run Status

#### Admin Lobby: Header / Code And Start

Purpose:

- make the join code easy to share
- make the next admin action obvious
- keep start-drive readiness visible

Content:

- run name
- six-digit join code
- share code button
- copy code button if share sheet is not enough
- start drive button
- readiness label

Start drive button states:

- disabled if no route exists
- disabled if required admin/location permissions are missing
- enabled once route exists and minimum readiness is satisfied
- loading while status changes to active

Readiness label examples:

- "Add a route before starting"
- "Waiting for drivers"
- "Ready to start"
- "Starting..."

Open decision:

- should start require at least one joined driver, or can an admin start solo for testing/pre-runs?

Recommendation:

- allow admin to start solo
- show a confirmation if no other drivers are currently waiting
- solo start is useful for testing, route previews, and scouting drives

#### Admin Lobby: Route Setup Row

Purpose:

- show whether the run has a route
- open the route setup flow

No-route state:

- title: "Route"
- value: "Not set"
- action: "Set route"

Route-exists state:

- title: "Route"
- value: distance and estimated duration
- action: opens Route Setup / Route Details

Content when route exists:

- distance
- estimated duration
- stop count
- source: Apple Maps route or GPX

Do not show a full map preview in the lobby. The row should stay compact.

#### Admin Lobby: Drivers Row

Purpose:

- summarize participants without crowding the lobby
- open the full driver sheet

Content:

- joined driver count
- waiting/currently present count
- small badge cluster for first few drivers
- row opens Drivers sheet

Driver status concepts:

- joined: driver has accepted/joined the run
- waiting: driver is currently in the lobby and ready for start
- offline/stale: driver joined but is not currently present
- active: driver is in the live drive after start

Open decision:

- do we need an explicit "ready" toggle from each driver, or is presence in the lobby enough?

Recommendation:

- do not add a driver ready toggle in v1
- use presence/currently waiting as the readiness signal
- ready toggles add coordination overhead and another state to maintain
- revisit explicit ready checks only if real club usage shows admins need it

#### Admin Lobby: Drivers Sheet

Purpose:

- show all joined drivers and their state

Content per driver:

- generated badge/color
- display name
- car make/model
- status indicator
- last seen / currently waiting indicator

Admin actions for later:

- remove driver before start
- approve/deny joins if moderation is added
- message/notify driver if communications are added

V1 recommendation:

- no approval gate
- no messaging
- allow admin remove only if simple and supported by rules

#### Admin Lobby: Run Status Row

Purpose:

- show operational state without adding another full screen

States:

- Draft: route/setup in progress
- Ready: route exists, waiting for start
- Active: drive has started
- Ended: run completed

Display:

- short state label
- plain explanation of what is blocking start, if anything

#### Admin Lobby: Driver View

Driver lobby should be simpler than admin lobby.

Content:

- run name
- admin name
- route summary if route exists
- driver count
- own joined status
- waiting/start state
- entry point to route details
- entry point to driver list

Driver should not see admin setup controls.

Driver lobby:

- run name
- admin
- route summary
- driver list entry point
- waiting/start state
- ability to open route details if available

Driver list modal/sheet:

- all drivers who joined with the code
- badge/color for each driver
- display name
- car make/model
- status indicator for waiting/ready/currently present
- later: admin remove/approve controls if needed

Route preview:

- do not duplicate a full route preview in the lobby
- show only a compact route summary in the lobby
- full preview belongs inside Route Setup / Route Details

### 9.10 Route Setup

Purpose:

- admin defines the route before driving

Inputs:

- Apple Maps generated route
- GPX import

Definition:

- Apple Maps generated route means MapKit asks Apple's routing service for driving directions between the chosen start, destination, and waypoints.
- The app displays the returned route line and saves its geometry, distance, duration, and stop metadata.
- This is the primary route creation method.
- GPX import is the secondary route creation method and should stay visually minimal.

Admin actions:

- add start/destination/stops
- import GPX
- preview route
- save route

Desired interaction model:

- work like a native Apple/Google Maps route planner
- map should be the largest element on the screen
- choose start and destination by search, current location, or dropped pin
- add waypoints by search or pin drop
- reorder waypoints with simple drag handles
- update route summary as stops change
- make the map clear, responsive, and easy to pan/zoom
- keep controls compact so they do not fight the map

Primary route flow:

1. Admin opens Route Setup from the lobby.
2. Admin sets a start point.
3. Admin sets a destination.
4. App requests an Apple Maps driving route.
5. Route line appears on the map.
6. Admin adds optional waypoints between start and destination.
7. Waypoints can be added by search or by manually moving/dropping a pin.
8. Admin can reorder waypoints.
9. Route recalculates whenever stops are added, removed, or reordered.
10. Admin saves the route.

Route editor layout:

- full-screen map
- compact bottom glass/editor panel
- start row
- waypoint rows
- destination row
- drag handles for waypoint rows
- route summary always visible when a route exists
- save route button
- small GPX import affordance, not a competing primary action

Route save rules:

- start is required
- destination is required
- route calculation must succeed
- saved route should include points, distance, duration, source, and stops

GPX import flow:

1. Admin taps a secondary GPX import action.
2. Admin selects a GPX file.
3. App parses and previews the imported route.
4. Admin saves or discards.

GPX editing decision:

- no GPX route editing in v1
- imported GPX is preview-and-save only
- if the admin wants editable stops, they should use the Apple Maps generated route flow

Post-success route:

- Run Lobby

### 9.11 Live Drive

Purpose:

- map-first active drive experience
- show route, nearby drivers, and hazards at a glance without a dashboard

Core UI:

- MapKit route
- driver markers
- own location
- hazard/report button
- route progress/status
- admin end-run control

Design direction:

- map should use as much of the screen as possible
- the most important information must be readable at a glance
- use Apple Maps/MapKit styling and native SwiftUI controls
- avoid dense panels while driving
- primary controls should be large, reachable, and visually stable
- driver markers should use generated badges/colors by default
- hazard reporting should be one tap away in the bottom-right area but not easy to trigger accidentally

Top status overlay:

- small glass status bar over the map
- show run name and active drive status
- show next waypoint and distance remaining when available

Example:

- "Sunday Mountain Run · Active"
- "Next stop: Chapman's Peak · 12 km"

Bottom controls:

- recenter
- route overview
- lobby/details
- hazard report in the bottom-right
- admin end drive, admin only

Driver markers:

- generated color and badge
- status ring/state
- do not show live speed for other drivers
- tapping a driver can show display name, car make/model, and location freshness

Driver marker states:

- live/current
- stale location
- stopped
- offline

Hazards:

- reported hazards appear on the map at the route/location where they were reported
- hazard marker should use a clear icon by type
- tapping a hazard opens type, reporter, and time/details
- admin may dismiss hazards later if needed
- repeated reports can increment or strengthen a hazard marker later

Driver writes:

- location updates
- hazard reports

Admin writes:

- status changes
- summary/end data

### 9.12 Hazard Report

Purpose:

- quick report while driving
- place a visible route hazard at the driver's current location with minimal distraction

Presentation:

- bottom sheet
- opened from the bottom-right Live Drive hazard button
- large touch targets
- dismissible by drag, close button, or selecting a hazard

Recommended interaction:

- not pure one-tap from the map button
- map button opens a confirm/report sheet
- selecting a hazard type reports immediately and dismisses the sheet
- show a short confirmation toast/banner after reporting

Reason:

- pure one-tap reporting is too easy to trigger accidentally while driving
- a sheet still keeps reporting fast while preventing most accidental reports

Options:

- pothole
- roadworks
- police
- mobile camera
- debris
- broken-down car
- accident/incident, if legally/product appropriate
- other, optional later

Post-action:

- write hazard
- dismiss sheet
- show confirmation

Hazard data:

- type
- reportedBy uid
- reporter display name
- latitude
- longitude
- timestamp
- dismissed false
- report count 1

Map behavior:

- hazard appears on the map at the location where it was reported
- marker should be visible along the route
- marker icon/color should communicate the hazard type
- tapping a hazard opens type, reporter, time ago, and report count

Expiry/dismissal:

- hazards should not stay forever during a drive
- v1 recommendation: visually fade hazards after 20 minutes and hide after 30 minutes
- admin can dismiss a hazard manually if needed
- repeated reports can refresh or strengthen the hazard marker

Open decisions:

- exact hazard type list
- whether drivers can dismiss hazards or only admins can
- exact expiry timing after physical drive testing

Confirmed hazard type decisions:

- include police
- include mobile camera

Hazard validity direction:

- hazards should become more or less trusted based on nearby driver confirmation
- when another driver approaches a reported hazard, the app can ask a lightweight confirmation question
- confirmation should be quick and non-blocking

Potential confirmation outcomes:

- still there
- gone

Ignoring or dismissing the prompt should leave the hazard on its original timer.

Timer behavior concept:

- "still there" refreshes or extends the hazard timer and can increase confidence/report count
- "gone" reduces confidence and can fade or remove the hazard sooner

Complexity note:

- proximity-based confirmation adds meaningful product value, but it also adds location-trigger logic, notification timing, UI prompts, and anti-spam rules
- v1 can launch with simple report/expiry/admin-dismiss behavior
- v1.5 can add nearby-driver confirmation once live location and hazard rendering are stable

### 9.13 End Run / Summary

Purpose:

- finish active drive and show result
- let drivers complete their own run experience even if the admin disconnects

Admin:

- confirm end run
- write ended status
- generate or write summary
- can terminate the full group drive if reconnected

All users:

- view summary
- leave run
- return home

Who can end what:

- only admin can end the global/group run
- confirmation is required before admin ends the group run
- each driver can end/leave their own drive session
- driver ending their own session should stop their tracking and generate their personal summary
- driver ending their own session should not end the global run for everyone else

Admin disconnect model:

- if admin disconnects, drivers should not be trapped in an active run
- drivers can finish individually by reaching the final destination
- drivers can manually leave/end their own drive at any time
- if admin reconnects, admin can still end the global run
- if admin never reconnects, individual driver sessions can time out independently

Recommended timeout behavior:

- if a driver has no active location updates for a set period, mark that driver stale/offline
- if a driver is stale for a longer period, stop expecting live data from that driver
- if the app is reopened, offer to resume or finish the personal drive
- global run cleanup can be handled later by expiry rules, not by non-admin drivers

Arrival behavior:

- when a driver reaches the final destination, show a finish prompt
- if the driver confirms finish, stop tracking and show personal summary
- if the admin reaches the destination, allow "End Group Drive" as the primary admin action

Post-drive availability:

- summaries must remain available after the drive
- user should be able to revisit past summaries from history/profile later
- summary should have a clean share/copy format
- shared summary should be readable outside the app as plain text or image/card export later

Stats ideas:

- personal max speed
- personal strongest acceleration/braking/cornering g-force if sensor quality is reliable
- route heatmap for collective speed intensity
- route heatmap for collective g-force intensity
- personal speed heatmap
- personal g-force heatmap
- distance driven
- moving time
- stopped time
- hazard count
- driver participation timeline

Safety/privacy notes:

- speed and g-force stats can encourage risky behavior if presented competitively
- keep max speed and max g-force stats, but do not rank drivers by max speed or max g-force
- make personal stats private by default unless sharing is explicitly designed
- collective heatmaps should be useful for route review, not competition
- physical-device sensor validation is required before trusting g-force data

Onboarding/safety note:

- after signup, include a short note that accurate g-force readings require the phone to be mounted securely
- keep the note lightweight and practical, not a blocking safety course

### 9.14 Settings

Purpose:

- account/profile/preferences
- let users maintain identity and preferences without distracting from create/join/drive flows

Sections:

- Profile
- Car
- Units
- Account
- Debug/backend status during development

Actions:

- edit profile
- reset password flow
- sign out

Profile section:

- display name
- generated badge preview
- badge color regenerate option, if allowed
- later: profile photo if account/profile polish is revisited

Car section:

- car make
- car model
- searchable make/model suggestions
- free text fallback
- generated car initials/badge preview

Units section:

- distance units
- speed units
- temperature units only if weather or conditions are added

Recommended v1 unit options:

- kilometres / kilometres per hour
- miles / miles per hour

Account section:

- email
- reset password
- sign out
- delete account later, once data deletion behavior is defined

History section:

- past runs
- summaries
- personal heatmaps where available
- shared/exported summary later

Development/debug section:

- backend mode
- authenticated uid
- database/emulator status
- latest run write/read smoke result

Debug visibility:

- show during development/TestFlight builds
- hide or tuck away in production unless explicitly enabled

Settings design:

- use a standard grouped settings list
- avoid dashboard-like cards
- profile edit can be a separate form sheet
- reset password should be a simple account action

## 10. Next Planning Tasks

- Decide first-launch restore behavior.
- Define profile setup screen fields and validation.
- Define create-run lobby behavior.
- Define route setup flow: Apple Maps generated route vs GPX import.
- Define live drive map controls.
- Define hazard reporting flow.
- Define end-run and summary flow.

## 11. Data Model Planning

This section captures the backend shapes implied by the native iOS app flow. Exact field names can still be refined during implementation, but the product concepts should remain stable.

### 11.1 User Profile

Purpose:

- persist account identity and default car details across runs

Suggested path:

- `/users/{uid}`

Fields:

- uid
- email
- displayName
- carMake
- carModel
- badgeColor
- badgeText
- preferredDistanceUnit
- preferredSpeedUnit
- createdAt
- updatedAt

Notes:

- displayName is public within runs.
- email should not be exposed in run lobbies.
- badgeText can be generated from display initials or car initials.
- badgeColor can be generated at profile creation and optionally regenerated.

### 11.2 Run Root

Purpose:

- represent the group drive shell and admin ownership

Suggested path:

- `/runs/{runId}`

Fields:

- name
- description
- joinCode
- adminId
- status: draft | ready | active | ended
- createdAt
- startedAt
- driveStartedAt
- endedAt
- maxDrivers
- route
- drivers
- hazards
- summary

Notes:

- v1 create-run asks only name and optional description.
- status should stay draft until route/setup is ready.
- ready means route exists and the admin can start.

### 11.3 Join Code

Purpose:

- allow fast joining by six-digit code

Suggested path:

- `/joinCodes/{joinCode}`

Fields:

- runId
- createdAt

Notes:

- join code should be unique at creation.
- code should be copy/share friendly.

### 11.4 Driver Record

Purpose:

- represent a user's participation in a specific run

Suggested path:

- `/runs/{runId}/drivers/{uid}`

Fields:

- profile
- location
- joinedAt
- leftAt
- presence
- personalStatus
- finish

Profile snapshot:

- displayName
- carMake
- carModel
- badgeColor
- badgeText

Presence fields:

- state: joined | waiting | active | stale | offline | finished | left
- lastSeenAt
- isInLobby

Finish fields:

- finishedAt
- finishReason: destination | manual | timeout | adminEnded

Notes:

- run driver profile should be a snapshot so later profile edits do not rewrite history unexpectedly.
- live presence should be lightweight and tolerant of app backgrounding.

### 11.5 Location Updates

Purpose:

- show live driver position and support personal stats

Suggested latest-location path:

- `/runs/{runId}/drivers/{uid}/location`

Fields:

- lat
- lng
- heading
- speed
- accuracy
- timestamp

Suggested track path:

- `/tracks/{runId}/{uid}/{pointId}`

Fields:

- lat
- lng
- heading
- speed
- accuracy
- timestamp
- accelerationG, optional later
- lateralG, optional later

Notes:

- latest location feeds the live map.
- track points feed post-drive stats and heatmaps.
- g-force fields need physical-device validation.

### 11.6 Route Data

Purpose:

- store the admin-selected route for lobby preview and live navigation

Suggested path:

- `/runs/{runId}/route`

Fields:

- points
- distanceMetres
- durationSeconds
- source: apple_maps | gpx
- stops

Stop fields:

- id
- kind: start | waypoint | destination
- label
- lat
- lng
- source: search | coordinates | pin | current_location
- placeId
- order

Notes:

- Apple Maps generated routes are editable by stops/waypoints before saving.
- GPX routes are preview-and-save only in v1.

### 11.7 Hazard Record

Purpose:

- represent route hazards reported during the drive

Suggested path:

- `/runs/{runId}/hazards/{hazardId}`

Fields:

- type: pothole | roadworks | police | mobile_camera | debris | broken_down_car
- reportedBy
- reporterName
- lat
- lng
- timestamp
- dismissed
- reportCount
- confidence
- expiresAt
- lastConfirmedAt
- lastRejectedAt

Confirmation fields, later:

- confirmations/{uid}: still_there | gone

Notes:

- v1 can use simple report/expiry/admin-dismiss.
- v1.5 can add nearby-driver confirmation.
- ignored confirmation prompts do not affect timers.

### 11.8 Summary

Purpose:

- keep post-drive group and personal results available after the drive

Suggested group summary path:

- `/runs/{runId}/summary`

Fields:

- generatedAt
- totalDistanceKm
- totalDriveTimeMinutes
- movingTimeMinutes
- stoppedTimeMinutes
- hazardCount
- collectiveSpeedHeatmapRef
- collectiveGForceHeatmapRef
- shareText

Suggested personal summary path:

- `/runs/{runId}/drivers/{uid}/summary`

Fields:

- generatedAt
- distanceKm
- movingTimeMinutes
- stoppedTimeMinutes
- maxSpeed
- maxGForce
- personalSpeedHeatmapRef
- personalGForceHeatmapRef
- finishReason

Notes:

- keep max speed and max g-force, but do not rank drivers by those values.
- summaries must remain available after the drive.
- shareText should be easy to copy/share outside the app.

### 11.9 Local Cache

Purpose:

- make launch fast and support resume flows

Suggested local data:

- current user profile
- active run id
- role in active run
- last known run status
- local track buffer while offline
- pending writes if offline support is added

Notes:

- backend remains source of truth.
- local cache should not create irreversible state.
