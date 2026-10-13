import { EffectDbSqliteConfig } from "effect-db/sqlite";

export default EffectDbSqliteConfig.defineConfig({
  dialect: "sqlite",
  source: { include: ["./src/db.tables.ts"] },
  migrations: { dir: "./migrations" },
});
