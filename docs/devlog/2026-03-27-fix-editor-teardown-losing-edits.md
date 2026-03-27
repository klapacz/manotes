---
title: Fix editor teardown losing last edits
date: 2026-03-27
type: shipped
tags:
  - editor
  - persistence
  - effect
  - bug-fix
---

## Summary

Added an `onFinalize` callback to `streamDebounceNoDrop` that runs uninterruptibly on interrupt, and fixed editor teardown to await fiber interruption before destroying the Y.Doc. This fixes a race condition where the last batch of edits could be lost on navigation or tab close.

## The Why

Notes were silently losing edits when the user navigated away or closed a tab quickly. Two races in the teardown path:

1. **Fork+mailbox architecture of `streamDebounceNoDrop`**: On interrupt, the producer's finalizer flushed remaining items to the mailbox, but the consumer was already dead — nobody read the last batch. Effect's own `Stream.debounce` has the same limitation.

2. **Fire-and-forget interrupt in `editor.tsx`**: `Fiber.interrupt(fiber)` was not awaited, and `doc.destroy()` ran immediately after, racing against any in-flight persistence.

## Design Decisions

**Why not switch to `Stream.groupedWithin`?** It was considered — `groupedWithin` has structural guarantees via the Channel protocol. But it uses fixed-window semantics (flush every 1s) instead of debounce (flush after 1s of inactivity). During continuous typing, this emits far more events, which matters in a system where events have real cost (storage, sync, materialization).

**`onFinalize` callback on `streamDebounceNoDrop`**: On interrupt, the mailbox consumer is dead, so the normal flush path is useless. Instead, the operator accepts an optional `onFinalize` that receives the remaining buffered items and runs uninterruptibly — bypassing the mailbox entirely and persisting directly. The persist logic is extracted into `persistChunk` and shared between the normal `runForEach` path and the finalizer.

**Enqueue order fix**: Flipped the order in the debounce loop — `Queue.offer` now happens before `scheduleFlush`, closing a micro-race where an interrupt between schedule and enqueue could lose the current element.

**Awaiting interrupt**: `Fiber.interrupt` now completes (including uninterruptible finalizers) before `doc.destroy()` runs, so the final persist always finishes with the doc still alive.

## Learnings

- Stream operators backed by fork+mailbox cannot guarantee last-element delivery on interruption. The consumer dies before the producer's finalizer can be read. This is true even for Effect's built-in `Stream.debounce`.
- `Stream.groupedWithin` / `aggregateWithinEither` sidestep this via Channel-level composition, but at the cost of fixed-window semantics.
- The pragmatic middle ground: keep the custom operator for its debounce semantics, add a finalizer escape hatch for the interrupt edge case.
- When a fiber owns a resource (Y.Doc), always await its interruption before destroying the resource.
