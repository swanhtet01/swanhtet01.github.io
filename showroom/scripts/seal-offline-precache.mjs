// Seals the service worker's precache list into dist/sw.js after the Vite build.
//
// Why this exists. The worker is generated before the build (tools/write_app_release_metadata.mjs
// writes it into public-app/), so it cannot know the hashed chunk names. It used to compensate by
// scraping /assets/ URLs out of the cached index.html, which only ever finds the entry graph.
// /shop/ and /plant/ are a lazy chunk, so the till itself was never precached: a first-run offline
// open of the counter failed, and the RouteErrorBoundary told the operator to reload -- advice that
// cannot work offline. This script closes that by reading Vite's own manifest and injecting the
// real files, so the list cannot drift from the build the way a hand-kept route list does.
//
// WHAT IS PRECACHED. Install-time precache is bytes a shop pays for on a metered connection, so
// the set is chosen rather than swept -- but it is chosen by EXCLUSION, not by inclusion. Two roots
// (the document entry and the operations chunk) contribute their full static graphs plus one level
// of their dynamic imports, and a named list below drops the surfaces that cannot work offline
// anyway. That polarity is deliberate: forgetting to update an exclusion list costs bytes, while
// forgetting to update an inclusion list silently breaks offline -- which is precisely the bug
// being fixed here. A new lazy screen is therefore offline-capable by default.
//
// What that yields: the app shell and its chrome (including the product switcher and workspace
// status panel, which render on every screen), the `core-app` chunk -- /shop/ and /plant/, the till
// and the shop floor -- and the nine lazy screens the operations route owns (Today, Sell, Orders,
// Stock, the receipt dialog, the service schedule, the monthly statement, the channel intake, the
// Plant order board). About 1.9 MB uncompressed, roughly 480 KB over the wire.
//
// What the exclusions drop, and why each one: Website and Ecommerce (publishing a site and serving
// a storefront both require a network by definition), Settings, product onboarding, login, signup
// and account recovery (first-run and managed-workspace surfaces, done once and online), and the
// ecommerce buying-lifecycle model that Shop pulls in only to review an incoming online order.
// Together they are roughly another megabyte, more than half the app, for paths a shop cannot
// exercise with the internet down. All of them still cache opportunistically on first visit through
// the worker's /assets/ handler, so they work offline afterwards -- they are just not paid for up
// front.
//
// Every failure here is fatal. A precache that silently seals an empty or partial list is exactly
// the bug this script was written to end.

import { readFile, writeFile, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const showroomRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(showroomRoot, 'dist')
const viteDir = resolve(distDir, '.vite')
const manifestPath = resolve(viteDir, 'manifest.json')
const swPath = resolve(distDir, 'sw.js')

// The roots. `index.html` is Vite's entry key; `core-app` is the manualChunks name declared in
// vite.config.ts for CoreApp.tsx + OperationsPageRoute.tsx, and tools/verify_app_build.mjs already
// pins that same name as the operations route artifact. Both are resolved against the manifest and
// a miss is fatal, so a rename cannot quietly drop a route out of the offline set.
const OFFLINE_ENTRY_KEYS = ['index.html']
const OFFLINE_CHUNK_NAMES = ['core-app']

// Surfaces that are NOT worth the install-time bytes because they cannot be used with the internet
// down. Entries are manifest module keys or chunk names; every one must still resolve, so a stale
// name fails the build rather than silently excluding nothing. See the header for the reasoning.
const ONLINE_ONLY = [
  'src/core/SettingsPage.tsx',
  'src/core/ProductOnboardingPage.tsx',
  'src/core/WorkspaceControlsPage.tsx',
  'src/core/ManagedLoginPage.tsx',
  'src/core/ManagedAccountPage.tsx',
  'src/core/SignupPage.tsx',
  // Shop pulls this in only to review an order that arrived through the online storefront.
  'ecommerce-buying-lifecycle',
]
// The other three products' own surfaces, by location rather than by name, so a product added
// later is excluded without anyone having to remember this file.
const ONLINE_ONLY_PREFIX = 'src/products/'

function fail(reason) {
  console.error(`offline precache seal failed: ${reason}`)
  process.exit(1)
}

const manifestSource = await readFile(manifestPath, 'utf8').catch(() => null)
if (manifestSource === null) fail(`missing Vite manifest at ${manifestPath} -- build.manifest must stay enabled in vite.config.ts`)
const manifest = JSON.parse(manifestSource)

const keysByChunkName = new Map()
for (const [key, entry] of Object.entries(manifest)) {
  if (entry.name) keysByChunkName.set(entry.name, key)
}

const entryKeys = []
for (const key of OFFLINE_ENTRY_KEYS) {
  if (!manifest[key]) fail(`declared offline entry "${key}" is not in the Vite manifest`)
  entryKeys.push(key)
}
const chunkRootKeys = []
for (const name of OFFLINE_CHUNK_NAMES) {
  const key = keysByChunkName.get(name)
  if (!key) fail(`declared offline chunk "${name}" is not in the Vite manifest -- if it was renamed in vite.config.ts, rename it here in the same commit`)
  chunkRootKeys.push(key)
}

const excludedKeys = new Set()
for (const name of ONLINE_ONLY) {
  const key = manifest[name] ? name : keysByChunkName.get(name)
  if (!key) fail(`online-only exclusion "${name}" matches nothing in the Vite manifest -- remove it or correct it`)
  excludedKeys.add(key)
}
const isOnlineOnly = (key) => excludedKeys.has(key) || key.startsWith(ONLINE_ONLY_PREFIX)

const files = new Set()
const visited = new Set()

// Static imports only, transitively. Nothing here follows a dynamic import, so walking a key can
// never pull in a lazy surface that was not asked for at the root level.
function collectStatic(key) {
  if (visited.has(key)) return
  visited.add(key)
  const entry = manifest[key]
  if (!entry) fail(`manifest entry "${key}" is referenced but absent`)
  if (entry.file) files.add(entry.file)
  for (const css of entry.css ?? []) files.add(css)
  for (const asset of entry.assets ?? []) files.add(asset)
  for (const staticImport of entry.imports ?? []) collectStatic(staticImport)
}

// Each root contributes its static graph plus exactly one level of its own dynamic imports, minus
// the online-only surfaces. One level is enough because it reaches every screen the shell and the
// operations route render directly; going deeper would follow those screens' own lazy branches
// into the rest of the app.
for (const key of [...entryKeys, ...chunkRootKeys]) {
  collectStatic(key)
  for (const dynamicImport of manifest[key].dynamicImports ?? []) {
    if (!isOnlineOnly(dynamicImport)) collectStatic(dynamicImport)
  }
}

const precache = [...files].map((file) => `/${file}`).sort()
if (!precache.length) fail('resolved an empty precache list')

// A precached URL that is not on disk would reject cache.addAll() at install time and leave every
// device stuck on its previous worker. Catch it here instead.
for (const url of precache) {
  const onDisk = await stat(resolve(distDir, url.slice(1))).catch(() => null)
  if (!onDisk?.isFile()) fail(`precache names ${url}, which is not a file in dist/`)
}

// The check the missing till would have tripped: every /assets/ URL the built document references
// must be in the precache list. The worker no longer scrapes the document at runtime, so this is
// what guarantees the shell it falls back to can actually boot.
const indexSource = await readFile(resolve(distDir, 'index.html'), 'utf8')
const referenced = [...indexSource.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1])
if (!referenced.length) fail('built index.html references no /assets/ URL')
for (const url of referenced) {
  if (!precache.includes(url)) fail(`built index.html loads ${url} but the precache list omits it`)
}
// And the route this whole script exists for.
if (!precache.some((url) => /^\/assets\/core-app-[^/]+\.js$/.test(url))) {
  fail('the Shop/Plant operations route chunk (core-app) is not in the precache list')
}

// The cache name carries this digest, so it must move whenever anything the worker precaches
// moves. The asset list covers the hashed files; index.html is folded in because it is the one
// precached file whose content can change while every asset hash stays the same, and the worker
// never refreshes '/' outside install.
const build = createHash('sha256')
  .update(precache.join('\n'))
  .update('\0')
  .update(indexSource)
  .digest('hex')
  .slice(0, 16)

const BUILD_PLACEHOLDER = 'unsealed__SUPERMEGA_PRECACHE_BUILD__'
const FILES_PLACEHOLDER = '[] /* __SUPERMEGA_PRECACHE_FILES__ */'
let swSource = await readFile(swPath, 'utf8').catch(() => null)
if (swSource === null) fail(`missing ${swPath} -- run tools/write_app_release_metadata.mjs before the build`)
if (!swSource.includes(FILES_PLACEHOLDER)) fail(`sw.js has no ${FILES_PLACEHOLDER} placeholder`)
if (!swSource.includes(BUILD_PLACEHOLDER)) fail(`sw.js has no ${BUILD_PLACEHOLDER} placeholder`)
swSource = swSource
  .replace(BUILD_PLACEHOLDER, build)
  .replace(FILES_PLACEHOLDER, JSON.stringify(precache, null, 2))
await writeFile(swPath, swSource, 'utf8')

// The manifest was a build input, not a deliverable: it would ship a full map of the chunk graph
// and count against the artifact byte budget for nothing.
await rm(viteDir, { recursive: true, force: true })

const bytes = (await Promise.all(precache.map(async (url) => (await stat(resolve(distDir, url.slice(1)))).size)))
  .reduce((total, size) => total + size, 0)
console.log(JSON.stringify({ ok: true, contract: 'supermega_offline_precache', build, files: precache.length, bytes }))
