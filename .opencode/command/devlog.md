---
description: Create a devlog entry documenting work or experiments
---

Create a devlog entry in `docs/devlog/` directory.

Filename format: `docs/devlog/YYYY-MM-DD-<slug>.md` (date in ISO 8601, slug in kebab-case).

@.opencode/lib/devlog-guidelines.md

## Context

Filtered diff for analysis: %$1

Change description: %$1:log

## Workflow

1. Review the diff and description above
2. Summarize what the change does (1-2 sentences)
3. Ask the user:
   - Is this `shipped` (going to main) or `snippet` (preserving for reference)?
   - Any additional context to include?

## For Snippets

When creating a snippet, save the patch file per the guidelines above and set `diff_file` in frontmatter to the patch file path.

## For Shipped

Do NOT save a patch file—the devlog will be committed with the change.

If the user provided additional context as $ARGUMENTS, incorporate that.
