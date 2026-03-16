import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig({
  optimizeDeps: {
    exclude: ["wa-sqlite"],
  },
  plugins: [
    devtools(),

    tanstackRouter({ target: "solid", autoCodeSplitting: true }),
    cloudflare(),
    solidPlugin(),
    tailwindcss(),
  ],
});
