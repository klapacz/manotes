---
title: Commit message suggestion command
id: "003"
status: planned
priority: medium
depends_on: ["002"]
---

## Context

When working with jj changes, writing good commit messages is tedious. The AI has full context of the diff and can suggest conventional commit messages.

## Goal

`/describe <change-id>` analyzes a change's diff and suggests a commit message, then applies it via `jj describe` after user confirmation.

## Behavior

1. Load diff using jj-diff plugin (from 002)
2. Analyze changes, generate conventional commit message
3. Present message to user for confirmation/editing
4. Run `jj describe -c <change-id> -m "<message>"`

## Message Format

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, etc.
- Prefer concise single-line summaries
- Add body only when summary alone is insufficient
- No trailing periods on summary line

## Example

```
/describe wsqptkls
```

AI outputs:

```
Suggested message:

feat: add dark mode toggle to settings

Adds theme context provider and updates all components
to support light/dark switching.

---
Apply this message? (confirm or suggest edits)
```

User confirms → AI runs `jj describe -c wsqptkls -m "feat: add dark mode..."`.

## Acceptance Criteria

- [ ] Uses jj-diff plugin for diff loading
- [ ] Generates conventional commit format
- [ ] Keeps messages concise, adds body only when needed
- [ ] Applies message via `jj describe` after user confirmation

## Constraints

- Depends on 002-load-change-plugin for diff loading
- Must wait for user confirmation before running `jj describe`
