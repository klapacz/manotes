---
title: Implement /review command for change analysis
date: 2026-01-01
type: shipped
tags:
  - opencode
  - tooling
---

## Summary

Added the `/review` command to analyze jujutsu changes and provide structured feedback on code quality, documentation, and completeness. The command uses the existing `jj_load_change` plugin for diff loading and checks for common issues including bugs, missing documentation, and inconsistent patterns.

## The Why

Part of the task/devlog workflow (see [GWPP-task-devlog-workflow](../tasks/GWPP-task-devlog-workflow.md)). Before finalizing changes, developers need automated review to catch issues and ensure quality. The `/review` command enables this without requiring human code review.

## Design Decisions

- **Structured severity levels**: Issues grouped as "Must fix", "Should fix", and "Consider" to help prioritize fixes
- **Devlog integration**: Reviews check for existing devlogs in the diff and validate their accuracy against code changes
- **Consistent pattern**: Follows the same `$1` change ID syntax as `/devlog` and `/update-devlog`
- **Comprehensive checks**: Covers code quality, documentation, completeness, consistency, and edge cases

## Learnings

The `/review` command completes the core workflow: create task → implement → review → document → update. The structured feedback format helps maintain code quality while keeping the review process efficient and actionable.
