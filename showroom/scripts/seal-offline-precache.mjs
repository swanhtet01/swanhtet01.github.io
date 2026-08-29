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
// being fixed here. A new lazy screen hung off either root is therefore offline-capable by
// default. The walk is ONE level deep, though, so a lazy() added INSIDE one of those screens is
// not covered by that default -- the check near the bottom of this file fails the build on
// exactly that case rather than letting it become another silent hole.
//
// What that yields: the app shell and its chrome (including the product switcher and workspace
// status panel, which render on every screen), the `core-app` chunk -- /shop/ and /plant/, the till
// and the shop floor -- and the lazy screens the operations route owns (Today, Sell, Orders,
// Stock, the receipt dialog, the service schedule, the monthly statement, the channel intake, the
// Plant order board), plus the explicitly requested synthetic bakery demo and real local Batch
// first-use workflow opened from Today.
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
import { writeSync } from 'node:fs'
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
const OFFLINE_CHUNK_NAMES = [
  'core-app',
  'shop-bakery-demo-loader',
  'shop-batch-profit-control-first-use',
]

// Surfaces that are NOT worth the install-time bytes: either they need a network to do anything,
// or they are one-time setup a shop does once, on connectivity, and never again during a shift.
// None of them stop working offline -- they cache on first visit like anything else -- they are
// just not paid for up front. Entries are manifest module keys or chunk names; every one must
// still resolve, so a stale name fails the build rather than silently excluding nothing.
const ONLINE_ONLY = [
  'src/core/SettingsPage.tsx',
  'src/core/ProductOnboardingPage.tsx',
  'src/core/WorkspaceControlsPage.tsx',
  'src/core/ManagedLoginPage.tsx',
  'src/core/ManagedAccountPage.tsx',
  'src/core/SignupPage.tsx',
  // The "data tools" panel behind the product switcher: a client's catalog/CSV import, run once
  // while setting a shop up. Flagged by the two-levels-deep check below rather than by hand.
  'src/core/ClientDataOnboarding.tsx',
  // Shop pulls this in only to review an order that arrived through the online storefront.
  'ecommerce-buying-lifecycle',
]
// Vite records dependencies reached through the workspace's node_modules junction with an
// installation-specific relative prefix. Match the stable package suffix instead of sealing one
// machine's path into this contract. The browser ships only Supabase Auth; it cannot operate
// without the network and its responses must never become install-time offline assets.
const ONLINE_ONLY_SUFFIXES = [
  '/@supabase/auth-js/dist/module/index.js',
]
// The other three products' own surfaces, by location rather than by name, so a product added
// later is excluded without anyone having to remember this file.
const ONLINE_ONLY_PREFIX = 'src/products/'

function fail(reason) {
  // Written synchronously. build-showroom.mjs runs this with stdio 'inherit', so in CI stderr is a
  // pipe, where console.error is asynchronous and process.exit can truncate it -- turning a fatal
  // seal error into a bare non-zero exit with no reason, which is the opposite of the point.
  writeSync(2, `offline precache seal failed: ${reason}\n`)
  process.exit(1)
}

const manifestSource = await readFile(manifestPath, 'utf8').catch(() => null)
if (manifestSource === null) fail(`missing Vite manifest at ${manifestPath} -- build.manifest must stay enabled in vite.config.ts`)
const manifest = JSON.parse(manifestSource)

// Chunk names are NOT unique in this manifest -- `index` alone maps to three keys (the entry
// document, a shared chunk, and supabase-js). Collecting every key per name and refusing to
// resolve an ambiguous one keeps a future collision from silently binding a declared route or
// exclusion to the wrong module, which a last-wins map would have done without any error.
const keysByChunkName = new Map()
for (const [key, entry] of Object.entries(manifest)) {
  if (!entry.name) continue
  if (!keysByChunkName.has(entry.name)) keysByChunkName.set(entry.name, [])
  keysByChunkName.get(entry.name).push(key)
}
function resolveChunkName(name, role) {
  const keys = keysByChunkName.get(name)
  if (!keys) return null
  if (keys.length > 1) fail(`${role} "${name}" is ambiguous -- ${keys.length} manifest entries share that chunk name (${keys.join(', ')}); name it by manifest key instead`)
  return keys[0]
}

const entryKeys = []
for (const key of OFFLINE_ENTRY_KEYS) {
  if (!manifest[key]) fail(`declared offline entry "${key}" is not in the Vite manifest`)
  entryKeys.push(key)
}
const chunkRootKeys = []
for (const name of OFFLINE_CHUNK_NAMES) {
  const key = resolveChunkName(name, 'declared offline chunk')
  if (!key) fail(`declared offline chunk "${name}" is not in the Vite manifest -- if it was renamed in vite.config.ts, rename it here in the same commit`)
  chunkRootKeys.push(key)
}

const excludedKeys = new Set()
for (const name of ONLINE_ONLY) {
  const key = manifest[name] ? name : resolveChunkName(name, 'online-only exclusion')
  if (!key) fail(`online-only exclusion "${name}" matches nothing in the Vite manifest -- remove it or correct it`)
  excludedKeys.add(key)
}
const isOnlineOnly = (key) => excludedKeys.has(key)
  || key.startsWith(ONLINE_ONLY_PREFIX)
  || ONLINE_ONLY_SUFFIXES.some((suffix) => key.replaceAll('\\', '/').endsWith(suffix))

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
const followedDynamicKeys = new Set()
for (const key of [...entryKeys, ...chunkRootKeys]) {
  collectStatic(key)
  for (const dynamicImport of manifest[key].dynamicImports ?? []) {
    if (isOnlineOnly(dynamicImport)) continue
    collectStatic(dynamicImport)
    followedDynamicKeys.add(dynamicImport)
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

// The one-level bound, made loud. Following dynamic imports one level reaches every screen the
// shell and the operations route render directly, but a lazy() added inside one of THOSE screens
// produces a chunk nothing here would notice -- and its first offline open would land in the route
// error boundary, which is the regression this file exists to end. Rather than quietly following
// it (which walks into the rest of the app) or quietly dropping it, refuse to seal until someone
// decides which it is.
for (const key of followedDynamicKeys) {
  for (const deeper of manifest[key].dynamicImports ?? []) {
    if (isOnlineOnly(deeper)) continue
    const deeperFile = manifest[deeper]?.file
    if (deeperFile && !files.has(deeperFile)) {
      fail(`"${deeper}" is lazily imported by the precached screen "${key}", which puts it two levels deep and outside the precache. Decide: add it to OFFLINE_CHUNK_NAMES if it must work offline, or to ONLINE_ONLY if it must not.`)
    }
  }
}

const BUILD_PLACEHOLDER = 'unsealed__SUPERMEGA_PRECACHE_BUILD__'
const FILES_PLACEHOLDER = '[] /* __SUPERMEGA_PRECACHE_FILES__ */'
let swSource = await readFile(swPath, 'utf8').catch(() => null)
if (swSource === null) fail(`missing ${swPath} -- run tools/write_app_release_metadata.mjs before the build`)
if (!swSource.includes(FILES_PLACEHOLDER)) fail(`sw.js has no ${FILES_PLACEHOLDER} placeholder`)
if (!swSource.includes(BUILD_PLACEHOLDER)) fail(`sw.js has no ${BUILD_PLACEHOLDER} placeholder`)

// The worker's SHELL list, read back out of the worker itself so there is one source of truth.
// These paths carry no content hash in their names -- /theme-restore.js, /sw-register.js, the
// icons, the webmanifest -- so nothing about them appears in the asset list above.
const shellBlock = /const SHELL = (\[[\s\S]*?\])/.exec(swSource)?.[1]
let shell = []
try { shell = JSON.parse(shellBlock ?? '') } catch { /* handled next */ }
if (!Array.isArray(shell) || !shell.length) fail('could not read the SHELL list out of sw.js')
// '/' is the built document, read above; everything else is a real file in dist/.
const shellFiles = shell.filter((url) => url !== '/').map((url) => url.slice(1))
for (const file of shellFiles) {
  const onDisk = await stat(resolve(distDir, file)).catch(() => null)
  if (!onDisk?.isFile()) fail(`SHELL names /${file}, which is not a file in dist/ -- install would reject it`)
}

// The cache name carries this digest, so it must move whenever ANYTHING the worker precaches
// changes -- otherwise the worker's bytes stay identical, the browser never re-installs it, and
// the precache freezes. That is the bug this digest exists to close, and until 2026-08-20 it was
// still open for every unhashed file: the asset list covers only the hashed chunks, so editing
// /theme-restore.js produced a byte-identical sw.js (measured). Hashing the built document and
// each shell file's CONTENTS closes it for the whole precached set, /sw-register.js included --
// which matters, because a fix to the registration script is otherwise the one thing that
// cannot ship.
const digest = createHash('sha256').update(precache.join('\n')).update('\0').update(indexSource)
for (const file of shellFiles) {
  digest.update('\0')
  digest.update(file)
  digest.update('\0')
  digest.update(await readFile(resolve(distDir, file)))
}
const build = digest.digest('hex').slice(0, 16)

swSource = swSource
  .replace(BUILD_PLACEHOLDER, build)
  .replace(FILES_PLACEHOLDER, JSON.stringify(precache, null, 2))
await writeFile(swPath, swSource, 'utf8')

// The manifest was a build input, not a deliverable: it would ship a full map of the chunk graph
// and count against the artifact byte budget for nothing. On Windows, Vite's manifest directory
// can stay briefly locked after the build process exits, so keep the removal deterministic but
// tolerate transient handle release latency.
await rm(viteDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })

const bytes = (await Promise.all(precache.map(async (url) => (await stat(resolve(distDir, url.slice(1)))).size)))
  .reduce((total, size) => total + size, 0)
console.log(JSON.stringify({ ok: true, contract: 'supermega_offline_precache', build, files: precache.length, bytes }))
