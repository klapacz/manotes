---
title: Sequence account, graph registry, sync identity, and E2EE work
id: AIQH
status: planned
priority: high
depends_on: []
---

## Goal

Land account-backed synced graphs without painting the app into a corner on graph identity or encryption.

## Phase 1

Introduce local graph registry and stop using graph display names as storage identity.

- add app-global local registry for graphs and session
- introduce immutable `localGraphId`
- route by `localGraphId`
- name per-graph OPFS databases by `localGraphId`

## Phase 2

Add server graph registry and switch cloud graph identity to `graphId`.

- add account-owned graph registry API
- enforce unique `displayName` per account
- move sync addressing from graph name to `graphId`
- keep sync Durable Object focused on event log transport

## Phase 3

Implement signed-in graph inventory and attach/download flows.

- graph picker sections for local, synced-on-device, and cloud-not-on-device
- create local-only graph while signed in
- enable sync for a local graph by creating a new remote graph
- open an existing cloud graph by creating a fresh local graph record
- logout cleanup for cloud-backed local graphs

## Phase 4

Implement wrapped random graph keys for synced graphs.

- synced graphs only are encrypted in MVP
- each synced graph gets random `graphKey`
- per-graph password wraps `graphKey`
- password change re-wraps only `graphKey`
- leave persistent unlock hardening for later

## Not First

Do not start with import/export, encrypted graph metadata, or device-keystore persistence. They are useful but not required to get the account and E2EE boundaries right.
