import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db.tables.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
