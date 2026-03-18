# Route Planner UX Refresh

## Summary

The ClubRun route planner should feel like a mobile map tool first, not a form with a map inside it. This refresh replaces the previous top-card-driven planner with a Google Maps-inspired flow built around:

- a full-screen map surface
- minimal top chrome
- a permanent bottom-right current-position button
- a hybrid bottom sheet that guides the user through `Start` -> `End` -> `Stops`, while still allowing full route-list editing when expanded

This redesign is a planner-shell refactor around the existing stop model and routing engine. Route save and run activation stay separate.

## Product Direction

- The map is always the primary surface.
- The top of the screen should stay minimal:
  - floating back button
  - small route status chip only when useful
  - no persistent top `Start / Destination` card
- Route editing belongs inside one bottom sheet.
- The default interaction model is guided:
  - choose `Start`
  - choose `End`
  - add or reorder `Stops`
- The sheet can expand at any time into a full ordered route editor.
- The permanent current-position control is required and takes priority over extra map chrome.
- `Fit route` is secondary and only appears when a valid route preview exists.
- The reference is Google Maps interaction quality and visual hierarchy, not a literal clone.

## Screen Structure

### Map layer

- Full-screen map under the safe area.
- Bright, legible day-mode road map styling.
- Route line must stay highly visible with a white casing and colored inner line.
- Stop markers:
  - `Start`: green / `S`
  - `End`: red / `E`
  - `Stops`: numbered markers
- Selected stop marker gets stronger contrast.

### Top chrome

- Floating circular back button in the top-left.
- Optional compact route draft chip near the top center/right.
- No stacked cards, form fields, or stop editors at the top.

### Floating map controls

- Bottom-right current-position button is always visible.
- `Fit route` appears above it only after a route preview exists.
- No other persistent map controls unless they serve a clear route-planning purpose.

### Bottom sheet

- One sheet owns route structure, stop editing, search, map-pick mode, route summary, and route actions.
- The sheet must avoid duplicated controls and overlapping floating surfaces.
- The sheet has two main states:
  - `Collapsed`: guided prompt plus active stop editing
  - `Expanded`: ordered route list plus active stop editing

## Interaction Model

### Guided flow

- Empty planner opens focused on `Start`.
- Once `Start` is set, the planner automatically guides the user to `End`.
- Once `End` is set, the planner shifts to `Stops` mode:
  - add intermediate stops
  - reorder stops
  - remove stops
  - save route

### Active stop editing

The currently selected stop is edited through one shared input area in the bottom sheet.

Supported input methods for every stop:

- place/address search
- coordinate paste in `lat,lng` format
- `Use Current`
- `Pick On Map`

These are parallel ways to set the same stop; they should not feel like separate flows.

### Expanded ordered route list

When expanded, the sheet shows the full route order:

- `Start`
- zero or more `Stops`
- `End`

Rules:

- `Start` and `End` are first-class stops and always visible.
- `Start` and `End` are not removable.
- `Stops` are removable.
- `Stops` are reorderable using drag handles on the right.
- `Start` and `End` may be swapped through an explicit swap action.
- Reordering and edits should automatically refresh the preview route.

### Map pick mode

- Entering `Pick On Map` switches the planner into a focused map-picking state.
- The sheet stays minimal and keeps the active stop context visible.
- The map shows a clear crosshair-style pick affordance.
- The user can:
  - pan the map to the desired location
  - tap the map to refine the pin if supported
  - confirm the chosen point
  - cancel without applying changes

### Route actions

- `Save Route` writes the route draft only.
- `Start Run` remains disabled until a valid route has been saved.
- Route distance and duration appear once a valid preview exists.
- Route preview should update automatically after:
  - setting `Start`
  - setting `End`
  - adding a stop
  - removing a stop
  - reordering stops
  - changing a stop location

## Visual Design Guidance

- Prioritize strong hierarchy and uncluttered spacing.
- Use restrained floating surfaces with rounded corners and subtle elevation.
- Prefer one obvious primary action in each state.
- Avoid exposing raw coordinate fields as the default visual model.
- Raw coordinates are acceptable as fallback data labels, not as the primary planner UI.
- The planner should feel premium on mobile:
  - large tap targets
  - consistent spacing
  - readable labels
  - clear selection states

## Implementation Notes

- Reuse the current `RouteStopDraft` model and route preview pipeline.
- Reuse the current search provider abstraction and coordinate parsing helpers.
- Keep OSRM as the route preview engine.
- Keep route save and route start as separate backend operations.
- The main implementation work is:
  - screen hierarchy
  - guided state transitions
  - sheet behavior
  - map control placement
  - clearer stop editing and reordering

## Required UI States

The planner must explicitly support these states:

- empty planner
- selecting `Start`
- selecting `End`
- `Stops` mode after `Start` and `End` are valid
- map-pick mode
- expanded reorder mode
- route preview ready
- route saved

Required state transitions:

- `Start set` -> prompt `End`
- `End set` -> show route preview and unlock `Stops` flow
- `Route preview ready` -> allow add/remove/reorder stops
- `Route saved` -> enable `Start Run`

## Testing

### Screen tests

- minimal top chrome renders with no top `Start / End` card
- full-screen map renders with permanent current-position control
- guided flow advances from `Start` to `End` to `Stops`
- expanded sheet shows ordered route rows
- `Start` and `End` can be swapped
- stops can be reordered and removed
- map-pick mode supports confirm and cancel
- `Save Route` does not activate the run
- `Start Run` stays disabled until the route is saved

### Pure logic tests

- guided stage derivation from stop completeness
- coordinate parsing
- waypoint reorder helpers
- swap logic
- stop count helpers

### Manual acceptance

- map remains readable with sheet collapsed
- current-position button is easy to reach at bottom-right
- route structure is understandable without training
- expanded list feels reliable for editing order
- route line remains visible over the chosen map style
- native iOS/Android route-planning flow feels closer to Google Maps than to a form UI

## Assumptions And Defaults

- This document supersedes the earlier top-card planner spec rather than extending it.
- The planner uses a hybrid interaction model:
  - guided by default
  - expandable for full ordered editing
- Native mobile is the primary target; web remains a degraded fallback.
- `Fit route` is secondary to the permanent current-position control.
- Search provider quality may improve later, but the planner should already feel structurally correct now.
