import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import sqlocal from "sqlocal/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    devtools(),

    tanstackRouter({ target: "solid", autoCodeSplitting: true }),
    cloudflare(),
    solidPlugin(),
    sqlocal(),
    tailwindcss(),
  ],
});
