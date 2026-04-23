import { defineConfig } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  optimizeDeps: {
    exclude: ["wa-sqlite"],
  },
  envDir: "../..",
  plugins: [
    devtools(),

    tanstackRouter({ target: "solid", autoCodeSplitting: false }),
    cloudflare({ configPath: "../worker/wrangler.jsonc" }),
    solidPlugin(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // Skip web app manifest — this is not a installable PWA, just offline caching
      manifest: false,
      // Skip auto-injecting registration script into index.html; we do it manually in main.tsx
      injectRegister: false,
      // In dev the cloudflare plugin serves requests through its own local worker emulation.
      // Running the SW on top of that would layer two interceptors and break /api/* proxying.
      devOptions: { enabled: false },
      injectManifest: {
        // The cloudflare plugin outputs client assets to dist/client/, not dist/.
        // workbox-build's injectManifest scans globDirectory to build __WB_MANIFEST,
        // so this must point at the actual client output directory.
        globDirectory: "dist/client",
        globPatterns: ["**/*.{js,css,html,wasm,woff,woff2}"],
      },
    }),
  ],
});
