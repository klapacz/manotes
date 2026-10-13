import { DatabaseSync } from "node:sqlite";
import { DateTime, Effect, Exit, Schema } from "effect";
import { Column, Fragment, Json, Query, Table, Type, makeExpression } from "effect-qb";
import * as Sqlite from "effect-qb/sqlite";
import * as SqliteQuery from "effect-qb/sqlite/query";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { AttrsSchema } from "../src/attrs.schema";
import { Tables } from "../src/db.tables";
import { DBUsedTables } from "../src/db.used-tables";
import { NoteSchema } from "../src/note.schema";

// Investigation only: no application schemas or repositories are changed.
const documents = Table.make("codec_probe", {
  id: Column.text().pipe(Column.schema(NoteSchema.Id), Column.primaryKey),
  createdAt: Column.text().pipe(Column.schema(Schema.DateTimeUtcFromString)),
  content: Column.text().pipe(
    Column.schema(
      Schema.fromJsonString(
        Schema.Struct({
          type: Schema.String,
          content: Schema.optional(Schema.Array(Schema.Unknown)),
        }),
      ),
    ),
  ),
  enabled: Column.custom(Schema.BooleanFromBit, Type.int()),
  payload: Column.json(Schema.Struct({ count: Schema.NumberFromString })),
});

const Expects = Schema.Record(NoteSchema.Id, AttrsSchema.RuleExpectation);

const fragmentRules = Query.select({
  id: Tables.notes.id,
  expects: Fragment.expression({
    dbType: Type.json(),
    schema: Expects,
    nullability: "never",
    kind: "aggregate",
  })`json_group_object(${Tables.ruleExpects.propId}, json(${Tables.ruleExpects.value})) FILTER (
    WHERE ${Tables.ruleExpects.propId} IS NOT NULL AND ${Tables.ruleExpects.value} IS NOT NULL
  )`,
}).pipe(
  Query.from(Tables.notes),
  Query.leftJoin(Tables.ruleExpects, Query.eq(Tables.ruleExpects.ruleId, Tables.notes.id)),
  Query.groupBy(Tables.notes.id),
  Query.orderBy(Tables.notes.id),
);

// The public AST constructor can express function calls without SQL templates.
// This declares the function's result contract; QB does not verify its SQL signature.
const parsedExpectation = makeExpression(
  {
    runtime: Schema.NullOr(AttrsSchema.RuleExpectation).make(null),
    runtimeSchema: Schema.NullOr(AttrsSchema.RuleExpectation),
    dbType: Type.json(),
    nullability: "maybe",
    dialect: "sqlite",
    kind: "scalar",
    dependencies: { rule_expects: true },
  },
  { kind: "function", name: "json", args: [Tables.ruleExpects.value] },
);

const expectationObject = makeExpression(
  {
    runtime: Expects.make({}),
    runtimeSchema: Expects,
    dbType: Type.json(),
    nullability: "never",
    dialect: "sqlite",
    kind: "aggregate",
    dependencies: { rule_expects: true },
  },
  {
    kind: "function",
    name: "json_group_object",
    args: [Tables.ruleExpects.propId, parsedExpectation],
  },
);

const validExpectations = Query.select({ expects: expectationObject }).pipe(
  Query.from(Tables.ruleExpects),
  Query.where(
    Query.and(
      Query.eq(Tables.ruleExpects.ruleId, Tables.notes.id),
      Query.isNotNull(Tables.ruleExpects.propId),
      Query.isNotNull(Tables.ruleExpects.value),
    ),
  ),
);

const astRules = Query.select({
  id: Tables.notes.id,
  expects: SqliteQuery.scalar(validExpectations),
}).pipe(Query.from(Tables.notes), Query.orderBy(Tables.notes.id));

describe("effect-qb 0.24.1 codec and JSON aggregation investigation", () => {
  it("encodes mutations and decodes column codecs without repository-level Schema calls", async () => {
    await withDatabase(async (database, executor) => {
      await Effect.runPromise(executor.execute(Query.createTable(documents)));
      const createdAt = DateTime.makeUnsafe("2026-10-14T10:00:00.000Z");
      const id = NoteSchema.Id.make("document");
      const content = { type: "doc", content: [] };

      await Effect.runPromise(
        executor.execute(
          Query.insert(documents, {
            id,
            createdAt,
            content,
            enabled: true,
            payload: { count: 42 },
          }),
        ),
      );

      expect(database.prepare("SELECT * FROM codec_probe").get()).toEqual({
        id: "document",
        createdAt: "2026-10-14T10:00:00.000Z",
        content: '{"type":"doc","content":[]}',
        enabled: 1,
        payload: '{"count":"42"}',
      });

      const rows = await Effect.runPromise(
        executor.execute(Query.select(documents.columns).pipe(Query.from(documents))),
      );

      expectTypeOf(rows[0]!.id).toEqualTypeOf<NoteSchema.Id>();
      expectTypeOf(rows[0]!.createdAt).toEqualTypeOf<DateTime.Utc>();
      expectTypeOf(rows[0]!.enabled).toEqualTypeOf<boolean>();
      expectTypeOf(rows[0]!.payload.count).toEqualTypeOf<number>();
      expect(rows[0]!.content).toEqual(content);
      expect(DateTime.formatIso(rows[0]!.createdAt)).toBe(DateTime.formatIso(createdAt));
      expect(rows[0]!.enabled).toBe(true);
      expect(rows[0]!.payload.count).toBe(42);

      await Effect.runPromise(
        executor.execute(
          Query.update(documents, { enabled: false, payload: { count: 7 } }).pipe(
            Query.where(Query.eq(documents.id, id)),
          ),
        ),
      );
      expect(database.prepare("SELECT enabled, payload FROM codec_probe").get()).toEqual({
        enabled: 0,
        payload: '{"count":"7"}',
      });
    });
  });

  it("returns encoded leaves from JSON paths and constructors, while whole columns decode", async () => {
    await withDatabase(async (_database, executor) => {
      await Effect.runPromise(executor.execute(Query.createTable(documents)));
      await Effect.runPromise(
        executor.execute(
          Query.insert(documents, {
            id: NoteSchema.Id.make("document"),
            createdAt: DateTime.makeUnsafe("2026-10-14T10:00:00.000Z"),
            content: { type: "doc" },
            enabled: true,
            payload: { count: 42 },
          }),
        ),
      );

      const plan = Query.select({
        whole: documents.payload,
        leaf: documents.payload.count.pipe(Json.text),
        object: Json.buildObject({ count: documents.payload.count }),
      }).pipe(Query.from(documents));

      // @ts-expect-error QB 0.24.1 widens Json.buildObject's dialect to string; this probes runtime separately.
      const rows = await Effect.runPromise(executor.execute(plan));
      expectTypeOf(rows[0]!.leaf).toEqualTypeOf<string>();
      expectTypeOf(rows[0]!.object.count).toEqualTypeOf<string>();
      expect(rows).toEqual([{ whole: { count: 42 }, leaf: "42", object: { count: "42" } }]);
    });
  });

  it("does not decode text JSON when its target schema accepts strings", async () => {
    await withDatabase(async (database, executor) => {
      const permissive = Table.make("permissive_probe", {
        content: Column.text().pipe(Column.schema(Schema.fromJsonString(Schema.Unknown))),
      });

      await Effect.runPromise(executor.execute(Query.createTable(permissive)));
      database.prepare("INSERT INTO permissive_probe VALUES (?)").run('{"type":"doc"}');

      const rows = await Effect.runPromise(
        executor.execute(Query.select(permissive.columns).pipe(Query.from(permissive))),
      );

      // Schema.is accepts the raw string, so the executor skips JSON decoding.
      expect(rows[0]!.content).toBe('{"type":"doc"}');
    });
  });

  it("rejects corrupt stored data instead of asserting the selected type", async () => {
    await withDatabase(async (database, executor) => {
      await Effect.runPromise(executor.execute(Query.createTable(documents)));
      database.exec(
        `INSERT INTO codec_probe VALUES ('broken', 'invalid date', '{}', 1, '{"count":"42"}')`,
      );
      expect(
        Exit.isFailure(
          await Effect.runPromiseExit(
            executor.execute(Query.select(documents.columns).pipe(Query.from(documents))),
          ),
        ),
      ).toBe(true);
    });
  });

  it("matches the requested filtered LEFT JOIN aggregate using a fragment or function AST", async () => {
    await withDatabase(async (database, executor) => {
      await seedRules(database, executor);
      const fragmentRows = await Effect.runPromise(executor.execute(fragmentRules));
      const astRows = await Effect.runPromise(executor.execute(astRules));
      expectTypeOf(fragmentRows[0]!.expects).toEqualTypeOf<typeof Expects.Type | null>();
      expectTypeOf(astRows[0]!.expects).toEqualTypeOf<typeof Expects.Type | null>();
      expect(fragmentRows).toEqual([
        { id: "empty", expects: {} },
        { id: "filtered", expects: {} },
        {
          id: "populated",
          expects: {
            priority: AttrsSchema.RuleExpectation.cases.required.make({}),
            'quoted " key': AttrsSchema.RuleExpectation.cases.optional.make({}),
          },
        },
      ]);
      expect(astRows).toEqual(fragmentRows);
      expect([...DBUsedTables.usedTables(astRules)].sort()).toEqual(["notes", "rule_expects"]);
      expect([...DBUsedTables.usedTables(fragmentRules)].sort()).toEqual(["notes", "rule_expects"]);
    });
  });

  it("validates the aggregate's JSON values with the declared result codec", async () => {
    await withDatabase(async (database, executor) => {
      await seedRules(database, executor);
      database.exec(
        `UPDATE rule_expects SET value = '{"_tag":"invalid"}' WHERE propId = 'priority'`,
      );
      expect(Exit.isFailure(await Effect.runPromiseExit(executor.execute(astRules)))).toBe(true);
      expect(Exit.isFailure(await Effect.runPromiseExit(executor.execute(fragmentRules)))).toBe(
        true,
      );
    });
  });
});

async function withDatabase(
  run: (database: DatabaseSync, executor: ReturnType<typeof makeExecutor>) => Promise<void>,
) {
  const database = new DatabaseSync(":memory:");

  const executor = makeExecutor(database);

  try {
    await run(database, executor);
  } finally {
    database.close();
  }
}

function makeExecutor(database: DatabaseSync) {
  return Sqlite.Executor.make({
    driver: Sqlite.Executor.driver((statement) => {
      return Effect.try(() => {
        return database
          .prepare(statement.sql)
          .all(...statement.params.map((value) => nativeParameter(value)));
      });
    }),
  });
}

// Only this in-memory test driver needs to adapt QB's unknown binding contract.
const nativeParameter = Schema.decodeUnknownSync(
  Schema.Union([Schema.Null, Schema.String, Schema.Number, Schema.BigInt, Schema.Uint8Array]),
);

async function seedRules(database: DatabaseSync, executor: ReturnType<typeof makeExecutor>) {
  await Effect.runPromise(executor.execute(Query.createTable(Tables.notes)));
  await Effect.runPromise(executor.execute(Query.createTable(Tables.ruleExpects)));

  const insertNote = database.prepare(`INSERT INTO notes
    (id, _tag, content, text, date, createdAt, updatedAt, lastEventLocalSeq)
    VALUES (?, 'rule', '{}', ?, '2026-10-14', '2026-10-14', '2026-10-14', 0)`);

  for (const id of ["empty", "filtered", "populated"]) insertNote.run(id, id);
  const insertExpect = database.prepare("INSERT INTO rule_expects VALUES (?, ?, ?)");
  insertExpect.run("filtered", "invalid", null);
  insertExpect.run(
    "populated",
    "priority",
    JSON.stringify(AttrsSchema.RuleExpectation.cases.required.make({})),
  );
  insertExpect.run(
    "populated",
    'quoted " key',
    JSON.stringify(AttrsSchema.RuleExpectation.cases.optional.make({})),
  );
  insertExpect.run("populated", "ignored", null);
}
