# E2E Encrypted Note Sync Architecture

## Problem Statement

Design a synchronization system for an end-to-end encrypted note-taking application with the following requirements:

- Multi-device sync with concurrent editing support
- Complete note history
- End-to-end encryption (server cannot read content)
- Efficient sync for potentially thousands of notes

## Architecture Overview

### Hybrid Approach: Event Log + CRDT

The system combines two complementary technologies:

1. **Event log** for structural operations (create, delete, rename notes)
2. **Yjs CRDT** for collaborative text editing and conflict-free merging

## Data Model

### Unified Sync Log Table

```sql
sync_log:
seq (global) | note_id | type     | encrypted_blob | timestamp
1001         | abc     | create   | null           | ...
1002         | abc     | update   | <binary>       | ...
1003         | def     | update   | <binary>       | ...
1004         | abc     | delete   | null           | ...
1005         | abc     | compact  | <binary>       | ...
```

**Key properties:**

- `seq`: Global, monotonically increasing sequence number (server-assigned, unencrypted)
- `note_id`: Note identifier (unencrypted for routing)
- `type`: Event type - `create`, `update`, `delete`, `compact`, `hard_delete`
- `encrypted_blob`: Encrypted Yjs update or compact (null for `create`, `delete`, `hard_delete`)
- `timestamp`: Server timestamp (unencrypted)

## Client Architecture

### Materialized Database + Full Sync Log

**Clients maintain two data stores:**

1. **Materialized database** - local notes table for fast queries and offline access
2. **Full server sync log** - complete copy of server's sync_log table for sync operations

The materialized database serves application queries. The sync log enables efficient synchronization.

## Sync Protocol

### Client State

```typescript
{
  last_synced_seq: 1000,           // Last server sequence number synced
  pending: Array<{
    note_id: string;
    type: "create" | "update" | "delete" | "compact";
    yjs_update: Binary | null;     // Unencrypted Yjs updates locally
    timestamp: number;
  }>,
  notes: {
    abc: { deleted: false },       // Note metadata
    def: { deleted: false }
  }
}
```

**Important:** The **server** assigns sequence numbers (`seq`), not clients. Clients track pending local changes without sequence numbers until they're pushed to the server. Local merged updates are purely client-side compaction using `Y.mergeUpdates()` - they're still regular Yjs updates, just merged together.

### Sync Flow

1. **Client requests changes** - sends `last_synced_seq` to server
2. **Server returns all events** since last sync (seq, noteId, type, encryptedBlob)
3. **Client applies updates**:
   - Decrypts encrypted blobs
   - Applies Yjs updates directly to local state (no rollback needed - CRDT properties ensure convergence)
   - Recomputes materialized views (tags, backlinks) from merged note content
   - Updates local sync state (`last_synced_seq`)

### Push Validation

**Server enforces catch-up before accepting pushes:**

- Client must be synchronized to the latest `seq_id` before pushing changes
- Server rejects pushes from clients with stale state (`last_synced_seq < latest_seq`)
- Client workflow: **pull → merge → push**

**Why this matters:**

- Prevents clients from creating compacts based on incomplete state
- Ensures pushed updates/compacts include all known server changes
- Eliminates race conditions where client pushes changes without seeing concurrent edits
- Simplified conflict resolution: client always has full context before contributing changes

**Example:**

```
Client A: last_synced_seq = 100
Server: latest_seq = 105

Client A attempts push → REJECTED
Client A pulls (seq 101-105) → merges → last_synced_seq = 105
Client A attempts push → ACCEPTED
```

### Why No Rollback/Rebasing Needed

Traditional sync systems require complex rollback and rebase operations when merging remote and local changes:

**Traditional approach:**

1. Rollback local pending changes
2. Apply server changes to get authoritative state
3. Rebase/replay local changes on top
4. Handle conflicts and recompute derived state

**CRDT-based approach (this system):**

1. Merge server updates directly with local state
2. Recompute derived state from merged content

**Why this works:**

- **Yjs updates are commutative**: Server updates and local updates can be applied in any order and will converge to the same state. The CRDT properties eliminate the need for rollback.
- **Materialized views are derived**: Tags, backlinks, and other metadata are recomputed from note content (single source of truth). After Yjs merges updates, simply rebuild these views from the merged state.
- **No snapshot comparison**: Unlike systems that diff snapshots, Yjs tracks the causal history internally. No need to manually determine what changed or in what order.

### Complexity

- **Sync cost**: O(changes since last sync), not O(total notes)
- **Server load**: Minimal - stores opaque encrypted blobs
- **Privacy**: Server sees only note IDs, sequence numbers, timestamps

## Key Design Decisions

### Deletion Strategy: Soft Delete with Tombstones

**Conflict resolution:**
| Scenario | Behavior |
|----------|----------|
| Device A deletes, Device B edits | Edit applies, note stays "deleted" but recoverable |
| User wants to restore | Clear `deleted_at`, note reappears |
| Garbage collection | Hard delete after 30 days |

**Advantages:**

- No data loss from concurrent operations
- User can restore from "trash"
- Simpler conflict handling (no special cases needed)

### Compaction: Periodic Compacts

**Problem:** Incremental Yjs updates accumulate over time

- Note with months of edits: 2,847 updates = 4.2MB
- Actual content: 12KB of text

**Solution:** Dual-layer compaction

The system uses two complementary compaction strategies using the same mechanism (`Y.mergeUpdates()`):

1. **Pending updates compaction** (offline-capable): Merge local pending updates to reduce memory footprint while preserving all changes
2. **Server log compaction** (online only): Merge updates from server_log, then push the compact to trigger server GC of superseded updates

Since the server cannot decrypt the content, only the client can perform compaction operations.

**Important:** Server log compaction only makes sense when connected to the server. There is no point in compacting updates from server_log when offline, since:

- The compact cannot be pushed to trigger server GC
- The compacted updates are already synced (no local storage benefit)
- Local memory is managed by pending updates compaction instead

**Pending updates compaction triggers:**

- Pending array has >100 updates
- Total pending update size >500KB
- Background job on idle
- Anytime to reduce memory footprint

**Server log compaction triggers** (only when online and caught up):

- Note has >100 updates in server_log since last compact
- Total server_log update size for a note >500KB
- On note close (if connected and caught up to server)
- User manually triggers sync/cleanup

**Server compact creation workflow:**

To ensure server compacts contain all known state and avoid data loss:

```
pull → merge → compact → push
```

1. Client pulls latest updates from server
2. Applies remote updates to local Yjs doc (merge)
3. Creates compact from merged state using `Y.encodeStateAsUpdate(doc)`
4. Pushes compact to server

This "pull before compact" rule ensures the compact contains a superset of all known state. Without this, a compact created from stale local state could cause data loss when the server GCs updates that weren't included in the compact.

**Note:** When merging remote updates (step 2), Yjs handles this automatically via CRDT properties - no manual rebasing required. The client simply applies server updates to the local Yjs document, which automatically merges with any local changes.

### Garbage Collection Synchronization

The system uses a **compacting log** pattern where the event log contains events describing its own mutations. This breaks the pure append-only model but is necessary for practical storage management.

#### 1. Superseded Updates GC (Immediate)

When the server receives a compact, it immediately deletes superseded updates:

1. Client pushes compact at seq N (contains all state up to seq N-1)
2. Server assigns sequence number to compact
3. Server immediately deletes all previous `update` events for that note
4. Clients syncing later receive only the compact (no intermediate updates)

**Why immediate deletion works:**

- Compact contains full document state - no information is lost
- Offline clients that missed intermediate updates don't need them
- Yjs merges compact with any local changes automatically
- No grace period needed - compacts are self-contained

#### 2. Hard-Deleted Notes GC (More Complex)

When a tombstone expires (after 30 days) and a note is permanently deleted, clients need explicit notification:

**Approach: `hard_delete` events in sync log**

```sql
sync_log:
seq  | note_id | type        | encrypted_blob | ...
2001 | abc     | hard_delete | null           | ...
```

**GC Flow:**

1. Note is soft-deleted (tombstone created)
2. After 30 days (or when user manually empties trash), client initiates permanent deletion
3. Client pushes `hard_delete` event to server
4. Server deletes all `note_id` entries from sync log (complete cleanup)
5. Server propagates `hard_delete` event to other clients via normal sync flow
6. Other clients receive event and purge local data
7. `hard_delete` events are **retained forever** (lightweight, no encrypted blob)

**Event Type Schema:**

```typescript
type SyncEvent =
  | {
      type: "create" | "update" | "delete" | "compact";
      noteId: string;
      encryptedBlob: Binary;
    }
  | { type: "hard_delete"; noteId: string; encryptedBlob: null }; // GC notification (kept forever)
```

**Why keep `hard_delete` events forever:**

- Extremely lightweight (just `seq`, `note_id`, `type`, `timestamp` - no encrypted blob)
- Eliminates the need for complex "full resync" logic for very old clients
- Provides complete historical record of what was deleted and when
- Minimal storage cost compared to actual note data

**Edge cases:**

- Client pushes changes to GCed note → Handle "note not found" error gracefully
- New device onboarding → Receives all `hard_delete` events, knows definitively what's deleted

**Pattern trade-offs:**

This is sometimes called a **compacting log** or **log with tombstone GC**. The log contains events that describe mutations to itself, breaking the pure append-only model in a controlled way.

| Pure Event Sourcing                | Pragmatic Need                       |
| ---------------------------------- | ------------------------------------ |
| Log is immutable truth             | Log needs to shrink                  |
| Replay from beginning always works | Ancient history gets GCed            |
| Events describe domain actions     | Some events describe log maintenance |

**Documentation requirements:**

- Log is append-only _except_ for GC (update deletion and hard delete notification)
- `hard_delete` events notify clients of permanent deletions
- `hard_delete` events are kept forever, so even very old clients can sync

### Encryption Considerations

**Encrypted:**

- Note content (Yjs blobs)
- Note titles/metadata

**Unencrypted (for sync efficiency):**

- Note IDs
- Sequence numbers
- Timestamps
- Event types

**Trade-off:** Server learns note access patterns but cannot read content

## Known Challenges

### Initial Sync on New Device

**Problem:** New device needs all notes before app feels "ready"

**Solutions:**

- Lazy loading: Sync note list first, fetch content on demand
- Progressive sync: Load recent/important notes first
- Background sync: Continue fetching while user works

### Long Offline Periods

**Problem:** Client accumulates unbounded pending updates when offline for extended periods

**Solution:** Local update merging

Even when never syncing with the server, clients can merge their pending Yjs updates locally:

```typescript
// Before compaction: 1000+ small updates
pending.updates = [update1, update2, ..., update1000];

// After local merging: single merged Yjs update
pending.merged_update = Y.mergeUpdates(pending.updates);
pending.updates = [];
```

**Benefits:**

- Bounded memory usage regardless of offline duration
- When finally syncing, client pushes merged updates (still regular Yjs updates)
- Same compaction triggers apply locally as server-side
- `Y.mergeUpdates()` is lossless - merged update contains all information from individual updates

### Sync Failure Recovery

**Problem:** Connection drops mid-sync

**Solutions:**

- Atomic batch operations where possible
- Idempotent update application (Yjs handles this)
- Resume from last successful `seq`

## Implementation Notes

### Yjs State Vector (No Custom Vector Clocks Needed)

Yjs provides built-in state tracking through state vectors, which encode what updates each client has seen. The library can compute diffs between local and remote state vectors to determine what updates need to be synced.

**Implication:** No need for separate vector clock implementation for Yjs content

### Yjs CRDT Properties

Yjs updates have key properties that simplify the sync architecture:

1. **Order-independent:** Updates can be applied in any order and will converge to the same state
2. **Idempotent:** Applying the same update multiple times has no effect
3. **State-based:** Compacts contain full document state; clients can skip intermediate updates entirely
4. **History-agnostic:** Yjs only cares about current state vector, not the history of how we got there

**Practical implications:**

- When a client pulls a compact, Yjs automatically merges it with local changes
- No manual "rebasing" needed - Yjs handles conflicts automatically
- Clients can miss updates (if GCed) and still sync via compacts
- The event log history is an optimization for sync protocol - Yjs doesn't depend on it

### Compact Example

Here's how compact-based compaction works with concurrent edits:

```yaml
# 1. Starting point
server:
  events:
    - seq: 1, note_id: "abc", type: "create"
client_a: synced (last_synced_seq: 1)
client_b: synced (last_synced_seq: 1)

# 2. Client A makes changes and pushes
server:
  events:
    - seq: 1, note_id: "abc", type: "create"
    - seq: 2, note_id: "abc", type: "update"  # A's changes
    - seq: 3, note_id: "abc", type: "update"  # A's changes
client_a: synced (last_synced_seq: 3)

# 3. Client A creates compact (after pull-merge)
# Server receives compact and immediately deletes seq 2, 3
server:
  events:
    - seq: 1, note_id: "abc", type: "create"
    - seq: 4, note_id: "abc", type: "compact"  # Contains all state
    # seq 2, 3 immediately deleted

# 4. Client B (offline) makes local changes
client_b:
  last_synced_seq: 1
  local_yjs_doc: "has B's edits applied locally"
  pending_updates: [{ yjs_update: Binary }]

# 5. Client B pulls and syncs
client_b:
  # Receives compact (seq 4)
  # Yjs applies compact and merges with B's local changes automatically
  # No "rebasing" needed - CRDT handles conflict resolution
  last_synced_seq: 4
  local_yjs_doc: "merged state (compact + B's edits)"
  pending_updates: [{ yjs_update: Binary }]  # still needs to push

# 6. Client B pushes merged changes
server:
  events:
    - seq: 1, note_id: "abc", type: "create"
    - seq: 4, note_id: "abc", type: "compact"
    - seq: 5, note_id: "abc", type: "update"  # B's merged update
```

**Key observations:**

- Client B never "saw" seq 2-3 updates, but this is fine
- The compact (seq 4) contains all the content from seq 2-3
- Yjs merges compact + B's local changes automatically
- No data loss despite history compaction

## Materialized Views and Derived State

### Challenge: Syncing Derived State

While Yjs CRDT handles note content merging automatically, **derived/materialized state** (like tags, backlinks) doesn't benefit from CRDT properties:

| Yjs Updates       | Materialized View Operations             |
| ----------------- | ---------------------------------------- |
| Order-independent | Order-dependent (for reference counting) |
| Idempotent        | Not idempotent (`INSERT` can fail)       |
| Self-merging      | Requires explicit conflict resolution    |

### Solution: Junction Table + Idempotent Operations

Instead of tracking tag reference counts (which is order-dependent), use a junction table pattern:

```sql
tags:
  id | name | created_at

note_tags:
  note_id | tag_id
  PRIMARY KEY (note_id, tag_id)
```

**Why this works:**

| Operation      | SQL                                                               | Idempotent? |
| -------------- | ----------------------------------------------------------------- | ----------- |
| Note gains tag | `INSERT ... ON CONFLICT DO NOTHING`                               | ✓           |
| Note loses tag | `DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?`          | ✓           |
| Orphan cleanup | `DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)` | ✓           |

**Concurrent scenarios:**

```
# Two devices create same tag offline
Device A: INSERT tag "work" → id=1, INSERT note_tags(note_a, 1)
Device B: INSERT tag "work" → ON CONFLICT DO NOTHING, INSERT note_tags(note_b, 1)
Result: Both note_tags rows exist, tag exists once ✓

# Delete while adding elsewhere
Device A: Deletes note_a → DELETE FROM note_tags WHERE note_id = note_a
Device B: Adds tag to note_b → INSERT INTO note_tags(note_b, 1)
Result: Tag survives because note_b still references it ✓
```

**Derivation strategy:**

After applying Yjs updates during sync, rebuild materialized views from note content.

**Key principles:**

- Materialized views are **derived from note content** (single source of truth)
- Operations are **idempotent** (order doesn't matter)
- No need for "rebasing" separate event logs
- Tags have no properties (just `id`, `name`, `created_at`) - no metadata conflicts possible
- Lazy GC for orphaned tags (query-time filtering or periodic cleanup)

## Summary

**Core Insight:** Event log serves as a lightweight, unencrypted sync index that allows the server to answer "what changed since X" without reading encrypted content.

**Architecture Benefits:**

- Efficient sync: O(changes) not O(notes)
- Privacy: Server stores opaque blobs
- Scalability: Handles thousands of notes
- Conflict-free: Yjs handles concurrent edits
- Offline-resilient: Compacts allow syncing after long offline periods
- Flexibility: Clear separation of concerns
- Simple derived state: Junction tables + idempotent operations avoid rebasing complexity

**Trade-offs:**

- Two systems to maintain (event log + Yjs)
- Server sees access patterns
- Client-side compaction complexity (local update merging + server compacts)
- Materialized views need rebuilding after sync (but operations are idempotent)
