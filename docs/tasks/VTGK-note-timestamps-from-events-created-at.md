---
title: Make materializer follow event createdAt order
id: VTGK
status: planned
priority: medium
depends_on: []
---

## Context

Note timestamps should come from event creation time, not from local insertion order.

## Goal

Make `notes.createdAt` and `notes.updatedAt` derive from note events sorted by `createdAt`.

## Acceptance Criteria

- [ ] `notes.createdAt` comes from the earliest event `createdAt` for the note
- [ ] `notes.updatedAt` comes from the latest event `createdAt` for the note
- [ ] Event timestamps are evaluated after sorting note events by `createdAt`

## Constraints

- Keep the task scoped to note timestamp derivation

## Relevant Files

- `src/lib/materializer.service.ts`
- `src/lib/event.repo.ts`
- `src/lib/db.tables.ts`
- `src/lib/event.schema.ts`
- `docs/adr/002-cloudflare-sync-topology.md`
