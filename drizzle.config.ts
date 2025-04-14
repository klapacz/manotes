import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./worker/db/schema",
  out: "./migrations/d1",
  casing: "snake_case",
  dialect: "sqlite",
  driver: "d1-http",
});
