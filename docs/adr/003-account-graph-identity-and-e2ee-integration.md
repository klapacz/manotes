# ADR-003: Account, Graph Identity, and E2EE Integration MVP

## Status

Proposed

## Context

ADR-001 defines the long-term encrypted sync model, and ADR-002 defines the current graph-scoped sync topology. We now need one coherent product and data model for:

- local-only graphs without an account
- optional per-graph cloud sync after sign-in
- downloading existing cloud graphs onto a device
- per-graph end-to-end encryption that fits the account flow

The current codebase still treats the route graph name as the local database identity. That is not the right long-term boundary for accounts, sync, rename, or per-graph encryption.

## Decision

### Identity Model

We split graph identity into three distinct fields:

- `localGraphId`: immutable device-local graph identifier
- `graphId`: immutable cloud graph identifier, nullable for local-only graphs
- `displayName`: user-facing graph name

`displayName` is metadata, not identity.

Consequences:

- routes use `localGraphId`
- local OPFS database filenames use `localGraphId`
- cloud sync uses `graphId`
- renaming a graph has no storage or cryptographic effect

### Local Registry

The app gets an app-global local registry store separate from per-graph content databases.

For MVP, each local graph record stores:

```ts
{
  localGraphId: string
  displayName: string
  origin: "local" | "cloud"
  graphId: string | null
  accountId: string | null
}
```

Invariants:

- `graphId === null` means the graph is local-only
- `graphId !== null` means the graph is cloud-backed
- at most one local graph record may exist per `(accountId, graphId)` on a device
- local-only graphs may have the same `displayName` as cloud-backed graphs on the same device

The registry also stores account session state.

### Product Model

The baseline experience remains local-first:

- signed-out users can create and use local-only graphs
- sync always requires sign-in
- signed-in users can still create local-only graphs
- sync is opt-in per graph

The graph picker/dashboard is the signed-in entry point. MVP sections are:

- local graphs
- synced graphs on this device
- cloud graphs not on this device

### Graph Flows

#### Create Local Graph

- creates a local registry record with `graphId = null`
- creates a per-graph local database on first open

#### Enable Sync For Existing Local Graph

- keeps the same `localGraphId`
- creates a new remote graph and gets a new `graphId`
- attaches that `graphId` to the existing local graph
- if the remote `displayName` conflicts within the account, the user renames the graph and that rename applies to both local and remote

MVP does not support attaching a local graph to an already-populated remote graph.

#### Open Existing Cloud Graph

- never mutates the currently open local graph
- creates a new local registry record with a fresh `localGraphId`
- links that record to the existing remote `graphId`
- creates the per-graph local database on demand
- joins sync for that graph

MVP does not support graph-to-graph merge.

#### Logout

- deletes cloud-backed local graphs for the current account
- keeps purely local graphs
- drops unlocked graph secrets from memory

### Server Model

The server has two separate responsibilities:

#### Graph Registry Layer

Stores account-owned graph metadata and access control:

- `graphId`
- `accountId`
- `displayName`
- encryption metadata needed to unlock the graph

The registry API is responsible for:

- list graphs
- create graph
- rename graph
- authorize opening a graph for sync

`displayName` uniqueness is enforced per account on the server.

#### Graph Sync Durable Object

The sync Durable Object is keyed by `graphId` and remains focused on event-log replication:

- ordered event log
- websocket fanout
- replay and commit protocol

For MVP, graph metadata discussed in this ADR stays outside the Durable Object.

### Authentication And Encryption Are Separate

Account auth and graph decryption are separate concerns:

- magic-link login proves who the user is
- graph unlock proves the client can decrypt one graph

Logging in does not imply that the client can decrypt all graphs on the account.

For MVP:

- graph existence and `displayName` remain plaintext metadata
- note payloads are encrypted
- note identifiers are hidden from the server behind opaque hashes

### E2EE Model

Only synced graphs use E2EE in MVP. Local-only graphs remain unencrypted for now.

Each synced graph gets a random symmetric `graphKey`. Content is encrypted with `graphKey`.

The user-provided per-graph password does not encrypt note events directly. Instead it is used to wrap the graph key:

1. generate random `graphKey`
2. derive a `passwordKey` from the graph password
3. encrypt the `graphKey` with `passwordKey`
4. store the wrapped `graphKey` plus scheme metadata
5. unlocking the graph unwraps `graphKey`, which is then used for content encryption/decryption

This means:

- changing a graph password only re-wraps `graphKey`
- graph rename has no crypto impact
- future unlock methods can be added without re-encrypting note content

For MVP, wrong password detection can happen client-side while trying to unwrap `graphKey` or decrypt graph content. The server does not validate graph passwords directly.

### Unlock Persistence

For MVP, unlocked graph secrets live for the lifetime of the local session on a device.

We explicitly defer the hardening choice between:

- memory-only unlock state
- local persistent raw-password cache
- device-protected cached wrapped keys

The durable architecture decision is the wrapped `graphKey` model, not the first local caching mechanism.

## Consequences

### What Gets Simpler

- account flow and graph unlock have clean boundaries
- rename no longer affects storage or crypto
- opening an existing cloud graph on a new device becomes a straightforward download-and-unlock flow
- future password change is cheap because it only re-wraps `graphKey`

### What Gets More Complex

- the app now needs a real app-global local registry
- route identity can no longer be the graph display name
- the server needs a graph registry in addition to sync Durable Objects

### Deferred From This ADR

- import/export format and flows
- encryption of graph display names or other metadata
- which metadata, if any, should later move into the Durable Object
- persistent unlock hardening beyond MVP

### Recommended Implementation Order

1. Introduce the app-global local graph registry and move route/database identity to `localGraphId`.
2. Add the server graph registry and switch sync addressing from graph name to `graphId`.
3. Implement signed-in graph inventory flows: list cloud graphs, create synced graph, download cloud graph, logout cleanup.
4. Implement wrapped random `graphKey` design for synced graphs.
5. Add unlock UX on top of the new registry and `graphId`-based sync model.
