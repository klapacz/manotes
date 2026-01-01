# Task Guidelines

## Frontmatter Schema

```yaml
---
title: <descriptive title>
id: "<XXXX>" # 4 uppercase letters, generated via nanoid
status: planned | in_progress | done | cancelled
priority: low | medium | high
depends_on: [] # array of task IDs
---
```

## Required Sections

- **Context** — Background, why this matters
- **Goal** — What success looks like (1-2 sentences)
- **Acceptance Criteria** — Checklist of requirements
- **Constraints** — Limitations, requirements

## Optional Sections

- **Implementation Plan** — For complex tasks
- **Open Questions** — Unresolved decisions
- **Relevant Files** — Related code/docs
- **Subtasks** — Links to related task files

## Style

- Keep tasks concise; prefer prose descriptions over large code snippets
- Reference existing files/patterns instead of duplicating code
- Code examples only when essential for clarity (e.g., API signatures, config formats)
- References to other markdown documents within the project must use markdown links (e.g., `[task title](../tasks/ABCD-task-devlog-workflow.md)`)
