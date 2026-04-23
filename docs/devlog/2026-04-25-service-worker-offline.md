---
title: Service worker for offline static assets and session caching
date: 2026-04-25
type: shipped
tags:
  - pwa
  - offline
  - service-worker
---

## Summary

Added a service worker via `vite-plugin-pwa` (`injectManifest` strategy) that
precaches all static assets and caches `/api/session` responses — including 401s
— so the app works offline and preserves the last known auth state without a
network connection.

## The Why

The app should load and reflect a meaningful state when offline. Static
precaching handles the shell and all assets. Session caching means the user sees
themselves as logged-in or logged-out (whichever was last observed) rather than
a blank or broken auth state.

## Design Decisions

**`injectManifest` strategy over `generateSW`**: the user writes the SW; Workbox
only injects `self.__WB_MANIFEST`. This avoids Workbox's routing magic while
still getting automatic precache manifest generation tied to hashed build
outputs.

**Cache 401s alongside 200s for `/api/session`**: Workbox's `NetworkFirst` only
caches 2xx by default. A `cacheWillUpdate` plugin overrides this to also persist
401 responses. Offline auth state then mirrors last-seen reality rather than
last successful login.

**Offline SPA navigation fallback**:
`NavigationRoute(createHandlerBoundToURL("/index.html"))` mirrors Cloudflare's
online SPA fallback so deep links and reloads offline still boot the app shell.

**`autoCodeSplitting: false`**: disabled TanStack Router's route-level code
splitting to avoid partial app loads when chunks aren't cached and to eliminate
the mixed-version risk that `skipWaiting()` + `clients.claim()` can create with
lazy chunks.

**`devOptions: { enabled: false }`**: the Cloudflare plugin runs its own local
worker emulation in dev; layering a SW on top would intercept `/api/*` before
the Cloudflare plugin sees it.

**`globDirectory: "dist/client"`**: the Cloudflare Vite plugin outputs client
assets to `dist/client/`, not `dist/`, so `injectManifest.globDirectory` must
point there for `__WB_MANIFEST` to be populated.

**`/// <reference lib="webworker" />` in `sw.ts`**: `tsconfig.sw.json` (with
`lib: ["WebWorker"]`) provides IDE support only; the project's type checker (`vp
check`) uses the main tsconfig which excludes `sw.ts`, so the in-file directive
is required to resolve `ServiceWorkerGlobalScope`, `skipWaiting`, etc.
