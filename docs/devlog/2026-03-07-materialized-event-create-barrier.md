---
title: Materialized Event Create Barrier via Checkpoint Wait
date: 2026-03-07
type: shipped
tags:
  - materialization
  - effect
  - sqlite
  - yjs
  - editor
---

## Summary

Added a blocking event-create path that waits until the event is materialized, then returns the materialized note. This is implemented with a reactive checkpoint barrier: after writing an `update` event, the flow waits until `materialization_checkpoint.lastAppliedEventId` reaches that event id.

## Why

The existing flow persists events asynchronously and materializes later, which is correct eventually but does not provide a deterministic "create and return persisted note" boundary. For note creation paths we need a hard acknowledgment point without introducing a global write lock or changing event semantics.

## Design Decisions

- **Keep update-only semantics**: New flow still writes `type: "update"`; legacy `"create"` remains unused.
- **Use global durable cursor as barrier**: Wait on `materialization_checkpoint.lastAppliedEventId >= event.id`.
- **Reactive, not polling**: Barrier uses `DB.reactiveQuery` over the checkpoint row.
- **Return note, not event**: `MaterializedEventService.create` now returns `NoteRepo.getById(event.noteId)` after barrier passes.
- **No timeout yet**: Intentionally omitted for this step; timeout/error policy comes later.

## How It Works

1. `MaterializedEventService.create` inserts an `update` event via `EventRepo.create`.
2. It calls `MaterializationCheckpointRepo.waitUntilAtLeast(event.id)`.
3. `waitUntilAtLeast` subscribes to checkpoint updates with `reactiveQuery` and completes once the cursor reaches the target id.
4. After barrier completion, service loads and returns the note by id.

Because materializer note updates and checkpoint advance happen in one DB transaction, reaching the target checkpoint implies the note state for that event is already persisted.

## Files

- `src/lib/materialization-checkpoint.repo.ts` - added `waitUntilAtLeast(targetEventId)` reactive barrier
- `src/lib/materialized-event.service.ts` - new service for create-and-wait, returns materialized note
- `src/lib/runtime.ts` - wired `MaterializedEventService` into runtime layer
- `src/lib/graph.dedicated-worker.ts` - wired `MaterializedEventService` into worker service layer
- `src/lib/index.ts` - exported `MaterializedEventService`

## Scope Notes

- This change introduces the primitive/service only; it is not yet wired into all note creation call sites.
- Timeout/cancellation behavior is intentionally deferred.
