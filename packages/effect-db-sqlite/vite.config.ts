import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/cli.ts", "src/migrate.ts", "src/files.ts"],
    platform: "node",
    dts: true,
    deps: { neverBundle: true },
  },
});
