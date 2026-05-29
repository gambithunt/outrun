# Native iOS Accessibility And Polish Checklist

Status: Active
Related phase: `native-ios-implementation-phases.md` Phase 15

## Purpose

Use this checklist before calling the native iOS app ready for external testers. Keep the checks concrete and repeatable; do not use this as a place for broad redesign ideas.

## Major Screens

- [ ] Auth: Login, Register, Forgot Password, Profile Setup
- [ ] Home Hub
- [ ] Create Run
- [ ] Join Run
- [ ] Admin Lobby
- [ ] Driver Lobby
- [ ] Route Setup
- [ ] Live Drive
- [ ] Hazard reporting
- [ ] Drive Summary
- [ ] Settings

## Accessibility

- [ ] Every icon-only button has a VoiceOver label.
- [ ] Destructive actions have explicit labels and confirmation when needed.
- [ ] Dynamic Type does not truncate primary actions at large accessibility sizes.
- [ ] Map screens remain usable when labels grow.
- [ ] Driver/hazard markers expose meaningful VoiceOver labels.
- [ ] Route setup stop controls expose Start, Waypoint, and Finish clearly.
- [ ] Summary stats remain readable without relying on color alone.

## Appearance Modes

- [ ] Light mode screenshots captured for every major screen.
- [ ] Dark mode screenshots captured for every major screen.
- [ ] Reduce Transparency keeps overlays readable.
- [ ] Increase Contrast keeps map overlays readable.
- [ ] Reduce Motion keeps route setup and hazard rail usable.

## Map Readability

- [ ] Route line remains visible in daylight-style map colors.
- [ ] Route line remains visible in dark-style map colors.
- [ ] Current driver marker is visible over roads, water, and parks.
- [ ] Other driver markers remain visible when close together.
- [ ] Hazard markers do not hide the active route or bottom controls.
- [ ] Start and finish markers remain distinguishable without labels.

## Manual Verification Notes

Record device, simulator/runtime, and any screenshots beside the relevant phase notes before checking off Phase 15 verification.
