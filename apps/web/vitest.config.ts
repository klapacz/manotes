import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.{test,spec}.ts", "src/**/*.{test,spec}.tsx"],
          exclude: ["node_modules/**", "src/lib/atom-bridge.test.ts"],
        },
      },
      {
        resolve: {
          conditions: ["browser", "development"],
        },
        ssr: {
          resolve: {
            conditions: ["browser", "development"],
          },
        },
        test: {
          name: "solid-client",
          environment: "node",
          server: {
            deps: {
              inline: ["solid-js"],
            },
          },
          include: ["src/lib/atom-bridge.test.ts"],
        },
      },
    ],
  },
});
