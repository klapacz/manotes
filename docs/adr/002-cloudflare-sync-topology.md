# ADR-002: Cloudflare Sync Topology MVP

## Status

Proposed

## Context

ADR-001 describes the long-term sync model around an event log and Yjs updates, with later end-to-end encryption and compaction. We now need a concrete first deployment shape for multi-device sync that fits the code that already exists.

Current local architecture already gives us most of the data flow we need:

- `src/lib/event.repo.ts` persists per-graph Yjs updates in the local `events` table
- `src/lib/materializer.service.ts` turns the local event log into the materialized `notes` table
- `src/lib/editor-sync.service.ts` already propagates changes between tabs by reacting to local event log updates
- each graph already maps to its own browser SQLite database in OPFS

We want to add cloud sync with the following constraints:

- one user only for now
- payloads are plaintext for now; encryption comes later
- Cloudflare Workers + Durable Objects + Durable Object SQLite
- hibernating WebSockets for low-latency fanout
- minimal disruption to the current local-first pipeline

The key requirement is to make remote device sync look like "more events arriving in the same local log" so the existing materializer and tab sync keep working.

## Decision

### Sync Unit: One Graph per Durable Object

The sync boundary is the graph, not the individual note.

- browser storage is already partitioned per graph
- local event ids and materialization are already graph-scoped
- a graph-wide ordered log is enough for note creation, edits, and later delete/compact events
- note-level Durable Objects would make list sync, cross-note operations, and reconnect logic more complex

Each graph maps to one `GraphSyncDurableObject` instance.

For the one-user plaintext MVP, the Durable Object name can be derived from `graphName`. The intended account-integrated shape is documented in `docs/adr/003-account-graph-identity-and-e2ee-integration.md`: the Durable Object key becomes stable `graphId`, while account ownership and graph metadata live in a separate graph registry layer.

### High-Level Topology

```text
Tabs for one graph
  |
  v
SharedWorker (routing / leader coordination)
  |
  v
Dedicated Worker (single browser leader for that graph)
  |- OPFS SQLite: events, notes, sync metadata
  |- MaterializerService
  |- one WebSocket to cloud
  |
  v
Cloudflare Worker router
  |
  v
GraphSyncDurableObject
  |- hibernating WebSocket fanout
  |- graph-wide ordered sync log
  |- Durable Object SQLite
```

The important consequence is that only the browser-side leader for a graph talks to the cloud. Other tabs do not run independent sync loops. They keep observing the same local SQLite database, which avoids duplicate uploads and duplicate remote inserts.

### Browser Responsibilities

The existing local pipeline stays intact.

- editor writes local Yjs updates into the local `events` table
- materializer rebuilds `notes` from `events`
- other tabs learn about changes from the same local database

Multi-device sync is added as a separate replication layer in the dedicated worker:

- watches local unsynced events and uploads them
- receives committed remote events and inserts them into local `events`
- derives the local commit cursor from `coalesce(max(events.commitSeq), 0)`
- leaves all note materialization and editor fanout to the existing services

This means remote sync does not need a second editor-specific merge path. The merge point remains the local event log.

### Server Responsibilities

The edge Worker is thin. It only:

- authenticates the request when auth exists
- resolves the graph Durable Object
- upgrades WebSocket requests or forwards HTTP requests

The Durable Object is the sync authority for one graph. It owns:

- the graph's total event order
- the graph's live WebSocket connections
- commit validation and idempotency
- catch-up replay for reconnecting clients

Even though the MVP payload is plaintext, the server still treats note payloads as transport data, not as a server-side source of truth. We intentionally do not build a separate server `notes` table. That keeps the server close to the future encrypted shape from ADR-001.

### Server Data Model

The Durable Object stores a graph-wide sync log in SQLite.

```sql
events (
  commitSeq  integer primary key autoincrement,
  id         text not null unique,
  noteId     text not null,
  isDaily    integer not null,
  payload    blob not null,
  createdAt  text not null
)
```

Notes:

- `commitSeq` is the authoritative graph-wide order assigned by the Durable Object
- `id` gives idempotent retry safety across reconnects
- each row is one committed `update` event in the MVP
- later event kinds can be added without changing the overall topology

No per-client cursor has to live on the server. Each client derives its own last applied `commitSeq` from local `events` as `coalesce(max(commitSeq), 0)`.

### Local Data Model Additions

The existing local `events` and `notes` tables remain the main content pipeline.

Add a small sync-specific layer alongside them:

- extend local `events` rows with unique `id` and nullable `commitSeq`

In the MVP, there is no separate local `sync_state`, `sync_outbox`, or `server_events` table.

- pending local changes are simply `events where commitSeq is null`
- a local event gets `id` when inserted and keeps it for its whole lifetime
- once the server commits it, that same row is updated with `commitSeq`
- the local reconnect / base cursor is derived as `coalesce(max(events.commitSeq), 0)`
- this derived cursor is only valid if non-null local `commitSeq` values are unique and form a contiguous prefix of the server log

Applying a validated `Replay`, `CommitAck`, or `Committed` batch must make a longer committed prefix visible atomically in the local database. After a crash, the client may be behind, but it must never observe a local gap and then report a later `max(commitSeq)` as if the missing events were already applied.

This keeps the materialization model simple. `MaterializerService` and `EditorSyncService` still only care about the local ordered `events` table.

### Protocol

The primary transport is a graph-wide WebSocket between the browser leader and the graph Durable Object.

There are two client messages (`Connect`, `Commit`) and four server messages (`Replay`, `ReplayDone`, `CommitAck`, `Committed`).

#### 1. Connect

Client opens a WebSocket and sends:

```ts
{
  _tag: "Connect",
  graphName,
  lastCommitSeq,
}
```

`lastCommitSeq` is derived from local `events` as `coalesce(max(commitSeq), 0)`. Because the client only makes committed prefixes visible locally, that derived value is the highest contiguous `commitSeq` the client has fully applied.

The Durable Object replies with zero or more `Replay` messages followed by exactly one `ReplayDone`. If the client is already caught up, the catch-up sequence is just `ReplayDone`. A validated `ReplayDone` is the only transition that makes a new session ready for `Commit`.

#### 2. Replay

Server catch-up uses:

```ts
{
  _tag: "Replay",
  events: [
    {
      commitSeq,
      id,
      noteId,
      isDaily,
      payload,
      createdAt
    }
  ]
}
```

Notes:

- `Replay.events` is always non-empty, contiguous, and ordered by `commitSeq` ascending
- each `Replay` extends the client's current `lastCommitSeq`; future replay pagination can therefore stream multiple `Replay` pages before completion
- the server may send `Replay` immediately after `Connect` and later as the response to a stale `Commit`

#### 3. ReplayDone

Server catch-up completion uses:

```ts
{
  _tag: "ReplayDone",
  upToCommitSeq,
}
```

Notes:

- `upToCommitSeq` is the authoritative end cursor for the catch-up cycle that just finished
- `ReplayDone` may arrive immediately after `Connect` when there is nothing to replay
- `ReplayDone` may also complete the stale-commit response path after one or more `Replay` messages

#### 4. Commit

The browser leader watches local pending rows and sends batches:

```ts
{
  _tag: "Commit",
  baseCommitSeq,
  events: [
    {
      id,
      noteId,
      isDaily,
      payload,
      createdAt
    }
  ]
}
```

`baseCommitSeq` is derived from local `events` as `coalesce(max(commitSeq), 0)`, which is also the highest contiguous `commitSeq` the client has fully applied locally. The commit set is local rows where `commitSeq` is `null`. Even though the MVP only syncs `update` events, keeping this precondition preserves ADR-001's catch-up-before-push rule and leaves room for later event kinds such as compaction or delete that do depend on full server context.

The Durable Object compares `baseCommitSeq` with the current graph tip:

- if `baseCommitSeq` matches the current tip, it writes the batch transactionally, assigns `commitSeq`, replies to the originator with `CommitAck`, and emits `Committed` to the other connected clients
- if the client is behind, it does not append and instead responds with the missing suffix as zero or more `Replay` messages followed by `ReplayDone`; the client applies that replay and retries later from local pending rows
- if `baseCommitSeq` is impossible for the current server state, the server closes the socket as a protocol violation

For an accepted `Commit`, event ids are expected to be new:

- if `id` is already present while `baseCommitSeq` matches the current tip, the server treats that as a protocol or state invariant violation and closes the socket
- otherwise it appends new rows and returns them in `CommitAck`

#### 5. CommitAck

Successful commit confirmation to the originator uses:

```ts
{
  _tag: "CommitAck",
  events: [
    {
      commitSeq,
      id,
      noteId,
      isDaily,
      payload,
      createdAt
    }
  ]
}
```

`CommitAck.events` is always non-empty, contiguous, and ordered by `commitSeq` ascending. Because the protocol allows only one in-flight `Commit` per socket, `CommitAck` does not need to echo `baseCommitSeq`; an unexpected or malformed `CommitAck` is a protocol violation.

For the MVP client, `CommitAck` also does not have to be validated as an exact mirror of the just-sent `Commit` payload. The local SQLite `events` table remains the source of truth for unsent work: applying any authoritative committed suffix from the server is safe because rows whose ids were not acknowledged still have `commitSeq = null` locally and are retried by the next `readyOrCommitPending()` pass. In other words, the client relies on the server's committed graph log being authoritative, not on `CommitAck` echoing the pending batch byte-for-byte.

#### 6. Committed

Live replication uses:

```ts
{
  _tag: "Committed",
  events: [
    {
      commitSeq,
      id,
      noteId,
      isDaily,
      payload,
      createdAt
    }
  ]
}
```

`Committed.events` is always non-empty, contiguous, and ordered by `commitSeq` ascending. The server emits `Committed` to connected clients other than the originator of a successful `Commit`. That keeps live fanout separate from originator acknowledgement.

#### 7. Client Session Model

The browser leader runs one explicit sync state machine per graph:

```ts
type MachineState =
  | {
      _tag: "Bootstrapping";
      bufferedCommitted: ReadonlyArray<CommittedMessage>;
    }
  | {
      _tag: "Ready";
    }
  | {
      _tag: "Committing";
      bufferedCommitted: ReadonlyArray<CommittedMessage>;
    };
```

`lastCommitSeq` is derived from local `events` with `coalesce(max(commitSeq), 0)`, and pending uploads remain local `events where commitSeq is null`. The session state only tracks the protocol phase.

The client rules are:

- start in `Bootstrapping`, send `Connect`, and block local commits; any `Committed` received before the first valid `ReplayDone` is buffered instead of applied immediately
- validate every `Replay`, `CommitAck`, and `Committed` batch against the current derived `lastCommitSeq`; after dropping any already-applied prefix from a buffered `Committed`, the first unapplied event must be `lastCommitSeq + 1` and every later event must increment `commitSeq` by exactly 1
- when applying a validated event batch, match each event by `id` against the local log; if a local pending row exists, update its `commitSeq`, if no row exists, insert a new committed row, and if the row is already committed with the same `commitSeq`, treat it as an idempotent duplicate; the whole batch must become visible atomically so the derived cursor can only advance across committed prefixes
- `Replay` is data only, never a readiness signal; the client applies each validated `Replay` page immediately and stays blocked until `ReplayDone`
- once `ReplayDone` validates, the client requires `coalesce(max(events.commitSeq), 0) === upToCommitSeq`, drains buffered `Committed` messages with the same duplicate and continuity checks, and transitions to `Ready`
- in `Ready`, local SQLite notifications about pending rows are only wake-up hints; the client always re-queries pending rows before sending and only sends `Commit` when the session is `Ready`
- sending `Commit` transitions to `Committing`
- in `Committing`, a `Replay ... ReplayDone` sequence means the base cursor was stale; the client applies it, drains buffered `Committed`, then transitions through `readyOrCommitPending()` to either `Ready` or back to `Committing` if more local rows are ready to send
- in `Committing`, `CommitAck` means the in-flight commit was accepted; the client applies it, drains buffered `Committed`, then transitions through `readyOrCommitPending()` to either `Ready` or back to `Committing` if more local rows are ready to send
- when draining buffered `Committed`, the client drops a batch that is already fully covered by local `lastCommitSeq`; if a batch overlaps only at the front, it trims the duplicate prefix and validates the remaining suffix as the next contiguous extension
- any unexpected message for the current phase, any gap, rollback, duplicate `commitSeq`, or malformed ordering in `Replay`, `ReplayDone`, `CommitAck`, or `Committed` causes the client to close the socket and reconnect from the locally derived `lastCommitSeq`

Current implementation note for the MVP:

- the client implementation is intentionally a little more permissive than the strict rules above
- when applying inbound committed batches, it currently drops any already-applied prefix before enforcing continuity on the remaining suffix; in practice that means overlap is tolerated not only for buffered `Committed` fanout, but also for `Replay` and `CommitAck`
- while `Committing`, the client currently accepts a bare `ReplayDone` without a preceding `Replay` as a no-op stale-base resolution as long as the local derived cursor matches `upToCommitSeq`
- this is acceptable for the current MVP because the server implementation already emits ordered contiguous batches and the local database remains the source of truth for unsent work
- if we later want stricter protocol enforcement, tighten the client so duplicate or overlapping `Replay` / `CommitAck` messages and bare `ReplayDone` in `Committing` are treated as protocol violations instead of tolerated inputs

The client has one transition helper, `readyOrCommitPending()`, which runs after a valid `ReplayDone`, after resolving `Committing`, and when the local pending stream flips from empty to non-empty. It calls `sendPendingCommit()` and returns `Committing` when it actually sends a batch, otherwise `Ready`. Because the local database is the source of truth, missed wake-ups only delay the next send; they do not lose pending work.

Every applied `Replay`, `CommitAck`, or `Committed` still writes into the same local `events` table. That automatically wakes up:

- `MaterializerService` for note cache updates
- `EditorSyncService` for live tab/editor updates

### Event Scope for MVP

The first cloud sync slice is intentionally small:

- sync `update` events only
- first update implicitly creates a note
- defer delete, restore, compaction, and hard delete
- defer user-facing history semantics until the sync core is working

This matches the current local code better than jumping straight to the full ADR-001 event surface.

### Why This Shape

- It reuses the current local-first architecture instead of bypassing it.
- It gives each graph a single cloud ordering authority.
- It makes remote sync feed the same local event log that already powers materialization and tab sync.
- It makes catch-up, write acknowledgement, and live fanout explicit instead of overloading one message with multiple roles.
- It keeps the server payload model compatible with future encryption because the server remains a log store, not a note materializer.
- It keeps browser-side concurrency manageable by running exactly one sync loop per graph per browser.

### Planned Follow-Ups

After the MVP topology is in place, we can extend it in order:

1. add soft-delete and restore events
2. add replay pagination / large catch-up batching
3. add compaction and server-side GC rules
4. add real authentication and namespace Durable Objects by user id
5. encrypt payloads without changing the overall topology

## Consequences

What becomes easier:

- remote sync layers cleanly on top of the existing `events -> notes` pipeline
- one graph-wide Durable Object gives deterministic ordering and simple fanout
- reconnect is simple: send last applied `commitSeq` and replay forward
- no separate local cursor table is required; reconnect state is derived from `events`
- tabs stay simple because they continue to react to local SQLite only

What becomes harder:

- we need a browser-side sync leader per graph, not one sync loop per tab
- local committed rows must stay a unique, gap-free prefix of server order because the reconnect cursor is derived from `events`
- a single graph Durable Object is a serialization point for all writes in that graph
- large backfills will eventually need pagination or snapshots
