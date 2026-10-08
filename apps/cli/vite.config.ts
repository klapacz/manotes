import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: "src/cli.ts",
    platform: "node",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
