import { defineConfig } from "vite-plus";

export default defineConfig({
  // oxfmt doesn't support nested configs yet
  fmt: {
    ignorePatterns: [
      "apps/web/drizzle/meta/**",
      "apps/worker/worker-configuration.d.ts",
      ".workspace/**",
    ],
  },
  lint: {
    ignorePatterns: [".workspace/**"],
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    exclude: ["**/node_modules/**", ".reference/**", ".opencode/**", ".direnv", ".workspace/**"],
  },
});
