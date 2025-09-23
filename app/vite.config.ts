import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  publicDir: 'public',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      '@sim_kernels': '/Users/masonyarbrough/dev/LCR-Automata/sim_kernels',
    },
  },
  server: {
    fs: {
      allow: ['/Users/masonyarbrough/dev/LCR-Automata'],
    },
  },
  plugins: [react(), tailwindcss()],
})
