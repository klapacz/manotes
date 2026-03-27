import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "src/**/*.{test,spec}.tsx"],
    exclude: ["node_modules/**"],
  },
});
