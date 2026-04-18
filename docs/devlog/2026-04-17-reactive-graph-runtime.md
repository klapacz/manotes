---
title: Reactive graph runtime and access resolution
date: 2026-04-17
type: shipped
tags:
  - graph
  - runtime
  - routing
  - effect
  - solid
---

## Summary

Refactored graph opening around a reactive graph-access pipeline that resolves local/cloud/locked state, manages per-graph runtimes centrally, and feeds both routes and loaders from the same source of truth. This fixed stale graph-name UI, removed a cloud-promotion runtime race, and made `/$graph` surface runtime failures through normal router error handling instead of rendering a blank page.

## The Why

The old graph lifecycle had drifted into a few separate mechanisms:

- route loader snapshots for graph metadata
- ad-hoc runtime setup and reuse
- unlock state carried outside the graph record model
- UI components reading stale graph data after updates

That led to a few correctness issues:

- renaming a graph did not update everywhere immediately
- uploading an already-open local graph to cloud could keep using a stale local runtime
- promoting a graph to cloud could briefly look locked and redirect to `/unlock`
- runtime/setup failures in `/$graph` could collapse into a blank page

The fix was to stop treating graph records, unlock state, and runtime state as separate stories.

## Design Decisions

- **Reactive local registry lookups** — `LocalRegistry.Repo.findGraphReactive(...)` lets graph consumers follow record changes instead of relying on loader snapshots.
- **Separate key storage from graph records** — unlocked graph keys now live in a dedicated key store, keyed by wrapped-key identity rather than only `localGraphId`.
- **Explicit graph resolution states** — graph access composition produces `Missing`, `Local`, `CloudLocked`, or `CloudUnlocked`, which made route/runtime behavior much easier to reason about.
- **One graph-runtime manager** — runtime creation and replacement moved behind a dedicated graph runtime manager that caches runtimes by graph identity and recreates them when relevant setup changes.
- **Shared route and loader model** — route components consume reactive runtime state, while loaders use graph-runtime router helpers to run effects or redirect for missing/locked graphs.
- **UI reads live graph state** — graph menu/sidebar rendering now follows reactive graph state, so metadata changes like renames appear immediately.
- **Error rethrow into router handling** — the `/$graph` route now rethrows runtime errors and defects instead of silently rendering nothing.

## Learnings

The important boundary was not “runtime setup” by itself, but graph resolution as a whole: record existence, cloud/local mode, key availability, and runtime ownership all have to move together. Once those states were modeled explicitly, the rest of the refactor got simpler.

A second lesson was that graph promotion has to be transition-safe, not just eventually correct. During upload, the unwrapped key must become visible before the local record flips to cloud mode, otherwise reactive consumers can observe a transient locked state and tear down the active runtime.

Finally, routing got more reliable once failures were treated like normal route errors instead of UI states. That keeps runtime boot failures visible and consistent with the rest of the app.
