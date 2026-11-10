import { DatabaseSync } from "node:sqlite";
import { DateTime, Effect, Schema } from "effect";
import { Query } from "effect-qb";
import * as Sqlite from "effect-qb/sqlite";
import { describe, expect, it } from "vite-plus/test";
import { Tables } from "../src/db.tables";
import { DB } from "../src/db.service";
import { RecordSchema } from "../src/record.schema";
import { AttrsSchema } from "../src/attrs.schema";
import { BuiltinAttrs } from "../src/builtin-attrs";
import { RecordFilter } from "../src/record/filter";
import { Filters } from "../src/record/filters";

const expr = AttrsSchema.makeFilterExpr;

const id = (value: string) => RecordSchema.Id.make(value);

const boolean = (value: { val: boolean }) => AttrsSchema.PropVal.cases.bool.make(value);

const createdAt = DateTime.makeUnsafe("2026-10-15T12:00:00Z");

describe("record filter expressions", () => {
  it("inverts property violations across paths and keeps unavailable definitions unmatched", async () => {
    await withRecords(async (executor, database) => {
      const propId = id("flag");

      const insert = database.prepare(
        "INSERT INTO props (recordId, path, propId, value) VALUES (?, ?, ?, ?)",
      );

      insert.run("alpha", "[]", propId, JSON.stringify(boolean({ val: true })));
      insert.run(
        "alpha",
        JSON.stringify(["group"]),
        propId,
        JSON.stringify(AttrsSchema.PropVal.cases.text.make({ val: "wrong" })),
      );
      insert.run("body", "[]", propId, null);

      const metadata: RecordFilter.Metadata = {
        defs: {
          [propId]: {
            id: propId,
            title: null,
            prop_type: "bool",
            prop_default: boolean({ val: true }),
          },
        },
      };

      const validity = (violation: boolean) => {
        return expr.cmp({ val: [["prop", propId], "violation", violation] });
      };

      const valid = [expr.or({ val: [expr.and({ val: [validity(false)] })] })];

      expect(await findIds(executor, [validity(true)], metadata)).toEqual(["alpha", "body"]);
      // An unset property has no saved-value violation, even when it has a default.
      expect(await findIds(executor, valid, metadata)).toEqual(["prop"]);
      expect(await findIds(executor, valid)).toEqual([]);
      expect(await findIds(executor, valid, { defs: {} })).toEqual([]);

      database.prepare("DELETE FROM props WHERE path != '[]'").run();
      database
        .prepare("UPDATE props SET value = ? WHERE recordId = 'body'")
        .run(JSON.stringify(boolean({ val: false })));
      expect(await findIds(executor, valid, metadata)).toEqual(["alpha", "body", "prop"]);
      expect(await findIds(executor, [validity(true)], metadata)).toEqual([]);
    });
  });

  it("executes nested AND/OR, empty groups, IDs, and literal substring searches", async () => {
    await withRecords(async (executor) => {
      const ids = (filter: AttrsSchema.Filter) => findIds(executor, filter);
      expect(await ids([])).toEqual(["alpha", "body", "prop"]);
      expect(await ids([expr.and({ val: [] })])).toEqual(["alpha", "body", "prop"]);
      expect(await ids([expr.or({ val: [] })])).toEqual([]);
      expect(
        await ids([
          expr.and({
            val: [
              expr.cmp({ val: ["_tag", "=", "note"] }),
              expr.or({
                val: [
                  expr.cmp({ val: ["id", "=", id("alpha")] }),
                  expr.cmp({ val: ["body", "contains", "beta"] }),
                ],
              }),
            ],
          }),
        ]),
      ).toEqual(["alpha", "body"]);
      expect(await ids([expr.cmp({ val: ["body", "contains", "50%_!"] })])).toEqual(["alpha"]);
      expect(await ids([expr.cmp({ val: ["body", "contains", "%wildcard"] })])).toEqual([]);
    });
  });

  it("uses real assignments for exists, supports groups, and fails missing definitions", async () => {
    await withRecords(async (executor, database) => {
      database
        .prepare("INSERT INTO props (recordId, path, propId, value) VALUES (?, ?, ?, ?)")
        .run("alpha", JSON.stringify(["group"]), "flag", JSON.stringify(boolean({ val: true })));
      database
        .prepare("INSERT INTO props (recordId, path, propId, value) VALUES (?, ?, ?, ?)")
        .run(
          "body",
          "[]",
          "flag",
          JSON.stringify(AttrsSchema.PropVal.cases.text.make({ val: "wrong" })),
        );
      const eq = expr.cmp({ val: [["prop", id("flag")], "=", boolean({ val: true })] });
      expect(await findIds(executor, [eq])).toEqual(["alpha", "prop"]);
      expect(
        await findIds(executor, [expr.cmp({ val: [["prop", id("flag")], "exists", true] })]),
      ).toEqual(["alpha", "body"]);
      expect(
        await findIds(executor, [expr.cmp({ val: [["prop", id("flag")], "exists", false] })]),
      ).toEqual(["prop"]);
      expect(
        await findIds(executor, [
          expr.cmp({ val: [["prop", id("missing")], "=", boolean({ val: true })] }),
        ]),
      ).toEqual([]);

      expect(
        await findIds(executor, [expr.cmp({ val: [["prop", id("flag")], "violation", true] })]),
      ).toEqual([]);

      database.prepare("UPDATE records SET attrs_valid = 0 WHERE id = 'flag'").run();
      expect(await findIds(executor, [eq])).toEqual([]);
    });
  });

  it("uses registry defaults for built-ins and follows link direction", async () => {
    await withRecords(async (executor, database) => {
      database.prepare("INSERT INTO backlinks VALUES (?, ?)").run("alpha", "body");
      expect(
        await findIds(executor, [expr.cmp({ val: [["link", "->", id("body")], "exists", true] })]),
      ).toEqual(["alpha"]);
      expect(
        await findIds(executor, [expr.cmp({ val: [["link", "<-", id("alpha")], "exists", true] })]),
      ).toEqual(["body"]);
      expect(await findIds(executor, [Filters.aliases.unarchived.make()])).toEqual([
        "alpha",
        "body",
        "prop",
      ]);
      expect(
        await findIds(executor, [
          expr.cmp({ val: [["prop", BuiltinAttrs.archivedId], "exists", true] }),
        ]),
      ).toEqual([]);
    });
  });

  it("combines default equality with explicit assignments and allows contradictions", async () => {
    await withRecords(async (executor, database) => {
      const equals = Filters.aliases.unarchived.make();
      const exists = expr.cmp({ val: [["prop", BuiltinAttrs.archivedId], "exists", true] });
      const missing = expr.cmp({ val: [["prop", BuiltinAttrs.archivedId], "exists", false] });
      expect(await findIds(executor, [equals, exists])).toEqual([]);
      database
        .prepare("INSERT INTO props (recordId, path, propId, value) VALUES (?, ?, ?, ?)")
        .run("alpha", "[]", BuiltinAttrs.archivedId, JSON.stringify(boolean({ val: false })));
      expect(await findIds(executor, [equals, exists])).toEqual(["alpha"]);
      expect(await findIds(executor, [equals, missing])).toEqual(["body", "prop"]);
      expect(await findIds(executor, [exists, missing])).toEqual([]);
    });
  });

  it("prioritizes any title term while preserving AND filtering", async () => {
    await withRecords(async (executor) => {
      const filter = [
        expr.cmp({ val: ["body", "contains", "alpha"] }),
        expr.cmp({ val: ["body", "contains", "beta"] }),
      ];

      const rows = await Effect.runPromise(
        executor.execute(
          Query.select({ id: Tables.records.id }).pipe(
            Query.from(Tables.records),
            Query.where(RecordFilter.filterPredicate(filter)),
            Query.orderBy(Query.case().when(RecordFilter.titleMatchPredicate(filter), 0).else(1)),
          ),
        ),
      );

      expect(rows.map(({ id }) => id)).toEqual(["alpha", "body"]);
    });
  });
});

async function findIds(
  executor: ReturnType<typeof makeExecutor>,
  filter: AttrsSchema.Filter,
  metadata: RecordFilter.Metadata = {},
) {
  const rows = await Effect.runPromise(
    executor.execute(
      Query.select({ id: Tables.records.id }).pipe(
        Query.from(Tables.records),
        Query.where(Query.neq(Tables.records.id, id("flag"))),
        Query.where(RecordFilter.filterPredicate(filter, metadata)),
        Query.orderBy(Tables.records.id),
      ),
    ),
  );

  return rows.map(({ id }) => id);
}

async function withRecords(
  run: (executor: ReturnType<typeof makeExecutor>, database: DatabaseSync) => Promise<void>,
) {
  const database = new DatabaseSync(":memory:");
  const executor = makeExecutor(database);

  try {
    for (const table of [Tables.records, Tables.props, Tables.backlinks]) {
      await Effect.runPromise(executor.execute(Query.createTable(table)));
    }

    for (const row of [
      { id: id("alpha"), title: "alpha", text: "alpha beta 50%_!", _tag: "note" as const },
      { id: id("body"), title: "Draft", text: "alpha beta", _tag: "note" as const },
      { id: id("prop"), title: "Property", text: "property", _tag: "prop" as const },
    ]) {
      await Effect.runPromise(
        executor.execute(
          Query.insert(Tables.records).pipe(
            Query.from(
              DB.values(Tables.records, {
                ...row,
                content: { type: "doc" },
                date: "2026-10-15",
                createdAt,
                updatedAt: createdAt,
                lastEventLocalSeq: 0,
              }),
            ),
          ),
        ),
      );
    }

    await Effect.runPromise(
      executor.execute(
        Query.insert(Tables.records).pipe(
          Query.from(
            DB.values(Tables.records, {
              id: id("flag"),
              _tag: Schema.Literal("prop").make("prop"),
              prop_type: Schema.Literal("bool").make("bool"),
              prop_default: boolean({ val: true }),
              attrs_valid: true,
              title: "Flag",
              text: "flag",
              content: { type: "doc" },
              date: "2026-10-15",
              createdAt,
              updatedAt: createdAt,
              lastEventLocalSeq: 0,
            }),
          ),
        ),
      ),
    );
    await run(executor, database);
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

const nativeParameter = Schema.decodeUnknownSync(
  Schema.Union([Schema.Null, Schema.String, Schema.Number, Schema.BigInt, Schema.Uint8Array]),
);
