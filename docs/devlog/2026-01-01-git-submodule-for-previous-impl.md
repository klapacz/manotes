---
title: Add previous implementation as git submodule
date: 2026-01-01
type: shipped
tags:
  - git
  - submodule
  - jj-jujutsu
---

## Summary

Added the previous implementation (https://github.com/klapacz/manotes.git) as a git submodule at `docs/previous-impl`. Documented submodule usage in README with update instructions.

## The Why

Reference implementation is useful during rewrite to compare approaches, understand previous design decisions, and extract patterns worth preserving.

## Design Decisions

Placed submodule under `docs/previous-impl` to keep it organized with other documentation. Using git commands for submodule management since jj doesn't have native support yet.

## Learnings

**Jujutsu Submodule Compatibility**: JJ does NOT support git submodules natively (issue #494, open since Aug 2022). The design is aspirational and implementation is in phases.

**Colocated Workspaces Save the Day**: Since the repo uses colocated mode (`.git` alongside `.jj`), git submodules work transparently. JJ automatically imports/exports submodule changes on every command.

**Practical Approach**: Use git commands for submodule operations, jj for everything else. The gitlink commits are tracked by jj even though submodule contents aren't deeply understood.
