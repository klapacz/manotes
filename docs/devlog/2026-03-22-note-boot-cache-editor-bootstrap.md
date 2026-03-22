---
title: Warm editor bootstrap from a shared note boot cache
date: 2026-03-22
type: shipped
tags:
  - editor
  - cache
  - daily-notes
  - effect
  - yjs
---

## Summary

Moved editor bootstrap state behind a shared `NoteBootCache` service so editors no longer need route-specific `initial` props. Daily note navigation now preloads the selected day plus adjacent days, and editor setup consumes the cached boot stream to apply the materialized Yjs snapshot before tailing live updates.

## Why

Daily note scrolling and navigation were paying unnecessary cold-start cost at the editor boundary. Passing boot data through route props also made the daily and regular note paths diverge even though both need the same minimal note snapshot: `materializedYUpdate` plus `lastEventLocalSeq`.

## Design Decisions

- **Cache only boot fields**: `NoteBootCache` narrows note state to the two values needed for editor hydration instead of exposing the full note record to bootstrap consumers.
- **Use a shared reactive source**: cache entries are backed by `reactiveFindById` plus `Stream.share`, so concurrent editors and preloads can reuse one live stream per note.
- **Preload near the viewport**: the daily route loader eagerly warms the selected date and kicks off best-effort preload for the previous and next dates.
- **Remove `initial` plumbing**: `Editor` and its routes now bootstrap through `EditorSyncService` only, which keeps daily and non-daily note setup on one path.

## Learnings

- The editor bootstrap boundary is small enough that a focused boot cache is a better fit than threading note snapshots through every route.
- Preloading adjacent daily notes is a cheap way to improve perceived scroll/open latency without changing editor or event semantics.
- Keeping the boot stream alive for the editor lifetime avoids immediately discarding the warmed reactive subscription after the first read.
- The daily route still needs to read `dates()` before its early-return guards so search-driven scroll retries after the virtualized window reseeds.
- Editor bootstrap should surface a visible failure state; otherwise cache or stream setup errors look like an empty note instead of a load problem.
