# Route Planner UX Refresh

## Goal

The route planner should behave like a guided mobile map flow instead of a form living above a map. The map must be the primary surface from the first frame, and the bottom sheet should guide the user through:

1. choose a start
2. choose a destination
3. add, edit, remove, and reorder stops
4. save the route
5. offer to start then run or save for later

This document updates the implementation plan for the existing route planner in [app/create/route.tsx](/Users/delon/Documents/code/outrun/app/create/route.tsx).

## What We Learned From The Current Screen

The current planner already has useful building blocks:

- full-screen map with floating back button and top draft chip
- bottom sheet with collapsed and expanded states
- guided stage detection via `start -> destination -> stops`
- support for search, coordinate paste, `Use Current`, and `Pick On Map`
- automatic OSRM route preview after enough stops exist
- stop add/remove/reorder helpers
- separate `Save Route` and `Start Run` actions

The main gaps versus the target experience are:

- entry does not reliably feel centered on the user from the first interaction
- `Use Current` does not transition into a focused map confirmation state
- the sheet can still feel like a generic editor instead of a locked guided flow
- map-pick mode still keeps a confirmation card on screen instead of fully giving the map to the user
- stop management is present, but not yet shaped like the ordered route list in the reference
- the route preview is not treated as a persistent planning artifact across all planner states

## Product Direction

- The map is always the hero.
- On entry, the planner should immediately orient around the user's current location.
- The sheet should behave like a guided assistant, not a generic form.
- Until a valid start is set, the planner is in `Start` mode.
- Once a valid start is set, the planner must immediately move to `Destination` mode.
- Even if the user expands the sheet after setting the start, the primary prompt must still ask for a destination until one exists.
- After both start and destination are valid, the planner unlocks richer stop editing.
- Every stop can be resolved via:
  - search result
  - coordinate paste
  - current location
  - map picking
- The route line should remain visible whenever a valid routed preview can be computed.
- Saving a route remains separate from starting the run.

## Target UX Flow

### 1. Enter planner

- The screen opens with the map already centered on the user's live location.
- If live location is not ready yet:
  - keep the map visible
  - show the user-location affordance in a loading state
  - center as soon as the first good device location arrives
- The bottom sheet opens in a compact guided state.
- The active task is `Choose start`.

### 2. Choose start

The user can set the start in one of four ways:

- search for an address/place
- paste coordinates
- tap `Use Current`
- tap `Pick On Map`

Rules:

- choosing `Use Current` should immediately apply the user's current position as the start
- after `Use Current`, the sheet should collapse away so the user can clearly see the chosen start point on the map
- after the start is applied, the planner should automatically advance to `Choose destination`
- when the sheet is brought back up after this transition, the active prompt must still be destination-first

### 3. Choose destination

Once the start exists, destination becomes the locked next step.

Rules:

- expanded mode must still emphasize destination selection, not general stop editing
- the user may search, paste coordinates, or pick on map for destination
- a route preview should appear as soon as both start and destination are valid
- once destination is confirmed, the planner transitions into `Stops` mode

### 4. Pick on map flow

`Pick On Map` needs to become a true map-first mode.

Rules:

- entering map-pick mode should dismiss the sheet instead of leaving a large card over the map
- the user should be able to freely pan and inspect the map
- the active stop context must still be obvious through minimal floating guidance only
- the user taps the map to choose a point
- after tapping, the planner asks for confirmation before applying the point
- cancel returns to the previous editing state without changing the stop

The goal is to avoid the feeling that the map is constrained by the editor while picking.

### 5. Stops mode

After start and destination are valid, the planner unlocks the full route editor.

The expanded sheet should show an ordered list inspired by the second reference:

- start row
- zero or more stop rows
- destination row
- add-stop row or button

Rules:

- start and destination are always present
- start and destination are not removable
- waypoints are removable
- waypoints are reorderable
- selecting any row makes that stop the active edit target
- editing a selected row can happen through search, coordinates, current location, or map pick
- route preview updates automatically after every structural or location change

### 6. Route visibility

The route should feel persistent, not temporary.

Rules:

- when at least two valid routed stops exist, the routed line should stay visible on the map
- the route line must remain visible when:
  - the sheet is collapsed
  - the sheet is expanded
  - the user is editing a stop
  - the user is reviewing stop order
- when a route cannot yet be computed, chosen stop markers should still remain visible

## Screen Structure

### Map layer

- full-screen map under the safe area
- visible user location dot
- route line with strong contrast
- stop markers:
  - `Start`: green `S`
  - `Destination`: red `E`
  - `Stops`: numbered markers
- selected stop marker should be visually emphasized

### Top chrome

- floating back button
- compact route-draft chip
- no large top form card

### Floating controls

- permanent current-location recenter button
- optional fit-route button only when a route exists

### Bottom sheet

The sheet should have three practical states:

- `Guided`
  - compact
  - focused on the current required step
- `Expanded`
  - full ordered route editor
  - still honors the current required step
- `Hidden for map picking`
  - the map owns the screen
  - only minimal instruction or confirmation chrome is visible

## State Model

The current planner already uses a simple stage model from [lib/routePlanner.ts](/Users/delon/Documents/code/outrun/lib/routePlanner.ts). The next implementation should keep that idea, but split it more clearly into UX states.

### Planner stages

- `start_required`
- `destination_required`
- `stops_ready`

### Sheet states

- `guided`
- `expanded`
- `hidden_for_map_pick`

### Selection states

- active stop id
- pending map-picked point
- route saved / dirty

### Important transitions

- planner opens -> center on current user location -> `start_required`
- `Use Current` for start -> apply start -> hide sheet briefly -> advance to `destination_required`
- start chosen through search/coordinates/pick -> advance to `destination_required`
- destination chosen -> compute route -> enter `stops_ready`
- select waypoint -> keep route visible while editing that waypoint
- pick on map -> hide sheet -> wait for tap -> ask for confirmation -> apply or cancel
- any stop edit after save -> mark route dirty and disable `Start Run` again until re-saved

## Interaction Details To Build

### Entry centering

- bootstrap location immediately on screen mount
- if current location already exists in store, center without delay
- ignore the old fallback-first feel when a real user location is available
- recenter button remains available at all times

### `Use Current` behavior

- should feel like a shortcut, not just another input source
- after applying, visually show the chosen point on the map
- avoid leaving the user wondering whether anything changed

### Search and coordinates

- search input should support:
  - place text
  - street/address text
  - raw `lat, lng`
- coordinate input should continue auto-applying once parsed
- place results should remain scoped to the active stop

### Map pick behavior

- hide the full sheet
- allow free map navigation
- show a minimal instruction banner or chip
- allow tap-to-pick
- show a clear confirmation step before committing

### Expanded route editor

- mirror the mental model from the second reference:
  - ordered rows
  - clear row identity
  - drag handles
  - remove actions for waypoints
- selecting a row should focus map and editor state on that stop
- add-stop action should insert before destination

## Implementation Plan

### Phase 1. Tighten state and guided flow

- refine planner state names and transitions in [app/create/route.tsx](/Users/delon/Documents/code/outrun/app/create/route.tsx)
- make entry centering deterministic around current device location
- make `Use Current` for start advance directly into destination flow
- ensure expanded mode still reflects the required next step

### Phase 2. Rework sheet behavior

- separate guided, expanded, and hidden-for-map-pick sheet states
- reduce sheet content while choosing start and destination
- keep expanded route-list editing for `stops_ready`

### Phase 3. Rework map-pick mode

- remove the large bottom card while picking on map
- replace it with lighter floating instruction and confirmation UI
- preserve active-stop context through the pick lifecycle

### Phase 4. Strengthen ordered stop editing

- refine the expanded stop list to match the intended route-order mental model
- make add/edit/remove/reorder actions clearer
- keep selected stop and map focus aligned

### Phase 5. Persist route feedback

- ensure route preview remains visible through all non-empty route states
- confirm dirty/saved transitions behave correctly after edits
- verify `Start Run` is re-disabled after post-save edits

## Testing Plan

### Screen tests

- planner centers on user location when entering the screen
- guided sheet opens asking for start
- `Use Current` applies the start and advances to destination
- after start is set, reopening or expanding the sheet still asks for destination until one exists
- destination can be chosen by search, coordinates, and map pick
- entering map-pick mode hides the main sheet
- tapping the map creates a pending selection that requires confirmation
- after destination is set, expanded mode shows the ordered route list
- add/edit/remove/reorder stop interactions refresh the route preview
- editing after save marks the route dirty and disables `Start Run`

### Pure logic tests

- planner stage derivation
- stop insertion before destination
- reorder helpers
- swap behavior
- route dirty/reset behavior after save

### Manual acceptance

- the first thing the user sees is their area on the map
- setting start with `Use Current` feels immediate and obvious
- destination is the clear next task after start
- map-pick mode feels uncluttered and usable
- the expanded editor feels close to the route ordering model in the reference
- the route line remains visible whenever a routed preview exists

## Open Product Questions

These do not block planning, but they should be confirmed before implementation starts:

1. After `Use Current` sets the start, should the sheet fully disappear until the user taps or drags it back up, or should it auto-collapse to a very small handle plus destination prompt?
2. In map-pick mode, do you want the confirmation UI to appear only after the user taps a location, or should there always be a small floating `Cancel` affordance visible while picking?
3. When only the start is set and destination is still missing, is showing only the start marker enough, or do you want a provisional straight line or ghost route treatment before the real route preview exists?

## Assumptions For Now

- Native mobile remains the primary target.
- The existing stop model, route preview service, and search helpers stay in place.
- OSRM remains the preview routing engine.
- Saving a route and starting a run remain separate actions.
- The planner should be optimized for clarity first, then visual polish.
