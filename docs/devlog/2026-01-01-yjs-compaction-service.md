---
title: Yjs Event Compaction Service
date: 2026-01-01
type: snippet
status: experimental
diff_file: ./2026-01-01-yjs-compaction-service.patch
tags:
  - yjs
  - performance
  - storage
  - ai-generated
---

> **Note:** This code was AI-generated and has not been tested. Saved for future reference only.

## Summary

Background compaction service that merges many small Yjs `update` events into single `compact` events. Includes throttling, rate limiting, and modified editor loading to use compact events as baselines.

## The Why

Over time, a note accumulates hundreds of incremental Yjs updates. Loading requires applying each one sequentially, and storage grows with every keystroke. Compaction reduces both load time and storage by periodically merging updates into snapshots.

## Design Decisions

- **New `compact` event type** - Stores full merged Yjs state, not incremental update
- **Background scheduler** - Runs every 5 minutes, checks thresholds (50+ events or 100KB+)
- **Throttling** - Max 10 compactions/hour, 30-minute cooldown per note
- **State persistence** - Throttle state saved to localStorage
- **Non-destructive** - Compact events inserted, then old updates deleted in transaction

## How It Works

1. Background service periodically scans for notes exceeding thresholds
2. Merges all `update` events using `Y.mergeUpdates()`
3. Creates fresh `Y.Doc`, applies merged update, encodes as state
4. Inserts `compact` event, deletes old `update` events atomically
5. Editor loads compact event first (if exists), then only newer updates

## The Diff

See [2026-01-01-yjs-compaction-service.patch](./2026-01-01-yjs-compaction-service.patch)

## When To Use

Reference this when implementing event sourcing compaction for Yjs or similar CRDTs. The throttling/rate-limiting patterns are reusable.

## Caveats

- **Untested** - AI-generated code, not validated or run
- **localStorage dependency** - Throttle state won't persist across browsers
- **No migration** - Existing notes work, but no backfill of compact events
- **Needs review** - Logic and Effect patterns should be verified before use
