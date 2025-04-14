import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./worker/do/schema.ts",
  out: "./migrations/graph-do",
  dialect: "sqlite",
  casing: "snake_case",
  driver: "durable-sqlite",
});
