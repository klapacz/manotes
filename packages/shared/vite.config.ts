import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "vp pack",
        dependsOn: ["@manotes/effect-qb-sqlite#build"],
      },
    },
  },
  pack: {
    entry: ["src/**/*.ts", "!src/**/*.test.ts"],
    dts: true,
    exports: true,
    deps: { neverBundle: true },
  },
});
