---
title: Local graph deletion with reactive disposal and cross-tab locking
date: 2026-04-18
type: shipped
tags:
  - graph
  - deletion
  - runtime
  - opfs
  - effect
  - web-locks
---

## Summary

Implemented local graph deletion as a two-phase flow coordinated through the local registry, graph resolution, runtime manager, OPFS file removal, and Web Locks. Local graphs can now be marked as deleting, disappear reactively from graph access, dispose active runtimes across tabs, and then be hard-deleted only after exclusive access to the graph’s DB file is acquired.

## The Why

Deleting a local graph is more than removing a row from `LocalRegistry`.

A local graph is represented by:

- a `graphs` row in the local registry
- an OPFS SQLite file at `${localGraphId}.sqlite3`
- possibly one or more active runtimes in this tab or other tabs
- worker/DB resources scoped to those runtimes

That creates a correctness problem in a multi-tab app: deleting the registry row or OPFS file too early can race with another tab that still has the graph open. If that runtime keeps running while deletion is in progress, it can hold the DB open or even recreate state after partial cleanup.

The deletion flow needed to make graph disappearance reactive first, then wait until all runtime holders are gone before touching the DB file.

## Design Decisions

- **Separate lifecycle from mode** — local registry records now carry `status: "active" | "deleting"` instead of overloading `mode` with lifecycle meaning.
- **Keep repo factual, map semantics in resolution** — `local-registry/repo.ts` returns stored rows as-is, while `resolution/service.ts` maps `"deleting"` records to `Resolution.Missing()`.
- **Use reactive missing to dispose runtimes** — once a graph is marked deleting, existing runtime consumers observe it as missing and the runtime manager tears it down through the normal path.
- **Coordinate cross-tab deletion with Web Locks** — runtimes hold a shared per-graph lock, while deletion acquires the same lock exclusively before removing the OPFS file.
- **Make current-tab teardown eager** — deletion still calls `runtimeManager.remove(localGraphId)` explicitly so the initiating tab releases its shared lock immediately instead of waiting only on reactive propagation.
- **Treat OPFS `NotFoundError` as success** — if the DB file is already gone, deletion can still complete and hard-delete the registry row.
- **Do not roll back from `deleting` on failure** — if OPFS deletion fails, the graph stays in `"deleting"` state instead of being resurrected as active.
- **Reuse one graph DB path helper** — runtime creation, worker startup, and deletion all use `GraphRuntime.DBResolution.getPath(localGraphId)` for `${localGraphId}.sqlite3`.
- **Keep hard delete lifecycle-strict** — repository hard delete only succeeds for local graphs already in `status = 'deleting'`.

## What Changed

### Local registry

`apps/web/src/lib/graph-access/local-registry/schema.ts` and `repo.ts` were updated to add a shared `status` field to graph records and migrate existing installs with:

- `status TEXT NOT NULL DEFAULT 'active'`

The repo now shares a single `GRAPH_COLUMNS` list across `SELECT`/`RETURNING` queries and includes two deletion-oriented operations:

- `markGraphDeleting`
- `deleteLocalGraph`

Both enforce `mode = 'local'`, and hard delete also requires `status = 'deleting'`.

### Resolution and runtime behavior

`apps/web/src/lib/graph-access/resolution/service.ts` now centralizes the “resolve without key lookup” step and treats deleting graphs as missing. That means local graph deletion reuses the same runtime disposal behavior already used for missing graphs instead of introducing a second shutdown path.

### Web Locks

Web Lock handling was extracted into a shared helper in `apps/web/src/lib/web-lock.ts`, then reused by:

- `apps/web/src/lib/leader-election.ts`
- `apps/web/src/lib/graph-access/graph-runtime/lock.ts`

Graph runtimes acquire a shared per-graph lock before building DB/runtime resources. Deletion acquires that same lock exclusively, which guarantees all runtime holders are gone before file deletion starts.

### OPFS deletion

`apps/web/src/lib/opfs.service.ts` gained `removeFileFromOpfsRoot`, mirroring the existing OPFS helper style and preserving `NotFoundError` as a distinct case for callers that want to treat “already deleted” as success.

### Deletion orchestration

`apps/web/src/lib/graph-access/deletion/service.ts` adds the local deletion flow:

1. mark graph as deleting in the registry
2. remove the runtime eagerly in the current tab
3. acquire the graph’s exclusive runtime lock with timeout handling
4. delete the OPFS DB file
5. hard-delete the registry row

Timeout while waiting for the exclusive lock is surfaced as `GraphAccessDeletion.LockTimeout`.

### UI wiring

The index route’s graph list now exposes deletion through a dedicated confirmation dialog component:

- `apps/web/src/routes/-index/delete-graph-dialog.tsx`

The dialog calls the deletion service via the graph-access runtime layer, shows a success toast on completion, and renders a specific message for lock timeout failures.

## Notes for Future Work

A graph stuck in `status: "deleting"` is now an intentional recoverable state rather than an impossible one. That makes follow-up recovery work straightforward:

- startup scan for stale deleting rows
- UI affordance for retrying or surfacing stuck deletions
- possibly richer timeout/recovery handling if multi-tab contention becomes common

The main invariant to keep in mind is that registry state, runtime disposal, lock ownership, and OPFS file deletion must stay in this order. The file should only be removed after graph resolution has already made the graph disappear and after exclusive access proves no runtime still holds the DB open.
