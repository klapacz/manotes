import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      dev: { command: "alchemy dev --env-file .env.local" },
      deploy: {
        command: "alchemy deploy --env-file .env.prod --stage prod",
        dependsOn: ["@manotes/shared#build", "@manotes/sql-sqlite-wasm#build"],
      },
    },
  },
});
