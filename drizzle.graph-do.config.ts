import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./worker/do/schema.ts",
  out: "./migrations/graph-do",
  dialect: "sqlite",
  driver: "durable-sqlite",
});
