import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";

import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

// https://astro.build/config
export default defineConfig({
  output: "server",

  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },

  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),

  integrations: [
    // Exclude .ts files because they may include decorators which are not supported by astro
    react({ include: ["**/*.tsx"] }),
  ],

  vite: {
    plugins: [TanStackRouterVite(), tailwindcss()],
    optimizeDeps: {
      exclude: ["sqlocal"], // https://sqlocal.dallashoffman.com/guide/setup#vite-configuration
    },
  },
});
