---
title: Browser extension for tab backlinking
date: 2026-04-13
type: shipped
tags:
  - browser-extension
  - backlinks
  - wxt
  - process-compose
---

## Summary

Added a WXT browser extension that exposes open browser tabs to the web app, letting users backlink to any tab directly from the `[[` autocomplete menu. Selecting a tab auto-creates a note with the page title and source URL, then inserts the backlink — no manual copy-paste needed.

## The Why

Backlinking is the core interaction in Manotes, but linking to external web content required leaving the editor, copying a URL, creating a note, and pasting. Most of the time the page is already open in another tab. Bridging the browser's tab list into the backlink menu removes that friction entirely.

## Design Decisions

- **Shared contract in `@manotes/shared`** — Request/response schemas live in `packages/shared/src/browser-extension/contract.ts` using Effect Schema. Both the extension and the web app validate messages with `decodeUnknownOption`, so invalid or foreign `postMessage` traffic is silently ignored.
- **Content script as a relay** — The content script bridges `window.postMessage` (web app ↔ content script) and `chrome.runtime.Port` (content script ↔ background). The web app never touches extension APIs directly, keeping it decoupled.
- **Background broadcasts on every tab event** — Instead of diffing, the background script re-queries and broadcasts the full tab list on create/remove/update/activate. Simple, and the tab list is small enough that this is fine.
- **Stream only while popover is open** — `watchTabs` is wired through `createRuntimeStreamStore` and only subscribes when the backlink popover is open, avoiding unnecessary message traffic.
- **Cached ProseMirror schemas** — Extracted `app-schema.ts` with module-level `DAILY_NOTE_SCHEMA` / `NON_DAILY_NOTE_SCHEMA` constants. Previously every `appNodeFromJSON` / `yDocToNodeJSON` call created a throwaway editor to get a schema. The tab-note service also uses the cached schema.
- **`PROSEMIRROR_XML_FRAGMENT_KEY`** — Replaced the `"prosemirror"` magic string with a shared constant in `prosemirror/yjs.ts`.
- **process-compose for dev** — Replaced `pnpm -r --parallel run dev` with `process-compose up`. Processes declare `ready_log_line` and `depends_on` so the web app waits for shared + sql-sqlite-wasm builds before starting. Extension process is disabled by default.

## Learnings

`window.postMessage` is the simplest bridge between a web app and a browser extension content script — no custom events, no DOM hacks. The content script just relays both directions. Pairing it with schema-validated decoding makes the boundary safe without complex handshake protocols.
