import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

import tailwind from "@astrojs/tailwind";

import react from "@astrojs/react";

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
    tailwind({
      applyBaseStyles: false,
    }),
    // Exclude .ts files because they may include decorators which are not supported by astro
    react({ include: ["**/*.tsx"] }),
  ],

  vite: {
    optimizeDeps: {
      exclude: ["sqlocal"], // https://sqlocal.dallashoffman.com/guide/setup#vite-configuration
    },
  },
});
