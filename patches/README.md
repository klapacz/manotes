# effect-qb 0.24.1 compatibility patch

`effect-qb@0.24.1.patch` modifies the published npm package. The project uses `effect@4.0.3`. The published 0.24.1 package still needs these compatibility fixes.

| Upstream source                                         | Reason and modification                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`, `src/internal/json/storage.ts`          | Shared declaration files refer to internal types. Expose internal subpaths and export the existing JSON storage marker so declaration emission works.                                                                                                                                                                                      |
| `src/standard.ts`, `src/standard/query.ts`              | Expose existing query/expression AST symbols, `makeExpression`, and the query plan namespace. The app uses them for reactive table inference and BLOB parameters in bulk inserts.                                                                                                                                                          |
| `src/internal/query.ts`, `src/internal/standard-dsl.ts` | Preserve optional mutation properties, allow explicit undefined values, omit them from assignments, and exclude them from dependency/dialect metadata. This ports Drizzle's partial update semantics.                                                                                                                                      |
| `src/internal/standard-dsl.ts`, `CaseBuilder.else`      | Backport union-based CASE metadata from unreleased effect-qb main, source `packages/querybuilder/src/standard/internal/dsl.ts` at commit `a7cf76f99eb728ee85bbd2758e3bf46b5199519d`. Adapt imported names to the published package; preserve dialect, dependencies, aggregation, and result nullability without broad tuple intersections. |
| `src/internal/standard-dsl.ts`, `OnConflictApi`         | Add an overload for a column target with no update action. Infer the target table from the insert plan, validate its conflict columns, and preserve the plan's dialect. The existing generic overload widened an ordinary `DO NOTHING` insert to an unknown dialect.                                                                       |
| `dist/standard.js`, `dist/internal/standard-dsl.js`     | Apply the runtime exports and undefined-assignment omission to the published JavaScript modules. Other changes affect types only.                                                                                                                                                                                                          |

The patch contains no replacement implementation of the query builder. It depends on these internal APIs and must be reviewed when upgrading effect-qb.

## SQLite migration generation

`effect-db@0.24.1.patch` adds `src/sqlite.ts`, published `dist/sqlite.js`/`.d.ts`, a package subpath export, and a dispatch before the existing CLI runner. Those entry points delegate to `@manotes/effect-db-sqlite`, installed explicitly beside effect-db in the workspace root. No upstream generator code is replaced or copied. The existing PostgreSQL CLI remains the fallback.

`effect-qb@0.24.1.patch` also supplies SQLite schema support:

- `src/sqlite/column-extension.ts` and its published JS add an integer-primary-key `autoIncrement` modifier using a preserved Schema annotation.
- `src/internal/column.ts` exports the existing `HasDefaultColumn` type, so omitting an autoincrement ID remains typed.
- `src/internal/dialect-renderers/sqlite.ts` and its published JS read the annotation with stable Effect's `Schema.resolveAnnotations`, render inline AUTOINCREMENT primary keys, map portable integer/JSON columns to INTEGER/TEXT, and parenthesize expression defaults.

These changes are needed to reproduce the existing SQLite schema through QB DDL. Source and published runtime changes are kept together. The companion's [README](../packages/effect-db-sqlite/README.md) describes generation/application commands, rebuild behavior, and unsupported declarations.

## Drizzle Kit rebuild preservation

`drizzle-kit@1.0.0-rc.4.patch` modifies the published `bin.cjs`, `cli.js`/`.mjs` and `payload-sqlite.js`/`.mjs` bundles. Source: `drizzle-kit/src/dialects/sqlite/convertor.ts`, the `recreate_table` converter in Drizzle tag `v1.0.0-rc.4`. The unpatched converter reconstructs `sqlite_sequence` from retained rows, losing IDs of deleted events. The patch saves the old sequence before replacing an AUTOINCREMENT table, restores the greater old/new sequence after renaming, and removes its temporary table. The `drizzle-kit/src/dialects/sqlite/diff.ts` rebuild predicate and the converter source-column filter also preserve readable generated values when a column becomes writable, rather than dropping/re-adding it.

Remove the patch when `packages/effect-db-sqlite/src/schema.test.ts`'s sequence and generated-to-writable regressions pass against an unpatched upstream release. There is no foreign-key fix in this patch; the agreed transaction/cascade limitation is documented in the runner and package README.
