import { defineConfig } from 'vite'
import { realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const projectRoot = realpathSync(dirname(fileURLToPath(import.meta.url)))

// https://vite.dev/config/
export default defineConfig({
  root: projectRoot,
  publicDir: resolve(projectRoot, 'public'),
  cacheDir: resolve(projectRoot, 'node_modules/.vite'),
  plugins: [react(), tailwindcss()],
})
