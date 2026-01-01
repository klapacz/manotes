---
title: File attachment approach for jj diffs
date: 2026-01-01
type: snippet
status: broken
diff_file: ./2026-01-01-jj-diff-file-attachment.patch
tags:
  - opencode
  - plugin
---

## Summary

Attempted to refactor the jj-change-expander plugin to write diffs to temp files and attach them as file parts instead of embedding them inline in the message text.

## The Why

Large diffs embedded in message text can be noisy and may affect token usage. File attachments seemed like a cleaner way to pass diff content to the agent.

## Design Decisions

- Used `os.tmpdir()` for storing diff files
- Created file parts with `type: "file"` and `file://` URLs
- Replaced inline XML format with file references

## The Diff

See [2026-01-01-jj-diff-file-attachment.patch](./2026-01-01-jj-diff-file-attachment.patch)

## Caveats

**Does not work.** The agent doesn't see attached files created this way. Reverting to inline message approach.
