---
title: Add MatchAsyncResult for AsyncResult UI branching
date: 2026-04-16
type: shipped
tags:
  - solid
  - effect
  - async-result
  - ui
---

## Summary

Added `MatchAsyncResult` to `apps/web/src/lib/primitives.ts` as a small Solid-style primitive for rendering `AsyncResult` states. It wraps the repeated `AsyncResult.matchWithError(...)` UI pattern into one place while preserving the four-way split the app actually uses: `Initial`, `Success`, `Error`, and `Defect`.

## The Why

The web UI had several call sites manually matching `AsyncResult` state into JSX. That worked, but it duplicated the same branch structure and made the rendering pattern harder to reuse consistently. A dedicated primitive keeps those state transitions explicit while making call sites smaller and easier to read.

## Design Decisions

- **Use `AsyncResult.matchWithError` directly** — the primitive follows the existing Effect API instead of adding a separate local normalization layer.
- **Mirror Solid `Show` semantics where possible** — the implementation uses `createMemo`, keyed vs non-keyed branch behavior, and `untrack(...)` so branch rendering behaves like Solid control-flow primitives.
- **Keep the API focused on the real UI split** — `AsyncResult` itself only has `Initial | Success | Failure`, but the UI needs to distinguish typed errors from defects, so the primitive exposes `onError` and `onDefect` separately.
- **Reuse upstream payload types** — branch callbacks receive existing `AsyncResult.Initial`, `AsyncResult.Success`, and `AsyncResult.Failure` values instead of introducing new wrapper types for consumers.
- **Prefer tag helpers for narrowing** — internal state narrowing uses `Types.Tags` and `Types.ExtractTag`, matching existing project patterns for tagged unions.
