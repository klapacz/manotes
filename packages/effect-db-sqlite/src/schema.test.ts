import { DatabaseSync } from "node:sqlite";
import { Column, Table, Query, Index } from "effect-qb";
import * as Sqlite from "effect-qb/sqlite";
import { mapOption } from "effect-qb/internal/table";
import * as SchemaExpression from "effect-qb/internal/schema-expression-value";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/payload/sqlite";
import { describe, expect, it } from "vite-plus/test";
import { EffectDbSqliteSchema } from "./schema";

async function snapshot(tables: readonly Table.AnyTable[]) {
  return await generateDrizzleJson(
    Object.fromEntries(
      EffectDbSqliteSchema.toDrizzleTables(tables).map((table, i) => [`table${i}`, table]),
    ),
  );
}

async function create(tables: readonly Table.AnyTable[], database: DatabaseSync) {
  const current = await snapshot(tables);

  for (const statement of await generateMigration({ ...current, ddl: [] }, current))
    database.exec(statement);

  return current;
}

describe("QB to Drizzle SQLite translation", () => {
  it("preserves defaults, keys, unique constraints, indexes, foreign keys, checks and generated columns", async () => {
    const parents = Table.make("parents", { id: Column.text().pipe(Column.primaryKey) });

    const children = Table.make("children", {
      id: Column.text().pipe(Column.primaryKey),
      parentId: Column.text(),
      quantity: Column.int().pipe(Column.default(Query.literal(2))),
      doubled: Column.int().pipe(Column.generated(SchemaExpression.fromSql('"quantity" * 2'))),
    }).pipe(
      Table.foreignKey(
        (t) => [t.parentId],
        () => [parents.id],
      ),
      Table.check("positive", (t) => Query.gte(t.quantity, 0)),
      Table.unique((t) => [t.parentId, t.quantity]),
      Index.make((t) => [t.parentId]).pipe(Index.named("children_parent_idx")),
    );

    const database = new DatabaseSync(":memory:");

    try {
      await create([children, parents], database);
      database.exec(
        "INSERT INTO parents VALUES ('p'); INSERT INTO children(id,parentId) VALUES ('c','p');",
      );
      expect(database.prepare("SELECT quantity,doubled FROM children").get()).toEqual({
        quantity: 2,
        doubled: 4,
      });
      expect(() => {
        return database.exec("INSERT INTO children(id,parentId) VALUES ('other','missing')");
      }).toThrow();
      expect(() => database.exec("UPDATE children SET quantity=-1")).toThrow();
      expect(() => {
        return database.exec("INSERT INTO children(id,parentId) VALUES ('duplicate','p')");
      }).toThrow();
      expect(
        database.prepare("SELECT name FROM pragma_index_list('children') WHERE origin='c'").all(),
      ).toEqual([{ name: "children_parent_idx" }]);
      expect((await snapshot([children, parents])).ddl).toEqual(
        (await snapshot([children, parents])).ddl,
      );
    } finally {
      database.close();
    }
  });

  it.each([false, true])(
    "patched rebuild preserves deleted event sequence when table empty=%s",
    async (empty) => {
      const events = (defaultValue: string) => {
        return Table.make("events", {
          localSeq: Column.int().pipe(Column.primaryKey, Sqlite.Column.autoIncrement),
          payload: Column.text().pipe(Column.default(Query.literal(defaultValue))),
        });
      };

      const database = new DatabaseSync(":memory:");

      try {
        const before = await create([events("old")], database);
        database.exec(
          "INSERT INTO events(localSeq) VALUES(1),(100); DELETE FROM events WHERE localSeq=100;",
        );

        if (empty) database.exec("DELETE FROM events");
        const after = await snapshot([events("new")]);

        for (const statement of await generateMigration(before, after)) database.exec(statement);
        database.exec("INSERT INTO events DEFAULT VALUES");
        expect(
          database
            .prepare("SELECT localSeq,payload FROM events ORDER BY localSeq DESC LIMIT 1")
            .get(),
        ).toEqual({ localSeq: 101, payload: "new" });
        expect(database.prepare("SELECT count(*) AS n FROM sqlite_temp_master").get()).toEqual({
          n: 0,
        });
      } finally {
        database.close();
      }
    },
  );

  it.each([false, true])(
    "preserves a generated column made writable when nullable=%s",
    async (nullable) => {
      const generated = Column.int().pipe(Column.generated(SchemaExpression.fromSql("7")));

      const beforeTable = Table.make("records", {
        id: Column.int().pipe(Column.primaryKey),
        derived: nullable ? Column.nullable(generated) : generated,
      });

      const afterTable = Table.make("records", {
        id: Column.int().pipe(Column.primaryKey),
        derived: nullable ? Column.int().pipe(Column.nullable) : Column.int(),
      });

      const database = new DatabaseSync(":memory:");

      try {
        const before = await create([beforeTable], database);
        database.exec("INSERT INTO records(id) VALUES(1)");
        const after = await snapshot([afterTable]);

        for (const statement of await generateMigration(before, after)) database.exec(statement);
        expect(database.prepare("SELECT * FROM records").all()).toEqual([{ id: 1, derived: 7 }]);
        database.exec("UPDATE records SET derived=9");
        expect(database.prepare("SELECT derived FROM records").get()).toEqual({ derived: 9 });
      } finally {
        database.close();
      }
    },
  );

  it("rejects unsupported index options instead of dropping them", () => {
    const base = Table.make("records", { id: Column.int() });

    const records = base.pipe(
      Index.make((t) => [t.id]).pipe(Index.named("partial"), (option) => {
        return mapOption(option, (spec) => ({ ...spec, predicate: Query.gt(base.id, 0) }));
      }),
    );

    expect(() => EffectDbSqliteSchema.toDrizzleTables([records])).toThrow(
      "Unsupported SQLite option",
    );
  });
});
