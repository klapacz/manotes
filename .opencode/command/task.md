---
description: Create a new task spec
---

Create a task file in `docs/tasks/` directory.

@.opencode/lib/task-guidelines.md

## Arguments

$ARGUMENTS contains the task title/description.

## ID

Use this generated ID for the task: !`pnpm nanoid --size 4 --alphabet ABCDEFGHIJKLMNOPQRSTUVWXYZ`

## Workflow

1. Create slug from title (kebab-case, max 50 chars)
2. Write file to `docs/tasks/<id>-<slug>.md` using the ID provided above
3. Use `status: planned` and `priority: medium` by default
4. Fill in Context and Goal based on user's description
5. Leave Acceptance Criteria and Constraints as placeholder sections for user to fill

## Example

User: `/task Add dark mode support`

Creates `docs/tasks/XKMT-dark-mode-support.md` with frontmatter per schema and required sections filled in.
