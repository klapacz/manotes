import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      dev: {
        command: "alchemy dev --env-file .env.local",
        // These are set by flake.nix so workerd can verify Cloudflare TLS certs.
        // vite-plus tasks only receive env vars explicitly listed here.
        untrackedEnv: ["SSL_CERT_FILE", "NIX_SSL_CERT_FILE"],
      },
      deploy: {
        command: "alchemy deploy --env-file .env.prod --stage prod",
        dependsOn: ["@manotes/shared#build", "@manotes/sql-sqlite-wasm#build"],
      },
    },
  },
});
