---
title: Ydoc Download Button
date: 2026-01-01
type: snippet
tags:
  - yjs
  - debugging
status: working
diff_file: ./2026-01-01-ydoc-download-button.patch
---

## Summary

Adds a button to the editor that exports the current Yjs document state as a downloadable binary file. Uses `Y.encodeStateAsUpdate()` to serialize the document.

## The Why

Needed to download the raw Yjs binary for debugging/inspection purposes. Not suitable for main codebase yet.

## Caveats

- Types are incorrect but functionality works
- UI is unstyled (just a plain button above the editor)
- No error handling

## The Diff

See [2026-01-01-ydoc-download-button.patch](./2026-01-01-ydoc-download-button.patch)
