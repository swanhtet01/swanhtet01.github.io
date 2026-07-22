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
  name: 'SuperMega Company OS',
  short_name: 'SuperMega',
  description: 'Company operations and governed agents in one accountable system.',
  start_url: '/',
  display: 'standalone',
  background_color: manifest.brand.colors.background,
  theme_color: manifest.brand.colors.background,
  icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
}

const publicDir = resolve(root, 'showroom', 'public-app')
await mkdir(publicDir, { recursive: true })
await Promise.all([
  writeFile(resolve(publicDir, '__release.json'), `${JSON.stringify(release, null, 2)}\n`, 'utf8'),
  writeFile(resolve(publicDir, 'favicon.svg'), favicon, 'utf8'),
  writeFile(resolve(publicDir, 'site.webmanifest'), `${JSON.stringify(webmanifest, null, 2)}\n`, 'utf8'),
])
console.log(JSON.stringify({ ok: true, contract: 'supermega_app_release', commit: release.commit }))
