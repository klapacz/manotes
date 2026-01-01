---
title: Extract Editor Sync Logic into Dedicated Service
date: 2026-01-01
type: shipped
tags:
  - refactoring
  - effect
  - service-extraction
---

## Summary

Extracted editor synchronization logic from the Editor component into a dedicated `EditorSyncService` Effect service. Added database query methods (`findUpdatesForNote`, `streamUpdatesForNote`) to `EventRepo` to encapsulate data access patterns.

## The Why

The Editor component was managing too many responsibilities: UI rendering, Effect runtime setup, and complex Y.js sync logic. This made the component harder to test, understand, and maintain. By extracting sync logic into a service, we follow the Single Responsibility Principle and make the codebase more modular.

## Design Decisions

- **Service over hook**: Chose Effect's `Service` pattern instead of a React hook because the sync logic is pure Effect computations with no React dependencies
- **Repo methods for queries**: Added `findUpdatesForNote` and `streamUpdatesForNote` to `EventRepo` rather than keeping raw SQL queries in the service, maintaining separation between data access and business logic
- **Minimal Editor changes**: The Editor component now only knows about `setupDoc`, keeping the API surface simple

## Learnings

The refactor demonstrates Effect's service composition pattern well—the `EditorSyncService` depends on `EventRepo`, and the runtime layers compose automatically. This pattern encourages testability since services can be easily mocked or replaced in different layers.
