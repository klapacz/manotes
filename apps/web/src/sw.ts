/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

// Activate the new SW immediately without waiting for existing tabs to close.
// Combined with clients.claim() this means the SW controls all open tabs as
// soon as it installs, rather than only after a full page reload.
void self.skipWaiting();

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Remove caches left by previous SW versions to avoid stale asset serving.
cleanupOutdatedCaches();

// Pre-cache all assets listed in the manifest injected by vite-plugin-pwa at build time.
// The manifest contains every hashed JS/CSS/HTML/WASM file from the client build.
// Cache invalidation is automatic: new deploy = new hashes = new cache entries.
precacheAndRoute(self.__WB_MANIFEST);

// Offline SPA navigation fallback.
// Cloudflare serves index.html for client-side routes online; mirror that in the SW
// so reloading or opening a deep link offline still boots the app shell.
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));

// GET /api/session — network-first with a cache fallback.
//
// On success: cache the response and return it.
// On network failure: return the last cached response (200 or 401).
//
// Both 200 and 401 are cached so offline state reflects the last known auth
// state. The atom in session/atom.ts maps 200 → Option.some(session) and
// 401 → Option.none(), so both decode correctly from the cached response body.
registerRoute(
  ({ url }) => url.pathname === "/api/session",
  new NetworkFirst({
    cacheName: "session-v1",
    plugins: [
      {
        // Workbox's NetworkFirst only caches 2xx by default. Override to also
        // cache 401 so a "logged out" state is preserved across offline sessions.
        cacheWillUpdate: async ({ response }) => {
          if (response.status === 200 || response.status === 401) return response;

          return null;
        },
      },
    ],
  }),
  "GET",
);

// All other /api/* routes are intentionally unregistered.
// Workbox defaults to NetworkOnly for unmatched routes, so mutations
// pass through and fail naturally when offline.
