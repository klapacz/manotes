---
title: Materialization Catch-Up with Durable Checkpoint
date: 2026-02-28
type: shipped
tags:
  - workers
  - effect
  - sqlite
  - yjs
  - materialization
---

## Summary

Implemented dedicated-worker materialization with durable catch-up semantics for search titles. The worker now replays missed `update` events from a stored global checkpoint, materializes each affected note to the latest event in the batch, and persists both per-note and global progress atomically.

## Why

`materialize({ noteId })` remains fire-and-forget and SharedWorker does not buffer requests. During worker startup or leader handoff, some requests can be soft-dropped. Catch-up from durable watermarks guarantees eventual correctness without introducing a buffering queue in SharedWorker.

## Design Decisions

- **Dual watermark model**: `notes.lastEventId` tracks per-note replay progress, while `materialization_checkpoint.lastAppliedEventId` tracks global batch progress.
- **Startup auto-catch-up**: Dedicated worker starts `MaterializerService.start()` on boot so replay runs after each leader takeover.
- **Batch replay over global stream**: Replays `update` events where `events.id > checkpoint`, processes notes up to each note's max id in the batch, then advances checkpoint.
- **Atomic progression**: Note updates and checkpoint advance happen in one DB transaction to avoid partial progress.
- **No on-demand endpoint (for now)**: Explicit `materialize(noteId)` path is intentionally skipped in this dev-phase implementation.

## How It Works

1. Read global cursor from `materialization_checkpoint` (create row lazily if missing).
2. Stream next batch of `update` events after cursor (bounded by max batch size).
3. Group events by `noteId` and keep the highest id per note as target.
4. For each target note, replay events from `notes.lastEventId` to target id.
5. Apply Yjs updates, derive ProseMirror JSON, extract first H1 as title.
6. Persist `notes.title`, `notes.content`, `notes.materializedYUpdate`, and `notes.lastEventId`.
7. Advance `materialization_checkpoint.lastAppliedEventId` to newest batch event id.
8. Repeat continuously; if no batch is available, wait for reactive stream updates.

## Files

- `src/lib/materializer.service.ts` - catch-up loop, per-note replay, title extraction pipeline
- `src/lib/materialization-checkpoint.repo.ts` - durable global checkpoint read/write
- `src/lib/graph.dedicated-worker.ts` - starts materializer in dedicated worker lifecycle
- `src/lib/event.repo.ts` - bounded global stream + per-note range queries
- `src/lib/note.repo.ts` - nullable snapshot field, per-note watermark read/write helpers
- `src/lib/db.tables.ts` - schema additions for note watermark/snapshot + checkpoint table
- `drizzle/0001_lame_groot.sql` - migration for new columns/table

## Current Scope and Caveats

- On-demand materialization is intentionally not implemented yet.
- Materializer failure is logged and fiber exits; no restart policy yet.
- This is acceptable for development and local validation, not production-hardening.

## Next Steps

- Add a lightweight restart policy for the materializer fiber.
- Add explicit on-demand `materialize(noteId)` endpoint if deterministic immediate refresh is needed.
