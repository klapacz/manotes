---
description: Create a new task spec
---

Create a task file in `docs/tasks/` directory.

@.opencode/lib/task-guidelines.md

## Context

Context is the user's description of the task.

<user-context>
    $ARGUMENTS
</user-context>

## ID

Use this generated ID for the task: !`pnpm nanoid --size 4 --alphabet ABCDEFGHIJKLMNOPQRSTUVWXYZ`

## Workflow

1. Create slug from title (kebab-case, max 50 chars)
2. Use `status: planned` and `priority: medium` by default
3. Fill in Context and Goal based on user's description
4. Ask user to provide Acceptance Criteria (checklist of requirements)
5. Ask user to provide Constraints (limitations, requirements)
6. Write file to `docs/tasks/<id>-<slug>.md` with all sections filled in

## Example

User: `/task Add dark mode support`

Creates `docs/tasks/XKMT-dark-mode-support.md` with frontmatter per schema and required sections filled in.
