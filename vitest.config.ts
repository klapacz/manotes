import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true, // Required for the jest-prosemirror to work
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
