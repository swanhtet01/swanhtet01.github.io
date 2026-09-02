#!/usr/bin/env node
// Shop cash-sale browser journey — ONE deterministic end-to-end run at a 390px
// phone viewport against the BUILT app (showroom/dist), driven over raw CDP.
//
// Why this exists: ENTERPRISE-READINESS-SCORECARD §5 names CoreApp.tsx as the
// largest untested surface — verified by build gates plus MANUAL 390px journeys,
// with no automated browser E2E in any workflow. This is that journey. It follows
// docs/demo-playbooks/shop.md §2-§3 (the canonical demo script) plus the shipped
// one-review settle ('Paid & handed over', DESIGN-PROGRAM phase 2 item 1):
//
//   1. /settings/?product=shop  → type a business name → 'Create Shop and start selling'
//   2. lands on /shop/?tab=counter with the guided working sample provisioned
//   3. tap two catalog tiles (one of them twice) → open the phone cart bar
//   4. pick 'Cash' → 'Review order' → the counter gate ('Review counter order')
//   5. name the cashier → 'Create order'   (reserve: order confirmed, stock reserved)
//   6. reload on /shop/?tab=orders → 'Paid & handed over' → 'Confirm change'
//      (settle: payment reconciled + confirmed→preparing→ready→completed, one proof)
//   7. reload on /shop/?tab=counter → the tiles show the decremented stock
//
// Every assertion is on STATE the app persists (the localStorage workspace record,
// see showroom/src/core/local-workspace-storage.ts) or on rendered text — never
// on pixels. Screenshots are diagnostic output on failure only.
//
// Contract with the environment:
//   - Zero dependencies: Node built-ins + Chromium's DevTools protocol over the
//     built-in WebSocket (same pattern as tools/perf/measure-android-baseline.mjs).
//   - Chromium is resolved from --chromium / $CHROMIUM_BIN / /opt/pw-browsers /
//     PATH (google-chrome, chromium, ...). Nothing is downloaded; it never runs
//     `playwright install`.
//   - Every run launches a FRESH temporary browser profile, so there is no service
//     worker, no cache and no localStorage from any earlier run; the journey asserts
//     that emptiness before it starts. A pass that depended on a cached prior run
//     would be worthless.
//   - Nothing here seeds a record. The only sample data is what the app's own
//     onboarding provisions (guided sample, `ACT-DEMO-WORKING-SAMPLE-` action ids —
//     the CLAUDE.md prefix rule). The order the journey creates is made through the
//     real UI with a real generated proof, exactly as an operator would make it.
//
// Usage:
//   node tools/journey_shop_cash_sale.mjs [--chromium /path/to/chrome] [--out-dir DIR]
// Exit 0 with a one-line JSON verdict on success; exit 1 with the failing step, the
// reason, and diagnostics (screenshot path, page text, stored workspace summary).

import { createServer } from 'node:http'
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(repoRoot, 'showroom', 'dist')

const CONTRACT = 'supermega.shop-cash-sale-journey.v1'
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }
const STEP_TIMEOUT_MS = 15_000
const JOURNEY_BUDGET_MS = 90_000
const BUSINESS_NAME = 'Journey Test Shop'
const CASHIER = 'Journey cashier'
const COMMERCE_KEY = 'supermega.commerce.workspace.v2'
const LAST_OPERATOR_KEY = 'supermega.last_operator.v1'
const COUNTER_DRAFT_KEY = 'supermega.shop.counter_draft.v1'
const SETUP_KEY = 'supermega.setup.v3'
const PRODUCT_SETUPS_KEY = 'supermega.product_setups.v1'
const LOCAL_METRICS_KEY = 'supermega.hq.local-metrics.v1'
const GUIDED_SAMPLE_PREFIX = 'ACT-DEMO-'
const WORKING_SAMPLE_PREFIX = 'ACT-DEMO-WORKING-SAMPLE-'

// ---- CLI ----
const args = process.argv.slice(2)
function argValue(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}

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

function startServer() {
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
    let filePath = normalize(join(distDir, pathname))
    if (filePath !== distDir && !filePath.startsWith(distDir + sep)) {
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
      filePath = join(distDir, 'index.html')
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
class JourneyError extends Error {
  constructor(step, message) {
    super(`${step}: ${message}`)
    this.step = step
  }
}

// In-page helpers, installed on every document so text-based lookups and the
// hit-test click stay in one place. `q(selector, text)` finds the first element
// matching the selector whose trimmed text starts with `text` (when given).
const PAGE_HELPERS = `
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
  target(selector, text) {
    const el = this.q(selector, text);
    if (!el) return null;
    this.lastTarget = el;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
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

async function main() {
  const startedAt = Date.now()
  const outDir = argValue('--out-dir', '') || await mkdtemp(join(tmpdir(), 'shop-journey-'))
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
  const userDataDir = await mkdtemp(join(tmpdir(), 'shop-journey-profile-'))
  const { proc, wsUrl } = await launchChromium(chromiumBin, userDataDir)
  const cdp = await Cdp.connect(wsUrl)
  const { product } = await cdp.send('Browser.getVersion')

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  let currentStep = 'launch'
  const budget = setTimeout(() => {
    console.error(`journey exceeded its ${JOURNEY_BUDGET_MS}ms budget during step "${currentStep}"`)
    proc.kill('SIGKILL')
    process.exit(1)
  }, JOURNEY_BUDGET_MS)

  const pageErrors = []
  cdp.on(sessionId, 'Runtime.exceptionThrown', (p) => {
    pageErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception')
  })

  async function evaluate(expression) {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    if (exceptionDetails) throw new JourneyError(currentStep, `page eval failed: ${exceptionDetails.exception?.description || exceptionDetails.text}`)
    return result.value
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // Polls `expression` until it returns a truthy value; the value is returned.
  async function waitUntil(expression, label, timeoutMs = STEP_TIMEOUT_MS) {
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
    const loaded = cdp.waitFor(sessionId, 'Page.loadEventFired', STEP_TIMEOUT_MS, `load of ${path}`)
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
      const target = await waitUntil(`(() => { const t = ${expr}; return t && t.hit && !t.disabled ? t : null; })()`, `${label} to be clickable`)
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

  async function readWorkspace() {
    const raw = await evaluate(`window.__journey.read(${JSON.stringify(COMMERCE_KEY)})`)
    if (raw === null) return null
    try {
      return JSON.parse(raw)
    } catch {
      throw new JourneyError(currentStep, `${COMMERCE_KEY} is not valid JSON`)
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

  let expected = null

  try {
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', VIEWPORT, sessionId)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HELPERS }, sessionId)

    await step('fresh-origin', async () => {
      await navigate('/settings/?product=shop')
      // The app writes its own housekeeping keys on first paint (theme, behaviour
      // trail, local metrics, the Plant workspace seed), so "empty" is the wrong
      // test. What proves a fresh origin is that no Shop workspace, no setup record
      // and no counter draft exist before onboarding — the keys this journey will
      // go on to assert against.
      const fresh = await evaluate(`(async () => ({
        business: [${JSON.stringify(COMMERCE_KEY)}, ${JSON.stringify(SETUP_KEY)}, ${JSON.stringify(PRODUCT_SETUPS_KEY)}, ${JSON.stringify(COUNTER_DRAFT_KEY)}, ${JSON.stringify(LAST_OPERATOR_KEY)}]
          .filter((key) => window.localStorage.getItem(key) !== null),
        keys: Object.keys(window.localStorage).sort(),
        workers: (await navigator.serviceWorker.getRegistrations()).length,
        viewport: window.innerWidth,
      }))()`)
      expect(fresh.business.length === 0, `a fresh profile already carries ${fresh.business.join(', ')} — this run is contaminated by a previous one`)
      expect(fresh.viewport === VIEWPORT.width, `expected a ${VIEWPORT.width}px viewport, got ${fresh.viewport}`)
      return { browser: product, profile: userDataDir, keysWrittenByFirstPaint: fresh.keys, serviceWorkers: fresh.workers }
    })

    await step('setup-name-workspace', async () => {
      await waitUntil(`Boolean(window.__journey.q('input[autocomplete="organization"]'))`, 'the Business name field')
      await type('input[autocomplete="organization"]', null, BUSINESS_NAME, 'Business name')
      // The submit is disabled until the runtime health probe settles (static host → demo).
      const submit = await click('form.product-onboarding-form button[type="submit"]', null, 'the setup submit button')
      expect(submit.text === 'Create Shop and start selling', `setup submit reads ${JSON.stringify(submit.text)}, expected "Create Shop and start selling"`)
    })

    await step('counter-opens-with-sample', async () => {
      await waitUntil(`location.pathname === '/shop/' && new URLSearchParams(location.search).get('tab') === 'counter'`, 'navigation to /shop/?tab=counter')
      await waitUntil(`Boolean(window.__journey.q('.shop-catalog-head h2', 'Tap an item to add it'))`, 'the counter heading')
      await waitUntil(`document.querySelectorAll('button.shop-product-tile').length > 1`, 'catalog tiles')
      const workspace = await readWorkspace()
      expect(workspace && workspace.schema === COMMERCE_KEY, `${COMMERCE_KEY} missing or wrong schema after onboarding`)
      expect(Array.isArray(workspace.orders) && workspace.orders.length === 0, `expected no orders before the sale, found ${workspace?.orders?.length}`)
      const baselines = workspace.catalogBaselines || []
      expect(baselines.length > 0 && baselines.every((b) => b.proof?.actionId?.startsWith(WORKING_SAMPLE_PREFIX)),
        'the provisioned catalog is not the guided working sample (catalog baselines lack the ACT-DEMO-WORKING-SAMPLE- prefix)')
      expect(workspace.movements.every((m) => m.actionId.startsWith(GUIDED_SAMPLE_PREFIX)),
        'a stock movement without the guided-sample prefix exists before any sale was made')
      const tiles = await evaluate(`Array.from(document.querySelectorAll('button.shop-product-tile')).map((tile, i) => ({
        name: (document.getElementById('shop-tile-name-' + i) || {}).textContent || '',
        stock: (document.getElementById('shop-tile-stock-' + i) || {}).textContent || '',
        disabled: tile.disabled,
      }))`)
      expect(tiles.length === workspace.items.length, `counter shows ${tiles.length} tiles for ${workspace.items.length} catalog items`)
      // Tile i renders items[i] (visibleItems === items with no search query).
      const first = workspace.items.findIndex((item) => item.onHand >= 2)
      const second = workspace.items.findIndex((item, i) => i !== first && item.onHand >= 1)
      expect(first >= 0 && second >= 0, 'the sample catalog has no two sellable items (one needs stock >= 2)')
      const a = workspace.items[first]
      const b = workspace.items[second]
      expect(tiles[first].name === a.name && tiles[second].name === b.name, 'tile order does not match the stored catalog order')
      expect(tiles[first].stock === `${a.onHand} in stock`, `tile ${first} shows ${JSON.stringify(tiles[first].stock)}, stored ${a.onHand}`)
      expected = {
        a: { index: first, sku: a.sku, name: a.name, price: a.price, onHand: a.onHand, quantity: 2 },
        b: { index: second, sku: b.sku, name: b.name, price: b.price, onHand: b.onHand, quantity: 1 },
        units: 3,
        total: a.price * 2 + b.price,
      }
      expected.totalText = `${new Intl.NumberFormat('en-US').format(expected.total)} MMK`
      return { items: workspace.items.length, sale: { [a.sku]: 2, [b.sku]: 1 }, total: expected.total }
    })

    await step('tap-items', async () => {
      const tile = (i) => `button.shop-product-tile:nth-of-type(${i + 1})`
      await click(tile(expected.a.index), null, `tile ${expected.a.name}`)
      await click(tile(expected.a.index), null, `tile ${expected.a.name} (second tap)`)
      await click(tile(expected.b.index), null, `tile ${expected.b.name}`)
      const bar = await waitUntil(`(() => {
        const bar = window.__journey.q('button.shop-mobile-cart');
        const qa = document.getElementById('shop-tile-quantity-${expected.a.index}');
        const qb = document.getElementById('shop-tile-quantity-${expected.b.index}');
        return bar && qa && qb ? { bar: bar.textContent.trim(), qa: qa.textContent.trim(), qb: qb.textContent.trim() } : null;
      })()`, 'the phone cart bar and tile quantity badges')
      expect(bar.qa === '2' && bar.qb === '1', `tile badges read ${bar.qa}/${bar.qb}, expected 2/1`)
      expect(bar.bar.includes(`${expected.units} items`), `cart bar reads ${JSON.stringify(bar.bar)}, expected "${expected.units} items"`)
      expect(bar.bar.includes(expected.totalText), `cart bar reads ${JSON.stringify(bar.bar)}, expected total ${expected.totalText}`)
      const draft = JSON.parse(await evaluate(`window.__journey.read(${JSON.stringify(COUNTER_DRAFT_KEY)})`) || 'null')
      expect(draft && draft.cart?.[expected.a.sku] === 2 && draft.cart?.[expected.b.sku] === 1,
        `the in-progress sale was not persisted to ${COUNTER_DRAFT_KEY}: ${JSON.stringify(draft)}`)
    })

    await step('review-cash-sale', async () => {
      await click('button.shop-mobile-cart', null, 'the phone cart bar')
      await waitUntil(`Boolean(document.querySelector('.shop-current-sale.is-open'))`, 'the current-sale panel to open')
      await click('.shop-payment-options button', 'Cash', 'the Cash payment option')
      const pressed = await evaluate(`(window.__journey.q('.shop-payment-options button[aria-pressed="true"]') || {}).textContent`)
      expect(pressed === 'Cash', `payment method reads ${JSON.stringify(pressed)}, expected Cash`)
      const footerTotal = await evaluate(`(window.__journey.q('.shop-current-sale > footer strong') || {}).textContent`)
      expect(footerTotal === expected.totalText, `sale panel total reads ${JSON.stringify(footerTotal)}, expected ${expected.totalText}`)
      const review = await click('button.shop-review-sale', null, 'Review order')
      expect(review.text.startsWith('Review order'), `review button reads ${JSON.stringify(review.text)}`)
    })

    await step('create-order', async () => {
      const gate = await waitUntil(`(() => {
        const d = document.querySelector('dialog.accountable-action-gate[open]');
        if (!d) return null;
        return { eyebrow: (d.querySelector('.core-eyebrow') || {}).textContent, title: (d.querySelector('#action-confirm-title') || {}).textContent };
      })()`, 'the counter review gate')
      expect(gate.eyebrow === 'Review counter order', `gate eyebrow reads ${JSON.stringify(gate.eyebrow)}`)
      expect(gate.title === `Create ${expected.totalText} counter order`, `gate title reads ${JSON.stringify(gate.title)}, expected "Create ${expected.totalText} counter order"`)
      const boundary = await evaluate(`Boolean(window.__journey.q('dialog.accountable-action-gate[open] .counter-local-boundary', 'Browser-local sample only.'))`)
      expect(boundary, 'the counter gate lost its browser-local boundary line (the playbook §4 privacy pitch)')
      await type('dialog.accountable-action-gate[open] form input:not([readonly])', null, CASHIER, 'the Cashier field')
      const submit = await click('dialog.accountable-action-gate[open] form button[type="submit"]', null, 'Create order')
      expect(submit.text.startsWith('Create order'), `gate submit reads ${JSON.stringify(submit.text)}`)
      await waitUntil(`!document.querySelector('dialog.accountable-action-gate[open]')`, 'the gate to close after the order was created')
    })

    await step('order-reserved-in-storage', async () => {
      const workspace = await waitUntil(`(() => {
        const raw = window.__journey.read(${JSON.stringify(COMMERCE_KEY)});
        if (!raw) return null;
        const state = JSON.parse(raw);
        return state.orders.length === 1 ? state : null;
      })()`, 'exactly one order in the stored workspace')
      const [order] = workspace.orders
      expect(order.status === 'confirmed', `order status is ${order.status}, expected confirmed`)
      expect(order.paymentStatus === 'pending', `payment status is ${order.paymentStatus}, expected pending`)
      expect(order.payment === 'Cash', `payment method stored as ${order.payment}`)
      expect(order.channel === 'Walk-in' && order.fulfilment === 'pickup', `channel/fulfilment stored as ${order.channel}/${order.fulfilment}`)
      expect(order.total === expected.total, `order total is ${order.total}, expected ${expected.total}`)
      expect(order.quantity === expected.units, `order quantity is ${order.quantity}, expected ${expected.units}`)
      expect(order.owner === CASHIER, `order owner is ${JSON.stringify(order.owner)}, expected the typed cashier`)
      expect(order.customer === 'Guest', `customer stored as ${JSON.stringify(order.customer)}, expected Guest`)
      const lines = Object.fromEntries((order.lines || []).map((line) => [line.sku, { quantity: line.quantity, unitPriceMmk: line.unitPriceMmk }]))
      expect(lines[expected.a.sku]?.quantity === 2 && lines[expected.a.sku]?.unitPriceMmk === expected.a.price, `line for ${expected.a.sku} is ${JSON.stringify(lines[expected.a.sku])}`)
      expect(lines[expected.b.sku]?.quantity === 1 && lines[expected.b.sku]?.unitPriceMmk === expected.b.price, `line for ${expected.b.sku} is ${JSON.stringify(lines[expected.b.sku])}`)
      const itemA = workspace.items.find((item) => item.sku === expected.a.sku)
      const itemB = workspace.items.find((item) => item.sku === expected.b.sku)
      expect(itemA.onHand === expected.a.onHand - 2, `${expected.a.sku} on hand is ${itemA.onHand}, expected ${expected.a.onHand - 2}`)
      expect(itemB.onHand === expected.b.onHand - 1, `${expected.b.sku} on hand is ${itemB.onHand}, expected ${expected.b.onHand - 1}`)
      const reserves = workspace.movements.filter((m) => m.orderId === order.id)
      expect(reserves.length === 2 && reserves.every((m) => m.kind === 'reserve'), `expected two reserve movements for ${order.id}, found ${JSON.stringify(reserves.map((m) => m.kind))}`)
      expect(reserves.every((m) => !m.actionId.startsWith(GUIDED_SAMPLE_PREFIX)),
        'the counter sale was recorded under the guided-sample prefix — a real UI action must not be indistinguishable from seeded data')
      expect(reserves.every((m) => m.actor === CASHIER && m.evidenceReference && m.reason), 'reserve movements are missing their proof (actor/reason/evidence)')
      const draft = await evaluate(`window.__journey.read(${JSON.stringify(COUNTER_DRAFT_KEY)})`)
      expect(draft === null, `the counter draft survived the sale: ${draft}`)
      const operator = await evaluate(`window.__journey.read(${JSON.stringify(LAST_OPERATOR_KEY)})`)
      expect(operator === CASHIER, `last operator is ${JSON.stringify(operator)}, expected ${CASHIER}`)
      const metrics = JSON.parse(await evaluate(`window.__journey.read(${JSON.stringify(LOCAL_METRICS_KEY)})`) || '{"events":[]}')
      const completed = (metrics.events || []).filter((event) => event.action === 'sale.completed')
      expect(completed.length === 1, `expected one sale.completed local metric, found ${completed.length}`)
      const cartGone = await evaluate(`!document.querySelector('button.shop-mobile-cart')`)
      expect(cartGone, 'the phone cart bar is still showing after the order was created')
      expected.orderId = order.id
      return { orderId: order.id, total: order.total, status: order.status }
    })

    await step('settle-paid-and-handed-over', async () => {
      // A full reload: the settle must work from the persisted record, not from React state.
      await navigate('/shop/?tab=orders')
      const settle = await click('.order-list button', 'Paid & handed over', 'Paid & handed over')
      expect(settle.text === 'Paid & handed over', `settle button reads ${JSON.stringify(settle.text)}`)
      const gate = await waitUntil(`(() => {
        const d = document.querySelector('dialog.accountable-action-gate[open]');
        if (!d) return null;
        const inputs = Array.from(d.querySelectorAll('form input'));
        return { title: (d.querySelector('#action-confirm-title') || {}).textContent, values: inputs.map((i) => i.value) };
      })()`, 'the settle gate')
      expect(gate.title.startsWith('Settle ') && gate.title.endsWith(' · paid and handed over'), `settle gate title reads ${JSON.stringify(gate.title)}`)
      // The name defaults to the setup owner ('Business owner', written by onboarding) and
      // falls back to the remembered operator only when there is none — the operator
      // confirms who actually did it, exactly as at a shared till.
      expect(gate.values[0] && gate.values[0].trim(), 'settle gate offered no default name')
      expect(gate.values[1] === 'Cash received and the customer took the order.', `settle gate reason reads ${JSON.stringify(gate.values[1])}`)
      await type('dialog.accountable-action-gate[open] form input:not([readonly])', null, CASHIER, 'the settle gate name field')
      const submit = await click('dialog.accountable-action-gate[open] form button[type="submit"]', null, 'Confirm change')
      // bi() renders bilingual labels ('Confirm change · အတည်ပြုမည်'); match the English head.
      expect(submit.text.startsWith('Confirm change'), `settle submit reads ${JSON.stringify(submit.text)}`)
      await waitUntil(`!document.querySelector('dialog.accountable-action-gate[open]')`, 'the settle gate to close')
      expected.settleTitle = gate.title
    })

    await step('order-completed-in-storage', async () => {
      const workspace = await waitUntil(`(() => {
        const raw = window.__journey.read(${JSON.stringify(COMMERCE_KEY)});
        if (!raw) return null;
        const state = JSON.parse(raw);
        const order = state.orders.find((o) => o.id === ${JSON.stringify(expected.orderId)});
        return order && order.status === 'completed' ? state : null;
      })()`, `order ${expected.orderId} to reach completed`)
      const order = workspace.orders.find((o) => o.id === expected.orderId)
      expect(workspace.orders.length === 1, `expected the single journey order, found ${workspace.orders.length}`)
      expect(order.paymentStatus === 'reconciled', `payment status is ${order.paymentStatus}, expected reconciled`)
      expect(order.paymentReconciledBy === CASHIER, `payment reconciled by ${JSON.stringify(order.paymentReconciledBy)}`)
      const settleId = order.paymentReconciliationActionId
      expect(typeof settleId === 'string' && settleId && !settleId.startsWith(GUIDED_SAMPLE_PREFIX), `settle proof id is ${JSON.stringify(settleId)}`)
      // One reviewed settle = one command with derived, individually unique inner proofs.
      expect(JSON.stringify(order.advancementActionIds) === JSON.stringify([`${settleId}:advance-confirmed`, `${settleId}:advance-preparing`]),
        `advancement ids are ${JSON.stringify(order.advancementActionIds)}, expected the derived confirmed/preparing pair`)
      expect(order.completion?.actionId === `${settleId}:advance-ready`, `completion proof id is ${JSON.stringify(order.completion?.actionId)}`)
      expect(order.completion?.actor === CASHIER, `completion actor is ${JSON.stringify(order.completion?.actor)}`)
      expect(order.total === expected.total, `settled order total drifted to ${order.total}`)
      const itemA = workspace.items.find((item) => item.sku === expected.a.sku)
      expect(itemA.onHand === expected.a.onHand - 2, `${expected.a.sku} on hand changed again at settle: ${itemA.onHand}`)
      // The Orders tab lists work that still needs action, so a settled order leaves it;
      // what must reflect the sale is the settle notice, the queue count, and the
      // daily-close panel (#shop-close-controls) counting it as ready to close.
      const surface = await waitUntil(`(() => {
        const text = document.body.innerText;
        const noticed = text.includes(${JSON.stringify(`${expected.settleTitle} completed.`)});
        const queue = text.includes('0 orders need action');
        const close = text.includes(${JSON.stringify(`1 completed, reconciled orders · ${expected.totalText} ready to close.`)});
        return noticed && queue && close ? { noticed, queue, close } : null;
      })()`, 'the Orders tab to reflect the settled sale (notice, empty queue, daily close ready)')
      const settleGone = await evaluate(`!window.__journey.q('button', 'Paid & handed over')`)
      expect(settleGone, 'the settle button is still offered after the order completed')
      return { ...surface, orderId: order.id, settleActionId: settleId, status: order.status, paymentStatus: order.paymentStatus }
    })

    await step('counter-shows-decremented-stock', async () => {
      await navigate('/shop/?tab=counter')
      const stock = await waitUntil(`(() => {
        const a = document.getElementById('shop-tile-stock-${expected.a.index}');
        const b = document.getElementById('shop-tile-stock-${expected.b.index}');
        return a && b ? { a: a.textContent.trim(), b: b.textContent.trim() } : null;
      })()`, 'the catalog tiles after the sale')
      const wantA = expected.a.onHand - 2 > 0 ? `${expected.a.onHand - 2} in stock` : 'Out of stock'
      const wantB = expected.b.onHand - 1 > 0 ? `${expected.b.onHand - 1} in stock` : 'Out of stock'
      expect(stock.a === wantA, `${expected.a.sku} tile reads ${JSON.stringify(stock.a)}, expected ${JSON.stringify(wantA)}`)
      expect(stock.b === wantB, `${expected.b.sku} tile reads ${JSON.stringify(stock.b)}, expected ${JSON.stringify(wantB)}`)
      const openOrders = await evaluate(`(window.__journey.q('.shop-counter-summary a') || {}).textContent`)
      expect(openOrders === '0 open orders', `counter summary reads ${JSON.stringify(openOrders)}, expected "0 open orders"`)
      return { stock }
    })

    clearTimeout(budget)
    const seconds = Number(((Date.now() - startedAt) / 1000).toFixed(1))
    console.log(JSON.stringify({ ok: true, contract: CONTRACT, viewport: `${VIEWPORT.width}x${VIEWPORT.height}`, browser: product, steps, seconds }))
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
      const workspace = await readWorkspace().catch(() => null)
      if (workspace) {
        diagnostics.workspace = {
          items: workspace.items.map((item) => ({ sku: item.sku, onHand: item.onHand, price: item.price })),
          orders: workspace.orders.map((order) => ({ id: order.id, status: order.status, paymentStatus: order.paymentStatus, total: order.total, quantity: order.quantity })),
          movements: workspace.movements.length,
        }
      }
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)
      const shot = join(outDir, `failure-${currentStep}.png`)
      await writeFile(shot, Buffer.from(data, 'base64'))
      diagnostics.screenshot = shot
    } catch (diagError) {
      diagnostics.diagnosticsError = diagError.message
    }
    console.error(`SHOP CASH-SALE JOURNEY FAILED at step "${currentStep}": ${error.message}`)
    console.error(JSON.stringify({ ok: false, contract: CONTRACT, steps, ...diagnostics }, null, 2))
    process.exitCode = 1
  } finally {
    proc.kill('SIGKILL')
    server.close()
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((err) => {
  console.error(err instanceof JourneyError ? `SHOP CASH-SALE JOURNEY FAILED at step "${err.step}": ${err.message}` : err)
  process.exit(1)
})
