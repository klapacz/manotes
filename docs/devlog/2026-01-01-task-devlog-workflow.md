---
title: Document AI-assisted development workflow with tasks and devlogs
date: 2026-01-01
type: shipped
tags:
  - workflow
  - documentation
  - opencode-commands
---

## Summary

Documented complete workflow from task creation through implementation to devlog, showing which OpenCode commands are invoked at each stage. The workflow replaces GitHub PRs/issues as source of truth for AI-assisted development.

## The Why

We're building a task/devlog system for AI-assisted development. Tasks are specs for work to be done; devlogs document completed work. Both live in-repo, replacing GitHub PRs/issues as the source of truth.

The key insight: AI assistants can invoke OpenCode commands (`/devlog`, `/task`, `/review`) to participate in this workflow autonomously.

## The Workflow

### 1. Task Creation (`/task` command)

Human or AI creates a task spec: `/task "Add dark mode support"`

AI generates `docs/tasks/XKMT-dark-mode.md` with frontmatter, context, goal, acceptance criteria, constraints.

### 2. Task Execution

AI reads task spec, works on implementation. Uses standard tools (Edit, Write, Bash). Task status transitions: `planned` → `in_progress` → `done`

### 3. Review (`/review` command)

Before finalizing, review the change: `/review wsqptkls`

AI gets filtered diff (via `jj-diff`), any existing devlog in the change, runs checks, suggests improvements.

### 4. Devlog Creation (`/devlog` command)

Document what was shipped: `/devlog wsqptkls`

AI gets diff + change description, asks shipped vs snippet, writes devlog.

### 5. Devlog Update (`/update-devlog` command)

If change evolves after devlog exists: `/update-devlog wsqptkls`

AI compares current diff with existing devlog, identifies discrepancies, and updates. For snippets, also regenerates the patch file.

### 6. Task Cleanup

When work is done:

- `shipped` → task file deleted, devlog committed with change
- `cancelled` → task file deleted, `snippet` devlog preserves learnings

## OpenCode Commands

| Command          | Trigger                    | Output                         |
| ---------------- | -------------------------- | ------------------------------ |
| `/task`          | "create task for X"        | `docs/tasks/<id>-<slug>.md`    |
| `/devlog`        | "document this change"     | `docs/devlog/<date>-<slug>.md` |
| `/review`        | "review this change"       | Analysis + suggestions         |
| `/update-devlog` | "update devlog for change" | Updated devlog                 |

## Design Decisions

Chose in-repo documentation over external tools because it keeps everything in version control. Task and devlog files are single source of truth, making it easy to see what's planned, in-progress, or shipped.

## Implementation Details

- [Task command](./2026-01-01-task-command.md) — `/task` creates task specs with frontmatter validation
- [Devlog command refactor](./2026-01-01-devlog-command-refactor.md) — `/devlog` and `/update-devlog` implementations
- [jj-diff file attachment](./2026-01-01-jj-diff-file-attachment.md) — Plugin for filtering and loading jj diffs
- [Review command](./2026-01-01-review-command.md) — `/review` provides change analysis
