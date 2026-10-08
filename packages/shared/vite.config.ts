import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/**/*.ts", "!src/**/*.test.ts"],
    dts: true,
    exports: true,
    deps: { neverBundle: true },
  },
});
