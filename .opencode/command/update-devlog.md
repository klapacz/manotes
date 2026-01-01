---
description: Update an existing devlog entry to match current changes
---

Update the devlog entry found in the diff for change `$1`.

@.opencode/lib/devlog-guidelines.md

## Context

Current diff (includes the devlog and all code changes):
%$1

Change description:
%$1:log

## Instructions

1. Find the devlog file (`docs/devlog/*.md`) in the diff — it will appear as an added or modified file
2. Parse the devlog content and frontmatter
3. Compare what the devlog documents against the actual code changes in the same diff
4. Identify discrepancies:
   - Summary that doesn't match what the code actually does
   - Missing design decisions for new code patterns
   - Outdated "How It Works" sections
   - Missing or incorrect tags
   - For snippets: stale patch file reference

5. **If anything is unclear or ambiguous**, ask clarifying questions before suggesting updates

6. Suggest specific updates, then apply them

## For Snippet Type Devlogs

If the devlog has `type: snippet` in frontmatter, also regenerate the patch file:

```bash
jj diff -r $1 --git > <path-from-diff_file-frontmatter>
```

Use the `diff_file` value from the frontmatter as the output path.

## Guidelines

- Preserve the existing structure and voice where possible
- Only update sections that are actually out of sync
