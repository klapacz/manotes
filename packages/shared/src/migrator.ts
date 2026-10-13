import { EffectDbSqliteMigrate } from "@manotes/effect-db-sqlite/migrate";

export const migrate = EffectDbSqliteMigrate.migrate;

export type Migration = EffectDbSqliteMigrate.Migration;

export * as Migrator from "./migrator";
