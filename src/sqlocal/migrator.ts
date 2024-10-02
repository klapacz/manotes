import { Migrator } from "kysely";
import { db } from "./client";

export const migrator = new Migrator({
  db,
  provider: {
    async getMigrations() {
      const { migrations } = await import("./migrations/");
      return migrations;
    },
  },
});
