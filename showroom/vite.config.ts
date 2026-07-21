import { defineConfig } from 'vite'
import { realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'

const projectRoot = realpathSync(dirname(fileURLToPath(import.meta.url)))
const localApi = process.env.SUPERMEGA_LOCAL_API || 'http://127.0.0.1:8788'
const apiProxy = { '/api': { target: localApi, changeOrigin: true } }

// https://vite.dev/config/
export default defineConfig({
  root: projectRoot,
  publicDir: resolve(projectRoot, 'public-app'),
  cacheDir: resolve(projectRoot, 'node_modules/.vite'),
  plugins: [react()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
})
