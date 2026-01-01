---
title: jj_load_change plugin for expanding change references
date: 2026-01-01
type: shipped
tags:
  - opencode
  - plugin
  - jujutsu
---

## Summary

Implemented a `chat.message` hook plugin that expands `%changeId` references in any message, automatically loading jujutsu diffs and wrapping them in `<jujutsu-change>` tags.

## The Why

Commands like `/devlog`, `/review`, and `/include` all need to load jj diffs. Instead of inline shell execution (`!`jj-diff $1``), a plugin provides validation, error handling, and reusability. The `%changeId` syntax is cleaner and works anywhere in a message.

## Design Decisions

- **Inline text over file attachments**: Tried attaching diffs as file parts (see [2026-01-01-jj-diff-file-attachment.md](./2026-01-01-jj-diff-file-attachment.md)) but the agent doesn't see files created that way. Reverted to inline `<jujutsu-change>` XML blocks.

- **Plain regex over ArkType/ArkRegex**: ArkType doesn't support typed output for `matchAll()`, so used native regex with named capture groups instead. Still get good DX with `match.groups.id` and `match.groups.format`.

- **Shared exclude filter**: Extracted `EXCLUDE_FILTER` to `.opencode/lib/jj-filters.ts` so both `jj-diff` script and plugin use the same pattern.

- **Multiple formats**: Supports `%id`, `%id:diff`, `%id:stat`, `%id:log`, `%id:show` for different output types.

- **Bash to Bun migration**: Rewrote `jj-diff` script in TypeScript for consistency with the plugin ecosystem.

## Learnings

- The `chat.message` hook receives `output.parts` which can be mutated in place
- File parts added dynamically don't work—stick with text content
- Named capture groups in regex provide decent type safety without extra deps
