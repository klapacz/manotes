# Devlog Guidelines

## Frontmatter Schema

```yaml
---
title: <descriptive title>
date: <YYYY-MM-DD>
type: shipped | snippet
tags:
  - <tag1>
  - <tag2>

# Required only for type=snippet:
status: working | experimental | broken | deprecated
diff_file: <path to .patch file>
---
```

## Type Definitions

- **shipped**: Work that was merged/committed. The devlog is committed together with the change it documents.
- **snippet**: Code that won't be merged but is worth preserving for reference. Includes a patch file.

## Content Guidelines

Devlogs should be **concise**. Do not include code snippets unless absolutely necessary—the diff/patch file contains the code. Focus on the "why", not the "what".

### For Shipped

- **Summary** — What was done (2-3 sentences)
- **The Why** — Motivation and context
- **Design Decisions** — Tradeoffs made, alternatives considered
- **Learnings** — What was discovered or decided

### For Snippets

- **Summary** — What this change does (2-3 sentences)
- **The Why** — Motivation, context, problem being solved
- **Design Decisions** — Tradeoffs made, alternatives considered
- **How It Works** — Brief implementation overview
- **The Diff** — Reference: `See [<slug>.patch](./<slug>.patch)`
- **When To Use** — Useful scenarios
- **Caveats** — Limitations, warnings

## Patch File Convention

For snippets, save the FULL unfiltered diff:

```bash
jj diff -r <change> --git > docs/devlog/YYYY-MM-DD-<slug>.patch
```

For shipped entries, do NOT create a patch file—history is preserved in version control.
