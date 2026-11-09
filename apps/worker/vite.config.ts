import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      dev: {
        command: "alchemy dev --env-file .env.local",
        cache: false,
      },
      deploy: {
        command: 'alchemy deploy --env-file "$PWD/.env.prod" --stage dune',
        dependsOn: ["@manotes/shared#build", "@manotes/sql-sqlite-wasm#build"],
        cache: false,
      },
    },
  },
});
