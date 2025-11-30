import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import solidPlugin from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    devtools(),

    TanStackRouterVite({ target: 'solid', autoCodeSplitting: true }),
    solidPlugin(),
    tailwindcss(),
  ],
})
