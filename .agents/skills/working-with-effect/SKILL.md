---
name: working-with-effect
description: Project conventions for Effect APIs, span naming, and SQL schema decoding. Use when writing or reviewing Effect code, including Effect.fn spans and queries using Effect SQL or SqlSchema.
---

# Working with Effect

## Reference

The Effect repository is cloned to `.reference/effect` for local API lookups and examples. Use it for reference only; do not modify it.

## Effect spans

Name spans using `Effect.fn("Module.functionName")`, where `Module` matches the file's module name derived from its path:

- `auth/jwt.ts` → `AuthJwt`
- `auth/identity/cloudflare-access.ts` → `AuthIdentityCloudflareAccess`
- `auth/session.ts` → `AuthSession`

## Effect SQL

Use `SqlSchema` helpers from `effect/unstable/sql/SqlSchema` to combine SQL queries with schema decoding instead of manually decoding results.

- `SqlSchema.findOneOption` returns `Option<T>`, decoding the first row or returning `None`.
- `SqlSchema.findOne` returns `T`, failing with `NoSuchElementError` if empty.
- `SqlSchema.findAll` returns `Array<T>`.
- `SqlSchema.void` executes without parsing results, useful when request schema encoding helps.

Define `Request` and `Result` schemas and provide an `execute` function receiving the encoded request. Keep schema definitions next to their encode/decode helpers.
