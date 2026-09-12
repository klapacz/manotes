import { defineConfig } from "vite-plus";
import { antiSlopRules } from "./tools/oxlint/anti-slop.config.ts";

export default defineConfig({
  // oxfmt doesn't support nested configs yet
  fmt: {
    ignorePatterns: [
      "apps/web/drizzle/meta/**",
      "apps/worker/worker-configuration.d.ts",
      ".workspace/**",
      ".agents/**",
      ".pi/**",
      "tools/oxlint/anti-slop/**",
    ],
  },
  lint: {
    ignorePatterns: [".workspace/**", ".agents/**", ".pi/**", "tools/oxlint/anti-slop/**"],
    options: { typeAware: true, typeCheck: true },
    jsPlugins: [
      { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
      { name: "anti-slop-effect", specifier: "./tools/oxlint/anti-slop/effect/index.ts" },
    ],
    rules: antiSlopRules,
  },
  test: {
    exclude: ["**/node_modules/**", ".reference/**", ".opencode/**", ".direnv", ".workspace/**"],
  },
});
