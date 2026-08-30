import type { IncomingMessage, ServerResponse } from 'node:http'
import { realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

const projectRoot = realpathSync(dirname(fileURLToPath(import.meta.url)))
const localApi = process.env.SUPERMEGA_LOCAL_API?.trim()
// Opt-in bundle visualization: `npm run build:analyze` (or ANALYZE=1 npm run build).
// Never runs by default, so app:build / app:verify stay unaffected.
const shouldAnalyzeBundle = process.env.ANALYZE === '1'
const apiProxy: Record<string, { target: string; changeOrigin: boolean }> = localApi
  ? { '/api': { target: localApi, changeOrigin: true } }
  : {}
const isolatedHealthBody = JSON.stringify({
  status: 'attention',
  service: 'supermega-local-preview',
  operating_mode: 'isolated_demo',
  enterprise_db_ready: false,
  security_ready: false,
  coverage_score: 0,
  trial_backend: {
    write_enabled: false,
    browser_service_role_exposed: false,
  },
  enterprise_activation: {
    status: 'attention',
    requirements: ['Start the canonical SuperMega API and set SUPERMEGA_LOCAL_API before testing managed workspaces.'],
    secret_values_exposed: false,
  },
})

function isolatedHealthMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) {
  if (!/^\/api\/health\/?(?:\?|$)/.test(request.url ?? '')
    || !['GET', 'HEAD'].includes(request.method ?? '')) {
    next()
    return
  }
  response.statusCode = 200
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('x-content-type-options', 'nosniff')
  response.end(request.method === 'HEAD' ? undefined : isolatedHealthBody)
}

function localHealthPlugin(): Plugin {
  return {
    name: 'supermega-local-health',
    configureServer(server) {
      if (!localApi) server.middlewares.use(isolatedHealthMiddleware)
    },
    configurePreviewServer(server) {
      if (!localApi) server.middlewares.use(isolatedHealthMiddleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  root: projectRoot,
  publicDir: resolve(projectRoot, 'public-app'),
  // Dependencies can be supplied through a read-only/junctioned node_modules on the
  // Ally release checkout. Vite's optimizer must still be able to replace its temp
  // directory atomically, so keep generated cache in this checkout's ignored .tmp
  // directory instead of trying to write through the dependency junction.
  cacheDir: resolve(projectRoot, '../.tmp/vite-cache'),
  plugins: [
    react(),
    localHealthPlugin(),
    shouldAnalyzeBundle
      ? visualizer({
          filename: resolve(projectRoot, 'dist/bundle-stats.html'),
          gzipSize: true,
          brotliSize: true,
          template: 'treemap',
        })
      : null,
  ],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  build: {
    target: 'es2022',
    // Emitted so scripts/seal-offline-precache.mjs can derive the service worker's
    // precache list from the real chunk graph instead of a hand-kept route list --
    // a hand-kept list is what left the till out of the offline cache in the first
    // place. The sealer deletes dist/.vite/ once it has read the manifest, so the
    // manifest never ships and never counts against the artifact byte budget.
    manifest: true,
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes('vite/preload-helper')) {
            return 'preload-helper'
          }
          if (id.includes('/node_modules/react-router/')
            || id.includes('/node_modules/react-router-dom/')) {
            return 'router'
          }
          if (id.includes('/src/core/commerce-workspace.ts')) {
            return 'commerce-model'
          }
          if (id.includes('/src/core/production-workspace.ts')
            || id.includes('/src/core/channel-order-intake.ts')
            || id.includes('/src/core/managed-trial.ts')
            || id.includes('/src/core/team-work.ts')) {
            return 'operating-models'
          }
          if (id.includes('/src/core/shop-production-demand.ts')
            || id.includes('/src/core/shop-demand-intelligence.ts')
            || id.includes('/src/core/shop-replenishment.ts')
            || id.includes('/src/core/shop-procurement-decision.ts')) {
            return 'shop-planning-models'
          }
          if (id.includes('/src/core/CoreApp.tsx')
            || id.includes('/src/core/OperationsPageRoute.tsx')) {
            return 'core-app'
          }
        },
      },
    },
  },
})
