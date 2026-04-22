---
title: Reactive session-aware cloud graph access and Cloudflare Access login
date: 2026-04-22
type: shipped
tags:
  - auth
  - session
  - graph
  - cloud
  - runtime
  - effect
  - cloudflare-access
---

## Summary

Made session state a reactive client-side dependency for cloud graph access, graph listing, and create flows. The web app now treats signed-out as a first-class state, refreshes session state after unauthorized cloud requests, and uses a dedicated `/login` route backed by Cloudflare Access cookie auth on the worker.

## The Why

Cloud graph behavior depends on which account is currently signed in, but session state was previously fetched ad hoc and not integrated into the app’s reactive graph-access model.

That created a few mismatches:

- cloud graph visibility was not consistently tied to the active account
- UI affordances like upload/create-synced had to assume auth out of band
- unauthorized responses from session and registry endpoints did not map cleanly into “signed out”
- Cloudflare Access login flow depended on request-header behavior that does not work for all routes

The change makes session identity part of the same reactive system as graph access, so account-sensitive behavior updates automatically and unauthorized states degrade into a stable signed-out UI.

## Design Decisions

- **Represent signed-out as data, not failure** — `session/atom.ts` maps unauthorized session responses to `Option.none()` instead of leaving signed-out as an error state.
- **Make session state reactive and shareable** — `session/service.ts` exposes `get`, `find`, `refresh`, and stream variants from atoms so graph access and runtime code can depend on one session source.
- **Gate cloud graph resolution by account identity** — `resolution/service.ts` now treats cloud graphs as missing unless the active session belongs to the same account as the stored graph record.
- **Filter device graph listings through session identity** — local listings still show local graphs, while cloud-backed rows are only included for the active account.
- **Use atom-aware RPC for the remote registry** — the remote graph registry client now lives behind `AtomRpc.Service`, which fits the app’s existing reactivity model better than a plain effect client.
- **Refresh session after unauthorized registry responses** — registry HTTP transport taps 401 responses and refreshes the session atom so auth changes propagate without a reload.
- **Keep signed-out UI explicit** — the index and create routes now render different affordances for signed-in vs signed-out users instead of showing cloud actions unconditionally.
- **Authenticate from Cloudflare Access cookie, not injected header** — worker auth reads `CF_Authorization`, which works with the Access redirect/login flow across routes.
- **Use a dedicated `/login` route to trigger Access** — navigating to `/login` lets Cloudflare Access enforce auth and then redirects authenticated users back into the app.
- **Return typed no-content unauthorized errors from `/api/session`** — the session API declares `UnauthorizedNoContent`, and the worker converts internal auth failures into that public boundary error so `AtomHttpApi` can interpret signed-out responses correctly.
- **Distinguish socket open failure from later disconnects** — sync status gained `"Failed"` to separate initial connection/auth/network problems from ordinary disconnect/retry cases.
