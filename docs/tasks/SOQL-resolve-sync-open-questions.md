---
title: Resolve sync open questions and deferred decisions
id: SOQL
status: planned
priority: low
depends_on: []
---

## Context

The sync system architecture (`docs/adr/001-sync-system.md`) has several open questions and deferred decisions that need resolution post-MVP. These were documented in `docs/sync/open-questions.md` but not yet acted upon.

## Goal

Research, design, and resolve open questions to advance the sync system beyond MVP.

## Open Questions

### 1. Search and Deleted Notes

**Current:** Soft-deleted notes remain in database with content. Default search excludes deleted (`WHERE deleted_at IS NULL`), with toggle to include.

**To decide:**

- How should backlinks to deleted notes display? (strikethrough, badge, hidden?)
- When viewing deleted note's backlinks, should we show incoming links?
- Should editing a deleted note via backlink/URL auto-restore it?

---

### 2. Restore Semantics

**Current:** User restores soft-deleted note.

**Options:**

1. Just clear `deleted_at` - note reappears as-is
2. Emit a restore event - creates audit trail, helps with sync conflict detection

**To decide:**

- Is `restore` a new event type, or an `update` with special semantics?
- If someone edits a deleted note (via backlink/direct URL), auto-restore?

---

### 3. Title Storage

**Current:** `notes.title` exists as column, unclear if derived or authoritative.

**Options:**

1. Inside Yjs doc - first heading or dedicated CRDT field
2. Separate encrypted field - encrypted independently from content
3. Derived in notes cache - extracted during materialization

**Considerations:**

- Note list needs titles without loading Yjs docs
- Backlink labels stored at mention-time (can go stale)
- Title changes should sync like content

---

### 4. Note Creation Timestamp

**Current:** `create` event removed, so no explicit creation time.

**Options:**

1. First event's timestamp - query `MIN(timestamp) WHERE note_id = X`
2. Store in notes cache - `notes.created_at` set on first materialization
3. Store in Yjs doc - creation time as CRDT field

**Leaning toward:** Option 2 - set once, never updated.

---

### 5. Compaction Triggers for Local-Only Mode

**Context:** In sync mode, compaction reduces server storage. In local-only mode, no server.

**Should local-only mode compact?**

- Pro: Reduces local storage, faster Y.Doc reconstruction
- Con: Loses granular history (can't undo to arbitrary point)

**To decide:**

- Is granular undo history a feature?
- User-triggered compaction in local-only?
- Different triggers for local vs sync mode?

---

### 6. Effect Cluster/Workers Integration

**Context:** Background worker for materialization uses Effect Cluster/Workers.

**To research:**

- Effect Cluster with SharedWorker setup
- Supervision/restart strategy
- Handling worker crashes mid-materialization
- Using Effect interruption for graceful shutdown

**Implementation needed:**

- Worker entry point setup
- Message protocol between main thread and worker
- Database access from worker (OPFS SQLite works in workers?)

---

### 7. Encryption Key Management

**Context:** Design mentions E2E encryption but doesn't specify key management.

**To decide:**

- Key derivation (passphrase, device key, etc.)
- Key rotation strategy
- Multi-device key sharing
- Recovery if key lost

**Status:** Deferred post-MVP. Current implementation stores unencrypted payloads.

---

### 8. Hard Delete Evaluation

**Context:** Architecture.md describes hard delete (permanent, triggers GC), but deferred due to race conditions with distributed sync and P2P implications.

**To revisit after:**

- Deciding if P2P sync is a requirement
- Understanding real-world storage implications of keeping tombstones
- User research on trash/deletion expectations

**Options from open-questions.md:**

1. Never auto hard-delete - only manual, user accepts risk
2. Hard delete requires peer agreement - all peers must have note deleted for X days (breaks offline-first)
3. No hard delete - deleted notes stay as tombstones forever
4. Hard delete is local-only - doesn't propagate (confusing UX)
5. Server-mode only - hard delete only works with central server, not P2P

---

## Acceptance Criteria

- [ ] Search/backlink behavior for deleted notes decided
- [ ] Restore event semantics finalized
- [ ] Title storage approach chosen and implemented
- [ ] Creation timestamp approach chosen and implemented
- [ ] Local-only compaction triggers defined
- [ ] Effect Cluster/Workers architecture designed
- [ ] Encryption key management strategy documented
- [ ] Hard delete approach evaluated (or deferred with clear criteria)

## References

- `docs/adr/001-sync-system.md` - Full architecture design
- Original `docs/sync/open-questions.md` (now deleted)
- `docs/devlog/2026-01-01-yjs-compaction-service.md` - Compaction implementation reference
