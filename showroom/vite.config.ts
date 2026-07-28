import type { IncomingMessage, ServerResponse } from 'node:http'
import { realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = realpathSync(dirname(fileURLToPath(import.meta.url)))
const localApi = process.env.SUPERMEGA_LOCAL_API?.trim()
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
  cacheDir: resolve(projectRoot, 'node_modules/.vite'),
  plugins: [react(), localHealthPlugin()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react-router/')
            || id.includes('/node_modules/react-router-dom/')) {
            return 'router'
          }
          if (id.includes('/src/core/commerce-workspace.ts')
            || id.includes('/src/core/production-workspace.ts')
            || id.includes('/src/core/channel-order-intake.ts')
            || id.includes('/src/core/managed-trial.ts')
            || id.includes('/src/core/team-work.ts')) {
            return 'operating-models'
          }
          if (id.includes('/src/core/CoreApp.tsx')) {
            return 'core-app'
          }
        },
      },
    },
  },
})
