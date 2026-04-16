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

Added `MatchAsyncResult` to `apps/web/src/lib/primitives.ts` as a small Solid-style primitive for rendering `AsyncResult` states. It wraps the repeated `AsyncResult.matchWithError(...)` UI pattern into one place while preserving the four-way split the app actually uses: `Initial`, `Success`, `Error`, and `Defect`. It also supports a simpler `onFailure` branch so existing `AsyncResult.match(...)` call sites can use the same primitive without duplicating identical error and defect UI.

## The Why

The web UI had several call sites manually matching `AsyncResult` state into JSX. That worked, but it duplicated the same branch structure and made the rendering pattern harder to reuse consistently. A dedicated primitive keeps those state transitions explicit while making call sites smaller and easier to read. Supporting both detailed and generic failure handling means the app can standardize on one primitive instead of mixing `AsyncResult.matchWithError(...)` and `AsyncResult.match(...)` in JSX.

## Design Decisions

- **Use `AsyncResult.matchWithError` directly** — the primitive follows the existing Effect API instead of adding a separate local normalization layer.
- **Mirror Solid `Show` semantics where possible** — the implementation uses `createMemo`, keyed vs non-keyed branch behavior, and `untrack(...)` so branch rendering behaves like Solid control-flow primitives.
- **Support both failure styles in one component** — the primitive exposes `onError` and `onDefect` for detailed handling, plus `onFailure` for the simpler `Initial | Success | Failure` shape used by some screens.
- **Specific handlers take precedence** — `onError` and `onDefect` override `onFailure` when present, so callers can start generic and only specialize the branches that need it.
- **Reuse upstream payload types** — branch callbacks receive existing `AsyncResult.Initial`, `AsyncResult.Success`, and `AsyncResult.Failure` values instead of introducing new wrapper types for consumers.
- **Use the primitive at simple call sites too** — the home route now uses `MatchAsyncResult` for its local and cloud graph lists instead of open-coding `AsyncResult.match(...)`.
- **Prefer tag helpers for narrowing** — internal state narrowing uses `Types.Tags` and `Types.ExtractTag`, matching existing project patterns for tagged unions.
