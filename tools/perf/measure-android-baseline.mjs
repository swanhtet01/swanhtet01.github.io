#!/usr/bin/env node
// Low-end Android performance baseline — MEASURE ONLY, no optimization.
//
// Standalone script (no dependencies, not wired into any verify chain).
// Serves showroom/dist statically (gzip, SPA fallback), drives a headless
// Chromium over raw CDP (Node's built-in WebSocket), applies CPU throttling
// x6 and Slow-3G-ish network throttling with a Galaxy-class mobile viewport,
// and reports per-route navigation metrics (median of N runs):
//   FCP, DOMContentLoaded, load, JS transfer bytes (total and pre-FCP), JS executed bytes
//   (Profiler precise coverage), main-thread long-task totals, and
//   ScriptDuration/TaskDuration from Performance.getMetrics.
//
// Usage:
//   node tools/perf/measure-android-baseline.mjs [--runs 3] [--out results.json]
//     [--routes "/,/shop/?tab=counter"] [--chromium /path/to/chrome]
//
// Requires: an existing showroom/dist build (run `npm --prefix showroom run build`
// first) and a Chromium binary (default: newest /opt/pw-browsers/chromium-*/,
// override with --chromium or $CHROMIUM_BIN).

import { createServer } from 'node:http'
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createGzip } from 'node:zlib'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const distDir = join(repoRoot, 'showroom', 'dist')

// ---- throttling profile (documented in ANDROID-PERFORMANCE-BASELINE.md) ----
const CPU_THROTTLE_RATE = 6
const NET = {
  offline: false,
  latency: 400, // ms round-trip
  downloadThroughput: 50_000, // bytes/sec = 400 kbit/s
  uploadThroughput: 50_000,
  connectionType: 'cellular3g',
}
const DEVICE = { width: 360, height: 800, deviceScaleFactor: 3, mobile: true }
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
// NOTE: bare '/' is NOT the chooser — ProductHomeEntry (CoreShell.tsx
// ~513-525) redirects it to the remembered product, defaulting to /shop/
// (counter tab). The chooser only renders at /?choose=1. '/' is kept as its
// own row because that redirect chain IS the real first-load path.
const DEFAULT_ROUTES = [
  '/',
  '/?choose=1',
  '/shop/?tab=counter',
  '/shop/?tab=orders',
  '/plant/',
  '/website/',
  '/ecommerce/',
]
const SETTLE_QUIET_MS = 3000 // no long task and no network JS for this long => settled
const SETTLE_MAX_MS = 45_000 // hard cap on post-load settling
const LOAD_TIMEOUT_MS = 180_000

// ---- CLI ----
const args = process.argv.slice(2)
function argValue(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const runsPerRoute = Number(argValue('--runs', '3'))
if (!Number.isInteger(runsPerRoute) || runsPerRoute < 1) {
  console.error(`--runs must be a positive integer, got: ${argValue('--runs', '3')}`)
  process.exit(1)
}
const outFile = argValue('--out', '')
const routes = argValue('--routes', '') ? argValue('--routes', '').split(',') : DEFAULT_ROUTES

function findChromium() {
  const explicit = argValue('--chromium', process.env.CHROMIUM_BIN || '')
  if (explicit) return explicit
  const base = '/opt/pw-browsers'
  if (existsSync(base)) {
    const dirs = readdirSync(base)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    for (const d of dirs) {
      const bin = join(base, d, 'chrome-linux', 'chrome')
      if (existsSync(bin)) return bin
    }
  }
  return 'chromium'
}

// ---- static server: gzip + SPA fallback ----
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}
const GZIP_TYPES = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest'])

function startServer() {
  const server = createServer((req, res) => {
    let pathname
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    } catch {
      res.writeHead(400).end('bad request')
      return
    }
    let filePath = normalize(join(distDir, pathname))
    if (filePath !== distDir && !filePath.startsWith(distDir + sep)) {
      res.writeHead(403).end()
      return
    }
    let ext = extname(filePath)
    const exists = existsSync(filePath) && statSync(filePath).isFile()
    if (!exists) {
      if (ext) {
        // real asset missing: report it, do not mask with the SPA fallback
        res.writeHead(404).end('not found')
        return
      }
      filePath = join(distDir, 'index.html') // SPA fallback for route paths
      ext = '.html'
    }
    const type = MIME[ext] || 'application/octet-stream'
    if (GZIP_TYPES.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip' })
      createReadStream(filePath).pipe(createGzip({ level: 6 })).pipe(res)
    } else {
      res.writeHead(200, { 'content-type': type })
      createReadStream(filePath).pipe(res)
    }
  })
  return new Promise((resolveStarted) => {
    server.listen(0, '127.0.0.1', () => resolveStarted(server))
  })
}

// ---- minimal CDP client over Node's built-in WebSocket ----
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id)
        if (p) {
          this.pending.delete(msg.id)
          if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`))
          else p.resolve(msg.result)
        }
        return
      }
      const key = `${msg.sessionId || ''}:${msg.method}`
      for (const fn of this.listeners.get(key) || []) fn(msg.params)
    })
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl)
    await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout connecting to DevTools websocket')), 30_000)
      ws.addEventListener('open', () => {
        clearTimeout(timer)
        resolvePromise()
      }, { once: true })
      ws.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error(`failed to connect to DevTools websocket at ${wsUrl}`))
      }, { once: true })
    })
    return new Cdp(ws)
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject, method })
    })
  }

  on(sessionId, method, fn) {
    const key = `${sessionId || ''}:${method}`
    if (!this.listeners.has(key)) this.listeners.set(key, [])
    this.listeners.get(key).push(fn)
    return () => {
      const arr = this.listeners.get(key)
      const i = arr.indexOf(fn)
      if (i >= 0) arr.splice(i, 1)
    }
  }

  waitFor(sessionId, method, timeoutMs, label) {
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        off()
        reject(new Error(`timeout waiting for ${label || method}`))
      }, timeoutMs)
      const off = this.on(sessionId, method, (params) => {
        clearTimeout(timer)
        off()
        resolvePromise(params)
      })
    })
  }
}

async function launchChromium(bin, userDataDir) {
  const proc = spawn(
    bin,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  const wsUrl = await new Promise((resolvePromise, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error('chromium did not expose a DevTools endpoint')), 30_000)
    proc.stderr.on('data', (chunk) => {
      buf += chunk
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) {
        clearTimeout(timer)
        resolvePromise(m[1])
      }
    })
    proc.on('exit', (code) => reject(new Error(`chromium exited early (code ${code})`)))
  })
  return { proc, wsUrl }
}

// executed-bytes from Profiler precise coverage: per script, flag each byte
// covered by a range, inner ranges (applied after outer) override.
function coverageBytes(coverage) {
  let totalBytes = 0
  let executedBytes = 0
  const perUrl = new Map()
  for (const script of coverage.result) {
    if (!/^https?:/.test(script.url)) continue // skip extensions/injected snippets
    const ranges = []
    let scriptEnd = 0
    for (const fn of script.functions) {
      for (const r of fn.ranges) {
        ranges.push(r)
        if (r.endOffset > scriptEnd) scriptEnd = r.endOffset
      }
    }
    ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset)
    const flags = new Uint8Array(scriptEnd)
    for (const r of ranges) flags.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset)
    let used = 0
    for (let i = 0; i < flags.length; i++) used += flags[i]
    totalBytes += scriptEnd
    executedBytes += used
    const key = script.url.replace(/^https?:\/\/[^/]+/, '')
    const prev = perUrl.get(key) || { totalBytes: 0, executedBytes: 0 }
    perUrl.set(key, { totalBytes: prev.totalBytes + scriptEnd, executedBytes: prev.executedBytes + used })
  }
  return { totalBytes, executedBytes, perUrl: Object.fromEntries(perUrl) }
}

const OBSERVER_SRC = `
window.__perfBaseline = { longTasks: [] };
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__perfBaseline.longTasks.push({ start: e.startTime, dur: e.duration });
  }).observe({ type: 'longtask', buffered: true });
} catch (err) { window.__perfBaseline.observerError = String(err); }
`

async function evalInPage(cdp, sessionId, expression) {
  const { result, exceptionDetails } = await cdp.send(
    'Runtime.evaluate',
    { expression, returnByValue: true },
    sessionId,
  )
  if (exceptionDetails) throw new Error(`page eval failed: ${exceptionDetails.text}`)
  return result.value
}

async function measureRoute(cdp, origin, route) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const disposers = []
  try {
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Network.enable', {}, sessionId)
    await cdp.send('Performance.enable', {}, sessionId)
    await cdp.send('Profiler.enable', {}, sessionId)
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId)
    // `Network.setCacheDisabled` disables the HTTP cache and NOTHING ELSE. It does
    // not touch a service worker's Cache Storage, so once dist/ started shipping a
    // real sw.js (G3 -- before that this file's premise "dist/ contains no sw.js"
    // held and this line was unnecessary), run 1 registered the worker and precached
    // 35 files, and every run after it was served entirely out of Cache Storage:
    // measured 2026-08-30 on `/` as 4,440ms/99,209 B cold, then 400ms/0 B and
    // 392ms/0 B, reported as a 400ms median. That is a ~10x optimistic number for
    // an instrument whose whole job is to be the citable baseline. Clearing the
    // origin's storage per run restores the cold navigation this script claims to
    // measure; it also drops localStorage, which is correct here -- the documented
    // route semantics for `/` are a fresh visitor's redirect to the default product.
    await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }, sessionId)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE }, sessionId)
    await cdp.send('Network.emulateNetworkConditions', NET, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', DEVICE, sessionId)
    await cdp.send('Emulation.setUserAgentOverride', { userAgent: USER_AGENT }, sessionId)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER_SRC }, sessionId)
    await cdp.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true }, sessionId)

    // network accounting: transfer bytes per resource type
    const requests = new Map() // requestId -> { type, url }
    const transfer = { Script: 0, Stylesheet: 0, Document: 0, other: 0 }
    const perScriptTransfer = new Map()
    let lastNetworkActivity = Date.now()
    disposers.push(
      cdp.on(sessionId, 'Network.responseReceived', (p) => {
        requests.set(p.requestId, { type: p.type, url: p.response.url })
        lastNetworkActivity = Date.now()
      }),
      // dataReceived keeps the quiet-detector honest while a large body streams
      cdp.on(sessionId, 'Network.dataReceived', () => {
        lastNetworkActivity = Date.now()
      }),
      cdp.on(sessionId, 'Network.loadingFinished', (p) => {
        const req = requests.get(p.requestId)
        if (!req) return
        lastNetworkActivity = Date.now()
        const bucket = transfer[req.type] !== undefined ? req.type : 'other'
        transfer[bucket] += p.encodedDataLength
        if (req.type === 'Script') {
          const key = req.url.replace(/^https?:\/\/[^/]+/, '')
          perScriptTransfer.set(key, (perScriptTransfer.get(key) || 0) + p.encodedDataLength)
        }
      }),
    )

    const loadFired = cdp.waitFor(sessionId, 'Page.loadEventFired', LOAD_TIMEOUT_MS, `load of ${route}`)
    await cdp.send('Page.navigate', { url: origin + route }, sessionId)
    await loadFired

    // settle: wait until the main thread and network have been quiet
    const settleStart = Date.now()
    for (;;) {
      await new Promise((r) => setTimeout(r, 500))
      const now = Date.now()
      const quiet = await evalInPage(
        cdp,
        sessionId,
        `(() => {
          const lt = (window.__perfBaseline || { longTasks: [] }).longTasks;
          const last = lt.length ? lt[lt.length - 1] : null;
          return { lastLongTaskEnd: last ? last.start + last.dur : 0, now: performance.now() };
        })()`,
      )
      const mainQuietFor = quiet.now - quiet.lastLongTaskEnd
      const netQuietFor = now - lastNetworkActivity
      if ((mainQuietFor >= SETTLE_QUIET_MS && netQuietFor >= SETTLE_QUIET_MS) || now - settleStart >= SETTLE_MAX_MS)
        break
    }

    const page = await evalInPage(
      cdp,
      sessionId,
      `(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        const lt = (window.__perfBaseline || { longTasks: [] }).longTasks;
        // Script bytes that were already on the wire when the first pixel landed.
        // jsTransferBytes (from CDP, below) counts everything up to settle, so on its
        // own it cannot tell "moved off the critical path" from "never loaded" -- this
        // separates them. Resource timing shares FCP's navigation-start clock, so the
        // comparison is exact; transferSize includes response headers, so this reads a
        // few hundred bytes per request above the CDP encodedDataLength total.
        // No FCP means there is no "before FCP" to report. Returning null drops the
        // run from median() the same way a null fcp does, rather than silently
        // reporting the whole post-settle total as if it were a pre-paint figure.
        const jsBeforeFcp = fcp === undefined ? null : performance.getEntriesByType('resource')
          .filter((e) => /\\.m?js$/.test(new URL(e.name, location.href).pathname) && e.responseEnd <= fcp.startTime)
          .reduce((a, e) => a + (e.transferSize || 0), 0);
        return {
          fcp: fcp ? fcp.startTime : null,
          domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
          load: nav ? nav.loadEventEnd : null,
          jsTransferBeforeFcpBytes: jsBeforeFcp,
          longTaskCount: lt.length,
          longTaskTotalMs: lt.reduce((a, t) => a + t.dur, 0),
          longestTaskMs: lt.reduce((a, t) => Math.max(a, t.dur), 0),
        };
      })()`,
    )
    const coverage = await cdp.send('Profiler.takePreciseCoverage', {}, sessionId)
    const cov = coverageBytes(coverage)
    const { metrics } = await cdp.send('Performance.getMetrics', {}, sessionId)
    const metric = (name) => metrics.find((m) => m.name === name)?.value ?? null

    return {
      route,
      ...page,
      jsTransferBytes: transfer.Script,
      cssTransferBytes: transfer.Stylesheet,
      jsSourceBytes: cov.totalBytes,
      jsExecutedBytes: cov.executedBytes,
      jsCoveragePerScript: cov.perUrl,
      jsTransferPerScript: Object.fromEntries(perScriptTransfer),
      scriptDurationS: metric('ScriptDuration'),
      taskDurationS: metric('TaskDuration'),
      layoutDurationS: metric('LayoutDuration'),
      recalcStyleDurationS: metric('RecalcStyleDuration'),
      jsHeapUsedBytes: metric('JSHeapUsedSize'),
    }
  } finally {
    for (const dispose of disposers) dispose()
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {})
  }
}

function median(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  if (!nums.length) return null
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
}

const MEDIAN_FIELDS = [
  'fcp',
  'domContentLoaded',
  'load',
  'jsTransferBytes',
  'jsTransferBeforeFcpBytes',
  'jsSourceBytes',
  'jsExecutedBytes',
  'longTaskCount',
  'longTaskTotalMs',
  'longestTaskMs',
  'scriptDurationS',
  'taskDurationS',
]

async function main() {
  if (!existsSync(join(distDir, 'index.html'))) {
    console.error(`No build at ${distDir} — run \`npm --prefix showroom run build\` first.`)
    process.exit(1)
  }
  const chromiumBin = findChromium()
  const server = await startServer()
  const origin = `http://127.0.0.1:${server.address().port}`
  const userDataDir = await mkdtemp(join(tmpdir(), 'perf-baseline-'))
  const { proc, wsUrl } = await launchChromium(chromiumBin, userDataDir)
  const cdp = await Cdp.connect(wsUrl)
  const { product } = await cdp.send('Browser.getVersion')

  console.error(`# browser: ${product} (${chromiumBin})`)
  console.error(
    `# throttling: CPU x${CPU_THROTTLE_RATE}, net ${NET.downloadThroughput * 8 / 1000} kbit/s down, ${NET.latency}ms latency; viewport ${DEVICE.width}x${DEVICE.height}@${DEVICE.deviceScaleFactor}x mobile`,
  )

  const results = { browser: product, cpuThrottle: CPU_THROTTLE_RATE, network: NET, device: DEVICE, routes: {} }
  try {
    for (const route of routes) {
      const runs = []
      for (let i = 0; i < runsPerRoute; i++) {
        console.error(`# measuring ${route} (run ${i + 1}/${runsPerRoute})`)
        runs.push(await measureRoute(cdp, origin, route))
      }
      const medians = {}
      for (const field of MEDIAN_FIELDS) medians[field] = median(runs.map((r) => r[field]))
      results.routes[route] = { medians, runs }
      const show = (v) => (typeof v === 'number' ? `${Math.round(v)}ms` : 'n/a')
      console.error(`#   fcp=${show(medians.fcp)} load=${show(medians.load)} longTasks=${show(medians.longTaskTotalMs)}`)
    }
  } finally {
    proc.kill('SIGKILL')
    server.close()
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }

  const json = JSON.stringify(results, null, 2)
  if (outFile) {
    await writeFile(outFile, json)
    console.error(`# wrote ${outFile}`)
  } else {
    console.log(json)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
