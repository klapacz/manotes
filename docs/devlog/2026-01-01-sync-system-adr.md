---
title: Convert sync system design to ADR format
date: 2026-01-01
type: shipped
tags:
  - docs
  - adr
  - sync
---

## Summary

Converted the E2E encrypted sync design document to an Architecture Decision Record (ADR) format, added an ADR template for future decisions, and created documentation for open questions and deferred decisions in the task tracker.

## The Why

The design document needed proper ADR structure to clearly track architectural decisions with status, context, decision, and consequences. Additionally, several open questions were discovered during implementation planning and needed to be organized for post-MVP resolution.

## Design Decisions

- Used standard ADR template with Status/Context/Decision/Consequences format for better decision tracking
- Deferred hard delete implementation due to P2P sync race conditions and data loss risks
- Clarified that local-only mode is essentially sync mode where events stay pending forever—the same architecture supports both
- Separated open questions into a dedicated task file (SOQL) for future resolution
