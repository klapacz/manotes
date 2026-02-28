---
title: Wire Materialization Workers
date: 2026-02-06
type: shipped
tags:
  - workers
  - effect
  - rpc
  - sqlite
  - multigraph
---

## Summary

Wired the SharedWorker ↔ Dedicated Worker pipeline for materialization, inspired by the LiveStore dual-worker approach. Each graph now gets its own SharedWorker instance and a single leader-owned dedicated worker. The main thread creates both workers, connects them with a `MessageChannel`, and forwards materialization requests over `@effect/rpc`. This change is intentionally only the wiring—no buffering or materialization logic yet.

## Design Decisions

- **Per-graph worker isolation**: The SharedWorker is named `materialize-${graphName}`, and `graphName` is passed via `RpcWorker.initialMessage` so each graph runs in its own worker instance.
- **Dual-worker pattern**: SharedWorker routes requests; Dedicated Worker owns OPFS/SQLite access. This follows LiveStore’s pattern and avoids SharedWorker OPFS limitations.
- **Leader election**: Web Locks ensures only one dedicated worker exists per graph. Followers wait and take over when the leader closes.
- **MessagePort RPC**: SharedWorker builds an RPC client over the `MessagePort` using `BrowserWorker.layerPlatform` and `RpcSerialization.layerJson`.
- **Fail fast DB init**: Dedicated Worker builds graph-scoped services with `allowCreate: false` and logs DB init failures early.
- **Materialize semantics**: `materialize({ noteId })` is fire-and-forget. During startup/failover, SharedWorker may soft-drop requests before a dedicated port is connected.
- **Consistency model**: No SharedWorker buffering. Eventual correctness is delegated to dedicated-worker catch-up (watermark-based replay of unmaterialized events on startup/takeover).

## Next Steps

- Implement the materialization pipeline (events → Yjs → title extraction → notes update).
- Decide on debouncing strategy (main thread, worker, or both).
