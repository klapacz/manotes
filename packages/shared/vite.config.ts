import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: "src/**/*.ts",
    dts: { tsgo: true },
    exports: true,
  },
});
