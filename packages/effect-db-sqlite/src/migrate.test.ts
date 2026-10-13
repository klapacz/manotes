import { Effect, Exit } from "effect";
import { SqlClient } from "effect/sql";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { describe, expect, it } from "vite-plus/test";
import { EffectDbSqliteMigrate } from "./migrate";
import { EffectDbSqliteScript } from "./script";

const database = SqliteClient.layer({ filename: ":memory:" });

const script = (...statements: string[]) => {
  return statements.join(`;\n${EffectDbSqliteScript.statementSeparator}\n`) + ";";
};

describe("effect-db SQLite runner", () => {
  it("applies migrations once by name and rejects changes to applied SQL", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        const initial = {
          tag: "0000_initial",
          sql: script("CREATE TABLE sample (value INTEGER)", "INSERT INTO sample VALUES (1)"),
        };

        yield* EffectDbSqliteMigrate.migrate([initial]);
        yield* EffectDbSqliteMigrate.migrate([initial]);
        expect(yield* sql`SELECT * FROM sample`).toEqual([{ value: 1 }]);
        expect(yield* sql`SELECT name FROM __effectdb_migrations`).toEqual([{ name: initial.tag }]);
        expect(
          Exit.isFailure(
            yield* Effect.exit(
              EffectDbSqliteMigrate.migrate([{ ...initial, sql: script("DROP TABLE sample") }]),
            ),
          ),
        ).toBe(true);
        expect(yield* sql`SELECT * FROM sample`).toEqual([{ value: 1 }]);
      }).pipe(Effect.provide(database)),
    );
  });

  it("rolls back pending SQL and ledger writes on failure", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const initial = { tag: "0000_initial", sql: script("CREATE TABLE sample (value INTEGER)") };
        yield* EffectDbSqliteMigrate.migrate([initial]);
        const pending = { tag: "0001_pending", sql: script("INSERT INTO sample VALUES (1)") };

        const failed = yield* Effect.exit(
          EffectDbSqliteMigrate.migrate([
            initial,
            pending,
            { tag: "0002_broken", sql: "INSERT INTO missing VALUES (2)" },
          ]),
        );

        expect(Exit.isFailure(failed)).toBe(true);
        expect(yield* sql`SELECT * FROM sample`).toEqual([]);
        expect(yield* sql`SELECT name FROM __effectdb_migrations`).toEqual([{ name: initial.tag }]);
        yield* EffectDbSqliteMigrate.migrate([initial, pending]);
        expect(yield* sql`SELECT * FROM sample`).toEqual([{ value: 1 }]);
      }).pipe(Effect.provide(database)),
    );
  });

  it("rejects duplicate names and calls from inside a transaction", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const initial = { tag: "0000_initial", sql: "CREATE TABLE sample (value INTEGER)" };
        expect(
          Exit.isFailure(yield* Effect.exit(EffectDbSqliteMigrate.migrate([initial, initial]))),
        ).toBe(true);
        expect(
          Exit.isFailure(
            yield* Effect.exit(sql.withTransaction(EffectDbSqliteMigrate.migrate([initial]))),
          ),
        ).toBe(true);
      }).pipe(Effect.provide(database)),
    );
  });

  it("does not split SQL strings or comments containing the separator", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* EffectDbSqliteMigrate.migrate([
          {
            tag: "0000_initial",
            sql: script(
              `CREATE TABLE sample (value TEXT DEFAULT '${EffectDbSqliteScript.statementSeparator}')`,
              "INSERT INTO sample DEFAULT VALUES",
            ),
          },
        ]);
        expect(yield* sql`SELECT * FROM sample`).toEqual([
          { value: EffectDbSqliteScript.statementSeparator },
        ]);
      }).pipe(Effect.provide(database)),
    );
  });
});
