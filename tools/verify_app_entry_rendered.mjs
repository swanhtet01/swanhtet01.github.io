#!/usr/bin/env node
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

import {
  APP_ENTRY_RENDERED_CONTRACT,
  assertEvidenceDirectoryReady,
  assertExpectedHead,
  assertRenderedProofProvenanceStable,
  buildEvidenceDescriptor,
  buildScreenshotEvidence,
  collectRenderedProofProvenance,
  signedRenderedProof,
} from './rendered_proof_provenance.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(root, 'showroom', 'dist')
const args = process.argv.slice(2)

function argValue(name, fallback = '') {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}

const outFile = argValue('--out')
const screenshotDir = argValue('--screenshot-dir')
const expectedHead = argValue('--expected-head')
const shopOnly = args.includes('--shop-only')
const explicitChromium = argValue('--chromium', process.env.CHROMIUM_BIN || '')
const verifierPath = fileURLToPath(import.meta.url)

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
}

function findBrowser() {
  const candidates = [
    explicitChromium,
    process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '',
    process.platform === 'win32' ? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' : '',
    process.platform === 'win32' ? 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' : '',
    process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : '',
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '',
    process.platform === 'darwin' ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' : '',
    '/opt/pw-browsers/chromium-1181/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    'chromium',
    'google-chrome',
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (candidate.includes(sep) || /^[A-Za-z]:[\\/]/.test(candidate)) {
      if (existsSync(candidate)) return candidate
      continue
    }
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' })
    if (!probe.error) return candidate
  }
  throw new Error('No Chromium-compatible browser found. Set CHROMIUM_BIN or pass --chromium.')
}

function startServer() {
  const server = createServer((request, response) => {
    let pathname
    try {
      pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname)
    } catch {
      response.writeHead(400).end('bad request')
      return
    }

    let filePath = normalize(join(distDir, pathname))
    if (filePath !== distDir && !filePath.startsWith(distDir + sep)) {
      response.writeHead(403).end()
      return
    }

    let extension = extname(filePath)
    const fileExists = existsSync(filePath) && statSync(filePath).isFile()
    if (!fileExists) {
      if (extension) {
        response.writeHead(404).end('not found')
        return
      }
      filePath = join(distDir, 'index.html')
      extension = '.html'
    }

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': mime[extension] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    })
    createReadStream(filePath).pipe(response)
  })
  return new Promise((resolveStarted) => {
    server.listen(0, '127.0.0.1', () => resolveStarted(server))
  })
}

function reservePort() {
  const server = createServer()
  return new Promise((resolvePort, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
  })
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`))
        else pending.resolve(message.result)
        return
      }
      const key = `${message.sessionId || ''}:${message.method}`
      for (const listener of this.listeners.get(key) || []) listener(message.params)
    })
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl)
    await new Promise((resolveConnected, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout connecting to browser websocket')), 30_000)
      ws.addEventListener('open', () => {
        clearTimeout(timer)
        resolveConnected()
      }, { once: true })
      ws.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error(`failed to connect to ${wsUrl}`))
      }, { once: true })
    })
    return new Cdp(ws)
  }

  send(method, params = {}, sessionId = '') {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    return new Promise((resolveSent, reject) => {
      this.pending.set(id, { resolve: resolveSent, reject, method })
    })
  }

  on(sessionId, method, listener) {
    const key = `${sessionId || ''}:${method}`
    if (!this.listeners.has(key)) this.listeners.set(key, [])
    this.listeners.get(key).push(listener)
    return () => {
      const listeners = this.listeners.get(key) || []
      const index = listeners.indexOf(listener)
      if (index >= 0) listeners.splice(index, 1)
    }
  }

  async close() {
    this.ws.close()
  }
}

async function launchBrowser(browserBin, userDataDir) {
  const debugPort = await reservePort()
  let stderr = ''
  let exited = null
  const browser = spawn(browserBin, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  browser.stderr.on('data', (chunk) => { stderr += chunk })
  browser.on('exit', (code) => { exited = code })

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
      if (response.ok) {
        const version = await response.json()
        if (version.webSocketDebuggerUrl) return { browser, wsUrl: version.webSocketDebuggerUrl }
      }
    } catch {
      // Browser startup is still in progress.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  const exitNote = exited === null ? 'still running' : `exited with code ${exited}`
  throw new Error(`browser did not expose DevTools on port ${debugPort} (${exitNote}). ${stderr.trim()}`.trim())
}

async function evalInPage(cdp, sessionId, expression) {
  let timeout
  const { result, exceptionDetails } = await Promise.race([
    cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId),
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('timeout evaluating rendered page state')), 10_000)
    }),
  ]).finally(() => clearTimeout(timeout))
  if (exceptionDetails) {
    const detail = exceptionDetails.exception?.description || exceptionDetails.exception?.value || exceptionDetails.text || 'unknown page exception'
    const location = Number.isInteger(exceptionDetails.lineNumber) && Number.isInteger(exceptionDetails.columnNumber)
      ? ` at ${exceptionDetails.lineNumber + 1}:${exceptionDetails.columnNumber + 1}`
      : ''
    throw new Error(`page eval failed: ${String(detail).replace(/\s+/g, ' ').trim()}${location}`)
  }
  return result.value
}

function seedScript(seed) {
  return `
try {
  if (!sessionStorage.getItem('supermega.entry-rendered.seeded.v1')) {
    localStorage.clear();
    ${seed.lastProduct ? `localStorage.setItem('supermega.last-product.v1', ${JSON.stringify(seed.lastProduct)});` : ''}
    ${seed.productSetups ? `localStorage.setItem('supermega.product_setups.v1', ${JSON.stringify(JSON.stringify(seed.productSetups))});` : ''}
    sessionStorage.setItem('supermega.entry-rendered.seeded.v1', 'true');
  }
} catch (error) {
  window.__supermegaSeedError = String(error && error.message ? error.message : error);
}`
}

async function waitForRenderedState(cdp, sessionId, expectedPath, expectedText, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let latest = null
  while (Date.now() < deadline) {
    latest = await evalInPage(cdp, sessionId, `(() => ({
      path: location.pathname + location.search,
      text: document.body ? document.body.innerText : '',
      bodyLength: document.body ? document.body.innerText.trim().length : 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentScrollWidth: document.documentElement ? document.documentElement.scrollWidth : 0,
      overlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')),
      seedError: window.__supermegaSeedError || '',
    }))()`)
    const text = latest.text || ''
    const matchesPath = typeof expectedPath === 'function'
      ? expectedPath(latest.path)
      : latest.path === expectedPath
    if (matchesPath && latest.bodyLength > 0 && expectedText.every((needle) => text.includes(needle))) return latest
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  return latest
}

async function exerciseShopCounter(cdp, sessionId, mobile) {
  const added = await evalInPage(cdp, sessionId, `(() => {
    const tile = [...document.querySelectorAll('.shop-product-tile')]
      .find((candidate) => candidate.textContent.includes('Premium rice 25kg'));
    if (!tile || tile.disabled) return false;
    tile.click();
    return true;
  })()`)
  if (!added) return { ok: false, error: 'mini-mart product tile was not actionable' }

  const deadline = Date.now() + 5_000
  if (mobile) {
    let opened = false
    while (Date.now() < deadline && !opened) {
      opened = await evalInPage(cdp, sessionId, `(() => {
        const button = document.querySelector('.shop-mobile-cart');
        if (!button) return false;
        button.click();
        return true;
      })()`)
      if (!opened) await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    }
    if (!opened) return { ok: false, error: 'mobile current-sale drawer did not open' }
  }

  const expectedText = ['PAYMENT', 'Keep as open order', 'Total', 'Review & complete sale']
  let state = null
  while (Date.now() < deadline) {
    state = await evalInPage(cdp, sessionId, `(() => {
      const isMobile = ${mobile ? 'true' : 'false'};
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
      };
      const text = document.body ? document.body.innerText : '';
      const target = (element) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        const name = String(element.getAttribute('aria-label') || element.innerText || element.textContent || '').trim();
        return { namePresent: Boolean(name), focusable: !element.disabled && element.tabIndex >= 0, width: box.width, height: box.height };
      };
      const productTile = [...document.querySelectorAll('.shop-product-tile')]
        .find((candidate) => candidate.textContent.includes('Premium rice 25kg'));
      const paymentButtons = [...document.querySelectorAll('.shop-payment-options button')].map(target);
      const openOrderInput = document.querySelector('.shop-open-order-choice input[type="checkbox"]');
      const openOrderLabel = document.querySelector('.shop-open-order-choice');
      const reviewControl = document.querySelector('.shop-review-sale');
      const quantityButtons = [...document.querySelectorAll('.shop-quantity-stepper button')].map(target);
      const touchTargets = isMobile
        ? [target(productTile), ...paymentButtons, target(openOrderLabel), target(reviewControl), ...quantityButtons].filter(Boolean)
        : [];
      const semanticChecks = {
        productTileLabelled: Boolean(productTile?.getAttribute('aria-labelledby') && productTile?.getAttribute('aria-describedby')),
        paymentButtonCount: paymentButtons.length,
        paymentButtonsNamed: paymentButtons.every((entry) => entry?.namePresent),
        paymentPressedStatePresent: [...document.querySelectorAll('.shop-payment-options button')]
          .every((button) => button.hasAttribute('aria-pressed')),
        openOrderCheckboxLabelled: Boolean(openOrderInput && openOrderLabel?.textContent?.trim()),
        reviewButtonNamed: Boolean(target(reviewControl)?.namePresent),
        criticalControlsFocusable: [...paymentButtons, target(openOrderInput), target(reviewControl)]
          .filter(Boolean)
          .every((entry) => entry.focusable),
      };
      const accessibility = {
        ok: semanticChecks.productTileLabelled
          && semanticChecks.paymentButtonCount === 5
          && semanticChecks.paymentButtonsNamed
          && semanticChecks.paymentPressedStatePresent
          && semanticChecks.openOrderCheckboxLabelled
          && semanticChecks.reviewButtonNamed
          && semanticChecks.criticalControlsFocusable
          && (!isMobile || touchTargets.every((entry) => entry.height + 0.25 >= 44)),
        semantics: semanticChecks,
        touchTargets: {
          required: isMobile,
          minimumHeightPx: isMobile ? 44 : null,
          roundingTolerancePx: isMobile ? 0.25 : null,
          checked: touchTargets.length,
          minimumObservedHeightPx: touchTargets.length ? Math.min(...touchTargets.map((entry) => entry.height)) : null,
        },
      };
      return {
        text,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentScrollWidth: document.documentElement ? document.documentElement.scrollWidth : 0,
        payment: rect('.shop-sale-details fieldset'),
        openOrderChoice: rect('.shop-open-order-choice'),
        total: rect('.shop-current-sale > footer'),
        reviewButton: rect('.shop-review-sale'),
        accessibility,
      };
    })()`)
    if (expectedText.every((needle) => (state?.text || '').includes(needle))
      && state?.payment && state?.openOrderChoice && state?.total && state?.reviewButton) break
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  const missingText = expectedText.filter((needle) => !(state?.text || '').includes(needle))
  const aboveFold = ['payment', 'openOrderChoice', 'total', 'reviewButton'].every((key) => {
    const box = state?.[key]
    return box && box.top >= -1 && box.bottom <= state.viewportHeight + 1
  })
  return {
    ok: missingText.length === 0 && Boolean(state?.payment && state?.openOrderChoice && state?.total && state?.reviewButton),
    error: missingText.length ? `counter checkout missing text: ${missingText.join(', ')}` : '',
    aboveFold,
    ...state,
    text: undefined,
  }
}

async function verifyCase(cdp, origin, testCase) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const errors = []
  const disposers = []
  try {
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Log.enable', {}, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: testCase.width,
      height: testCase.height,
      deviceScaleFactor: testCase.mobile ? 3 : 1,
      mobile: Boolean(testCase.mobile),
    }, sessionId)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript(testCase.seed || {}) }, sessionId)
    disposers.push(
      cdp.on(sessionId, 'Runtime.consoleAPICalled', (event) => {
        if (event.type !== 'error') return
        const text = event.args.map((arg) => arg.value || arg.description || '').join(' ')
        if (!/favicon/i.test(text)) errors.push(`console: ${text}`.trim())
      }),
      cdp.on(sessionId, 'Runtime.exceptionThrown', (event) => {
        errors.push(`exception: ${event.exceptionDetails?.text || 'runtime exception'}`)
      }),
      cdp.on(sessionId, 'Log.entryAdded', (event) => {
        if (event.entry?.level !== 'error') return
        const text = event.entry.text || ''
        if (!/favicon/i.test(text)) errors.push(`log: ${text}`.trim())
      }),
    )

    const load = new Promise((resolveLoad, reject) => {
      let timer
      const off = cdp.on(sessionId, 'Page.loadEventFired', () => {
        off()
        clearTimeout(timer)
        resolveLoad()
      })
      timer = setTimeout(() => {
        off()
        reject(new Error(`timeout loading ${testCase.route}`))
      }, 30_000)
    })
    await cdp.send('Page.navigate', { url: origin + testCase.route }, sessionId)
    await load
    const rendered = await waitForRenderedState(cdp, sessionId, testCase.expectedPath, testCase.expectedText, testCase.timeoutMs)
    const shopCounter = testCase.exerciseShopCounter
      ? await exerciseShopCounter(cdp, sessionId, Boolean(testCase.mobile))
      : null
    let screenshot = null
    if (screenshotDir && testCase.screenshotName) {
      const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId)
      const screenshotPath = resolve(screenshotDir, `${testCase.screenshotName}.png`)
      const screenshotPayload = Buffer.from(capture.data, 'base64')
      screenshot = buildScreenshotEvidence({ payload: screenshotPayload, path: screenshotPath, evidenceDir: screenshotDir })
      await writeFile(screenshotPath, screenshotPayload, { flag: 'wx' })
    }
    const pathMatches = typeof testCase.expectedPath === 'function'
      ? testCase.expectedPath(rendered?.path || '')
      : rendered?.path === testCase.expectedPath
    const missingText = testCase.expectedText.filter((needle) => !(rendered?.text || '').includes(needle))
    const renderedViewportMatches = Math.abs((rendered?.viewportWidth ?? 0) - testCase.width) <= 1
      && Math.abs((rendered?.viewportHeight ?? 0) - testCase.height) <= 1
    const counterViewportMatches = !shopCounter
      || Math.abs((shopCounter.viewportWidth ?? 0) - testCase.width) <= 1
        && Math.abs((shopCounter.viewportHeight ?? 0) - testCase.height) <= 1
    const failures = [
      ...(pathMatches ? [] : [`expected path ${testCase.expectedPathLabel || testCase.expectedPath}, got ${rendered?.path || 'unknown'}`]),
      ...(rendered?.bodyLength > 0 ? [] : ['blank page']),
      ...(rendered?.overlay ? ['framework error overlay present'] : []),
      ...(rendered?.seedError ? [`seed error: ${rendered.seedError}`] : []),
      ...(renderedViewportMatches ? [] : [`expected ${testCase.width}x${testCase.height} viewport, got ${rendered?.viewportWidth ?? 'unknown'}x${rendered?.viewportHeight ?? 'unknown'}`]),
      ...(testCase.noHorizontalOverflow && rendered?.documentScrollWidth > rendered?.viewportWidth + 1
        ? [`horizontal overflow: ${rendered.documentScrollWidth}px document in ${rendered.viewportWidth}px viewport`]
        : []),
      ...(shopCounter && !shopCounter.ok ? [shopCounter.error || 'counter checkout exercise failed'] : []),
      ...(shopCounter && !shopCounter.accessibility?.ok ? ['counter accessibility or mobile touch-target contract failed'] : []),
      ...(shopCounter && !shopCounter.aboveFold ? ['counter payment, open-order choice, total, and review control are not all above fold'] : []),
      ...(shopCounter && shopCounter.documentScrollWidth > shopCounter.viewportWidth + 1
        ? [`counter horizontal overflow: ${shopCounter.documentScrollWidth}px document in ${shopCounter.viewportWidth}px viewport`]
        : []),
      ...(counterViewportMatches ? [] : [`counter viewport changed from ${testCase.width}x${testCase.height} to ${shopCounter?.viewportWidth ?? 'unknown'}x${shopCounter?.viewportHeight ?? 'unknown'}`]),
      ...missingText.map((needle) => `missing text: ${needle}`),
      ...errors,
    ]
    return {
      name: testCase.name,
      route: testCase.route,
      viewport: `${testCase.width}x${testCase.height}${testCase.mobile ? ' mobile' : ''}`,
      path: rendered?.path || '',
      bodyLength: rendered?.bodyLength || 0,
      layout: shopCounter,
      screenshot,
      runtime: { clean: errors.length === 0, errors: [...errors] },
      ok: failures.length === 0,
      failures,
    }
  } finally {
    for (const dispose of disposers) dispose()
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {})
  }
}

function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}

const launcherText = [
  'Switch product',
  'First action',
  'Shop',
  'Complete a sample sale',
  'Plant',
  'Run a sample production job',
  'Website',
  'Preview a business website',
  'Ecommerce',
  'Send a sample order to Shop',
]

const shopSetup = {
  commerce: {
    product: 'commerce',
    templateId: 'spa',
    workspace: 'Pilot Spa Workspace',
    owner: 'Owner',
    entryPoint: 'Counter',
    currentRecord: 'Sample sale',
    baseline: 'Manual orders',
    targetOutcome: 'Reviewed close',
    authorityBoundary: 'No external effects',
    acceptanceEvidence: 'Operator review',
    startedAt: '2026-08-24T00:00:00.000Z',
    savedAt: '2026-08-24T00:00:00.000Z',
  },
}

const tests = [
  {
    name: 'desktop root shows launcher despite remembered product',
    route: '/',
    width: 1280,
    height: 900,
    expectedPath: '/',
    expectedText: [...launcherText, 'Continue saved workspace: Pilot Spa Workspace'],
    seed: { lastProduct: 'production', productSetups: shopSetup },
  },
  {
    name: 'desktop choose query shows launcher',
    route: '/?choose=1',
    width: 1280,
    height: 900,
    expectedPath: '/?choose=1',
    expectedText: launcherText,
    seed: { lastProduct: 'commerce' },
  },
  {
    name: 'mobile root shows launcher',
    route: '/',
    width: 360,
    height: 800,
    mobile: true,
    expectedPath: '/',
    expectedText: launcherText,
    seed: { lastProduct: 'ecommerce' },
  },
  {
    name: 'demo shop opens explicit shop route',
    route: '/?demo=shop',
    width: 1280,
    height: 900,
    expectedPath: (path) => path.startsWith('/shop/'),
    expectedPathLabel: '/shop/',
    expectedText: ['Shop'],
    seed: {},
  },
  {
    name: 'desktop trade link opens a complete mini-mart counter',
    route: '/shop/?template=mini-mart',
    width: 1280,
    height: 900,
    expectedPath: (path) => path.startsWith('/shop/?') && path.includes('tab=counter') && path.includes('template=mini-mart'),
    expectedPathLabel: '/shop/?tab=counter&template=mini-mart',
    expectedText: ['Mini-mart & grocery', 'Tap an item to add it', 'Premium rice 25kg', 'LOCAL DEMO'],
    exerciseShopCounter: true,
    noHorizontalOverflow: true,
    screenshotName: 'shop-counter-mini-mart-desktop-1280x900',
    timeoutMs: 60_000,
    seed: {},
  },
  {
    name: 'mobile trade link keeps the complete mini-mart checkout in view',
    route: '/shop/?template=mini-mart',
    width: 390,
    height: 844,
    mobile: true,
    expectedPath: (path) => path.startsWith('/shop/?') && path.includes('tab=counter') && path.includes('template=mini-mart'),
    expectedPathLabel: '/shop/?tab=counter&template=mini-mart',
    expectedText: ['Mini-mart & grocery', 'Tap an item to add it', 'Premium rice 25kg', 'LOCAL DEMO'],
    exerciseShopCounter: true,
    noHorizontalOverflow: true,
    screenshotName: 'shop-counter-mini-mart-mobile-390x844',
    timeoutMs: 60_000,
    seed: {},
  },
  {
    name: 'demo plant opens explicit plant route',
    route: '/?demo=plant',
    width: 1280,
    height: 900,
    expectedPath: (path) => path.startsWith('/plant/'),
    expectedPathLabel: '/plant/',
    expectedText: ['Plant'],
    seed: {},
  },
  {
    name: 'demo website opens explicit website route',
    route: '/?demo=website',
    width: 1280,
    height: 900,
    expectedPath: (path) => path.startsWith('/website/'),
    expectedPathLabel: '/website/',
    expectedText: ['Website'],
    seed: {},
  },
  {
    name: 'demo ecommerce opens explicit ecommerce route',
    route: '/?demo=ecommerce',
    width: 1280,
    height: 900,
    expectedPath: (path) => path.startsWith('/ecommerce/'),
    expectedPathLabel: '/ecommerce/',
    expectedText: ['Ecommerce'],
    seed: {},
  },
]

async function main() {
  if (!existsSync(join(distDir, 'index.html'))) throw new Error(`Missing build at ${distDir}; run npm run app:build first.`)
  if (!outFile || !screenshotDir) throw new Error('app_entry_rendered_evidence_paths_required')
  const evidence = buildEvidenceDescriptor({ evidenceDir: screenshotDir, outputPath: outFile })
  await assertEvidenceDirectoryReady(screenshotDir)
  const provenanceBefore = await collectRenderedProofProvenance({ root, distDir, verifierPath })
  assertExpectedHead(provenanceBefore, expectedHead)
  if (screenshotDir) await mkdir(resolve(screenshotDir), { recursive: true })
  const browserBin = findBrowser()
  const userDataDir = await mkdtemp(join(tmpdir(), 'supermega-entry-rendered-'))
  const server = await startServer()
  const origin = `http://127.0.0.1:${server.address().port}`
  const { browser, wsUrl } = await launchBrowser(browserBin, userDataDir)
  const cdp = await Cdp.connect(wsUrl)
  try {
    const version = await cdp.send('Browser.getVersion')
    const cases = []
    const selectedTests = shopOnly ? tests.filter((testCase) => testCase.exerciseShopCounter) : tests
    for (const testCase of selectedTests) cases.push(await verifyCase(cdp, origin, testCase))
    const failures = cases.flatMap((entry) => entry.failures.map((failure) => `${entry.name}: ${failure}`))
    const provenanceAfter = await collectRenderedProofProvenance({ root, distDir, verifierPath })
    assertRenderedProofProvenanceStable(provenanceBefore, provenanceAfter)
    const body = {
      ok: failures.length === 0,
      contract: APP_ENTRY_RENDERED_CONTRACT,
      generatedAt: new Date().toISOString(),
      scope: shopOnly ? 'shop-counter' : 'full',
      evidence,
      ...provenanceBefore,
      sourceSha: provenanceBefore.source.commit,
      sourceTreeSha: provenanceBefore.source.tree,
      sourceTreeClean: provenanceBefore.source.clean,
      distManifestSha256: provenanceBefore.artifact.digest,
      verifierSha256: provenanceBefore.verifier.digest,
      browser: version.product,
      cases,
      checks: cases.length,
      runtime: {
        clean: cases.every((entry) => entry.runtime.clean),
        errorCount: cases.reduce((total, entry) => total + entry.runtime.errors.length, 0),
      },
      failures,
    }
    const report = signedRenderedProof(body)
    const serialized = JSON.stringify(report, null, 2)
    await writeFile(outFile, `${serialized}\n`, { flag: 'wx' })
    if (report.ok) console.log(serialized)
    else {
      console.error(serialized)
      process.exitCode = 1
    }
  } finally {
    await cdp.send('Browser.close').catch(() => {})
    await cdp.close().catch(() => {})
    server.close()
    browser.kill()
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((error) => {
  const report = {
    ok: false,
    contract: APP_ENTRY_RENDERED_CONTRACT,
    scope: shopOnly ? 'shop-counter' : 'full',
    sourceCommit: gitHead(),
    failures: [error.message],
  }
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
})
