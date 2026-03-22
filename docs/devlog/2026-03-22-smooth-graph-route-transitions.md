---
title: Smooth graph route transitions around editor boot
date: 2026-03-22
type: shipped
tags:
  - editor
  - routing
  - ux
---

## Summary

Enabled view transitions by default for route changes, then opted out of the transitions that produced blank or jarring intermediate frames. Daily note navigation now fades in after the virtual list has measured, and standalone note pages wait until the editor is done loading before revealing content.

## The Why

The graph experience had the right ingredients for animated navigation, but two boot-time details made it feel broken: the virtualized daily list snapshots as empty on its first frame, and the note route could reveal editor chrome before the document was ready. That made route transitions inconsistent and hid the intended motion.

## Design Decisions

- Enabled router-level view transitions once in `src/main.tsx` and disabled them only for intra-list date syncing, where the browser transition was fighting scroll and focus behavior
- Used a local opacity fade for the daily list because `virtua` needs a measurement frame before it renders items, so the browser snapshot could otherwise capture an empty list
- Exposed editor boot state from `src/editor.tsx` so routes can react to loading, ready, and error states without duplicating editor internals
- Reveal the note route when the editor is no longer loading, so failure states remain visible instead of being hidden behind `opacity-0`
- Added a reduced-motion guard for view transition pseudo-elements to keep the new motion opt-out friendly

## Learnings

View Transitions work best when the DOM is already visually stable at snapshot time. When a component depends on async boot or post-layout measurement, a small route-local fade is often more reliable than forcing the browser transition to cover that unstable phase.
