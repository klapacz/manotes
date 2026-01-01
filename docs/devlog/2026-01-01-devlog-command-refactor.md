---
title: Refactor devlog commands with shared guidelines
date: 2026-01-01
type: shipped
tags:
  - dx
  - opencode
---

## Summary

Extracted devlog guidelines into a shared library file and added an `update-devlog` command. The `/devlog` command now references the shared guidelines instead of duplicating them inline.

## The Why

The devlog command had grown verbose with inline documentation. Extracting to a shared lib file enables reuse across commands and keeps the command files focused on workflow logic.

## Design Decisions

- Created `.opencode/lib/` as a convention for reusable prompt fragments
- The `update-devlog` command reuses the same guidelines via `@` reference
- Kept frontmatter schema and content guidelines together in one lib file

## Learnings

Using `@` file references in OpenCode commands works well for DRY prompt composition.
