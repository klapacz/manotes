import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";

const execute = promisify(execFile);

describe("Drizzle-backed effectdb SQLite CLI", () => {
  it("generates folders offline, supports renames and applies migrations once", async () => {
    const directory = await mkdtemp(resolve("packages/effect-db-sqlite/.test-"));
    const cli = resolve("node_modules/effect-db/dist/cli.js");
    const databaseFile = join(directory, "records.sqlite");

    try {
      const config = (file: string, rename = false) => {
        return writeFile(
          join(directory, "effectdb.config.ts"),
          `import { EffectDbSqliteConfig } from "effect-db/sqlite";
export default EffectDbSqliteConfig.defineConfig({dialect:"sqlite",source:{include:["./${file}"]},migrations:{dir:"./migrations"}${rename ? ',renames:{columns:{records:{title:"label"}}}' : ""}});`,
        );
      };

      await config("initial.ts");
      await writeFile(
        join(directory, "initial.ts"),
        `import { Column, Table } from "effect-qb";
export const records = Table.make("records",{id:Column.int().pipe(Column.primaryKey),title:Column.text()});`,
      );

      const run = (...args: string[]) => {
        return execute(process.execPath, [cli, "migrate", ...args], { cwd: directory });
      };

      await run("generate", "--name", "z_initial");
      const [initial] = await readdir(join(directory, "migrations"));
      expect(initial).toMatch(/^\d{14}_z_initial$/);
      expect(await readdir(join(directory, "migrations", initial!))).toEqual([
        "migration.sql",
        "snapshot.json",
      ]);
      const up = () => run("up", "--database", databaseFile);
      await up();
      await up();
      let database = new DatabaseSync(databaseFile);
      database.exec("INSERT INTO records VALUES(1,'kept')");
      expect(database.prepare("SELECT count(*) AS n FROM __effectdb_migrations").get()).toEqual({
        n: 1,
      });
      database.close();
      expect((await run("generate")).stdout).toContain("No schema changes");
      await config("next.ts", true);
      await writeFile(
        join(directory, "next.ts"),
        `import { Column, Table } from "effect-qb";
export const records = Table.make("records",{id:Column.int().pipe(Column.primaryKey),label:Column.text()});`,
      );
      await run("generate", "--name", "a_rename");
      await up();
      database = new DatabaseSync(databaseFile);
      expect(database.prepare("SELECT * FROM records").all()).toEqual([{ id: 1, label: "kept" }]);
      database.close();
      const folders = await readdir(join(directory, "migrations"));
      expect(folders).toHaveLength(2);
      expect(
        await readFile(join(directory, "migrations", initial!, "migration.sql"), "utf8"),
      ).toContain("CREATE TABLE");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
