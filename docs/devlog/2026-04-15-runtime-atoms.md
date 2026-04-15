---
title: Runtime atoms for graph-scoped UI state
date: 2026-04-15
type: shipped
tags:
  - effect
  - atoms
  - runtime
  - solid
---

## Summary

Split the web graph runtime into `rt` and `atom`, then added a small `runtime-atom` wrapper that binds Effect atoms to the current graph runtime from Solid context. This replaced ad-hoc `runPromise(...)` / `createRuntimeStreamStore(...)` glue with one graph-scoped reactive path for reads, writes, streams, and `SubscriptionRef` state.

## The Why

The app had two separate styles for runtime-backed UI state:

- one-shot actions through `runtime.runPromise(...)`
- live data through custom stream-store helpers

That worked, but it scattered runtime plumbing through components and made some state awkward to model, especially long-lived async state like editor boot, worker health, sync status, and command-menu searches. Effect's atom runtime already solves that problem. The missing piece was binding those atoms to the active graph runtime without forcing every call site to thread runtime objects around manually.

## Design Decisions

- **One service graph, two front doors** — `src/lib/runtime.ts` now builds both a `ManagedRuntime` and an `AtomRuntime` from the same layer and shared `memoMap`. Effects and atoms resolve the same services instead of accidentally constructing parallel graphs.
- **Thin wrapper, not a new state system** — `src/lib/runtime-atom.ts` is intentionally small. It mostly mirrors Effect atom APIs, adds lazy binding against the current runtime from context, and caches the bound atom per runtime so registry identity stays stable.
- **Keep module-scope declarations ergonomic** — components can declare `RtAtom.atom(...)`, `RtAtom.fn(...)`, or `RtAtom.subscriptionRef(...)` once, then use them anywhere under a graph runtime. That keeps app code close to normal `@effect/atom-solid` usage while still being graph-aware.
- **Preserve existing Solid store ergonomics** — `createAtomStore` keeps the old reconcile-based object-store behavior for places that want a plain store instead of reading `AsyncResult` directly.
- **Move async UI flows onto atoms** — sidebar actions, note search, backlink search, worker health, sync status, and incoming backlinks now all run through runtime atoms. This removes a lot of bespoke runtime glue and makes the state shape more uniform.
- **Guard editor boot state by session identity** — runtime atoms preserve the previous successful value while the next async read is spinning up. For the editor that briefly leaked the previous note's `Ready` state into the next note, so boot state is tagged with the active `Y.Doc` and stale values are masked back to `Loading`.

## Learnings

The useful abstraction here is not cleverness, it is thinness. The wrapper works because it does very little: bind late, cache identity, expose Solid-friendly hooks, and otherwise inherit upstream Effect behavior. That keeps the local code understandable while unlocking a much more powerful way to model graph-scoped UI state.
