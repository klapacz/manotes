---
title: Add devlog system for in-repo change documentation
date: 2026-01-01
type: shipped
tags:
  - tooling
  - documentation
---

## Summary

Adds infrastructure for creating structured devlog entries—in-repo documentation that serves as PR descriptions without requiring GitHub.

## The Why

Without GitHub PRs, there's no natural place for longer-form context about changes. Commit messages are intentionally terse. Devlogs solve this by storing "PR descriptions" directly in the repository:

- `jj checkout <change>` + read devlog = full context, no browser needed
- Works offline, no vendor lock-in
- Grepable locally
- Travels with the code if you move repos
- AI assistants can read it directly

Two types: **shipped** (committed with the change) and **snippet** (preserves experimental code that didn't land in main, with a patch file).

## Architecture

```
.opencode/
├── bin/jj-diff              # Filtered diff (excludes lock/gen files)
├── command/devlog.md        # Command instructions for AI
├── lib/
│   ├── frontmatter.ts       # gray-matter wrapper
│   └── validate.ts          # Standard Schema validation
├── plugin/devlog-validator.ts  # Live validation on Edit/Write
├── schemas/devlog.ts        # Zod v4 discriminated union
└── scripts/validate-devlogs.ts # CLI batch validation

docs/devlog/*.md             # Entries (shipped or snippet)
```

**Flow:** AI invokes `/devlog` → writes entry → plugin intercepts `Edit`/`Write` → validates frontmatter → shows toast on error + modifies tool output to force fix.

## Design Decisions

- **Zod v4 with Standard Schema** — Future-proof validation, works with any schema library
- **OpenCode plugin for live validation** — Catches frontmatter errors immediately on write
- **Discriminated union schema** — Snippet requires `status` and `diff_file`, shipped doesn't
- **jj-diff filter script** — Excludes pnpm-lock.yaml and \*.gen.ts from diffs for cleaner reviews
- **gray-matter with JSON_SCHEMA** — Prevents js-yaml from auto-converting date strings to Date objects

## Future Plans

**Migrate to Astro Content Collections:** The current Zod + OpenCode plugin approach will be replaced by [Astro Content Collections](../tasks/004-astro-content-collections.md) when the project website is added. This consolidates validation into a single source of truth—`astro check` validates frontmatter, and the same schema powers the developer feed. See [task 004](../tasks/004-astro-content-collections.md) for implementation plan.

**Unified task lifecycle:** Tasks (`docs/tasks/`) are detailed specs for LLM agents to execute. Upon completion, the task file is deleted and a devlog is created. Shipped work becomes a `shipped` devlog; cancelled/pivoted work becomes a `snippet` devlog. Clean separation—tasks/ only contains pending work, devlogs capture outcomes.

**Developer feed:** Devlogs will be served on the project website. Subscribers can follow project updates with full context—not just "what changed" but "why it changed." Unlike sr.ht's activity feed (raw commits + mailing list posts), this will be curated summaries with design rationale.
