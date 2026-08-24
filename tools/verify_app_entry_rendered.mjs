#!/usr/bin/env node
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(root, 'showroom', 'dist')
const args = process.argv.slice(2)

function argValue(name, fallback = '') {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}

const outFile = argValue('--out')
const explicitChromium = argValue('--chromium', process.env.CHROMIUM_BIN || '')

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
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId)
  if (exceptionDetails) throw new Error(`page eval failed: ${exceptionDetails.text}`)
  return result.value
}

function seedScript(seed) {
  return `
try {
  localStorage.clear();
  ${seed.lastProduct ? `localStorage.setItem('supermega.last-product.v1', ${JSON.stringify(seed.lastProduct)});` : ''}
  ${seed.productSetups ? `localStorage.setItem('supermega.product_setups.v1', ${JSON.stringify(JSON.stringify(seed.productSetups))});` : ''}
} catch (error) {
  window.__supermegaSeedError = String(error && error.message ? error.message : error);
}`
}

async function waitForRenderedState(cdp, sessionId, expectedPath, expectedText) {
  const deadline = Date.now() + 15_000
  let latest = null
  while (Date.now() < deadline) {
    latest = await evalInPage(cdp, sessionId, `(() => ({
      path: location.pathname + location.search,
      text: document.body ? document.body.innerText : '',
      bodyLength: document.body ? document.body.innerText.trim().length : 0,
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
      const off = cdp.on(sessionId, 'Page.loadEventFired', () => {
        off()
        resolveLoad()
      })
      setTimeout(() => {
        off()
        reject(new Error(`timeout loading ${testCase.route}`))
      }, 30_000)
    })
    await cdp.send('Page.navigate', { url: origin + testCase.route }, sessionId)
    await load
    const rendered = await waitForRenderedState(cdp, sessionId, testCase.expectedPath, testCase.expectedText)
    const pathMatches = typeof testCase.expectedPath === 'function'
      ? testCase.expectedPath(rendered?.path || '')
      : rendered?.path === testCase.expectedPath
    const missingText = testCase.expectedText.filter((needle) => !(rendered?.text || '').includes(needle))
    const failures = [
      ...(pathMatches ? [] : [`expected path ${testCase.expectedPathLabel || testCase.expectedPath}, got ${rendered?.path || 'unknown'}`]),
      ...(rendered?.bodyLength > 0 ? [] : ['blank page']),
      ...(rendered?.overlay ? ['framework error overlay present'] : []),
      ...(rendered?.seedError ? [`seed error: ${rendered.seedError}`] : []),
      ...missingText.map((needle) => `missing text: ${needle}`),
      ...errors,
    ]
    return {
      name: testCase.name,
      route: testCase.route,
      viewport: `${testCase.width}x${testCase.height}${testCase.mobile ? ' mobile' : ''}`,
      path: rendered?.path || '',
      bodyLength: rendered?.bodyLength || 0,
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
  const browserBin = findBrowser()
  const userDataDir = await mkdtemp(join(tmpdir(), 'supermega-entry-rendered-'))
  const server = await startServer()
  const origin = `http://127.0.0.1:${server.address().port}`
  const { browser, wsUrl } = await launchBrowser(browserBin, userDataDir)
  const cdp = await Cdp.connect(wsUrl)
  try {
    const version = await cdp.send('Browser.getVersion')
    const cases = []
    for (const testCase of tests) cases.push(await verifyCase(cdp, origin, testCase))
    const failures = cases.flatMap((entry) => entry.failures.map((failure) => `${entry.name}: ${failure}`))
    const report = {
      ok: failures.length === 0,
      contract: 'supermega.app-entry-rendered.v1',
      head: gitHead(),
      browser: version.product,
      origin,
      dist: distDir,
      cases,
      checks: cases.length,
      failures,
    }
    const serialized = JSON.stringify(report, null, 2)
    if (outFile) await writeFile(outFile, `${serialized}\n`)
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
    contract: 'supermega.app-entry-rendered.v1',
    head: gitHead(),
    failures: [error.message],
  }
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
})
