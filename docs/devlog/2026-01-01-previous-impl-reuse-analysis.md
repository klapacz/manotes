---
title: Previous implementation reuse analysis
date: 2026-01-01
type: shipped
tags:
  - analysis
  - previous-impl
  - yjs
  - tiptap
---

## Summary

Analyzed previous implementation to identify reusable components for the new MVP based on ADR-001 sync system architecture. Found significant overlap in Yjs utilities, TipTap extensions, and ProseMirror extraction logic. Sync system and database schema are architecturally incompatible.

## The Why

Previous implementation (git submodule at `docs/previous-impl/)`) contains production-ready code for Yjs integration, TipTap editor with backlinks/tags, and derived state extraction. Rather than reimplementing from scratch, identify what can be directly reused versus what needs new implementation to align with the event log + CRDT sync architecture from ADR-001.

## Design Decisions

### Directly Reusable

**Yjs Core Utilities:**

- Merge operations (`Y.mergeDocs`, compare snapshots) - essential for merging pending + server events during sync and compaction
- YDoc creation from updates (`createDocFromUpdate`) - needed for loading saved Yjs state from database
- YDoc ↔ ProseMirror conversion (`getNodeFromDoc`, `prosemirrorJSONToYDoc`) - core for materialization pipeline extracting content/tokens/embeddings

**TipTap Editor Extensions:**

- Backlink node with `[[` trigger and autocomplete - matches ADR requirements exactly
- Tag node with `#` trigger - matches ADR requirements exactly
- Custom Collaboration extension - Yjs integration with TipTap (real-time sync parts removable)

**ProseMirror Extraction Logic:**

- Backlink extraction (`findAllBacklinks`) - traverse ProseMirror AST to find all backlink nodes
- Tag extraction (`findAllTags`) - traverse ProseMirror AST to find all tag nodes
- Heading/title extraction (`getFirstHeadingContent`) - extract first H1 for notes cache title field

**Service/Repo Patterns:**

- Idempotent backlink recreation (delete + reinsert) - safe for event replay and concurrent updates
- Idempotent tag recreation - same pattern as backlinks

### Architecturally Incompatible

**Sync System:**

- Vector clock sync - ADR uses event log with global sequence numbers
- Real-time WebSocket collaboration - not in MVP scope
- GraphDurableObject - Cloudflare-specific, different sync model
- Sync plan computation - ADR has simpler pull → merge → push protocol

**Database Schema:**

- Server note table with vector clock columns - ADR uses unified `sync_log` table
- State vector storage - client-side only in ADR

**Authentication:**

- User accounts/sessions - not in MVP scope
- D1 database - ADR is local-only first

## Learnings

**Yjs utilities are portable:** The core Yjs merge, conversion, and diff operations are framework-agnostic and can be used directly in the new implementation without modifications.

**TipTap extensions are decoupled:** Backlink and tag nodes with their suggestion/autocomplete logic are independent of sync architecture and can be copy-pasted.

**Extraction patterns are generic:** ProseMirror AST traversal for backlinks/tags is schema-agnostic and works with any editor implementation.

**Sync architecture is the bottleneck:** Vector clocks vs event log are fundamentally different sync models - this is where the new implementation diverges significantly from previous work.

**Service layer patterns transfer:** Idempotent delete+reinsert for derived state is sound regardless of sync mechanism.
