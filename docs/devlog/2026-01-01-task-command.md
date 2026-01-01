---
title: Implement /task command with unified frontmatter validation
date: 2026-01-01
type: shipped
tags:
  - opencode
  - tooling
---

## Summary

Added the `/task` command for creating task specification files and refactored frontmatter validation into a config-driven system that handles both devlogs and tasks.

## The Why

Part of building a task/devlog system for AI-assisted development (see [GWPP-task-devlog-workflow](../tasks/GWPP-task-devlog-workflow.md)). The `/devlog` command existed; now `/task` completes the workflow by enabling structured task creation with auto-generated IDs.

## Design Decisions

- **Config-driven validation**: Replaced hardcoded `devlog-validator.ts` with `frontmatter-validator.ts` using an array of `{prefix, suffix, schema, label}` configs. Simple prefix/suffix matching avoids glob library overhead.
- **4-letter nanoid IDs**: Generated via CLI (`pnpm nanoid --size 4 --alphabet ABCDEFGHIJKLMNOPQRSTUVWXYZ`) for short, human-readable identifiers (e.g., `XKMT`). Inline shell invocation avoids build steps vs. requiring agents to run TypeScript.

## Learnings

- Unifying validators via config pattern scales cleanly—adding new validated file types requires only a schema and a config entry.
- nanoid CLI is convenient for shell-accessible ID generation without build steps.
