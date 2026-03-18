# Live Drive Experience

## Goal

Transform the run map into a full Google Maps / Waze-style live driving experience. The map is the
primary surface at all times. Every driver has full situational awareness — they can see where
everyone else is, their direction of travel, and any hazards on the road ahead — from the moment
they join right through to the end of the run.

---

## Phases

### Phase 1 — Pre-Drive Lobby (waiting to start)

Before the admin starts the drive, all drivers land on the full-screen map in **lobby mode**.

**What drivers see:**
- Full-screen map centered and fitted to the planned route
- Every driver who has joined appears as a large, animated pin with their name (not just initials —
  full first name or display name) and a fun idle pulse animation to show they are live and waiting
- A bold status banner at the top: `"Waiting for [Admin Name] to start the run…"`
- Their own pin is visually distinct (accent-colored border, slightly larger) so they can instantly
  find themselves
- Driver count indicator: `"5 / 8 drivers ready"` showing how many have GPS active vs. total joined
- No hazard buttons yet — the run hasn't started
- The map is pannable and zoomable so drivers can explore the route while waiting

**What the admin sees:**
- Everything drivers see, plus:
- A prominent `"Start Drive"` button anchored at the bottom of the screen
- The button is disabled (greyed out) until at least one other driver has joined with an active GPS
  signal, preventing a solo start
- Tapping "Start Drive" transitions run status from `draft` → `active` in Firebase, which
  simultaneously kicks all connected clients into navigation mode

**Run status change:**
- Currently the run becomes `active` when the admin saves the route. This needs to change.
- Route saving sets status to `'ready'` (new intermediate status between `draft` and `active`)
- Admin tapping "Start Drive" sets status to `'active'`
- All clients subscribe to run status — when `active` fires, every device transitions to navigation
  mode in sync

---

### Phase 2 — Navigation Mode (drive is live)

Once the admin starts the drive, every device transitions to **navigation mode**.

**Camera behaviour (Google Maps style):**
- Camera locks to the user's own GPS position and updates every location tick
- Map tilts to ~45° pitch for the 3D perspective
- Map rotates to match the user's heading (direction of travel) — the map turns as you turn
- Zoom level tightens to street level (~zoom 16) so the road ahead is clear
- `rotateEnabled` is set to `false` for manual gestures but the camera itself rotates via
  `followUserMode="course"`

**Recenter button:**
- If the user manually pans away from their position, a floating `"Recenter"` button appears
- Tapping it snaps the camera back to navigation mode
- Button disappears automatically once recentered

**Driver pins during navigation:**
- Each driver is rendered as a car-shaped or circular pin with their first name below it
- The pin rotates to match the driver's `heading` field so you can see which direction they are
  travelling
- Pin colour indicates status:
  - Active (updated within 60s): accent colour
  - Stale (60–120s): amber/orange
  - Lost signal (120s+): grey, with a `"Signal lost"` label
- Your own pin is visually distinct (brighter, slightly larger) so you always know which one is you
- Pins animate smoothly between position updates instead of jumping

**Route overlay:**
- The planned route remains visible as a line on the map throughout the drive
- Completed sections of the route (behind your position) are dimmed to show progress

---

### Phase 3 — Hazard Awareness (Waze style)

**Hazard pins on the map:**
- Each hazard type uses a recognisable emoji icon instead of text abbreviations:
  - Pothole → 🕳️
  - Roadworks → 🚧
  - Police → 🚓
  - Debris → ⚠️
  - Animal → 🐄
  - Broken down car → 🚗
- Hazard pins display a report count badge when more than one report exists (e.g. `×3`)
- Pins pulse briefly when first placed on the map

**Incoming hazard alert:**
- When another driver reports a hazard, a Waze-style alert slides in from the top of the screen:
  `"🚧 Roadworks reported ahead — 1.2 km"` (distance calculated from your current position)
- Alert auto-dismisses after 5 seconds or can be swiped away
- Alert only fires if the hazard is ahead of you on the route (not behind)

**Reporting a hazard while driving:**
- Floating quick-report buttons are anchored to the bottom-right of the screen
- One tap reports immediately from your current GPS position — no confirmation needed while moving
- A brief success toast confirms: `"🚓 Police reported"`

---

### Phase 4 — Driver Awareness Panel

A collapsible bottom sheet gives full convoy visibility without leaving the map.

**Collapsed state (default while driving):**
- Shows a compact strip at the bottom: driver avatars in a horizontal scroll with coloured status
  dots
- Tapping the strip expands the full panel

**Expanded state:**
- Full list of drivers with name, status (active / stale / signal lost), and current speed
- Your own entry is highlighted at the top
- Admin sees a "Remove Driver" option per entry
- Swipe down to collapse back to the strip

---

## Key Design Principles

- **Map is always primary.** No scrollable lists during a live drive. Everything is an overlay.
- **Your own position is always obvious.** Distinct styling and always centred in navigation mode.
- **Awareness without distraction.** Hazard alerts are brief and directional. Driver panel is
  collapsed by default. Nothing competes with the road.
- **Smooth animations.** Driver pins animate between GPS updates. Camera transitions are eased.
  Nothing jumps.
- **Admin control is clear.** Only the admin can start and end the run. The Start Drive button is
  prominent in lobby mode. The End Run action moves to the expanded driver panel during navigation.

---

## Run Status Flow (updated)

```
draft → ready → active → ended
```

- `draft`: Run created, route not yet planned
- `ready`: Route saved by admin, drivers can join and see the lobby map
- `active`: Admin tapped "Start Drive", all devices enter navigation mode
- `ended`: Admin ended the run, all devices navigate to the summary screen

---

## Implementation Tasks

### 1. Add `ready` run status
- [ ] Add `'ready'` to `RunStatus` type in `types/domain.ts`
- [ ] Update `startRunWithSavedRouteWithFirebase()` in `lib/routeService.ts` to set status
      `'ready'` instead of `'active'`
- [ ] Add `startDriveWithFirebase(runId)` function in `lib/runService.ts` that sets status
      to `'active'` and records `driveStartedAt` timestamp
- [ ] Update Firebase security rules to allow admin-only status transition to `'active'`
- [ ] Update `runSessionStore` to handle the `ready` status
- [ ] Update any existing status checks that branch on `active` to also consider `ready` where
      appropriate (e.g. allowing drivers to join while `ready`)

### 2. Pre-drive lobby screen
- [ ] Update `app/run/[id]/map.tsx` to detect `ready` status and render lobby mode
- [ ] Replace current scrollable layout with a full-screen map as the base layer
- [ ] Show full-name driver pins with pulse animation in lobby mode (not just initials)
- [ ] Add `"Waiting for [admin] to start…"` banner overlay at the top
- [ ] Add driver ready count indicator (`"X / Y drivers with GPS"`)
- [ ] Add `"Start Drive"` button overlay at the bottom, visible only to admin
- [ ] Disable `"Start Drive"` until at least 2 drivers have an active GPS signal
- [ ] Wire `"Start Drive"` button to `startDriveWithFirebase()`
- [ ] When run status transitions to `active`, animate the camera into navigation mode

### 3. Full-screen map layout
- [ ] Replace `<Screen scrollable>` wrapper in `app/run/[id]/map.tsx` with a full-screen
      non-scrollable layout
- [ ] Move run title, connectivity banner, and error display to floating overlays on the map
- [ ] Move tracking request card to a bottom sheet or modal so it doesn't break the map layout
- [ ] Pass `edgeToEdge={true}` to `<ClubRunMap />` during active run so map fills the screen
- [ ] Set a minimum map height for tablet/large screen support

### 4. Navigation camera (Google Maps style)
- [ ] Enable `followUserLocation` on `<Camera>` when run is `active`
- [ ] Set `followUserMode="course"` so the map rotates with the user's heading
- [ ] Set `pitch={45}` for the 3D tilted perspective
- [ ] Set `followZoomLevel={16}` for street-level zoom while driving
- [ ] Remove `rotateEnabled={false}` restriction (or keep false for manual gestures and let the
      camera handle rotation programmatically)
- [ ] Add camera state tracking to detect when the user has manually panned away
- [ ] Show a floating `"Recenter"` button when the user has panned away
- [ ] Wire recenter button to snap camera back to `followUserLocation` mode

### 5. Driver pin heading arrows
- [ ] Update driver `PointAnnotation` in `ClubRunMap.tsx` to render a directional arrow or
      rotated chevron based on `driver.location.heading`
- [ ] Show full first name below the pin (not just initials) during a live drive
- [ ] Apply status-based colour to each pin (active / stale / lost signal)
- [ ] Animate pin position updates smoothly between coordinate changes
- [ ] Visually distinguish the current user's own pin (larger, accent-coloured ring)

### 6. Waze-style hazard icons
- [ ] Replace text abbreviation labels on hazard pins with emoji icons per hazard type
- [ ] Add a report count badge to hazard pins when `reportCount > 1`
- [ ] Add a brief pulse/scale animation when a new hazard pin is placed
- [ ] Build an incoming hazard alert component that slides in from the top of the screen
- [ ] Calculate distance from current user position to new hazard and include in alert message
- [ ] Only show the incoming hazard alert if the hazard is ahead on the route (not behind)
- [ ] Auto-dismiss alert after 5 seconds, allow swipe-to-dismiss
- [ ] Move hazard quick-report buttons to floating bottom-right overlay during navigation mode
- [ ] One-tap hazard reporting with instant GPS capture and brief success toast

### 7. Driver awareness panel (bottom sheet)
- [ ] Build a collapsible bottom sheet component anchored below the map
- [ ] Collapsed state: horizontal scroll strip of driver avatars with status dots
- [ ] Expanded state: full list with name, status, speed, and admin controls
- [ ] Highlight the current user's entry at the top of the expanded list
- [ ] Move `"End Run"` admin button into the expanded driver panel
- [ ] Animate open/close transitions

### 8. Lobby driver pin animations
- [ ] Add a pulsing ring animation to driver pins while in lobby/waiting state
- [ ] Show full display name on lobby pins (not initials)
- [ ] Fit map bounds to the full route with padding when entering lobby mode
- [ ] Animate the camera smoothly to navigation mode when `active` status fires

### 9. Cleanup and polish
- [ ] Remove the scrollable "Run Details", "Driver Roster", "Hazard Report", and "Current Session"
      cards from the map screen — replace with overlays and the bottom sheet
- [ ] Ensure tracking enable flow works correctly within the new full-screen layout
- [ ] Test background tracking continues correctly when the phone is locked during a drive
- [ ] Handle the edge case where a driver joins after the drive has already started (`active` status)
      — they should enter navigation mode directly, skipping lobby
- [ ] Verify all existing tests still pass after status flow changes
- [ ] Update Firebase rules to cover the new `ready` status and `driveStartedAt` field
