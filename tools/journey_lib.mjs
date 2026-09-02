// Shared harness for the automated 390px browser journeys (tools/journey_*.mjs).
//
// One journey file per product flow; everything that is NOT about the flow lives
// here so the second journey proves the harness is reusable rather than a one-off:
//
//   - a static server for showroom/dist with SPA fallback and an honest 404 on
//     /api/* (a static host has no runtime API; the app's health probe must settle
//     on its isolated-demo branch, not parse HTML);
//   - Chromium resolution (--chromium / $CHROMIUM_BIN / /opt/pw-browsers / PATH),
//     never a download;
//   - a minimal DevTools-protocol client over Node's built-in WebSocket, a fresh
//     temporary profile per run, phone emulation;
//   - real pointer clicks verified by an in-page click log, typing verified by
//     reading the field back, `expect`/`JourneyError` carrying the failing step;
//   - readers for the persisted localStorage workspace records;
//   - the verdict line on success, and diagnostics (page text, stored keys, click
//     log, notices, screenshot) on failure only.
//
// Zero dependencies: Node built-ins only. Journeys assert on STATE the app persists
// or on rendered text — never on pixels.
//
// Usage from a journey file:
//   import { runJourney } from './journey_lib.mjs'
//   await runJourney({ contract, label, profilePrefix, workspaceKey, summarizeWorkspace }, async (j) => {
//     await j.step('name', async () => { ... j.click / j.type / j.waitUntil / j.expect ... })
//   })
// Exit 0 with a one-line JSON verdict on success; exit 1 with the failing step, the
// reason, and diagnostics.

import { createServer } from 'node:http'
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const distDir = join(repoRoot, 'showroom', 'dist')

export const PHONE_VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }
export const DEFAULT_STEP_TIMEOUT_MS = 15_000
export const DEFAULT_JOURNEY_BUDGET_MS = 90_000

// Keys every product journey shares (see showroom/src/core/local-workspace-storage.ts).
export const SETUP_KEY = 'supermega.setup.v3'
export const PRODUCT_SETUPS_KEY = 'supermega.product_setups.v1'
export const LAST_OPERATOR_KEY = 'supermega.last_operator.v1'
export const LOCAL_METRICS_KEY = 'supermega.hq.local-metrics.v1'
export const ACCOUNTABLE_ACTIONS_KEY = 'supermega.accountable.actions.v1'
// The CLAUDE.md prefix rule: guided samples are identified by actionId prefix, never by actor string.
export const GUIDED_SAMPLE_PREFIX = 'ACT-DEMO-'
export const WORKING_SAMPLE_PREFIX = 'ACT-DEMO-WORKING-SAMPLE-'

// ---- CLI ----
export function argValue(name, fallback, args = process.argv.slice(2)) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}

export function findChromium(explicit = argValue('--chromium', process.env.CHROMIUM_BIN || '')) {
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
  // GitHub's ubuntu runners ship google-chrome; plain distros ship chromium.
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    for (const name of names) {
      const candidate = join(dir, name)
      try {
        if (statSync(candidate).isFile()) return candidate
      } catch {
        // not here
      }
    }
  }
  return null
}

// ---- static server: SPA fallback, honest 404 for assets and for /api ----
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

export function startServer(root = distDir) {
  const server = createServer((req, res) => {
    let pathname
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    } catch {
      res.writeHead(400).end('bad request')
      return
    }
    // A static host has no runtime API. Answer the way one does so the app's
    // /api/health probe settles on its isolated-demo branch instead of parsing HTML.
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('no api on static host')
      return
    }
    let filePath = normalize(join(root, pathname))
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      res.writeHead(403).end()
      return
    }
    let ext = extname(filePath)
    const exists = existsSync(filePath) && statSync(filePath).isFile()
    if (!exists) {
      if (ext) {
        res.writeHead(404).end('not found')
        return
      }
      filePath = join(root, 'index.html')
      ext = '.html'
    }
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' })
    createReadStream(filePath).pipe(res)
  })
  return new Promise((resolveStarted) => {
    server.listen(0, '127.0.0.1', () => resolveStarted(server))
  })
}

// ---- minimal CDP client over Node's built-in WebSocket ----
export class Cdp {
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

export async function launchChromium(bin, userDataDir) {
  const proc = spawn(
    bin,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
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

// ---- journey failure carries the step it died in ----
export class JourneyError extends Error {
  constructor(step, message) {
    super(`${step}: ${message}`)
    this.step = step
  }
}

// In-page helpers, installed on every document so text-based lookups and the
// hit-test click stay in one place. `q(selector, text)` finds the first element
// matching the selector whose trimmed text starts with `text` (when given).
export const PAGE_HELPERS = `
window.__journey = {
  clicks: [],
  q(selector, text) {
    const nodes = Array.from(document.querySelectorAll(selector));
    if (text === undefined || text === null) return nodes[0] || null;
    return nodes.find((n) => (n.textContent || '').trim().startsWith(text)) || null;
  },
  // Scrolls the element into view and reports where a real pointer must land.
  // 'hit' is false when something else covers that point (off-canvas cart, a
  // closed dialog, an overlay) — the journey refuses to click through that.
  // The scroll is 'instant' on purpose: the app animates its own scrolls
  // (scroll-behavior: smooth), and a measurement taken mid-animation is stale.
  target(selector, text) {
    const el = this.q(selector, text);
    if (!el) return null;
    this.lastTarget = el;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const at = document.elementFromPoint(x, y);
    return {
      x, y, width: r.width, height: r.height,
      hit: Boolean(at) && (at === el || el.contains(at)),
      disabled: el.disabled === true,
      text: (el.textContent || '').trim().slice(0, 120),
    };
  },
  focusAndSelect(selector, text) {
    const el = this.q(selector, text);
    if (!el) return false;
    el.focus();
    if (typeof el.select === 'function') el.select();
    return document.activeElement === el;
  },
  read(key) {
    return window.localStorage.getItem(key);
  },
};
// Where real pointer clicks actually landed — diagnostics for a click that "did nothing".
document.addEventListener('click', (event) => {
  const t = event.target;
  const classes = t && typeof t.className === 'string' ? t.className.split(' ').filter(Boolean).join('.') : '';
  // Containment is judged AT EVENT TIME against the control measured before the
  // press: React re-renders a pressed button (e.g. 'Applying…'), detaching the
  // span the click hit, so a check made afterwards would see it as a miss.
  const wanted = window.__journey.lastTarget;
  const entry = {
    x: event.clientX, y: event.clientY,
    target: t && t.tagName ? t.tagName.toLowerCase() + (classes ? '.' + classes : '') : String(t),
    text: ((t && t.textContent) || '').trim().slice(0, 40),
    onTarget: Boolean(wanted) && Boolean(t) && (t === wanted || wanted.contains(t)),
  };
  window.__journey.clicks.push(entry);
}, true);
`

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Runs one journey end to end. `options`:
//   contract           the verdict's contract id (e.g. 'supermega.shop-cash-sale-journey.v1')
//   label              upper-case failure banner ('SHOP CASH-SALE JOURNEY')
//   profilePrefix      temp-dir prefix for the output dir and the browser profile
//   viewport           Emulation.setDeviceMetricsOverride params (default: 390x844 phone)
//   stepTimeoutMs      per-wait timeout; budgetMs: hard wall-clock budget for the whole run
//   workspaceKey       localStorage key of the product's workspace record (for diagnostics)
//   summarizeWorkspace (workspace) => small object for the failure diagnostics
// `run(j)` receives the journey context and performs the steps.
export async function runJourney(options, run) {
  const {
    contract,
    label,
    profilePrefix,
    viewport = PHONE_VIEWPORT,
    stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS,
    budgetMs = DEFAULT_JOURNEY_BUDGET_MS,
    workspaceKey = null,
    summarizeWorkspace = null,
  } = options
  const startedAt = Date.now()
  const outDir = argValue('--out-dir', '') || await mkdtemp(join(tmpdir(), `${profilePrefix}-`))
  await mkdir(outDir, { recursive: true })
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new JourneyError('preflight', `no build at ${distDir} — run \`npm --prefix showroom run build\` first`)
  }
  if (!existsSync(join(distDir, 'sw.js'))) {
    throw new JourneyError('preflight', `${distDir} has no sw.js — this is not a finished app build`)
  }
  const chromiumBin = findChromium()
  if (!chromiumBin) throw new JourneyError('preflight', 'no Chromium found (pass --chromium or set CHROMIUM_BIN)')

  const steps = []
  const server = await startServer()
  const origin = `http://127.0.0.1:${server.address().port}`
  const userDataDir = await mkdtemp(join(tmpdir(), `${profilePrefix}-profile-`))
  const { proc, wsUrl } = await launchChromium(chromiumBin, userDataDir)
  const cdp = await Cdp.connect(wsUrl)
  const { product } = await cdp.send('Browser.getVersion')

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  let currentStep = 'launch'
  const budget = setTimeout(() => {
    console.error(`journey exceeded its ${budgetMs}ms budget during step "${currentStep}"`)
    proc.kill('SIGKILL')
    process.exit(1)
  }, budgetMs)

  const pageErrors = []
  cdp.on(sessionId, 'Runtime.exceptionThrown', (p) => {
    pageErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception')
  })

  async function evaluate(expression) {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    if (exceptionDetails) throw new JourneyError(currentStep, `page eval failed: ${exceptionDetails.exception?.description || exceptionDetails.text}`)
    return result.value
  }

  // Polls `expression` until it returns a truthy value; the value is returned.
  async function waitUntil(expression, label, timeoutMs = stepTimeoutMs) {
    const deadline = Date.now() + timeoutMs
    let last
    for (;;) {
      last = await evaluate(expression)
      if (last) return last
      if (Date.now() > deadline) {
        throw new JourneyError(currentStep, `timed out after ${timeoutMs}ms waiting for ${label} (last value: ${JSON.stringify(last)})`)
      }
      await sleep(100)
    }
  }

  async function navigate(path) {
    const loaded = cdp.waitFor(sessionId, 'Page.loadEventFired', stepTimeoutMs, `load of ${path}`)
    await cdp.send('Page.navigate', { url: origin + path }, sessionId)
    await loaded
  }

  // A real pointer click at the element's centre, refused if the centre is not
  // hit-testable — a covered or off-canvas control fails the journey instead of
  // being "clicked" through JavaScript. The page records where the click event
  // actually landed; a layout shift between measuring and pressing (a re-render
  // moving the control) shows up as a click on something else and is retried.
  // A control the click reaches but that does nothing is NOT retried: the next
  // wait fails on it, which is the whole point of a journey that can fail.
  async function click(selector, text, label) {
    const expr = `window.__journey.target(${JSON.stringify(selector)}, ${JSON.stringify(text ?? null)})`
    let landed = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      // Clickable AND still: the app's own smooth scrolls (e.g. Plant's 'Review
      // blockers' scrolling the control workspace into view) move a control for a
      // few hundred milliseconds after it first becomes hit-testable, and a press
      // at a stale point lands on whatever slid underneath. Two measurements a
      // frame apart must agree before the pointer goes down.
      const target = await waitUntil(`(async () => {
        const first = ${expr};
        if (!first || !first.hit || first.disabled) return null;
        await new Promise((r) => setTimeout(r, 120));
        const second = ${expr};
        return second && second.hit && !second.disabled && Math.abs(second.x - first.x) < 1 && Math.abs(second.y - first.y) < 1 ? second : null;
      })()`, `${label} to be clickable and still`)
      const { x, y } = target
      const before = await evaluate('window.__journey.clicks.length')
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId)
      landed = await evaluate(`(() => {
        const clicks = window.__journey.clicks.slice(${before});
        return clicks.length ? clicks[clicks.length - 1] : null;
      })()`)
      if (landed && landed.onTarget) return target
      const stillThere = await evaluate(`Boolean(window.__journey.q(${JSON.stringify(selector)}, ${JSON.stringify(text ?? null)}))`)
      if (!stillThere) throw new JourneyError(currentStep, `${label}: the pointer click landed on ${JSON.stringify(landed)} and the control is gone`)
      await sleep(150)
    }
    throw new JourneyError(currentStep, `${label}: the pointer click did not land on it after 3 attempts (last landed on ${JSON.stringify(landed)})`)
  }

  async function type(selector, text, value, label) {
    await click(selector, text, label)
    const focused = await evaluate(`window.__journey.focusAndSelect(${JSON.stringify(selector)}, ${JSON.stringify(text ?? null)})`)
    if (!focused) throw new JourneyError(currentStep, `${label} did not take focus`)
    await cdp.send('Input.insertText', { text: value }, sessionId)
    const stored = await evaluate(`(window.__journey.q(${JSON.stringify(selector)}, ${JSON.stringify(text ?? null)}) || {}).value`)
    if (stored !== value) throw new JourneyError(currentStep, `${label} holds ${JSON.stringify(stored)} after typing ${JSON.stringify(value)}`)
  }

  function readStored(key) {
    return evaluate(`window.__journey.read(${JSON.stringify(key)})`)
  }

  async function readJson(key) {
    const raw = await readStored(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw)
    } catch {
      throw new JourneyError(currentStep, `${key} is not valid JSON`)
    }
  }

  function expect(condition, message) {
    if (!condition) throw new JourneyError(currentStep, message)
  }

  async function step(name, fn) {
    currentStep = name
    const t0 = Date.now()
    const detail = await fn()
    steps.push({ step: name, ms: Date.now() - t0, ...(detail ? { detail } : {}) })
  }

  const journey = {
    browser: product,
    cdp,
    click,
    evaluate,
    expect,
    navigate,
    origin,
    readJson,
    readStored,
    sessionId,
    sleep,
    step,
    type,
    userDataDir,
    viewport,
    waitUntil,
    get currentStep() {
      return currentStep
    },
  }

  try {
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', viewport, sessionId)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HELPERS }, sessionId)

    await run(journey)

    clearTimeout(budget)
    const seconds = Number(((Date.now() - startedAt) / 1000).toFixed(1))
    console.log(JSON.stringify({ ok: true, contract, viewport: `${viewport.width}x${viewport.height}`, browser: product, steps, seconds }))
  } catch (error) {
    clearTimeout(budget)
    // Diagnostics: what the page showed, what it stored, and a screenshot — on failure only.
    const diagnostics = { step: currentStep, error: error.message, pageErrors }
    try {
      diagnostics.url = await evaluate('location.href')
      diagnostics.pageText = (await evaluate('document.body.innerText')).slice(0, 4000)
      const stored = await evaluate(`Object.fromEntries(Object.keys(window.localStorage).map((k) => [k, (window.localStorage.getItem(k) || '').length]))`)
      diagnostics.storedKeyLengths = stored
      // Small records verbatim (setup, drafts, operator); the workspace is summarised below.
      diagnostics.smallStoredValues = await evaluate(`Object.fromEntries(Object.keys(window.localStorage).filter((k) => (window.localStorage.getItem(k) || '').length <= 600).map((k) => [k, window.localStorage.getItem(k)]))`)
      diagnostics.clicks = await evaluate('window.__journey.clicks')
      diagnostics.notices = await evaluate(`Array.from(document.querySelectorAll('.form-notice, [role="alert"], [role="status"]')).map((n) => n.textContent.trim()).filter(Boolean)`)
      if (workspaceKey && summarizeWorkspace) {
        const workspace = await readJson(workspaceKey).catch(() => null)
        if (workspace) diagnostics.workspace = summarizeWorkspace(workspace)
      }
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)
      const shot = join(outDir, `failure-${currentStep}.png`)
      await writeFile(shot, Buffer.from(data, 'base64'))
      diagnostics.screenshot = shot
    } catch (diagError) {
      diagnostics.diagnosticsError = diagError.message
    }
    console.error(`${label} FAILED at step "${currentStep}": ${error.message}`)
    console.error(JSON.stringify({ ok: false, contract, steps, ...diagnostics }, null, 2))
    process.exitCode = 1
  } finally {
    proc.kill('SIGKILL')
    server.close()
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }
}

// The journey file's last line: anything escaping runJourney (a preflight failure,
// a harness fault) is reported with the same banner as an in-step failure.
export function reportFatal(label, err) {
  console.error(err instanceof JourneyError ? `${label} FAILED at step "${err.step}": ${err.message}` : err)
  process.exit(1)
}
