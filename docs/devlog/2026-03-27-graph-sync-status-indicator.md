---
title: Surface graph sync status in the sidebar
date: 2026-03-27
type: shipped
tags:
  - sync
  - workers
  - sidebar
  - effect
---

## Summary

Added a small sidebar sync status indicator for cloud-backed graphs and wired worker RPCs so the UI can observe disconnected, bootstrapping, ready, and committing states. The same path also exposes whether local changes are still pending, so the sync state is visible without opening logs or guessing from behavior.

## The Why

Graph sync was doing meaningful background work, but none of that state was visible in the app shell. When a socket dropped or pending edits had not been committed yet, the user had no lightweight way to tell whether sync was healthy, catching up, or waiting to reconnect.

## Design Decisions

- Kept sync status as a small schema in `src/lib/graph.worker-rpc.ts` so the shared and dedicated workers agree on one transport shape.
- Stored cloud sync status in a `SubscriptionRef` inside the dedicated worker, then streamed it through the shared worker instead of having the main thread infer status indirectly from lower-level events.
- Updated `syncState` in the machine runner and `hasPending` in the session layer so each part of the sync stack owns the field it already knows best.
- Showed the indicator only for cloud graphs; local graphs expose a stable local status and avoid sidebar noise for a feature that is not relevant there.

## Learnings

The dual-worker setup is a good place to publish coarse operational state. A single streamed status object is simpler than trying to reconstruct sync health in the UI from retries, socket lifecycle, and pending event queries scattered across different layers.
