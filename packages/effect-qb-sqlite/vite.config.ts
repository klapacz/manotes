import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/json.ts"],
    dts: true,
    deps: { neverBundle: true },
  },
});
