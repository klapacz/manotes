import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db.tables.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
