import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMigrationFiles } from "effect-db/postgres/migrate";
import { expect, it } from "vite-plus/test";

it("preserves effect-db migration checksums and provides Effect 4.1 crypto", async () => {
  const directory = await mkdtemp(join(tmpdir(), "manotes-effect-db-"));
  const contents = "CREATE TABLE compatibility (id integer);\n";

  try {
    await writeFile(join(directory, "001.sql"), contents);
    await writeFile(join(directory, "002.sql"), contents.replaceAll("\n", "\r\n"));
    const migrations = await readMigrationFiles(directory);
    const checksum = `sha256:${createHash("sha256").update(contents).digest("hex")}`;

    expect(migrations.map(({ name, checksum }) => ({ name, checksum }))).toEqual([
      { name: "001.sql", checksum },
      { name: "002.sql", checksum },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
