---
description: Create a devlog entry documenting work or experiments
---

Create a devlog entry in `docs/devlog/` directory.

The filename should be: `docs/devlog/YYYY-MM-DD-<slug>.md` where:

- Date is today in ISO 8601 format
- Slug is a short kebab-case description

The file MUST have YAML frontmatter with this structure:

```yaml
---
title: <descriptive title>
date: <today's date>
type: shipped | snippet
tags:
  - <tag1>
  - <tag2>

# If type=snippet (code that didn't land in main):
status: working | experimental | broken | deprecated
diff_file: <path to .patch file>
---
```

## Determining Type

- **shipped**: Work that was merged/committed. The devlog will be committed together with the change it documents.
- **snippet**: Code/change that won't be merged but is worth preserving for reference. Includes a patch file.

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

When creating a snippet:

1. Save the FULL unfiltered diff to a patch file (preserves complete change):
   `jj diff -r $1 --git > docs/devlog/YYYY-MM-DD-<slug>.patch`

2. Set `diff_file` in frontmatter to the patch file path.

## For Shipped

Do NOT save a patch file - the devlog will be committed with the change, so history is preserved in version control.

## Content Guidelines

Devlogs should be **concise**. Do not include code snippets unless absolutely necessary - the diff/patch file contains the code.

### For Snippets

- **Summary** - What this change does (2-3 sentences)
- **The Why** - Motivation, context, problem being solved
- **Design Decisions** - Tradeoffs made, alternatives considered
- **How It Works** - Brief implementation overview
- **The Diff** - Reference: `See [<slug>.patch](./<slug>.patch)`
- **When To Use** - Useful scenarios
- **Caveats** - Limitations, warnings

### For Shipped

- **Summary** - What was done (2-3 sentences)
- **The Why** - Motivation and context
- **Design Decisions** - Tradeoffs made, alternatives considered
- **Learnings** - What was discovered or decided

If the user provided additional context as $ARGUMENTS, incorporate that.
