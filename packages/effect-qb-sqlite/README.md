# SQLite query helpers

`@manotes/effect-qb-sqlite/json` provides `SqliteJson.make(options)`, which returns `jsonArrayFrom` and `jsonObjectFrom`. Pass the same `valueMappings` and `reportInput` options as the SQLite executor so nested rows use the same codecs as ordinary results.

The module targets patched effect-qb 0.24.1 and uses its internal query, projection, renderer and row-decoder APIs. Review those imports when upgrading QB. It has no Manotes schema dependency and can run in browsers or Node.

See [database maintenance](../../docs/database.md) for examples, result cardinality, supported inputs and integration regressions in `packages/shared/test/json-from.test.ts`.
