import { DevEnv } from "@manotes/shared/dev-env";
import { PortSchema } from "@manotes/shared/schema/port";
import { defineConfig } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import solidPlugin from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    origin: process.env[DevEnv.names.url],
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${PortSchema.decode(process.env[DevEnv.names.apiPort]) ?? 3000}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    rolldownOptions: {
      // Keep the larger SDK out of the main chunk so SW assets stay below its 2 MiB limit.
      output: { codeSplitting: { groups: [{ name: "ui-sdk", test: /@ui-sdk/ }] } },
    },
  },
  optimizeDeps: {
    // SDK contexts must share one module; Virtua's source JSX needs the Solid compiler.
    exclude: ["wa-sqlite", "@ui-sdk/core", "@manotes/virtua-solid2-source"],
  },
  envDir: "../..",
  plugins: [
    devtools(),

    tanstackRouter({ target: "solid", autoCodeSplitting: false }),
    solidPlugin({ diagnostics: true }),
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
        // Use the plugin's default absolute directory from Vite's resolved outDir.
        // Alchemy builds into dist/client; standalone Vite builds into dist.
        globPatterns: ["**/*.{js,css,html,wasm,woff,woff2}"],
      },
    }),
  ],
});
