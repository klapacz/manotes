---
title: Validate wa-sqlite OPFS switch with hot-path perf probes
date: 2026-03-15
type: shipped
tags:
  - sqlite
  - opfs
  - performance
  - editor
  - yjs
---

## Summary

Switched the browser persistence path from SQLocal to a direct `wa-sqlite` setup using `OPFSCoopSyncVFS`, then added targeted perf probes back across note bootstrap, reactive queries, cache lookup, and backlink rendering. The new traces show the old latency was mostly backend-wrapper overhead rather than editor or Yjs work.

## Why

The previous browser-local SQLite path made note open and backlink resolution feel much slower than the app architecture justified. Before committing to a more cursed design like a full in-memory replica or UI model pool, we needed to verify whether a lower-level SQLite backend could preserve the existing repo/service API shape while fixing the hot paths.

## Design Decisions

- **Keep app-facing APIs stable**: The swap stays behind `DB.Service` and repo boundaries instead of rewriting editor or cache consumers.
- **Measure end-to-end hot paths**: Probes were added around point reads, reactive first emission, editor bootstrap, and backlink resolution rather than only raw SQL execution.
- **Compare against previous SQLocal traces**: The goal was not abstract benchmark numbers, but whether the same user-visible flows materially improved.
- **Prefer persisted OPFS over in-memory architecture**: `OPFSCoopSyncVFS` gives a fast persisted path without adopting Livestore-style full replicas or Reflect-style lazy model hydration.

## Learnings

- `NoteRepo.findById` dropped from roughly `66ms` to `16ms` on the same note-open path.
- Plain preview lookup dropped from roughly `11-16ms` to `2.7ms`.
- Reactive preview first emission dropped from roughly `20-23ms` to `3.7ms`.
- Backlink resolution dropped from roughly `130ms` to about `13ms` end-to-end.
- Editor creation remains cheap (`Y.Doc`, extension build, editor init, mount), so the old bottleneck really was the DB backend path.
- This is good enough to keep the current architecture for now; further complexity should be justified only if future workloads regress.
