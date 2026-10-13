import { DatabaseSync } from "node:sqlite";
import { DateTime, Effect, Exit, Schema } from "effect";
import { Column, Query, Table } from "effect-qb";
import * as Sqlite from "effect-qb/sqlite";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { NoteSchema } from "../src/note.schema";
import { AttrsSchema } from "../src/attrs.schema";
import { Tables } from "../src/db.tables";
import { DBUsedTables } from "../src/db.used-tables";
import { SqliteJson } from "@manotes/effect-qb-sqlite/json";

const { jsonArrayFrom, jsonObjectFrom } = SqliteJson.make({});

const parents = Table.make("parents", {
  id: Column.text().pipe(Column.schema(NoteSchema.Id), Column.primaryKey),
});

const children = Table.make("children", {
  id: Column.text().pipe(Column.schema(NoteSchema.Id), Column.primaryKey),
  parentId: Column.text(),
  name: Column.text(),
  createdAt: Column.text().pipe(Column.schema(Schema.DateTimeUtcFromString)),
  enabled: Column.boolean(),
  payload: Column.json(Schema.Struct({ count: Schema.NumberFromString })),
});

const childQuery = Query.select({
  id: children.id,
  name: children.name,
  createdAt: children.createdAt,
  enabled: children.enabled,
  payload: children.payload,
}).pipe(
  Query.from(children),
  Query.where(Query.eq(children.parentId, parents.id)),
  Query.where(Query.neq(children.name, "excluded")),
  Query.orderBy(children.name),
  Query.limit(2),
);

const sqliteQuery = Query.select({
  id: parents.id,
  children: jsonArrayFrom(childQuery),
  firstChild: jsonObjectFrom(childQuery.pipe(Query.limit(1))),
}).pipe(Query.from(parents), Query.orderBy(parents.id));

const expectations = Query.select({
  propId: Tables.ruleExpects.propId,
  value: Tables.ruleExpects.value,
}).pipe(
  Query.from(Tables.ruleExpects),
  Query.where(Query.eq(Tables.ruleExpects.ruleId, Tables.notes.id)),
  Query.where(Query.isNotNull(Tables.ruleExpects.value)),
  Query.orderBy(Tables.ruleExpects.propId),
);

const rules = Query.select({
  id: Tables.notes.id,
  expects: jsonArrayFrom(expectations),
  firstExpectation: jsonObjectFrom(expectations.pipe(Query.limit(1))),
}).pipe(Query.from(Tables.notes), Query.where(Query.eq(Tables.notes._tag, "rule")));

describe("typed JSON subquery helpers", () => {
  it("uses the executor's value mappings for array, object and nested array rows", async () => {
    await withDatabase(async (database) => {
      const options = {
        valueMappings: {
          boolean: { fromDriver: (value) => Schema.decodeUnknownSync(Schema.Number)(value) === 0 },
        },
      } satisfies SqliteJson.Options;

      const executor = makeExecutor(database, options);
      const json = SqliteJson.make(options);
      const grandchildren = Table.alias(children, "grandchildren");

      const nestedChildren = Query.select({
        enabled: children.enabled,
        related: json.jsonArrayFrom(
          Query.select({ enabled: grandchildren.enabled }).pipe(
            Query.from(grandchildren),
            Query.where(Query.eq(grandchildren.id, children.id)),
          ),
        ),
      }).pipe(
        Query.from(children),
        Query.where(Query.eq(children.parentId, parents.id)),
        Query.orderBy(children.name),
        Query.limit(1),
      );

      const query = Query.select({
        children: json.jsonArrayFrom(nestedChildren),
        child: json.jsonObjectFrom(nestedChildren),
      }).pipe(Query.from(parents), Query.where(Query.eq(parents.id, "populated")));

      const direct = await Effect.runPromise(
        executor.execute(Query.select({ enabled: children.enabled }).pipe(Query.from(children))),
      );

      expect(direct.every((row) => row.enabled === false)).toBe(true);
      const child = { enabled: false, related: [{ enabled: false }] };
      expect(await Effect.runPromise(executor.execute(query))).toEqual([
        { children: [child], child },
      ]);
    });
  });

  it("works with Manotes rule expectations without another result schema", async () => {
    await withDatabase(async (database, executor) => {
      await Effect.runPromise(executor.execute(Query.createTable(Tables.notes)));
      await Effect.runPromise(executor.execute(Query.createTable(Tables.ruleExpects)));
      database.exec(`INSERT INTO notes
        (id, _tag, content, text, date, createdAt, updatedAt, lastEventLocalSeq)
        VALUES ('rule', 'rule', '{}', '', '2026-10-14', '2026-10-14', '2026-10-14', 0)`);
      const insert = database.prepare("INSERT INTO rule_expects VALUES ('rule', ?, ?)");
      const required = AttrsSchema.RuleExpectation.cases.required.make({});
      insert.run("priority", JSON.stringify(required));
      insert.run("ignored", null);
      const rows = await Effect.runPromise(executor.execute(rules));
      expectTypeOf(rows[0]!.expects[0]!.value).toEqualTypeOf<AttrsSchema.RuleExpectation>();
      expect(rows).toEqual([
        {
          id: "rule",
          expects: [{ propId: "priority", value: required }],
          firstExpectation: { propId: "priority", value: required },
        },
      ]);
      expect([...DBUsedTables.usedTables(rules)].sort()).toEqual(["notes", "rule_expects"]);
    });
  });

  it("returns decoded arrays and objects, preserving ordering, limits and empty results", async () => {
    await withDatabase(async (_database, executor) => {
      const rows = await Effect.runPromise(executor.execute(sqliteQuery));
      expectTypeOf(rows[0]!.id).toEqualTypeOf<NoteSchema.Id>();
      expectTypeOf(rows[1]!.children[0]!.createdAt).toEqualTypeOf<DateTime.Utc>();
      expectTypeOf(rows[1]!.children[0]!.payload.count).toEqualTypeOf<number>();
      expectTypeOf(rows[0]!.firstChild).toEqualTypeOf<Query.ResultRow<typeof childQuery> | null>();
      expect(rows[0]).toEqual({ id: "empty", children: [], firstChild: null });
      expect(rows[1]!.children.map((child) => child.name)).toEqual(["Alice", "Bob"]);
      expect(rows[1]!.children[0]!.payload).toEqual({ count: 42 });
      expect(rows[1]!.children[0]!.enabled).toBe(true);
      expect(DateTime.formatIso(rows[1]!.firstChild!.createdAt)).toBe("2026-10-14T10:00:00.000Z");
      expect([...DBUsedTables.usedTables(sqliteQuery)].sort()).toEqual(["children", "parents"]);
    });
  });

  it("rejects multiple rows for jsonObjectFrom without silently picking one", async () => {
    await withDatabase(async (_database, executor) => {
      const query = Query.select({ child: jsonObjectFrom(childQuery) }).pipe(Query.from(parents));

      expect(Exit.isFailure(await Effect.runPromiseExit(executor.execute(query)))).toBe(true);
    });
  });

  it("fails when nested stored data breaks its column codec", async () => {
    await withDatabase(async (database, executor) => {
      database.exec("UPDATE children SET createdAt = 'bad date' WHERE name = 'Alice'");
      expect(Exit.isFailure(await Effect.runPromiseExit(executor.execute(sqliteQuery)))).toBe(true);
    });
  });

  it("decodes nested selection objects and another jsonArrayFrom inside them", async () => {
    await withDatabase(async (_database, executor) => {
      const grandchildren = Table.alias(children, "grandchildren");

      const grandchildQuery = Query.select({ name: grandchildren.name }).pipe(
        Query.from(grandchildren),
        Query.where(Query.eq(grandchildren.id, children.id)),
      );

      const nestedChildren = Query.select({
        details: { id: children.id, createdAt: children.createdAt },
        related: jsonArrayFrom(grandchildQuery),
      }).pipe(
        Query.from(children),
        Query.where(Query.eq(children.parentId, parents.id)),
        Query.orderBy(children.name),
      );

      const query = Query.select({ children: jsonArrayFrom(nestedChildren) }).pipe(
        Query.from(parents),
        Query.where(Query.eq(parents.id, "populated")),
      );

      const rows = await Effect.runPromise(executor.execute(query));
      expectTypeOf(rows[0]!.children[0]!.details.createdAt).toEqualTypeOf<DateTime.Utc>();
      expect(rows[0]!.children[0]!.related).toEqual([{ name: "Alice" }]);
      expect(DateTime.formatIso(rows[0]!.children[0]!.details.createdAt)).toBe(
        "2026-10-14T10:00:00.000Z",
      );
    });
  });

  it("quotes selected keys and derives aliases without colliding with correlated sources", async () => {
    await withDatabase(async (_database, executor) => {
      const parent = Table.alias(parents, "__qb_json_from");

      const subquery = Query.select({ 'quoted " key': children.name }).pipe(
        Query.from(children),
        Query.where(Query.eq(children.parentId, parent.id)),
        Query.orderBy(children.name),
        Query.limit(1),
      );

      const query = Query.select({ result: jsonArrayFrom(subquery) }).pipe(
        Query.from(parent),
        Query.where(Query.eq(parent.id, "populated")),
      );

      expect(await Effect.runPromise(executor.execute(query))).toEqual([
        { result: [{ 'quoted " key': "Alice" }] },
      ]);
    });
  });

  it("preserves integers beyond JavaScript's safe range inside JSON", async () => {
    await withDatabase(async (database, executor) => {
      const exact = Table.make("exact_numbers", { amount: Column.bigint() });
      await Effect.runPromise(executor.execute(Query.createTable(exact)));
      database.exec("INSERT INTO exact_numbers VALUES (9007199254740993)");

      const query = Query.select({
        numbers: jsonArrayFrom(Query.select(exact.columns).pipe(Query.from(exact))),
      });

      expect(await Effect.runPromise(executor.execute(query))).toEqual([
        { numbers: [{ amount: "9007199254740993" }] },
      ]);
    });
  });

  it("tracks correlated dependencies and rejects non-select subqueries", () => {
    // @ts-expect-error Correlated parents must be provided by the outer query.
    Sqlite.Renderer.make().render(Query.select({ children: jsonArrayFrom(childQuery) }));

    const rejectInsert = () => {
      // @ts-expect-error INSERT is not a selectable subquery.
      jsonArrayFrom(Query.insert(parents, { id: NoteSchema.Id.make("new") }));
    };

    expect(rejectInsert).toThrow("JSON helpers currently require a SELECT");

    const rejectUnion = () => {
      // @ts-expect-error Set operations are outside this prototype's SELECT scope.
      jsonArrayFrom(Query.union(childQuery, childQuery));
    };

    expect(rejectUnion).toThrow("JSON helpers currently require a SELECT");
  });
});

async function withDatabase(
  run: (database: DatabaseSync, executor: ReturnType<typeof makeExecutor>) => Promise<void>,
) {
  const database = new DatabaseSync(":memory:");
  const executor = makeExecutor(database);

  try {
    await Effect.runPromise(executor.execute(Query.createTable(parents)));
    await Effect.runPromise(executor.execute(Query.createTable(children)));
    database.exec("INSERT INTO parents VALUES ('empty'), ('populated')");

    const insert = database.prepare(
      "INSERT INTO children VALUES (?, 'populated', ?, '2026-10-14T10:00:00.000Z', 1, ?)",
    );

    for (const name of ["Carol", "Bob", "Alice", "excluded"])
      insert.run(name, name, '{"count":"42"}');
    await run(database, executor);
  } finally {
    database.close();
  }
}

function makeExecutor(database: DatabaseSync, options: SqliteJson.Options = {}) {
  return Sqlite.Executor.make({
    ...options,
    driver: Sqlite.Executor.driver((statement) => {
      return Effect.try(() => {
        return database
          .prepare(statement.sql)
          .all(...statement.params.map((value) => nativeParameter(value)));
      });
    }),
  });
}

const nativeParameter = Schema.decodeUnknownSync(
  Schema.Union([Schema.Null, Schema.String, Schema.Number, Schema.BigInt, Schema.Uint8Array]),
);
