# Agent Instructions

This file contains instructions and context for AI coding assistants working on this project.

## Reference

The Effect repository is cloned to `.reference/effect` for local API lookups and examples. Use it for reference only; do not modify it.

## Style guide

Always be concise.

## Version Control

This project uses **Jujutsu (jj)** for version control. Always use `--git` flag with `jj diff` and similar commands to get properly formatted diffs (e.g. `jj diff --git`, `jj log -p --git`).

For working with Jujutsu changes (squashing, splitting, partial commits, etc.), use the `jj-hunk` skill.

## Migrations

Do not create Drizzle migration SQL files by hand. Generate migrations with `drizzle-kit generate`.

## Linting

DO NOT ever run any type checking or linting commands before asking me first.
