---
name: devlog
description: Create or update concise project devlog entries in docs/devlog for shipped work or preserved snippets.
---

# Devlog

Use when creating or updating a devlog entry in:

```text
docs/devlog/YYYY-MM-DD-<slug>.md
```

Use today’s date unless specified. Slug: short kebab-case.

## Frontmatter

```yaml
---
title: <descriptive title>
date: <YYYY-MM-DD>
type: shipped | snippet
tags:
  - <tag>
---
```

For snippets only:

```yaml
status: working | experimental | broken | deprecated
diff_file: docs/devlog/YYYY-MM-DD-<slug>.patch
```

## Workflow

1. Use the available context about the change.
2. Assume `shipped` unless told otherwise.
3. Write the devlog.

## Shipped

Use unless told otherwise.

```markdown
## Summary

<1-2 sentences.>

## The Why

<Motivation and context.>

## Design Decisions

<Tradeoffs and alternatives considered.>
```

## Snippet

Use for code not being merged but worth preserving.

Save the full patch:

```bash
jj diff -r <change> --git > docs/devlog/YYYY-MM-DD-<slug>.patch
```

Then reference it from `diff_file`.

```markdown
## Summary

<1-2 sentences.>

## The Why

<Motivation and context.>

## Design Decisions

<Tradeoffs and alternatives considered.>

## How It Works

<Brief implementation overview.>

## The Diff

See [YYYY-MM-DD-<slug>.patch](./YYYY-MM-DD-<slug>.patch).

## When To Use

<Useful scenarios.>

## Caveats

<Limitations or warnings.>
```

## Style

Be concise. Focus on why, tradeoffs, and context. Avoid code snippets.
