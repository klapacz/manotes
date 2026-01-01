---
title: Document AI-assisted development workflow with tasks and devlogs
id: GWPP
status: in_progress
priority: high
depends_on: []
---

## Context

We're building a task/devlog system for AI-assisted development. Tasks are specs for work to be done; devlogs document completed work. Both live in-repo, replacing GitHub PRs/issues as the source of truth.

The key insight: AI assistants can invoke OpenCode commands (`/devlog`, `/task`, `/review`) to participate in this workflow autonomously.

## Goal

Document the complete workflow from task creation through implementation to devlog, showing which OpenCode commands are invoked at each stage.

## The Workflow

### 1. Task Creation (`/task` command - planned)

Human or AI creates a task spec:

```
/task "Add dark mode support"
```

AI generates `docs/tasks/XKMT-dark-mode.md` with:

- Frontmatter (title, id, status, priority)
- Context, Goal, Acceptance Criteria, Constraints

### 2. Task Execution

AI reads task spec, works on implementation. Uses standard tools (Edit, Write, Bash).

Task status transitions: `planned` → `in_progress` → `done`

### 3. Review (`/review` command - planned)

Before finalizing, review the change:

```
/review wsqptkls
```

AI gets:

- Filtered diff (via `jj-diff`)
- Any existing devlog in the change
- Runs checks, suggests improvements

### 4. Devlog Creation (`/devlog` command - exists)

Document what was shipped:

```
/devlog wsqptkls
```

AI gets diff + change description, asks shipped vs snippet, writes devlog.

### 5. Devlog Update (`/update-devlog` command - exists)

If change evolves after devlog exists:

```
/update-devlog wsqptkls
```

AI compares current diff with existing devlog, identifies discrepancies, and updates. For snippets, also regenerates the patch file.

### 6. Task Cleanup

When work is done:

- `shipped` → task file deleted, devlog committed with change
- `cancelled` → task file deleted, `snippet` devlog preserves learnings

## OpenCode Commands Summary

| Command          | Status  | Trigger                    | Output                         |
| ---------------- | ------- | -------------------------- | ------------------------------ |
| `/task`          | planned | "create task for X"        | `docs/tasks/<id>-<slug>.md`    |
| `/devlog`        | exists  | "document this change"     | `docs/devlog/<date>-<slug>.md` |
| `/review`        | planned | "review this change"       | Analysis + suggestions         |
| `/update-devlog` | exists  | "update devlog for change" | Updated devlog                 |
| `/describe`      | planned | "suggest commit message"   | Message + `jj describe`        |

## Subtasks

- [002-load-change-plugin](./002-load-change-plugin.md) — Plugin for loading jj diffs with validation. Subtask because `/review`, `/devlog`, and `/update-devlog` all need reliable diff loading—this is shared infrastructure, not a standalone feature.

## Relevant Files

- `.opencode/command/devlog.md` — existing devlog command
- `.opencode/command/update-devlog.md` — existing update-devlog command
- `.opencode/lib/devlog-guidelines.md` — shared devlog guidelines (frontmatter schema, content guidelines)
- `.opencode/command/task.md` — task command (to be created)
- `.opencode/command/review.md` — review command (to be created)
- `PLAN-tasks-system.md` — implementation plan for tasks system
- `todo.md` — raw ideas for other commands

## Acceptance Criteria

- [ ] `/task` command creates valid task specs
- [ ] `/review` command provides useful change analysis
- [ ] `/update-devlog` command keeps devlogs in sync with changes
- [ ] Workflow documented in this file is accurate and complete
- [ ] All commands use consistent patterns (frontmatter validation, jj integration)

## Constraints

- Commands must work with jj (not git)
- All validation via Zod + Standard Schema
- AI must be able to invoke commands autonomously (no interactive prompts)
- Devlogs are concise—no code snippets unless essential
