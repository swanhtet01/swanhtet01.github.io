import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

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
  // Design phase 2 item 8: the vector-only favicon does not satisfy Chrome/Android
  // installability (wants a raster PNG at 192/512) and iOS ignores the manifest
  // entirely for "Add to Home Screen" (apple-touch-icon.png, linked from index.html,
  // covers that case). All four rasters are generated below from the same brand
  // colors and terminal-mark geometry as the SVG immediately above, so they can
  // never drift from it.
  icons: [
    { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

// Raster icon generation. No new dependency: a tiny supersampled rasterizer + a
// minimal PNG encoder, both pure Node (zlib for IDAT deflate, a hand-rolled CRC32 for
// chunk checksums). Renders the exact same rect/path geometry as the favicon SVG above.
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const BG = hexToRgb(manifest.brand.colors.background)
const INK = hexToRgb(manifest.brand.colors.ink)
const ACCENT = hexToRgb(manifest.brand.colors.accent)
const SS = 4 // supersample factor
const STROKE = 4.5 / 2
const SEGMENTS = [
  [13, 18, 27, 32, ACCENT],
  [27, 32, 13, 46, ACCENT],
  [34, 46, 51, 46, INK],
]

function inRoundedRect(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - r)
  const cy = Math.min(Math.max(y, r), h - r)
  const dx = x - cx, dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay
  const apx = px - ax, apy = py - ay
  const abLenSq = abx * abx + aby * aby
  let t = abLenSq === 0 ? 0 : (apx * abx + apy * aby) / abLenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * abx, cy = ay + t * aby
  const dx = px - cx, dy = py - cy
  return Math.sqrt(dx * dx + dy * dy)
}

function renderIcon(size, { maskable = false } = {}) {
  const hi = size * SS
  // maskable icons need the mark inside Android's ~80% safe zone; regular icons use
  // the full square with the source SVG's own rounded corners.
  const pad = maskable ? hi * 0.22 : 0
  const scale = (hi - pad * 2) / 64
  const buf = Buffer.alloc(hi * hi * 4)
  for (let y = 0; y < hi; y += 1) {
    for (let x = 0; x < hi; x += 1) {
      const sx = (x - pad) / scale
      const sy = (y - pad) / scale
      let color = maskable ? BG : (inRoundedRect(sx, sy, 64, 64, 8) ? BG : null)
      if (color) {
        for (const [ax, ay, bx, by, strokeColor] of SEGMENTS) {
          if (distToSegment(sx, sy, ax, ay, bx, by) <= STROKE) { color = strokeColor; break }
        }
      }
      const i = (y * hi + x) * 4
      if (color) { buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2]; buf[i + 3] = 255 }
      else buf[i + 3] = 0
    }
  }
  // box-filter downsample hi x hi -> size x size for anti-aliased edges
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const i = ((y * SS + sy) * hi + (x * SS + sx)) * 4
          const alpha = buf[i + 3]
          r += buf[i] * alpha; g += buf[i + 1] * alpha; b += buf[i + 2] * alpha; a += alpha
        }
      }
      const n = SS * SS
      const oi = (y * size + x) * 4
      if (a > 0) { out[oi] = Math.round(r / a); out[oi + 1] = Math.round(g / a); out[oi + 2] = Math.round(b / a); out[oi + 3] = Math.round(a / n) }
    }
  }
  return out
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length)
  const body = Buffer.concat([typeBuf, data])
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(body))
  return Buffer.concat([lenBuf, body, crcBuf])
}

function encodePng(pixels, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(6, 9) // color type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0 // filter type: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const idat = deflateSync(raw)
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))])
}

const rasterIcons = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-512-maskable.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
].map(([name, size, opts]) => [name, encodePng(renderIcon(size, opts), size)])

// The app shell must emit NO inline <script>. Both content policies that serve this app
// (the vercel.json response header and index.html's own meta tag) carry `script-src 'self'`
// with no hash and no nonce, so an inline script is REFUSED by the browser -- it does not
// warn, it simply never runs. That is not theoretical: the service-worker registration used
// to be inline, so `navigator.serviceWorker.register('/sw.js')` never executed, no service
// worker was ever installed, and nothing at all worked offline. Measured 2026-08-20 against
// a built dist/ in Chromium: three "Refused to execute inline script" console errors, zero
// registrations, zero caches. `tools/verify_app_deploy_workflow.mjs` already pinned the
// intended property ("the built shell emits no inline script") -- it just had nothing
// checking it. These three files restore that property; the checks now enforce it.
//
// Keep the theme key in sync with THEME_KEY in showroom/src/core/CoreShell.tsx. This runs
// as a render-blocking classic script in <head>, so it still lands before first paint and
// a returning dark-theme user does not get a light flash.
const themeRestoreScript = `try {
  if (window.localStorage.getItem('supermega-interface-theme') === 'dark') {
    document.documentElement.dataset.supermegaTheme = 'dark'
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#05080d')
  }
} catch (e) {}
`
const serviceWorkerRegisterScript = `if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
`
// Vercel Web Analytics: cookieless aggregate pageviews, no PII. Loaded dynamically because
// /_vercel/insights/ exists only on the deployment edge, never in dist/, and only on the
// production host so local/dev stays beacon-free.
const insightsScript = `if (/(^|\\.)supermega\\.dev$/.test(location.hostname)) { const insights = document.createElement('script'); insights.defer = true; insights.src = '/_vercel/insights/script.js'; document.head.append(insights) }
`

// SHELL is what the worker can name before the build exists: the document plus the icon and
// manifest files this generator writes itself. Everything hashed -- the entry chunks and the
// Shop/Plant operations route -- is sealed in post-build by
// showroom/scripts/seal-offline-precache.mjs, which reads Vite's own manifest and rewrites
// the two placeholders below. It fails the build if either placeholder is missing, so this
// worker can never ship with an empty precache list.
//
// BUILD is likewise injected post-build: a digest of the sealed precache list AND of the built
// document. It matters because the browser only re-installs a worker whose BYTES changed. The
// old cache name was `supermega-app-${brand.version}` and the worker source was otherwise
// release-independent, so a release that changed every asset hash left this file byte-identical,
// no install event fired, precacheAll() never re-ran, and the previous release's precache
// silently went stale. Deriving the cache name from the build output means each release that
// changes anything this worker serves produces a different worker, installs it, and the activate
// handler below retires exactly the superseded cache. The document is folded into the digest for
// the same reason: it is the one precached file that can change without any asset hash changing.
//
// The two placeholders are written so the UNSEALED worker is still valid JavaScript -- `vite dev`
// serves public-app/ directly, and a worker that throws on evaluation cannot be replaced by a
// later good one, which would strand a developer's machine on a stale registration. Unsealed it
// simply precaches SHELL and nothing else; tools/verify_app_build.mjs fails the artifact if either
// marker survives into dist/.
// SERVICE WORKER LIFECYCLE -- the reasoning lives here, in the generator, and NOT inside the
// template below, because the template IS the file every device downloads on install and on every
// update check. Shipping several kilobytes of prose to a metered connection would contradict the
// whole reason showroom/scripts/seal-offline-precache.mjs keeps an exclusion list. The worker
// keeps one-line pointers back to these paragraphs.
//
// [L1] skipWaiting + claim are deliberate. Waiting for every tab to close before a new worker
// activates can mean never on a shop counter that is open all day, which would keep an offline fix
// from ever reaching the device -- the exact failure this worker exists to prevent.
//
// [L2] Retention is the current release AND the one immediately before it. A tab held open across
// a deploy is still running the PREVIOUS document and still asks for the previous release's chunk
// hashes; deleting that cache on activate broke it. Measured 2026-08-20: a till left open on
// release A, then asked for a work mode it had not opened that session, landed in the route error
// boundary -- and did so even after the device dropped offline, where the old cache was the only
// thing that could have served it. Keeping one predecessor bounds storage at two generations
// (~3.9 MB) instead of the unbounded single cache this worker used to accumulate, and the
// predecessor is collected at the next release. A tab held open across TWO deploys is still
// stranded; that is the accepted residual, because the alternative is retaining every release
// forever on precisely the device we are protecting. caches.keys() resolves in creation order --
// measured in Chromium 2026-08-20: out-of-lexical-order creation preserves creation order, a
// delete does not reshuffle, and re-opening an existing cache does not move it -- so the last of
// ours that is not current is the immediate predecessor. Empty caches are skipped: install deletes
// its own cache when precaching fails, but a worker killed mid-install cannot, and retaining an
// empty leftover would evict the cache an open tab still needs.
//
// [L3] Precaching does not use addAll. addAll only rejects on a network error or a non-ok status,
// and this host rewrites every unmatched path to /index.html -- measured 2026-08-20, a deleted
// /assets/*.js answers status 200, type text/html. So if a release lands while a slow device is
// still installing the previous one, addAll would SUCCEED and fill the cache with HTML documents
// under .js URLs, which the cache-first /assets/ branch would then serve forever, online included.
// Each entry is fetched and checked instead, still all-or-nothing.
//
// [L4] Entries are carried over from the previous release where they are provably identical.
// /assets/ URLs carry a content hash, so the same URL is the same bytes. The cache name changes
// whenever the document or any unhashed shell file changes, so without this a one-line edit to
// index.html would re-download all ~1.9 MB on a metered connection for assets already held.
// Shell paths are not content-addressed and are always re-fetched.
//
// [L5] Only this app's origin is handled. The browser dispatches fetch events for cross-origin
// requests too and the app talks to Supabase from the page, so without the origin guard the
// general handler would persist authenticated API responses into Cache Storage and replay them
// offline. Cache matching keys on URL alone and ignores the Authorization header, so a stored
// response could also be handed to a different session.
//
// [L6] Navigations bound how long they wait for the network. A dead link rejects fetch()
// immediately, but a degraded or captive one -- the normal condition in this market -- hangs for
// the browser's own multi-minute timeout, and /shop/ would show a blank tab for all of it even
// though the document and the till chunk are already on the device.
//
// [L7] The unhashed shell files are cache-first, from this release's cache only. That is safe
// precisely because the build digest covers their CONTENTS, so a change to one mints a new cache
// name and re-precaches; a stale copy cannot survive a release. It also matters for paint:
// /theme-restore.js is a render-blocking script in <head>, and network-first would delay first
// paint on a stalled link until the fetch timed out, on every load.
// [L8] An unsealed worker does nothing. `vite dev` serves public-app/ directly, so the worker the
// sealer has not touched would register with a cache name containing the literal placeholder -- a
// name that never changes. Its shell files would then be frozen for the life of the developer's
// origin, and because /sw-register.js is one of them, a fix to the registration script would be
// the one thing that could not ship, which is the hazard the sealed digest exists to close. That
// name is also shared by every branch served on the same localhost. So an unsealed worker clears
// our caches and unregisters itself instead.
//
// [L9] A failed install only deletes the cache it CREATED. BUILD covers the precache list, the
// document and the shell files -- not the worker's own source -- so a release that changes only
// this template ships new sw.js bytes under an unchanged cache name, and caches.open() then hands
// back the live, fully populated cache. Deleting that on one flaky fetch would strand a device
// that was working offline a moment earlier, with no predecessor to fall back to.
const cachePrefix = 'supermega-app-'
const cacheKey = `${cachePrefix}${manifest.brand.version}`
// Written as JSON so showroom/scripts/seal-offline-precache.mjs can parse this list straight
// out of the generated worker and fold each file's CONTENTS into the build digest. These paths
// carry no hash in their names, so without that the digest could not see them change.
const shellList = JSON.stringify([
  '/', '/favicon.svg', '/site.webmanifest', '/icon-192.png', '/icon-512.png',
  '/apple-touch-icon.png', '/icon-512-maskable.png',
  '/theme-restore.js', '/sw-register.js', '/vercel-insights.js',
])
const serviceWorker = `const BUILD = 'unsealed__SUPERMEGA_PRECACHE_BUILD__'
const SEALED = !BUILD.startsWith('unsealed')
const CACHE_PREFIX = '${cachePrefix}'
const CACHE = '${cacheKey}-' + BUILD
const SHELL = ${shellList}
const PRECACHE = [] /* __SUPERMEGA_PRECACHE_FILES__ */

// The newest non-empty cache that is not this release's. Empty ones are skipped: install deletes
// its own cache when precaching fails, but a worker killed mid-install cannot, and an empty
// leftover would both be retained as the predecessor and defeat the carry-over. See L2.
async function previousCacheName() {
  const ours = (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
  for (let index = ours.length - 1; index >= 0; index -= 1) {
    if ((await (await caches.open(ours[index])).keys()).length) return ours[index]
  }
  return null
}

// See L3 (no addAll) and L4 (carry-over) in tools/write_app_release_metadata.mjs.
async function precacheAll() {
  const previousName = await previousCacheName()
  const previous = previousName ? await caches.open(previousName) : null
  const cache = await caches.open(CACHE)
  // All-or-nothing: any rejection fails the install and the previous worker keeps serving.
  await Promise.all([...SHELL, ...PRECACHE].map(async (url) => {
    if (previous && url.startsWith('/assets/')) {
      const carried = await previous.match(url)
      if (carried) {
        await cache.put(url, carried)
        return
      }
    }
    const resp = await fetch(url)
    if (!resp.ok) throw new Error('precache_status_' + resp.status + '_' + url)
    if (url !== '/' && (resp.headers.get('content-type') || '').includes('text/html')) {
      throw new Error('precache_document_returned_for_' + url)
    }
    await cache.put(url, resp)
  }))
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
  if (!SEALED) return
  event.waitUntil((async () => {
    // Whether this install is the one that creates the cache. See L9.
    const preexisting = (await caches.keys()).includes(CACHE)
    try {
      await precacheAll()
    } catch (error) {
      // Only clean up our own leftover: an empty cache would be retained as the predecessor at
      // the next release and evict a cache an open tab still needs. See L2.
      if (!preexisting) await caches.delete(CACHE)
      throw error
    }
  })())
})

// Retention: this release plus the one before it. See L1 and L2.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const ours = (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX))
    if (!SEALED) {
      // See L8: leave the origin exactly as if no worker had ever been installed.
      await Promise.all(ours.map((key) => caches.delete(key)))
      await self.registration.unregister()
      return
    }
    const previous = await previousCacheName()
    await Promise.all(ours
      .filter((key) => key !== CACHE && key !== previous)
      .map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

// Only successful responses are worth keeping, and a failed write must never surface as an
// unhandled rejection inside the worker. Caching a 5xx body, a 429, or a host's interstitial
// would hand that page back on every later offline request for the same URL.
function cacheIfOk(request, resp) {
  if (!resp.ok) return
  // A replaced asset answers 200 with the SPA document, not 404; storing that under a .js URL
  // would poison it for the life of the cache. Navigations are handled separately. See L3.
  if ((resp.headers.get('content-type') || '').includes('text/html')) return
  const clone = resp.clone()
  caches.open(CACHE).then((cache) => cache.put(request, clone)).catch(() => {})
}

// How long a navigation waits for the network before the precached shell is used. See L6.
const NAVIGATION_NETWORK_TIMEOUT_MS = 3000

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (!SEALED) return
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const { pathname } = url
  // Only this app's own origin -- never another host's authenticated replies. See L5.
  if (url.origin !== self.location.origin) return
  if (pathname.startsWith('/api/')) return
  if (pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((resp) => {
        cacheIfOk(request, resp)
        return resp
      }))
    )
    return
  }
  // Navigations are the offline entry point: the host rewrites /shop/ and /plant/ to
  // /index.html, so nothing is ever cached under those URLs and only the shell fallback lets
  // the app run at all. Nothing is written back -- '/' belongs to precacheAll(), and letting a
  // navigation store the NEXT release's document here would leave a shell whose entry chunks
  // this cache does not hold.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      // Scoped to THIS release's cache: a retained predecessor also holds a '/' document and a
      // cross-cache match resolves in creation order, which would boot the older shell offline.
      const cache = await caches.open(CACHE)
      const shell = async () => (await cache.match(request)) ?? (await cache.match('/'))
      // One request either way; settled never rejects, so a late failure is not unhandled.
      const settled = fetch(request).then((resp) => ({ resp }), (error) => ({ error }))
      let timer
      const expired = new Promise((resolve) => { timer = setTimeout(() => resolve('expired'), NAVIGATION_NETWORK_TIMEOUT_MS) })
      const raced = await Promise.race([settled, expired])
      clearTimeout(timer)
      if (raced !== 'expired') return raced.resp ?? (await shell()) ?? Response.error()
      const cached = await shell()
      if (cached) return cached
      const final = await settled
      return final.resp ?? Response.error()
    })())
    return
  }
  // Unhashed shell files: cache-first from this release's cache only. See L7.
  if (pathname !== '/' && SHELL.includes(pathname)) {
    event.respondWith(
      caches.open(CACHE)
        .then((cache) => cache.match(request))
        .then((cached) => cached ?? fetch(request).then((resp) => {
          cacheIfOk(request, resp)
          return resp
        }))
    )
    return
  }
  // Everything else on this origin: network first, this release's cache first as a fallback.
  event.respondWith(
    fetch(request)
      .then((resp) => {
        cacheIfOk(request, resp)
        return resp
      })
      .catch(async () => (await (await caches.open(CACHE)).match(request))
        ?? (await caches.match(request))
        ?? Response.error())
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
  writeFile(resolve(publicDir, 'theme-restore.js'), themeRestoreScript, 'utf8'),
  writeFile(resolve(publicDir, 'sw-register.js'), serviceWorkerRegisterScript, 'utf8'),
  writeFile(resolve(publicDir, 'vercel-insights.js'), insightsScript, 'utf8'),
  ...rasterIcons.map(([name, bytes]) => writeFile(resolve(publicDir, name), bytes)),
])
console.log(JSON.stringify({ ok: true, contract: 'supermega_app_release', commit: release.commit }))
