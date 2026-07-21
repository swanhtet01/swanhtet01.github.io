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
  <rect x="2.5" y="2.5" width="59" height="59" rx="12" fill="#090d13" />
  <rect x="3.25" y="3.25" width="57.5" height="57.5" rx="11.25" fill="none" stroke="#fff" stroke-opacity=".18" />
  <path d="M15 19 29 32 15 45" fill="none" stroke="#6b95ff" stroke-width="4.25" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M36 45h14" fill="none" stroke="#3dd6a2" stroke-width="4.25" stroke-linecap="round" />
</svg>
`
const webmanifest = {
  name: 'SuperMega Operating Workspace',
  short_name: 'SuperMega',
  description: 'Shop and Plant operating software with governed assistance.',
  start_url: '/',
  display: 'standalone',
  background_color: '#090d13',
  theme_color: '#090d13',
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
