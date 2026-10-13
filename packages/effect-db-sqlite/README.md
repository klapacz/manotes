# effect-db SQLite migrations

The effect-db 0.24.1 bridge patch delegates SQLite `migrate generate` and `migrate up` to this package. QB is the sole maintained schema. A generation-only adapter creates Drizzle declarations, then Drizzle Kit 1.0.0-rc.4 owns planning, snapshots, SQL and migration folders. Application queries still use QB; the browser-safe `/migrate` entry uses only Effect SQL.

```ts
import { EffectDbSqliteConfig } from "effect-db/sqlite";

export default EffectDbSqliteConfig.defineConfig({
  dialect: "sqlite",
  source: { include: ["./src/db.tables.ts"] },
  migrations: { dir: "./migrations" },
});
```

```sh
scripts/nix-develop -c pnpm --filter @manotes/effect-db-sqlite build
scripts/nix-develop -c pnpm --filter @manotes/shared build
scripts/nix-develop -c pnpm exec effectdb migrate generate --config apps/cli/effectdb.config.ts --name add_priority
scripts/nix-develop -c pnpm exec effectdb migrate up --config apps/cli/effectdb.config.ts --database ./graph.sqlite
```

Use `apps/web/effectdb.config.ts` for the web schema. Generation needs no live database. The adapter validates QB DDL in a disposable in-memory SQLite database, and Kit compares declarations with saved snapshots. Each timestamped migration folder contains `migration.sql` and `snapshot.json`; there is no journal or separate metadata directory. Both apps load these SQL files in folder order. Generate serially; the wrapper waits out timestamp collisions and rejects future-dated history after a clock rollback. Database paths are relative to the current directory.

Renames are explicit and translated into Kit hints:

```ts
renames: {
  tables: { old_records: "records" },
  columns: { records: { old_title: "title" } },
}
```

Column maps use the destination table name. Remove rename hints after generation. Unresolved ambiguity fails with Kit's structured `missing_hints` response. `--dry-run` delegates to Kit's explain mode. Review generated SQL before applying, particularly drops and changed constraints.

The adapter supports defaults, primary and unique keys, ordinary indexes, foreign keys, checks and stored generated columns. It rejects casing overrides, expression/partial/covering indexes, deferred constraints and unsupported SQLite options instead of discarding them. QB table metadata and rendering use internal APIs; check adapter regressions on upgrades. Drizzle's public schema builders and SDK own its snapshot format.

The runner owns `__effectdb_migrations`, identifies applied migrations by folder name and checks SHA-256 checksums. Pending SQL and ledger writes run in one transaction. Edited applied files, duplicate names and calls inside an existing transaction fail. There is no Drizzle history import or baseline support; initialize a fresh database with this migration history.

The [Drizzle Kit patch](../../patches/README.md) preserves `sqlite_sequence` across AUTOINCREMENT rebuilds, including empty tables, so `events.localSeq` does not reuse deleted IDs. It also retains generated values when a column becomes writable. Remove it when these regressions pass against an unpatched upstream release.

Foreign-key rebuild handling is deliberately deferred. Kit emits `PRAGMA foreign_keys=OFF` inside the runner's transaction, where SQLite ignores it; rebuilding a referenced parent can cascade-delete children. Current Manotes tables have no foreign keys. Fix that execution boundary before introducing cascading references. Custom triggers/views and implicit row IDs have no additional preservation logic here.
