---
title: Multigraph/Multidb System Architecture
date: 2026-01-04
type: shipped
tags:
  - architecture
  - database
  - effect
  - routing
---

## Summary

The app implements a multigraph architecture where each "graph" is an isolated note workspace backed by its own SQLite database in the browser's OPFS. Graphs are implicitly created on first navigation after user confirmation.

## The Why

Users need separate workspaces for different contexts (personal, work, projects) with complete data isolation. Local-first architecture requires per-graph databases to enable offline access and avoid cloud dependency. The design prioritizes simplicity—no graph registry or management UI needed.

## Design Decisions

**Graph identification via URL path:** Graphs are identified by the `$graph` route param (`/work`, `/personal`). No explicit registry exists—any path is a valid graph name. This enables bookmarkable workspaces without configuration.

**OPFS + SQLite per graph:** Each graph gets its own `.sqlite3` file (`work.sqlite3`, `default.sqlite3`). Complete isolation—no shared tables, no cross-graph queries possible. Files persist in browser's Origin Private File System.

**Lazy creation with confirmation:** Navigating to a non-existent graph redirects to `/create?graphName=X` for user confirmation. After approval, the user is redirected back with `?allowCreate=true`, which triggers database creation and migrations.

**Runtime caching:** `runtime.ts` maintains a `Map<string, Runtime>` to avoid recreating Effect runtimes for the same graph. Each runtime owns its `DB.Service` instance connected to the graph's database.

**Effect service composition:** The database layer uses Effect's dependency injection:

```
Runtime
├── DB.Service (receives graph-specific Config)
├── EventRepo.Service
├── NoteRepo.Service
└── EditorSyncService.Service
```

`DB.Config` is a context tag providing `databasePath` and `allowCreate` to the service layer.

## Learnings

**OPFS existence checks are cheap:** Checking if a database file exists before opening (via `navigator.storage.getDirectory()`) is fast and avoids creating empty databases on read-only navigation.

**sqlocal handles OPFS complexity:** The `sqlocal` library abstracts SQLite-in-browser via OPFS, providing a clean async API and reactive query streams that integrate well with Effect.

**Route-level bootstrapping works well:** Initializing the runtime in `beforeLoad` keeps graph switching synchronous from the user's perspective—the layout route blocks until the database is ready.
