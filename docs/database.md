# Database maintenance

Manotes uses Effect Query Builder 0.24.1 with Effect 4.0.3 for SQLite queries. Table declarations are the schema source for queries and migrations. See the [SQLite migration package](../packages/effect-db-sqlite/README.md) for generation and execution commands, and [dependency patches](../patches/README.md) before upgrading QB, effect-db or Drizzle Kit.

## Tables, codecs and writes

Shared tables live in `packages/shared/src/db.tables.ts`; web-only tables live in `apps/web/src/lib/db.tables.ts`. Export table-derived row types immediately below each table. Keep storage codecs on columns so ordinary queries return domain values, including `DateTime.Utc` dates and parsed JSON. Do not add another row schema to repeat those column definitions.

Keep schemas for separate contracts and domain checks: Yjs documents, saved filters, sync/backup formats, event payloads, reserved `builtin:` event targets, and property definitions whose defaults must match their type. `NoteSchema.Content` supplies an editor-owned TypeScript type without validating the editor structure; its JSON column still parses and stringifies JSON.

Use `DB.Service` for query execution and transactions. Single inserts and updates bind domain values through QB's column codecs. For bulk inserts, use `Query.from(DB.values(table, rows))`; the helper reuses insert bindings for dates, JSON and BLOBs. It accepts one row or a nonempty batch whose rows supply the same columns. Undefined mutation fields are omitted. An empty update fails instead of becoming a silent no-op.

## Reactive queries

`db.reactiveQuery(plan)` discovers table dependencies through `db.used-tables.ts`. The traversal follows aliases, joins, subqueries and CTEs, then deduplicates physical table names. Callers supply no table list.

Tables hidden inside raw SQL text cannot be discovered. Pass table columns as QB expressions inside fragments. Stream substring search uses one fragment because QB's `Query.like` lacks an ESCAPE argument; its search values remain parameters.

## Nested JSON results

Use the helpers bound to `DB.Service` so nested rows share the executor's column decoders and value mappings:

```ts
import { Effect } from "effect";
import { Query } from "effect-qb";
import { DB } from "@manotes/shared/db.service";
import { Tables } from "@manotes/shared/db.tables";

const rules = Effect.gen(function* () {
  const db = yield* DB.Service;
  const expectations = Query.select({
    propId: Tables.ruleExpects.propId,
    value: Tables.ruleExpects.value,
  }).pipe(
    Query.from(Tables.ruleExpects),
    Query.where(Query.eq(Tables.ruleExpects.ruleId, Tables.notes.id)),
    Query.where(Query.isNotNull(Tables.ruleExpects.value)),
    Query.orderBy(Tables.ruleExpects.propId),
  );

  return yield* db.query(
    Query.select({
      id: Tables.notes.id,
      expects: db.jsonArrayFrom(expectations),
      first: db.jsonObjectFrom(expectations.pipe(Query.limit(1))),
    }).pipe(Query.from(Tables.notes)),
  );
});
```

`jsonArrayFrom` returns decoded selected rows, or `[]` for no matches. `jsonObjectFrom` returns one decoded row, or `null`; multiple rows fail decoding. Use ordering and `Query.limit(1)` to choose a first row. The inner query controls filtering, order, limits and offsets. Correlated references still require the outer query to provide their sources.

These SQLite helpers accept SELECT plans and reject BLOB fields. Nested selections and nested JSON helpers are supported; UNION queries are not. `packages/effect-qb-sqlite/src/json.ts` centralizes their QB internal API dependencies. When upgrading QB, review that module alongside shared's `db.used-tables.ts` and `db.values.ts`, and run their regressions.

## Regression coverage

- `packages/shared/test/json-from.test.ts`: nested decoding, cardinality, ordering, limits, large integers and shared value mappings.
- `packages/shared/test/db-codecs.test.ts`: column codecs, mutation bindings and partial updates.
- `packages/shared/src/db.used-tables.test.ts` and `apps/cli/src/db-reactivity.test.ts`: dependency discovery and actual invalidation.
- `apps/cli/src/builtin-attrs.test.ts`: filtering defaults, stored tags, disabled definitions and reserved event targets.
- `packages/effect-db-sqlite/src/*.test.ts`: schema translation, generated rebuilds, sequence preservation and the migration runner.

Follow `AGENTS.md` for check/test permissions. Rebuild `@manotes/effect-qb-sqlite`, shared code and the migration package before running commands that load their compiled exports. Applied migration SQL must not be edited. Existing Drizzle migration history is not imported; databases need the current migration history. The migration README documents the deferred foreign-key rebuild limitation.
