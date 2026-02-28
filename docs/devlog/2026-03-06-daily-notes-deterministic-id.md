---
title: Daily Notes via Deterministic Date IDs
date: 2026-03-06
type: shipped
tags:
  - routing
  - editor
  - yjs
  - materialization
  - sqlite
---

## Summary

Implemented a daily-note flow where the note identity is the route date key (`YYYY-MM-DD`). The graph route now validates and defaults `date` in search params, and the editor opens that date-specific note as a daily note. Persistence and event schemas were extended with `isDaily`, and materialization now derives daily titles from the deterministic date id.

## Why

Daily notes need a stable identity so the same day converges to one document across devices and sessions. Using the date key as note id removes ambiguity and lets Yjs updates for that day merge into the same stream.

## Design Decisions

- **Deterministic id from route date**: `/$graph` search includes `date` with a validated local-date default.
- **Minimal daily metadata**: Store only `isDaily` on notes/events; do not introduce a separate `dailyAt` field.
- **Editor-level daily mode**: `Editor` now receives `{ noteId, isDaily }` and injects a virtual daily heading for display only.
- **Canonical daily title in materialization**: For daily notes, title comes from `formatDailyNoteTitle(noteId)` instead of editable document H1 text.
- **Backfill-safe replay path**: `EditorSyncService.setupDoc` can initialize from repo state by note id and continue streaming updates, including `isDaily` on newly emitted events.

## How It Works

1. Route validation sets/normalizes `search.date` to a valid `YYYY-MM-DD` string.
2. Daily route UI switches days via prev/today/next controls by mutating `search.date`.
3. Editor opens the selected `noteId` in daily mode and renders a virtual heading from the date.
4. Outgoing Yjs updates are persisted as events with `noteId` and `isDaily`.
5. Materializer replays events, and when materializing a daily note it computes title from note id.

## Files

- `src/routes/$graph.tsx` - date search schema/defaulting and redirect preservation
- `src/routes/$graph.index.tsx` - date navigation and single daily editor binding
- `src/lib/temporal.schema.ts` - validated plain-date schema for search params
- `src/editor.tsx` - `{ noteId, isDaily }` editor contract and setup
- `src/editor.virtual-daily-heading.extension.ts` - view-only daily heading decoration
- `src/lib/daily-note.ts` - date parsing and display title formatting
- `src/lib/editor-sync.service.ts` - repo bootstrap by note id and event emission with `isDaily`
- `src/lib/materializer.service.ts` - canonical daily title logic during materialization
- `src/lib/db.tables.ts` - `isDaily` columns on notes/events
- `src/lib/note.schema.ts` - note schema `isDaily`
- `src/lib/event.schema.ts` - event schema `isDaily`
- `src/lib/note.repo.ts` - note create mapping for `isDaily`
- `src/lib/event.repo.ts` - event insert mapping for `isDaily`
- `drizzle/0002_slimy_wolf_cub.sql` - migration for `isDaily` columns

## Scope Notes

- No explicit `getOrCreateDailyByDate` helper was introduced in this iteration.
- Daily note creation remains event/materialization-driven in current flow.
