# Agent Instructions

This file contains instructions and context for AI coding assistants working on this project.

## Reference

The Effect repository is cloned to `.reference/effect` for local API lookups and examples. Use it for reference only; do not modify it.

## Style guide

Always be concise.
Keep schema definitions next to their encode/decode helpers.
Place small file-local helpers below the main exported implementation.
`index.ts` files are reserved for directory re-exports only; do not use them for implementation modules.

When copying code from a dependency or reference repository, document the source file path, dependency version, why it was copied, and what modifications were made.

## Version Control

This project uses **Jujutsu (jj)** for version control. Always use `--git` flag with `jj diff` and similar commands to get properly formatted diffs (e.g. `jj diff --git`, `jj log -p --git`).

## Development shell

Run development commands through `scripts/nix-develop -c <command>` so nested jj workspaces use the main checkout's Nix devshell. Run commands from the workspace, not the main checkout.

## Migrations

Do not create Drizzle migration SQL files by hand. Generate migrations with `drizzle-kit generate`.

## Effect spans

Name spans using `Effect.fn("Module.functionName")` where `Module` matches the file's module name derived from its path (e.g. `auth/jwt.ts` → `AuthJwt`, `auth/identity/cloudflare-access.ts` → `AuthIdentityCloudflareAccess`, `auth/session.ts` → `AuthSession`).

## Effect SQL

Use `SqlSchema` helpers from `effect/unstable/sql/SqlSchema` to combine SQL queries with schema decoding instead of manually decoding results. Key helpers:

- `SqlSchema.findOneOption` — query returning `Option<T>` (decodes first row or `None`)
- `SqlSchema.findOne` — query returning `T` (fails with `NoSuchElementError` if empty)
- `SqlSchema.findAll` — query returning `Array<T>`
- `SqlSchema.void` — execute without parsing results (useful when Request schema encoding helps)

Pattern: define `Request` and `Result` schemas, provide `execute` function receiving the encoded request.

## Linting

DO NOT ever run any type checking or linting commands before asking me first.
Use `vp check --fix` when asked to lint/check.
