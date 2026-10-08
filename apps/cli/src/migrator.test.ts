import { Effect, Exit, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as DB from "@manotes/shared/db.service";
import * as Migrator from "@manotes/shared/migrator";
import { describe, expect, it } from "vite-plus/test";

const database = DB.Service.layer.pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })),
);

describe("shared migration runner", () => {
  it("applies statements in order and skips previously applied SQL by hash", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        const migrations = [
          {
            tag: "initial",
            sql: "CREATE TABLE sample (value INTEGER);--> statement-breakpoint\nINSERT INTO sample VALUES (1);",
          },
          { tag: "next", sql: "INSERT INTO sample VALUES (2);" },
        ];

        yield* Migrator.migrate(migrations);
        yield* Migrator.migrate(migrations.map((migration) => ({ ...migration, tag: "renamed" })));

        expect(yield* sql`SELECT value FROM sample ORDER BY value`).toEqual([
          { value: 1 },
          { value: 2 },
        ]);
        expect(yield* sql`SELECT name FROM _drizzle_migrations ORDER BY id`).toEqual([
          { name: "initial" },
          { name: "next" },
        ]);
      }).pipe(Effect.provide(database)),
    );
  });

  it("rolls back the entire pending batch and its journal entries on failure", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* Migrator.migrate([{ tag: "initial", sql: "CREATE TABLE sample (value INTEGER);" }]);

        const pending = { tag: "pending", sql: "INSERT INTO sample VALUES (1);" };

        const failed = yield* Effect.exit(
          Migrator.migrate([
            pending,
            { tag: "broken", sql: "INSERT INTO missing_table VALUES (2);" },
          ]),
        );

        expect(Exit.isFailure(failed)).toBe(true);
        expect(yield* sql`SELECT value FROM sample`).toEqual([]);
        expect(yield* sql`SELECT name FROM _drizzle_migrations ORDER BY id`).toEqual([
          { name: "initial" },
        ]);

        yield* Migrator.migrate([pending]);
        expect(yield* sql`SELECT value FROM sample`).toEqual([{ value: 1 }]);
      }).pipe(Effect.provide(database)),
    );
  });
});
