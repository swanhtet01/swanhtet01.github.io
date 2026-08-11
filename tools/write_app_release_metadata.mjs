import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(await readFile(resolve(root, 'site-manifest.json'), 'utf8'))
const commit = String(process.env.SUPERMEGA_RELEASE_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || 'local').trim()
const release = {
  service: 'supermega-app',
  commit,
  brandVersion: manifest.brand.version,
  contextVersion: manifest.contextVersion,
  catalogVersion: manifest.catalogVersion,
  canonicalDomain: 'https://app.supermega.dev',
  generatedAt: new Date().toISOString(),
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="SuperMega terminal mark" shape-rendering="geometricPrecision">
  <rect width="64" height="64" rx="8" fill="${manifest.brand.colors.background}" />
  <rect x="1" y="1" width="62" height="62" rx="7" fill="none" stroke="${manifest.brand.colors.ink}" stroke-opacity=".16" />
  <path d="M13 18 27 32 13 46" fill="none" stroke="${manifest.brand.colors.accent}" stroke-width="4.5" stroke-linecap="square" stroke-linejoin="miter" />
  <path d="M34 46h17" fill="none" stroke="${manifest.brand.colors.ink}" stroke-width="4.5" stroke-linecap="square" />
</svg>
`
const webmanifest = {
  name: manifest.brand.name,
  short_name: manifest.brand.name,
  description: manifest.company.supporting,
  start_url: '/',
  display: 'standalone',
  background_color: manifest.brand.colors.background,
  theme_color: manifest.brand.colors.background,
  icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
}

const cacheKey = `supermega-app-${manifest.brand.version}`
const serviceWorker = `const CACHE = '${cacheKey}'

async function precacheAll() {
  const cache = await caches.open(CACHE)
  await cache.addAll(['/', '/favicon.svg', '/site.webmanifest'])
  const indexResp = await caches.match('/')
  if (!indexResp) return
  const html = await indexResp.text()
  const assets = [
    ...[...html.matchAll(/src="(\\/assets\\/[^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/href="(\\/assets\\/[^"]+)"/g)].map((m) => m[1]),
  ]
  if (assets.length) await cache.addAll(assets)
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAll())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const { pathname } = new URL(request.url)
  if (pathname.startsWith('/api/')) return
  if (pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((resp) => {
        const clone = resp.clone()
        caches.open(CACHE).then((cache) => cache.put(request, clone))
        return resp
      }))
    )
    return
  }
  event.respondWith(
    fetch(request)
      .then((resp) => {
        const clone = resp.clone()
        caches.open(CACHE).then((cache) => cache.put(request, clone))
        return resp
      })
      .catch(() => caches.match(request))
  )
})
`

const publicDir = resolve(root, 'showroom', 'public-app')
await mkdir(publicDir, { recursive: true })
await Promise.all([
  writeFile(resolve(publicDir, '__release.json'), `${JSON.stringify(release, null, 2)}\n`, 'utf8'),
  writeFile(resolve(publicDir, 'favicon.svg'), favicon, 'utf8'),
  writeFile(resolve(publicDir, 'site.webmanifest'), `${JSON.stringify(webmanifest, null, 2)}\n`, 'utf8'),
  writeFile(resolve(publicDir, 'sw.js'), serviceWorker, 'utf8'),
])
console.log(JSON.stringify({ ok: true, contract: 'supermega_app_release', commit: release.commit }))
