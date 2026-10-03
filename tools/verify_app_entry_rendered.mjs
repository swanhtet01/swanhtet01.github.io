#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { startBrowser } from './browser_startup.mjs'
import {
  COMMERCE_ACCOUNTING_HANDOFF_SCHEMA,
  COMMERCE_KEY,
  commerceAccountRoles,
  commerceCloseExpectation,
  commerceOrderAdjustedTotal,
  configureCommerceAccountMapping,
  configureCommercePaymentPolicy,
  createEmptyCommerce,
  createSeedCommerce,
  installCommerceWorkingSampleCatalog,
  saveCommerceClose,
  validateCommerceState,
} from '../showroom/src/core/commerce-workspace.ts'
import { shopBusinessTemplate, shopBusinessTemplateCommerceItems } from '../showroom/src/products/shop/business-templates.ts'
import { buildStorefrontPreview } from '../showroom/src/products/ecommerce/storefront-model.ts'
import { LOCAL_STOREFRONT_DRAFT_SCOPE, STOREFRONT_DRAFT_SCHEMA, storefrontDraftStorageKey, validateStorefrontDraft } from '../showroom/src/products/ecommerce/storefront-draft.ts'
import { captureWebsiteLead, emptyWebsiteLeadLedger, WEBSITE_LEAD_LEDGER_KEY } from '../showroom/src/products/website/website-leads.ts'
import { createInitialWorkspace, WEBSITE_STORAGE_KEY } from '../showroom/src/products/website/website-model.ts'
import { assertLauncherProductLinks } from './validate_app_entry_rendered_report.mjs'
import { RETIRED_PRODUCT_CASES, RETIRED_PRODUCT_PREVIEW_POLICY, RETIRED_STORAGE_KEYS, validateRetiredProductObservation } from './retired_product_preview_policy.mjs'
import { pairedClickScript, validatePairedTransition, activateReadyPairedTransition } from './paired_preview_transition.mjs'
import { installPreviewBrowserAccess, finishPreviewCase } from './preview_scoped_access.mjs'

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
const shopAccountingOnly = args.includes('--shop-accounting-only')
const shopOfflineOnly = args.includes('--shop-offline-only')
const ecommerceClaimOnly = args.includes('--ecommerce-claim-only')
const storeToShopOnly = args.includes('--store-to-shop-only')
const sitesOnly = args.includes('--sites-only')
const explicitChromium = argValue('--chromium', process.env.CHROMIUM_BIN || '')
const verifierPath = fileURLToPath(import.meta.url)
const proofScope = shopOnly ? 'shop-counter'
  : shopAccountingOnly ? 'shop-accounting-export'
    : shopOfflineOnly ? 'shop-offline-restore'
      : ecommerceClaimOnly ? 'ecommerce-claim'
        : storeToShopOnly ? 'store-to-shop'
          : sitesOnly ? 'sites-workspace'
            : 'full'

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

export function findBrowser({ explicit = explicitChromium, exists = existsSync, probe = spawnSync } = {}) {
  if (explicit) {
    if (explicit.includes('/') || explicit.includes('\\')) {
      if (!exists(explicit)) throw new Error('explicit_browser_missing')
    } else {
      const result = probe(explicit, ['--version'], { stdio: 'ignore', timeout: 5_000 })
      if (result.error || result.status !== 0) throw new Error('explicit_browser_unavailable')
    }
    return explicit
  }
  const candidates = [
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
      if (exists(candidate)) return candidate
      continue
    }
    const result = probe(candidate, ['--version'], { stdio: 'ignore', timeout: 5_000 })
    if (!result.error && result.status === 0) return candidate
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

export class Cdp {
  constructor(ws, commandTimeoutMs = 15_000) {
    this.ws = ws
    this.commandTimeoutMs = commandTimeoutMs
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    const disconnected = () => this.rejectPending('browser websocket disconnected')
    ws.addEventListener('close', disconnected)
    ws.addEventListener('error', disconnected)
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        clearTimeout(pending.timer)
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
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error('timeout connecting to browser websocket'))
      }, 30_000)
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

  rejectPending(reason) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`${pending.method}: ${reason}`))
    }
    this.pending.clear()
  }

  send(method, params = {}, sessionId = '', timeoutMs = this.commandTimeoutMs) {
    const id = this.nextId++
    return new Promise((resolveSent, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method}: browser command timed out`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolveSent, reject, method, timer })
      try {
        this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
      } catch {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new Error(`${method}: browser command could not be sent`))
      }
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
    this.rejectPending('browser connection closed')
    this.ws.close()
  }
}

export async function launchBrowser(browserBin, userDataDir) {
  const debugPort = await reservePort()
  return startBrowser(browserBin, [
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
  ], debugPort)
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

// Explicit private fixture: customer navigation must never install these records.
export function miniMartCounterFixture() {
  const template = shopBusinessTemplate('mini-mart')
  const state = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
    sampleId: template.id,
    sampleName: template.name.en,
    items: shopBusinessTemplateCommerceItems(template.id),
    capturedAt: '2026-09-28T00:00:00.000Z',
  })
  if (!state) throw new Error('mini_mart_counter_fixture_invalid')
  return { retained: { [COMMERCE_KEY]: JSON.stringify(state) } }
}

// Explicit private fixture representing products entered by an operator. Keep this
// separate from the working-sample fixture so customer-request acceptance proves
// the live-catalog path while the product continues to reject preview-only rows.
export function miniMartOwnedCatalogFixture() {
  const storeName = 'Mingalar Mini Mart'
  const summary = 'Everyday essentials prepared for pickup or local delivery.'
  const catalogState = validateCommerceState({
    ...createEmptyCommerce(),
    items: shopBusinessTemplateCommerceItems('mini-mart').map((item) => ({ ...item })),
  })
  const state = configureCommercePaymentPolicy(catalogState, {
    adapter: 'pay_on_pickup',
    allowedFulfilments: ['pickup'],
    maximumOrderMmk: 1_000_000,
    instructions: 'Collect at pickup and reconcile the receipt in Shop.',
    status: 'active',
    effectiveFrom: '2026-09-28T00:00:00.000Z',
    effectiveUntil: null,
  }, {
    actionId: 'ACT-RENDERED-MINIMART-PAYMENT-001',
    capturedAt: '2026-09-28T00:00:00.000Z',
    actor: 'Mini Mart owner',
    reason: 'Enable pay on pickup for the rendered Ecommerce acceptance journey.',
    evidenceReference: 'RENDERED-MINIMART-PAYMENT-001',
  })
  if (!state) throw new Error('mini_mart_owned_payment_fixture_invalid')
  const preview = buildStorefrontPreview(state.items, {
    storeName,
    summary,
    selectedSkus: state.items.slice(0, 4).map((item) => item.sku),
  })
  const sourcePreviewDigest = `sha256:${createHash('sha256').update(JSON.stringify(preview)).digest('hex')}`
  const draft = validateStorefrontDraft({
    schema: STOREFRONT_DRAFT_SCHEMA,
    scope: LOCAL_STOREFRONT_DRAFT_SCOPE,
    revision: 1,
    savedAt: '2026-09-28T00:00:00.000Z',
    storeName,
    summary,
    selectedSkus: preview.items.map((item) => item.sku),
    sourcePreviewDigest,
  }, LOCAL_STOREFRONT_DRAFT_SCOPE)
  return { retained: {
    [COMMERCE_KEY]: JSON.stringify(state),
    [storefrontDraftStorageKey(LOCAL_STOREFRONT_DRAFT_SCOPE)]: JSON.stringify(draft),
  } }
}

// Explicit private fixture for the completed-close export journey. It uses the
// same validated model transitions as the product and is installed only in an
// isolated browser context; customer navigation never creates this close.
export function shopCompletedCloseFixture() {
  const mappingCapturedAt = '2026-07-23T07:59:00.000Z'
  const closeCapturedAt = '2026-07-23T08:00:00.000Z'
  const mapped = configureCommerceAccountMapping(createSeedCommerce(), {
    mappings: commerceAccountRoles.map((accountRole, index) => ({
      accountRole,
      externalAccountCode: String(1000 + index * 100),
    })),
  }, {
    actionId: 'ACT-RENDERED-ACCOUNTING-MAPPING-001',
    capturedAt: mappingCapturedAt,
    actor: 'Synthetic Shop owner',
    reason: 'Exercise the completed-close accounting download in isolated rendered acceptance.',
    evidenceReference: 'RENDERED-ACCOUNTING-MAPPING-001',
  })
  if (!mapped) throw new Error('shop_completed_close_mapping_fixture_invalid')
  const expectation = commerceCloseExpectation(mapped, closeCapturedAt)
  if (!expectation?.orderIds.length) throw new Error('shop_completed_close_expectation_fixture_invalid')
  const expectedByPayment = new Map()
  for (const orderId of expectation.orderIds) {
    const order = mapped.orders.find((candidate) => candidate.id === orderId)
    const adjustedTotal = order ? commerceOrderAdjustedTotal(order) : null
    if (!order || adjustedTotal === null) throw new Error('shop_completed_close_order_fixture_invalid')
    expectedByPayment.set(order.payment, (expectedByPayment.get(order.payment) ?? 0) + adjustedTotal)
  }
  const closed = saveCommerceClose(mapped, 'CLOSE-33333333-3333-4333-8333-333333333333', {
    actionId: 'ACT-33333333-3333-4333-8333-333333333333',
    capturedAt: closeCapturedAt,
    actor: 'Synthetic Shop owner',
    reason: 'Complete the isolated rendered accounting export acceptance close.',
    evidenceReference: 'RENDERED-ACCOUNTING-CLOSE-001',
  }, expectation, [...expectedByPayment.entries()].map(([paymentMethod, countedMmk]) => ({
    paymentMethod,
    countedMmk,
    varianceOwner: '',
    varianceReason: '',
  })))
  if (!closed) throw new Error('shop_completed_close_fixture_invalid')
  return { retained: { [COMMERCE_KEY]: JSON.stringify(closed) } }
}

// Explicit private fixture representing a real saved owner workspace and one
// consented synthetic inquiry. It deliberately has no working-sample marker:
// the captured Pages and Inquiries screens are the product's normal saved state.
export function sitesOwnerWorkspaceFixture() {
  const capturedAt = '2026-09-28T00:00:00.000Z'
  const initialWorkspace = createInitialWorkspace()
  const workspace = {
    ...initialWorkspace,
    revision: 1,
    contentRevision: 1,
    pages: initialWorkspace.pages.map((page) => ({ ...page, updatedAt: capturedAt })),
  }
  const leadLedger = captureWebsiteLead(emptyWebsiteLeadLedger(), {
    siteName: workspace.siteName,
    sourcePage: '/contact',
    name: 'Daw Mya',
    contact: '09 420 555 019',
    request: 'Needs a weekly grocery delivery quote for a small office, starting next Monday.',
    consentRecorded: true,
  }, {
    id: 'LEAD-RENDERED-SITES-001',
    now: capturedAt,
  })
  return { retained: {
    [WEBSITE_STORAGE_KEY]: JSON.stringify(workspace),
    [WEBSITE_LEAD_LEDGER_KEY]: JSON.stringify(leadLedger),
  } }
}

export function seedScript(seed) {
  return `
try {
  if (!sessionStorage.getItem('supermega.entry-rendered.seeded.v1')) {
    localStorage.clear();
    ${seed.lastProduct ? `localStorage.setItem('supermega.last-product.v1', ${JSON.stringify(seed.lastProduct)});` : ''}
    ${seed.productSetups ? `localStorage.setItem('supermega.product_setups.v1', ${JSON.stringify(JSON.stringify(seed.productSetups))});` : ''}
    ${seed.retained ? Object.entries(seed.retained).map(([key, value]) => `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('') : ''}
    sessionStorage.setItem('supermega.entry-rendered.seeded.v1', 'true');
  }
} catch (error) {
  window.__supermegaSeedError = String(error && error.message ? error.message : error);
}`
}

export function renderedStateScript(retirement = false) {
  return `(() => ({
      origin: location.origin,
      path: location.pathname + location.search,
      hash: location.hash,
      text: document.body ? document.body.innerText : '',
      bodyLength: document.body ? document.body.innerText.trim().length : 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentScrollWidth: document.documentElement ? document.documentElement.scrollWidth : 0,
      overlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')),
      seedError: window.__supermegaSeedError || '',
      ${retirement ? `retained: Object.fromEntries(${JSON.stringify(RETIRED_STORAGE_KEYS)}.map(key => [key, localStorage.getItem(key)])),
      retiredToolVisible: [...document.querySelectorAll('h1,h2,h3,[role="heading"]')].some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && /^(Plant|Production|Record first shift output)$/i.test(el.textContent.trim())),
      retiredActionVisible: [...document.querySelectorAll('a,button')].some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && (/\\b(plant|production|first shift)\\b/i.test(el.textContent) || /(?:\\/plant(?:\\/|\\?|$)|\\/operations\\/production|[?&](?:product|demo)=(?:plant|production|factory)(?:&|$))/i.test(el.getAttribute('href') || ''))),` : ''}
      launcherLinks: [...document.querySelectorAll('nav[aria-label="Your workspace"] a')]
        .filter(link => link.getClientRects().length && getComputedStyle(link).visibility !== 'hidden')
        .map(link => ({ name: link.querySelector('h2')?.textContent.trim() || '', href: link.getAttribute('href') })),
    }))()`
}

async function readRenderedState(cdp, sessionId, retirement = false) {
  return evalInPage(cdp, sessionId, renderedStateScript(retirement))
}

function matchesExpectedPath(expectedPath, value) {
  return typeof expectedPath === 'function' ? expectedPath(value) : value === expectedPath
}

export function evaluateFinalRenderedLocation({ beforeCapture, afterCapture, expectedOrigin, expectedPath, expectedPathLabel }) {
  const before = beforeCapture || {}
  const after = afterCapture || {}
  const label = expectedPathLabel || expectedPath
  const locationStable = before.origin === after.origin && before.path === after.path && before.hash === after.hash
  const failures = [
    ...(matchesExpectedPath(expectedPath, before.path || '') ? [] : [`expected final path ${label}, got ${before.path || 'unknown'} before screenshot`]),
    ...(!expectedOrigin || before.origin === expectedOrigin ? [] : [`expected final origin ${expectedOrigin}, got ${before.origin || 'unknown'} before screenshot`]),
    ...(before.hash === '' ? [] : [`expected empty final hash, got ${before.hash || 'unknown'} before screenshot`]),
    ...(locationStable ? [] : ['rendered location changed during screenshot capture']),
    ...(matchesExpectedPath(expectedPath, after.path || '') ? [] : [`expected final path ${label}, got ${after.path || 'unknown'} after screenshot`]),
    ...(!expectedOrigin || after.origin === expectedOrigin ? [] : [`expected final origin ${expectedOrigin}, got ${after.origin || 'unknown'} after screenshot`]),
    ...(after.hash === '' ? [] : [`expected empty final hash, got ${after.hash || 'unknown'} after screenshot`]),
  ]
  return {
    final: {
      origin: String(after.origin || ''),
      path: String(after.path || ''),
      hash: String(after.hash || ''),
    },
    ok: failures.length === 0,
    failures,
  }
}

async function waitForRenderedState(cdp, sessionId, expectedPath, expectedText, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let latest = null
  while (Date.now() < deadline) {
    latest = await readRenderedState(cdp, sessionId)
    const text = latest.text || ''
    const matchesPath = matchesExpectedPath(expectedPath, latest.path)
    if (matchesPath && latest.bodyLength > 0 && expectedText.every((needle) => text.includes(needle))) return latest
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  return latest
}

export function counterCaptureReady(state) {
  return ['PAYMENT', 'Keep as open order', 'Total', 'Review & complete sale']
    .every(needle => (state?.text || '').includes(needle))
    && Boolean(state?.payment && state?.openOrderChoice && state?.total && state?.reviewButton)
    && state?.drawerTransitionSettled === true && state?.accessibility?.ok === true
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
      const currentSale = document.querySelector('.shop-current-sale');
      const quantityButtons = [...document.querySelectorAll('.shop-quantity-stepper button')].map(target);
      const touchTargets = isMobile
        ? [target(productTile), ...paymentButtons, target(openOrderLabel), target(reviewControl), ...quantityButtons].filter(Boolean)
        : [];
      const drawerTransitionSettled = !isMobile || Boolean(currentSale
        && getComputedStyle(currentSale).transform === 'none'
        && Number.parseFloat(getComputedStyle(currentSale).opacity) === 1);
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
        drawerTransitionSettled,
        accessibility,
      };
    })()`)
    if (counterCaptureReady(state)) break
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  const missingText = expectedText.filter((needle) => !(state?.text || '').includes(needle))
  const drawerSettled = !mobile || state?.drawerTransitionSettled === true
  const aboveFold = ['payment', 'openOrderChoice', 'total', 'reviewButton'].every((key) => {
    const box = state?.[key]
    return box && box.top >= -1 && box.bottom <= state.viewportHeight + 1
  })
  return {
    ok: missingText.length === 0 && drawerSettled && Boolean(state?.payment && state?.openOrderChoice && state?.total && state?.reviewButton),
    error: missingText.length
      ? `counter checkout missing text: ${missingText.join(', ')}`
      : drawerSettled ? '' : 'mobile current-sale drawer transition did not settle',
    aboveFold,
    ...state,
    text: undefined,
  }
}

async function exerciseShopDecisionDesk(cdp, sessionId, mobile, sourceControlledFixture) {
  const deadline = Date.now() + 10_000
  let state = null
  while (Date.now() < deadline) {
    state = await evalInPage(cdp, sessionId, `(() => {
      const desk = document.querySelector('section[aria-label="Shop decision desk"]');
      const recommendation = desk?.querySelector('.shop-decision-primary');
      const action = recommendation?.querySelector('a.shop-decision-action');
      const guidance = [...(recommendation?.querySelectorAll('.shop-decision-guidance > div') || [])].map((entry) => ({
        label: entry.querySelector('span')?.textContent?.trim() || '',
        value: entry.querySelector('p')?.textContent?.trim() || '',
      }));
      const rail = desk?.querySelector('aside[aria-label="Shop attention"]');
      const priorities = [...(rail?.querySelectorAll('a[data-priority-id]') || [])].map((entry) => ({
        id: entry.getAttribute('data-priority-id') || '',
        target: entry.getAttribute('href') || '',
        named: Boolean(entry.textContent?.trim()),
        hasImpact: Boolean(entry.querySelector(':scope > span > small')?.textContent?.trim()),
        hasNext: [...entry.querySelectorAll(':scope > small')].some((small) => small.textContent?.trim().startsWith('Next:')),
        hasClosure: [...entry.querySelectorAll(':scope > small')].some((small) => small.textContent?.trim().startsWith('Done when:')),
      }));
      const queue = document.querySelector('nav[aria-label="Shop work queues"]');
      const queues = [...(queue?.querySelectorAll(':scope > a[href]') || [])].map((entry) => ({
        name: entry.querySelector('strong')?.textContent?.trim() || '',
        target: entry.getAttribute('href') || '',
        status: entry.querySelector(':scope > b')?.textContent?.trim() || '',
      }));
      const advanced = document.querySelector('details[aria-label="Advanced Shop controls"]');
      const targets = [action, ...(rail?.querySelectorAll('a[href]') || []), ...(queue?.querySelectorAll('a[href]') || [])].filter(Boolean).map((entry) => {
        const box = entry.getBoundingClientRect();
        return {
          named: Boolean(entry.textContent?.trim()),
          focusable: entry.tabIndex >= 0,
          width: box.width,
          height: box.height,
        };
      });
      const visibleForbidden = [...document.querySelectorAll('.shop-today h1,.shop-today h2,.shop-today h3,.shop-today p,.shop-today a,.shop-today button')]
        .filter((entry) => entry.getClientRects().length && getComputedStyle(entry).visibility !== 'hidden')
        .map((entry) => entry.textContent?.trim() || '')
        .filter((text) => /Local Batch review stays off|Open a demo|Start trial|Working sample/i.test(text));
      return {
        ariaLabel: desk?.getAttribute('aria-label') || '',
        track: desk?.getAttribute('data-track') || '',
        recommendation: recommendation?.querySelector('h3')?.textContent?.trim() || '',
        action: action ? { label: action.textContent?.trim() || '', target: action.getAttribute('href') || '' } : null,
        guidance,
        priorities,
        railPresent: Boolean(rail),
        queues,
        advanced: advanced ? { present: true, open: advanced.open, label: advanced.querySelector('summary strong')?.textContent?.trim() || '' } : null,
        visibleForbidden,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentScrollWidth: document.documentElement?.scrollWidth || 0,
        accessibility: {
          ok: targets.length > 0
            && targets.every((entry) => entry.named && entry.focusable)
            && (!${mobile ? 'true' : 'false'} || targets.every((entry) => entry.width + 0.25 >= 44 && entry.height + 0.25 >= 44)),
          requiredMinimumPx: ${mobile ? '44' : 'null'},
          roundingTolerancePx: ${mobile ? '0.25' : 'null'},
          checked: targets.length,
          minimumObservedWidthPx: targets.length ? Math.min(...targets.map((entry) => entry.width)) : null,
          minimumObservedHeightPx: targets.length ? Math.min(...targets.map((entry) => entry.height)) : null,
        },
      };
    })()`)
    if (state?.recommendation && state?.action && state?.queues?.length === 2 && state?.accessibility?.checked) break
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  const checks = {
    deskPresent: state?.ariaLabel === 'Shop decision desk',
    recommendationPresent: Boolean(state?.recommendation),
    primaryActionPresent: Boolean(state?.action?.label && state?.action?.target),
    reasonPresent: state?.guidance?.some((entry) => entry.label === 'Why now' && entry.value),
    ownerCheckPresent: state?.guidance?.some((entry) => entry.label === 'Owner check' && entry.value),
    attentionRailPresent: state?.railPresent === true,
    priorityEvidenceComplete: !state?.priorities?.length || state.priorities.every((entry) => entry.id && entry.target && entry.named && entry.hasImpact && entry.hasNext && entry.hasClosure),
    twoQueuesPresent: state?.queues?.length === 2 && state.queues.every((entry) => entry.name && entry.target && entry.status),
    advancedClosedByDefault: state?.advanced?.present === true && state?.advanced?.open === false && state?.advanced?.label === 'Advanced controls',
    retiredCopyAbsent: state?.visibleForbidden?.length === 0,
    accessible: state?.accessibility?.ok === true,
    noHorizontalOverflow: Number(state?.documentScrollWidth || 0) <= Number(state?.viewportWidth || 0) + 1,
  }
  return {
    ok: Object.values(checks).every(Boolean),
    fixture: {
      source: sourceControlledFixture ? 'fresh_isolated_browser_context' : 'browser_storage_seeded',
      browserStorageHandEdited: !sourceControlledFixture,
    },
    checks,
    ...state,
  }
}

async function exerciseShopAccountingExport(cdp, sessionId, browserContextId) {
  const downloadDir = resolve(screenshotDir, 'downloads')
  await mkdir(downloadDir, { recursive: true })
  let started = null
  let resolveCompleted
  let rejectCompleted
  const completed = new Promise((resolveDownload, rejectDownload) => {
    resolveCompleted = resolveDownload
    rejectCompleted = rejectDownload
  })
  const offStarted = cdp.on('', 'Browser.downloadWillBegin', (event) => {
    if (!started) started = event
  })
  const offProgress = cdp.on('', 'Browser.downloadProgress', (event) => {
    if (event.state === 'completed') resolveCompleted(event)
    if (event.state === 'canceled') rejectCompleted(new Error('shop_accounting_export_download_canceled'))
  })
  const context = browserContextId ? { browserContextId } : {}
  try {
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
      eventsEnabled: true,
      ...context,
    })
    const control = await evalInPage(cdp, sessionId, `(() => {
      const panel = document.querySelector('[aria-label="Accountant handoff ready"]');
      const button = panel?.querySelector('button[data-shop-accounting-export="accounting-csv-v1"]');
      if (!panel || !button || button.disabled) return null;
      button.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const visible = rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0
        && rect.bottom <= window.innerHeight + 0.25 && rect.right <= window.innerWidth + 0.25
        && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      const label = button.textContent?.trim() || '';
      button.click();
      return {
        visible,
        label,
        businessDate: panel.querySelector('strong')?.textContent?.replace(/^Daily close · /, '').trim() || '',
        mappingReviewed: panel.textContent?.includes('Mapping reviewed') || false,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentScrollWidth: document.documentElement?.scrollWidth || 0,
      };
    })()`)
    if (!control) throw new Error('shop_accounting_export_control_missing')
    await Promise.race([
      completed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('shop_accounting_export_download_timeout')), 15_000)),
    ])
    const filename = String(started?.suggestedFilename || '')
    if (!/^supermega-shop-accounting-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\.csv$/u.test(filename)) {
      throw new Error('shop_accounting_export_filename_invalid')
    }
    const downloadPath = resolve(downloadDir, filename)
    if (!downloadPath.startsWith(`${downloadDir}${sep}`)) throw new Error('shop_accounting_export_path_invalid')
    let payload = null
    for (let attempt = 0; attempt < 40 && !payload; attempt += 1) {
      payload = await readFile(downloadPath).catch(() => null)
      if (!payload) await new Promise((resolveWait) => setTimeout(resolveWait, 50))
    }
    if (!payload?.byteLength) throw new Error('shop_accounting_export_file_missing')
    const text = payload.toString('utf8')
    const file = relative(screenshotDir, downloadPath).replaceAll('\\', '/')
    const checks = {
      controlVisible: control.visible === true,
      controlNamed: control.label === 'Download accountant CSV',
      mappingReviewed: control.mappingReviewed === true,
      filenameBounded: filename.startsWith(`supermega-shop-accounting-${control.businessDate}-`),
      bomPresent: payload.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
      schemaPresent: text.includes(COMMERCE_ACCOUNTING_HANDOFF_SCHEMA),
      closeIdPresent: text.includes('CLOSE-33333333-3333-4333-8333-333333333333'),
      reviewBoundaryPresent: text.includes('"review_required","none","false"'),
      businessDatePresent: Boolean(control.businessDate && text.includes(control.businessDate)),
      noHorizontalOverflow: control.documentScrollWidth <= control.viewportWidth + 1,
    }
    return {
      ok: Object.values(checks).every(Boolean),
      checks,
      file,
      filename,
      bytes: payload.byteLength,
      digest: `sha256:${createHash('sha256').update(payload).digest('hex')}`,
      schema: COMMERCE_ACCOUNTING_HANDOFF_SCHEMA,
      businessDate: control.businessDate,
      viewportWidth: control.viewportWidth,
      viewportHeight: control.viewportHeight,
      documentScrollWidth: control.documentScrollWidth,
    }
  } catch (error) {
    return { ok: false, error: String(error?.message || error) }
  } finally {
    offStarted()
    offProgress()
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'default', ...context }).catch(() => {})
  }
}

async function exerciseShopOfflineRestore(cdp, sessionId, expectedPath, expectedText, timeoutMs, offlineTransportFailures) {
  let offline = false
  try {
    const before = await evalInPage(cdp, sessionId, `(async () => {
      const supported = 'serviceWorker' in navigator && 'caches' in window;
      if (!supported) return { supported: false, storageRecord: null, controllerScript: '', cacheCount: 0, cacheEntryCount: 0 };
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 8000));
      const registration = await Promise.race([navigator.serviceWorker.ready, timeout]);
      const deadline = Date.now() + 8000;
      while (!navigator.serviceWorker.controller && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const cacheNames = (await caches.keys()).filter((name) => name.startsWith('supermega-app-'));
      let cacheEntryCount = 0;
      for (const name of cacheNames) cacheEntryCount += (await (await caches.open(name)).keys()).length;
      return {
        supported: true,
        ready: Boolean(registration?.active && registration.active.state === 'activated'),
        storageRecord: localStorage.getItem(${JSON.stringify(COMMERCE_KEY)}),
        controllerScript: navigator.serviceWorker.controller?.scriptURL || '',
        cacheCount: cacheNames.length,
        cacheEntryCount,
      };
    })()`)
    if (!before?.supported || !before?.ready || !before?.controllerScript || !before?.storageRecord
      || before.cacheCount < 1 || before.cacheEntryCount < 1) {
      throw new Error('shop_offline_service_worker_not_ready')
    }

    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
      connectionType: 'none',
    }, sessionId)
    offline = true

    const loaded = new Promise((resolveLoad, rejectLoad) => {
      let timer
      const off = cdp.on(sessionId, 'Page.loadEventFired', () => {
        off()
        clearTimeout(timer)
        resolveLoad()
      })
      timer = setTimeout(() => {
        off()
        rejectLoad(new Error('shop_offline_reload_timeout'))
      }, 30_000)
    })
    await cdp.send('Page.reload', { ignoreCache: true }, sessionId)
    await loaded
    await waitForRenderedState(cdp, sessionId, expectedPath, expectedText, timeoutMs)

    const after = await evalInPage(cdp, sessionId, `(async () => {
      const body = document.body?.innerText || '';
      const cacheNames = (await caches.keys()).filter((name) => name.startsWith('supermega-app-'));
      let cacheEntryCount = 0;
      for (const name of cacheNames) cacheEntryCount += (await (await caches.open(name)).keys()).length;
      return {
        online: navigator.onLine,
        storageRecord: localStorage.getItem(${JSON.stringify(COMMERCE_KEY)}),
        controllerScript: navigator.serviceWorker?.controller?.scriptURL || '',
        cacheCount: cacheNames.length,
        cacheEntryCount,
        route: location.pathname + location.search,
        recordVisible: body.includes('May') && body.includes('Cold drink pack') && body.includes('Daily close'),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentScrollWidth: document.documentElement?.scrollWidth || 0,
      };
    })()`)
    const controllerPath = (() => {
      try { return new URL(after.controllerScript).pathname } catch { return '' }
    })()
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    const checks = {
      serviceWorkerSupported: before.supported === true,
      serviceWorkerReady: before.ready === true,
      controllerActive: controllerPath === '/sw.js',
      sealedCachePresent: after.cacheCount >= 1 && after.cacheEntryCount >= 1,
      offlineModeActive: after.online === false,
      routeRestored: after.route === expectedPath,
      businessRecordRestored: after.recordVisible === true,
      storageRecordPreserved: after.storageRecord === before.storageRecord && Boolean(after.storageRecord),
      expectedFallbackTransportFailure: offlineTransportFailures.length === 1,
      noHorizontalOverflow: after.documentScrollWidth <= after.viewportWidth + 1,
    }
    return {
      ok: Object.values(checks).every(Boolean),
      checks,
      controllerScript: controllerPath,
      cacheCount: after.cacheCount,
      cacheEntryCount: after.cacheEntryCount,
      transportFailureCount: offlineTransportFailures.length,
      viewportWidth: after.viewportWidth,
      viewportHeight: after.viewportHeight,
      documentScrollWidth: after.documentScrollWidth,
    }
  } catch (error) {
    return { ok: false, error: String(error?.message || error) }
  } finally {
    if (offline) {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
        connectionType: 'none',
      }, sessionId).catch(() => {})
    }
  }
}

async function exerciseSitesPages(cdp, sessionId) {
  const opened = await evalInPage(cdp, sessionId, `(() => {
    const workbench = document.querySelector('.website-editor-workbench');
    if (workbench?.getClientRects().length && getComputedStyle(workbench).visibility !== 'hidden') return true;
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent.trim() === 'Edit website');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`)
  if (!opened) return { ok: false, error: 'Sites editor action was not available' }

  const deadline = Date.now() + 10_000
  let state = null
  while (Date.now() < deadline) {
    state = await evalInPage(cdp, sessionId, `(() => {
      const visible = (element) => Boolean(element && element.getClientRects().length
        && getComputedStyle(element).visibility !== 'hidden');
      const pageRail = document.querySelector('.website-page-rail');
      const editor = document.querySelector('.website-editor-workbench > .website-editor-panel');
      const insights = document.querySelector('.website-editor-insights');
      const pageButtons = [...document.querySelectorAll('.website-page-list button')];
      const activePage = document.querySelector('.website-page-list button[aria-current="page"]');
      const checks = {
        workbenchVisible: visible(document.querySelector('.website-editor-workbench')),
        pageRailVisible: visible(pageRail),
        editorVisible: visible(editor),
        insightsVisible: visible(insights),
        threePagesPresent: pageButtons.length === 3,
        activePagePresent: visible(activePage),
      };
      return {
        checks,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentScrollWidth: document.documentElement?.scrollWidth || 0,
      };
    })()`)
    if (state && Object.values(state.checks).every(Boolean)) break
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  const checks = state?.checks ?? {}
  return {
    ok: Object.values(checks).length > 0 && Object.values(checks).every(Boolean),
    error: Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name).join(', '),
    ...state,
  }
}

async function inspectSitesInquiries(cdp, sessionId) {
  const state = await evalInPage(cdp, sessionId, `(() => {
    const visible = (element) => Boolean(element && element.getClientRects().length
      && getComputedStyle(element).visibility !== 'hidden');
    const workspace = document.querySelector('.website-inquiry-workspace');
    const capture = document.querySelector('.website-inquiry-capture');
    const queue = document.querySelector('.website-inquiry-queue');
    const leads = [...document.querySelectorAll('.website-lead-list article')];
    const checks = {
      workspaceVisible: visible(workspace),
      captureFormVisible: visible(capture?.querySelector('form')),
      queueVisible: visible(queue),
      oneSyntheticLeadPresent: leads.length === 1 && visible(leads[0]),
      consentControlVisible: visible(capture?.querySelector('input[type="checkbox"]')),
      decisionControlsPresent: queue?.querySelectorAll('button').length === 2,
    };
    return {
      checks,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentScrollWidth: document.documentElement?.scrollWidth || 0,
    };
  })()`)
  const checks = state?.checks ?? {}
  return {
    ok: Object.values(checks).length > 0 && Object.values(checks).every(Boolean),
    error: Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name).join(', '),
    ...state,
  }
}

export function receiptBoundaryVisible(box, width, height, style) {
  return Boolean(box && box.width > 0 && box.height > 0
    && box.top >= -1 && box.left >= -1 && box.bottom <= height + 1 && box.right <= width + 1
    && style && style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0)
}

export function inspectBusinessBrief(document) {
  const websiteForm = document.querySelector('.website-starter-form')
  const form = websiteForm || document.querySelector('.business-brief form')
  const fields = form ? [...form.querySelectorAll(websiteForm ? 'input:not([type="file"]), textarea' : 'input, textarea')] : []
  const visible = node => Boolean(node && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
  const editable = node => visible(node) && !node.disabled && !node.readOnly && node.tabIndex >= 0
  const named = node => [...(node.labels || [])].some(label => label.textContent.trim())
  const submit = form?.querySelector('button[type="submit"]')
  const website = Boolean(websiteForm)
  const count = website ? 5 : 3
  const essentialsRequired = website
    ? fields.length === count && fields[0].required && fields[1].required && !fields[2].required && fields[3].required && fields[4].required
    : fields.length === count && fields[0].required && fields[1].required && !fields[2].required
  const nativeBlocked = website ? !form?.checkValidity() && !submit?.disabled : submit?.disabled
  return {
    fieldsReady: fields.length === count && fields.every(node => editable(node) && named(node)),
    essentialsRequired,
    emptyContinueBlocked: fields.every(node => node.value === '') && visible(submit) && nativeBlocked
      && submit.textContent.trim() === (website ? 'Create website' : 'Continue'),
  }
}

async function exerciseEcommerceClaimBoundary(cdp, sessionId) {
  const started = await evalInPage(cdp, sessionId, `(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === 'Open customer ordering');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`)
  if (!started) return { ok: false, error: 'Ecommerce customer-order action was not available' }

  const catalogDeadline = Date.now() + 10_000
  let productSelected = false
  while (Date.now() < catalogDeadline && !productSelected) {
    productSelected = await evalInPage(cdp, sessionId, `(() => {
      const workspace = document.querySelector('#ecommerce-buying-workspace');
      const notice = workspace?.querySelector('.ecommerce-buying-notice')?.textContent || '';
      const add = [...document.querySelectorAll('.storefront-request-button')]
        .find((candidate) => !candidate.disabled && candidate.textContent.trim() === 'Add to cart');
      if (!workspace || !add || notice.includes('Checking saved checkout recovery')) return false;
      add.click();
      return true;
    })()`)
    if (!productSelected) await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  if (!productSelected) return { ok: false, error: 'Ecommerce customer store did not become ready' }

  const readyDeadline = Date.now() + 10_000
  let formReady = false
  while (Date.now() < readyDeadline && !formReady) {
    formReady = await evalInPage(cdp, sessionId, `(() => {
      const workspace = document.querySelector('#ecommerce-buying-workspace');
      const form = workspace?.querySelector('form');
      const submit = form?.querySelector('button[data-request-mode="local"]');
      if (submit?.textContent.trim() !== 'Save request locally') return false;
      return Boolean(workspace?.open && form && submit && !submit.disabled);
    })()`)
    if (!formReady) await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  if (!formReady) return { ok: false, error: 'Ecommerce local checkout did not become ready' }

  const submitted = await evalInPage(cdp, sessionId, `(() => {
    const form = document.querySelector('#ecommerce-buying-workspace form');
    const name = form?.querySelector('input[autocomplete="name"]');
    const phone = form?.querySelector('input[autocomplete="tel"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!form || !name || !phone || !setter) return false;
    setter.call(name, 'May Thiri');
    name.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(phone, '09123456789');
    phone.dispatchEvent(new Event('input', { bubbles: true }));
    form.requestSubmit();
    return true;
  })()`)
  if (!submitted) return { ok: false, error: 'Ecommerce local checkout could not be submitted' }

  const resultDeadline = Date.now() + 15_000
  let state = null
  while (Date.now() < resultDeadline) {
    state = await evalInPage(cdp, sessionId, `(() => {
      const receipt = document.querySelector('.ecommerce-request-receipt[data-current="true"]');
      const receiptBox = receipt?.getBoundingClientRect();
      const boundaryGrid = receipt?.querySelector('.ecommerce-quote-boundaries');
      const boundaryItems = boundaryGrid ? [...boundaryGrid.children] : [];
      const boundaryRows = new Set(boundaryItems.map((item) => Math.round(item.getBoundingClientRect().top))).size;
      const receiptBoundary = receipt ? [...receipt.querySelectorAll('p')]
        .find((candidate) => candidate.textContent.includes('Request saved locally for Shop review.')) : null;
      const box = receiptBoundary?.getBoundingClientRect();
      const notice = document.querySelector('.ecommerce-buying-notice')?.textContent.trim() || '';
      const checkoutFormPresent = Boolean(document.querySelector('#ecommerce-buying-workspace form'));
      const receiptText = receipt?.textContent || '';
      const bodyText = document.body?.innerText || '';
      return {
        activeWorkspace: document.querySelector('.ecommerce-mode-nav [aria-current="page"]')?.textContent.trim() || '',
        receiptStatus: receipt?.querySelector('.status-pill')?.textContent.trim() || '',
        notice,
        checkoutFormPresent,
        receiptPresent: Boolean(receipt),
        receiptHeight: receiptBox?.height || 0,
        boundaryRows,
        receiptBoundary: receiptBoundary?.textContent.trim() || '',
        boundaryVisible: (${receiptBoundaryVisible.toString()})(box, window.innerWidth, window.innerHeight, receiptBoundary ? getComputedStyle(receiptBoundary) : null),
        oldManagedHeadlineVisible: bodyText.includes('Request sent to Shop'),
        companyReceiptClaimVisible: receiptText.includes('Company Shop received this request.'),
        localStorageKeyCount: localStorage.length,
        localBuyingStatePresent: Object.keys(localStorage).some((key) => key.startsWith('supermega.ecommerce.buying_lifecycle.v1.')),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentScrollWidth: document.documentElement?.scrollWidth || 0,
      };
    })()`)
    if (state?.receiptStatus === 'Request saved locally' && state?.receiptBoundary && state?.boundaryVisible) break
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }

  const checks = {
    localHeadline: state?.receiptStatus === 'Request saved locally',
    storeWorkspaceActive: state?.activeWorkspace === 'Store',
    checkoutFormRetired: state?.checkoutFormPresent === false && state?.notice === '',
    localReceipt: state?.receiptBoundary.includes('Request saved locally for Shop review.')
      && state?.receiptBoundary.includes('Shop still confirms stock, promise, payment, and delivery.'),
    boundaryVisible: Boolean(state?.boundaryVisible),
    compactMobileReceipt: Number(state?.viewportWidth || 0) > 560
      || (Number(state?.boundaryRows || 0) <= 2 && Number(state?.receiptHeight || 0) <= 380),
    managedHeadlineAbsent: !state?.oldManagedHeadlineVisible,
    companyReceiptClaimAbsent: !state?.companyReceiptClaimVisible,
    browserPersistencePresent: Boolean(state?.localBuyingStatePresent),
    noHorizontalOverflow: Number(state?.documentScrollWidth || 0) <= Number(state?.viewportWidth || 0) + 1,
  }
  return {
    ok: Object.values(checks).every(Boolean),
    error: Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name).join(', '),
    checks,
    ...state,
  }
}

async function exerciseStoreToShopJourney(cdp, sessionId, origin, expectedPath, expectedText, timeoutMs) {
  const claimBoundary = await exerciseEcommerceClaimBoundary(cdp, sessionId)
  if (!claimBoundary.ok) return { ok: false, error: `request capture: ${claimBoundary.error || 'unknown check'}`, claimBoundary }

  const source = await evalInPage(cdp, sessionId, `(() => {
    const commerce = JSON.parse(localStorage.getItem(${JSON.stringify(COMMERCE_KEY)}) || 'null');
    const request = commerce?.storefrontRequests?.[0];
    const lines = request?.lines || (request?.line ? [request.line] : []);
    const firstLine = lines[0];
    const item = commerce?.items?.find((candidate) => candidate.sku === firstLine?.sku);
    return {
      requestId: request?.id || '',
      requestCount: commerce?.storefrontRequests?.length || 0,
      sku: firstLine?.sku || '',
      quantity: firstLine?.quantity || 0,
      stockBefore: item?.onHand ?? null,
      orderCountBefore: commerce?.orders?.length || 0,
    };
  })()`)
  if (!source?.requestId || !source?.sku || source.requestCount !== 1 || source.orderCountBefore !== 0) {
    return { ok: false, error: 'captured request was not the only unconverted Shop source', claimBoundary, source }
  }

  await cdp.send('Page.navigate', { url: `${origin}/shop/?tab=orders` }, sessionId)
  await waitForRenderedState(cdp, sessionId, '/shop/?tab=orders', ['Shop', 'Orders'], timeoutMs)

  const composerDeadline = Date.now() + 15_000
  let composerOpened = false
  while (Date.now() < composerDeadline && !composerOpened) {
    composerOpened = await evalInPage(cdp, sessionId, `(() => {
      const button = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent.trim() === 'New order' && !candidate.disabled && candidate.getClientRects().length);
      if (!button) return false;
      button.click();
      return true;
    })()`)
    if (!composerOpened) await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  if (!composerOpened) return { ok: false, error: 'Shop order composer was not available', claimBoundary, source }

  const inboxDeadline = Date.now() + 15_000
  let inbox = null
  while (Date.now() < inboxDeadline) {
    inbox = await evalInPage(cdp, sessionId, `(() => {
      const dialog = document.querySelector('dialog.order-composer-dialog[open]');
      const online = [...(dialog?.querySelectorAll('.order-entry-methods button') || [])]
        .find((candidate) => candidate.textContent.trim() === 'Online request');
      if (online && online.getAttribute('aria-pressed') !== 'true') online.click();
      const panel = dialog?.querySelector('.website-intake');
      const review = [...(panel?.querySelectorAll('button') || [])]
        .find((candidate) => candidate.textContent.trim() === 'Review' && !candidate.disabled);
      const status = panel?.querySelector('.status-pill')?.textContent.trim() || '';
      const text = panel?.textContent || '';
      if (!dialog || !panel || !review || status !== 'This device' || !text.includes(${JSON.stringify(source.requestId)})) {
        return { ready: false, status, requestVisible: text.includes(${JSON.stringify(source.requestId)}) };
      }
      review.click();
      return { ready: true, status, requestVisible: true };
    })()`)
    if (inbox?.ready) break
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  if (!inbox?.ready) return { ok: false, error: 'same-device Ecommerce inbox did not expose the request', claimBoundary, source, inbox }

  const reviewDeadline = Date.now() + 15_000
  let prepared = null
  while (Date.now() < reviewDeadline) {
    prepared = await evalInPage(cdp, sessionId, `(() => {
      const dialog = document.querySelector('dialog.order-composer-dialog[open]');
      const sourceReady = dialog?.querySelector('.channel-source-ready');
      const review = [...(dialog?.querySelectorAll('button') || [])]
        .find((candidate) => candidate.textContent.trim() === 'Review order');
      const payment = dialog?.querySelector('.order-ecommerce-payment select');
      const sourceText = sourceReady?.textContent || '';
      const ready = Boolean(dialog && sourceText.includes(${JSON.stringify(source.requestId)}) && review && !review.disabled);
      return {
        ready,
        sourceBound: sourceText.includes(${JSON.stringify(source.requestId)}),
        paymentLocked: Boolean(payment?.disabled),
        payment: payment?.value || '',
      };
    })()`)
    if (prepared?.ready) break
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  if (!prepared?.ready) return { ok: false, error: 'Shop could not prepare the exact Ecommerce request', claimBoundary, source, inbox, prepared }

  const queued = await evalInPage(cdp, sessionId, `(() => {
    const review = [...document.querySelectorAll('dialog.order-composer-dialog[open] button')]
      .find((candidate) => candidate.textContent.trim() === 'Review order' && !candidate.disabled);
    if (!review) return false;
    review.click();
    return true;
  })()`)
  if (!queued) return { ok: false, error: 'prepared Ecommerce order could not enter accountable review', claimBoundary, source, inbox, prepared }

  const gateDeadline = Date.now() + 15_000
  let gate = null
  while (Date.now() < gateDeadline) {
    gate = await evalInPage(cdp, sessionId, `(() => {
      const dialog = document.querySelector('dialog.accountable-action-gate[open]');
      const submit = dialog?.querySelector('button[type="submit"]');
      const inputs = [...(dialog?.querySelectorAll('input') || [])];
      const text = dialog?.textContent || '';
      const ready = Boolean(dialog && submit && !submit.disabled && submit.textContent.trim() === 'Confirm change');
      return {
        ready,
        summaryBound: text.includes('Review Ecommerce order'),
        actor: inputs[0]?.value || '',
        reasonPresent: Boolean(inputs[1]?.value),
        sourceEvidenceBound: inputs.some((input) => input.value === ${JSON.stringify(source.requestId)}),
      };
    })()`)
    if (gate?.ready) break
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  if (!gate?.ready || !gate.summaryBound || !gate.reasonPresent || !gate.sourceEvidenceBound) {
    return { ok: false, error: 'accountable Shop review did not bind the Ecommerce source', claimBoundary, source, inbox, prepared, gate }
  }

  const confirmed = await evalInPage(cdp, sessionId, `(() => {
    const submit = document.querySelector('dialog.accountable-action-gate[open] button[type="submit"]');
    if (!submit || submit.disabled || submit.textContent.trim() !== 'Confirm change') return false;
    submit.click();
    return true;
  })()`)
  if (!confirmed) return { ok: false, error: 'accountable Shop confirmation was not available', claimBoundary, source, inbox, prepared, gate }

  const committedDeadline = Date.now() + 20_000
  let committed = null
  while (Date.now() < committedDeadline) {
    committed = await evalInPage(cdp, sessionId, `(() => {
      const commerce = JSON.parse(localStorage.getItem(${JSON.stringify(COMMERCE_KEY)}) || 'null');
      const matching = commerce?.orders?.filter((order) => order.sourceRecordId === ${JSON.stringify(source.requestId)}) || [];
      const order = matching[0];
      const item = commerce?.items?.find((candidate) => candidate.sku === ${JSON.stringify(source.sku)});
      return {
        route: location.pathname + location.search,
        matchingOrderCount: matching.length,
        orderStatus: order?.status || '',
        paymentStatus: order?.paymentStatus || '',
        owner: order?.owner || '',
        stockAfter: item?.onHand ?? null,
        pendingRequestCount: (commerce?.storefrontRequests || []).filter((request) =>
          !(commerce?.orders || []).some((candidate) => candidate.sourceRecordId === request.id)).length,
      };
    })()`)
    if (committed?.matchingOrderCount === 1 && committed?.route === expectedPath) break
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }

  await cdp.send('Page.reload', { ignoreCache: true }, sessionId)
  await waitForRenderedState(cdp, sessionId, expectedPath, expectedText, timeoutMs)
  const restored = await evalInPage(cdp, sessionId, `(() => {
    const commerce = JSON.parse(localStorage.getItem(${JSON.stringify(COMMERCE_KEY)}) || 'null');
    const matching = commerce?.orders?.filter((order) => order.sourceRecordId === ${JSON.stringify(source.requestId)}) || [];
    const order = matching[0];
    const item = commerce?.items?.find((candidate) => candidate.sku === ${JSON.stringify(source.sku)});
    const bodyText = document.body?.innerText || '';
    return {
      route: location.pathname + location.search,
      matchingOrderCount: matching.length,
      orderStatus: order?.status || '',
      paymentStatus: order?.paymentStatus || '',
      owner: order?.owner || '',
      stockAfter: item?.onHand ?? null,
      requestStillPending: (commerce?.storefrontRequests || []).some((request) => request.id === ${JSON.stringify(source.requestId)})
        && !matching.length,
      customerVisible: bodyText.includes('May Thiri'),
      paymentPendingVisible: bodyText.includes('Payment pending'),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentScrollWidth: document.documentElement?.scrollWidth || 0,
    };
  })()`)

  const expectedStock = Number(source.stockBefore) - Number(source.quantity)
  const checks = {
    localRequestCaptured: source.requestCount === 1,
    sameDeviceInbox: inbox.status === 'This device' && inbox.requestVisible,
    exactSourcePrepared: prepared.sourceBound && prepared.paymentLocked && prepared.payment === 'Cash',
    accountableSourceBound: gate.summaryBound && gate.reasonPresent && gate.sourceEvidenceBound,
    confirmedOnce: committed?.matchingOrderCount === 1 && restored?.matchingOrderCount === 1,
    paymentStillPending: committed?.paymentStatus === 'pending' && restored?.paymentStatus === 'pending',
    stockReservedOnce: committed?.stockAfter === expectedStock && restored?.stockAfter === expectedStock,
    sourceConsumed: committed?.pendingRequestCount === 0 && restored?.requestStillPending === false,
    accountableOwner: committed?.owner === 'Shop reviewer' && restored?.owner === 'Shop reviewer',
    persistedAfterReload: restored?.orderStatus === 'confirmed' && restored?.route === expectedPath,
    operatorViewRestored: restored?.customerVisible && restored?.paymentPendingVisible,
    noHorizontalOverflow: Number(restored?.documentScrollWidth || 0) <= Number(restored?.viewportWidth || 0) + 1,
  }
  return {
    ok: Object.values(checks).every(Boolean),
    error: Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name).join(', '),
    checks,
    claimBoundary,
    source,
    inbox,
    prepared,
    gate,
    committed,
    restored,
    viewportWidth: restored?.viewportWidth || 0,
    viewportHeight: restored?.viewportHeight || 0,
    documentScrollWidth: restored?.documentScrollWidth || 0,
  }
}

export async function verifyCase(cdp, origin, testCase, scopedAccess = null) {
  if (scopedAccess && testCase.isolatedBrowserContext !== true) throw new Error('preview_browser_access_requires_isolation')
  if (testCase.pairedAppOrigin && (testCase.isolatedBrowserContext !== true
    || testCase.expectedOrigin !== testCase.pairedAppOrigin || testCase.route !== '/'
    || !Array.isArray(testCase.pairedPublicExpectedText) || testCase.pairedPublicExpectedText.length < 1)) {
    throw new Error('paired_transition_case_invalid')
  }
  const hasSeed = Object.prototype.hasOwnProperty.call(testCase, 'seed')
  if (testCase.sourceControlledFixture && hasSeed) {
    throw new Error('source-controlled rendered proof cannot install a browser-storage seed')
  }
  let browserContextId = null
  if (testCase.isolatedBrowserContext) {
    const context = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true })
    if (typeof context?.browserContextId !== 'string' || !context.browserContextId) {
      throw new Error('browser context isolation could not be established')
    }
    browserContextId = context.browserContextId
  }
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank',
    ...(browserContextId ? { browserContextId } : {}),
  })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const errors = []
  const warnings = []
  const offlineTransportFailures = []
  const networkRequests = []
  const networkRequestUrls = new Map()
  const failedNetworkRequests = []
  const disposers = []
  let accessGuard = null
  try {
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Log.enable', {}, sessionId)
    await cdp.send('Network.enable', {}, sessionId)
    if (scopedAccess) accessGuard = await installPreviewBrowserAccess({ cdp, sessionId, targetId, access: scopedAccess })
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: testCase.width,
      height: testCase.height,
      deviceScaleFactor: testCase.mobile ? 3 : 1,
      mobile: Boolean(testCase.mobile),
    }, sessionId)
    if (!testCase.sourceControlledFixture) {
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript(hasSeed ? testCase.seed : {}) }, sessionId)
    }
    disposers.push(
      cdp.on(sessionId, 'Runtime.consoleAPICalled', (event) => {
        const text = event.args.map((arg) => arg.value || arg.description || '').join(' ')
        if (event.type === 'error' && !/favicon/i.test(text)) errors.push(`console: ${text}`.trim())
        if (event.type === 'warning' || event.type === 'warn') warnings.push(`console warning: ${text}`.trim())
      }),
      cdp.on(sessionId, 'Runtime.exceptionThrown', (event) => {
        errors.push(`exception: ${event.exceptionDetails?.text || 'runtime exception'}`)
      }),
      cdp.on(sessionId, 'Log.entryAdded', (event) => {
        const text = event.entry.text || ''
        if (event.entry?.level === 'error' && !/favicon/i.test(text)) {
          if (testCase.exerciseShopOfflineRestore && text === 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED') {
            offlineTransportFailures.push(text)
          } else errors.push(`log: ${text}`.trim())
        }
        if (event.entry?.level === 'warning') warnings.push(`log warning: ${text}`.trim())
      }),
      cdp.on(sessionId, 'Network.requestWillBeSent', (event) => {
        const url = String(event.request?.url || '')
        networkRequests.push({ method: String(event.request?.method || ''), url })
        if (typeof event.requestId === 'string' && url) networkRequestUrls.set(event.requestId, url)
      }),
      cdp.on(sessionId, 'Network.loadingFailed', (event) => {
        const url = networkRequestUrls.get(event.requestId)
        if (url && /^https?:/iu.test(url)) failedNetworkRequests.push(url)
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
    let pairedClick = null
    if (testCase.pairedAppOrigin) {
      const publicState = await waitForRenderedState(cdp, sessionId, '/', testCase.pairedPublicExpectedText, testCase.timeoutMs)
      pairedClick = await activateReadyPairedTransition({ state: publicState, publicOrigin: origin,
        requiredText: testCase.pairedPublicExpectedText,
        activate: () => evalInPage(cdp, sessionId, pairedClickScript(origin, testCase.pairedAppOrigin)) })
    }
    await waitForRenderedState(cdp, sessionId, testCase.initialExpectedPath ?? testCase.expectedPath, testCase.initialExpectedText ?? testCase.expectedText, testCase.timeoutMs)
    const shopCounter = testCase.exerciseShopCounter
      ? await exerciseShopCounter(cdp, sessionId, Boolean(testCase.mobile))
      : null
    const briefControls = testCase.inspectBusinessBrief ? await evalInPage(cdp, sessionId, `(${inspectBusinessBrief.toString()})(document)`) : null
    const rawShopDecisionDesk = testCase.exerciseShopDecisionDesk
      ? await exerciseShopDecisionDesk(cdp, sessionId, Boolean(testCase.mobile), testCase.sourceControlledFixture === true)
      : null
    const shopAccountingExport = testCase.exerciseShopAccountingExport
      ? await exerciseShopAccountingExport(cdp, sessionId, browserContextId)
      : null
    const shopOfflineRestore = testCase.exerciseShopOfflineRestore
      ? await exerciseShopOfflineRestore(cdp, sessionId, testCase.expectedPath, testCase.expectedText, testCase.timeoutMs, offlineTransportFailures)
      : null
    const ecommerceClaimBoundary = testCase.exerciseEcommerceClaimBoundary
      ? await exerciseEcommerceClaimBoundary(cdp, sessionId)
      : null
    const storeToShop = testCase.exerciseStoreToShop
      ? await exerciseStoreToShopJourney(cdp, sessionId, origin, testCase.expectedPath, testCase.expectedText, testCase.timeoutMs)
      : null
    const sitesWorkspace = testCase.exerciseSitesPages
      ? await exerciseSitesPages(cdp, sessionId)
      : testCase.inspectSitesInquiries
        ? await inspectSitesInquiries(cdp, sessionId)
        : null
    const beforeCapture = await readRenderedState(cdp, sessionId, Boolean(testCase.retirementCaseId))
    if (accessGuard) {
      await accessGuard.assertClean()
      scopedAccess.assertNoCredential({ beforeCapture, errors, warnings, networkRequests })
    }
    let screenshot = null
    if (screenshotDir && testCase.screenshotName) {
      const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId)
      const screenshotPath = resolve(screenshotDir, `${testCase.screenshotName}.png`)
      const screenshotPayload = Buffer.from(capture.data, 'base64')
      screenshot = buildScreenshotEvidence({ payload: screenshotPayload, path: screenshotPath, evidenceDir: screenshotDir })
      await writeFile(screenshotPath, screenshotPayload, { flag: 'wx' })
    }
    const afterCapture = await readRenderedState(cdp, sessionId, Boolean(testCase.retirementCaseId))
    if (accessGuard) {
      await accessGuard.assertClean()
      scopedAccess.assertNoCredential({ afterCapture, errors, warnings, networkRequests })
    }
    let pairedTransition = null
    let pairedFailure = ''
    if (testCase.pairedAppOrigin) {
      try {
        pairedTransition = validatePairedTransition({ publicOrigin: origin, appOrigin: testCase.pairedAppOrigin,
          click: pairedClick, beforeCapture, afterCapture,
          requests: networkRequests.filter(request => /^https?:/i.test(request.url)) })
      } catch (error) { pairedFailure = error.message }
    }
    let retirement = null
    let retirementFailure = ''
    if (testCase.retirementCaseId) {
      try {
        retirement = validateRetiredProductObservation({ policy: RETIRED_PRODUCT_PREVIEW_POLICY,
          caseId: testCase.retirementCaseId, origin, before: beforeCapture, after: afterCapture,
          retainedBefore: testCase.seed?.retained })
      } catch (error) { retirementFailure = error.message }
    }
    const finalLocation = evaluateFinalRenderedLocation({
      beforeCapture,
      afterCapture,
      expectedOrigin: testCase.expectedOrigin,
      expectedPath: testCase.expectedPath,
      expectedPathLabel: testCase.expectedPathLabel,
    })
    const finalRendered = afterCapture
    let launcherFailure = ''
    if (testCase.requireLauncherProducts) {
      try {
        assertLauncherProductLinks(beforeCapture.launcherLinks, testCase.expectedLauncherProducts)
        assertLauncherProductLinks(afterCapture.launcherLinks, testCase.expectedLauncherProducts)
      } catch { launcherFailure = 'app_entry_rendered_launcher_products_mismatch' }
    }
    const missingText = testCase.expectedText.filter((needle) => !(finalRendered?.text || '').includes(needle))
    const unexpectedText = (testCase.absentText ?? []).filter((needle) => (finalRendered?.text || '').includes(needle))
    const renderedViewportMatches = Math.abs((finalRendered?.viewportWidth ?? 0) - testCase.width) <= 1
      && Math.abs((finalRendered?.viewportHeight ?? 0) - testCase.height) <= 1
    const counterViewportMatches = !shopCounter
      || Math.abs((shopCounter.viewportWidth ?? 0) - testCase.width) <= 1
        && Math.abs((shopCounter.viewportHeight ?? 0) - testCase.height) <= 1
    const ecommerceViewportMatches = !ecommerceClaimBoundary
      || Math.abs((ecommerceClaimBoundary.viewportWidth ?? 0) - testCase.width) <= 1
        && Math.abs((ecommerceClaimBoundary.viewportHeight ?? 0) - testCase.height) <= 1
    const storeToShopViewportMatches = !storeToShop
      || Math.abs((storeToShop.viewportWidth ?? 0) - testCase.width) <= 1
        && Math.abs((storeToShop.viewportHeight ?? 0) - testCase.height) <= 1
    const sitesViewportMatches = !sitesWorkspace
      || Math.abs((sitesWorkspace.viewportWidth ?? 0) - testCase.width) <= 1
        && Math.abs((sitesWorkspace.viewportHeight ?? 0) - testCase.height) <= 1
    const decisionDeskViewportMatches = !rawShopDecisionDesk
      || Math.abs((rawShopDecisionDesk.viewportWidth ?? 0) - testCase.width) <= 1
        && Math.abs((rawShopDecisionDesk.viewportHeight ?? 0) - testCase.height) <= 1
    const shopAccountingViewportMatches = !shopAccountingExport
      || Math.abs((shopAccountingExport.viewportWidth ?? 0) - testCase.width) <= 1
        && Math.abs((shopAccountingExport.viewportHeight ?? 0) - testCase.height) <= 1
    const shopOfflineViewportMatches = !shopOfflineRestore
      || Math.abs((shopOfflineRestore.viewportWidth ?? 0) - testCase.width) <= 1
        && Math.abs((shopOfflineRestore.viewportHeight ?? 0) - testCase.height) <= 1
    const mutatingRequests = networkRequests.filter((entry) => !['GET', 'HEAD', 'OPTIONS'].includes(entry.method)).map((entry) => {
      let path = entry.url
      try { path = new URL(entry.url).pathname } catch {}
      return { method: entry.method, path }
    })
    const externalRequestCount = networkRequests.filter((entry) => {
      try {
        const url = new URL(entry.url)
        return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin
      } catch {
        return false
      }
    }).length
    const shopDecisionDesk = rawShopDecisionDesk ? {
      ...rawShopDecisionDesk,
      network: { externalRequestCount, failedRequestCount: failedNetworkRequests.length },
    } : null
    const failures = [
      ...(testCase.inspectBusinessBrief && (!briefControls || Object.values(briefControls).some(value => value !== true)) ? ['Business brief controls are not ready'] : []),
      ...(pairedFailure ? [pairedFailure] : []),
      ...(retirementFailure ? [retirementFailure] : []),
      ...(launcherFailure ? [launcherFailure] : []),
      ...finalLocation.failures,
      ...(finalRendered?.bodyLength > 0 ? [] : ['blank page']),
      ...(finalRendered?.overlay ? ['framework error overlay present'] : []),
      ...(finalRendered?.seedError ? [`seed error: ${finalRendered.seedError}`] : []),
      ...(renderedViewportMatches ? [] : [`expected ${testCase.width}x${testCase.height} viewport, got ${finalRendered?.viewportWidth ?? 'unknown'}x${finalRendered?.viewportHeight ?? 'unknown'}`]),
      ...(testCase.noHorizontalOverflow && finalRendered?.documentScrollWidth > finalRendered?.viewportWidth + 1
        ? [`horizontal overflow: ${finalRendered.documentScrollWidth}px document in ${finalRendered.viewportWidth}px viewport`]
        : []),
      ...(shopCounter && !shopCounter.ok ? [shopCounter.error || 'counter checkout exercise failed'] : []),
      ...(shopCounter && !shopCounter.accessibility?.ok ? ['counter accessibility or mobile touch-target contract failed'] : []),
      ...(shopCounter && !shopCounter.aboveFold ? ['counter payment, open-order choice, total, and review control are not all above fold'] : []),
      ...(shopCounter && shopCounter.documentScrollWidth > shopCounter.viewportWidth + 1
        ? [`counter horizontal overflow: ${shopCounter.documentScrollWidth}px document in ${shopCounter.viewportWidth}px viewport`]
        : []),
      ...(counterViewportMatches ? [] : [`counter viewport changed from ${testCase.width}x${testCase.height} to ${shopCounter?.viewportWidth ?? 'unknown'}x${shopCounter?.viewportHeight ?? 'unknown'}`]),
      ...(shopDecisionDesk && !shopDecisionDesk.ok ? [`Shop Decision Desk contract failed: ${Object.entries(shopDecisionDesk.checks || {}).filter(([, passed]) => !passed).map(([name]) => name).join(', ')}`] : []),
      ...(shopDecisionDesk && shopDecisionDesk.documentScrollWidth > shopDecisionDesk.viewportWidth + 1
        ? [`Shop Decision Desk horizontal overflow: ${shopDecisionDesk.documentScrollWidth}px document in ${shopDecisionDesk.viewportWidth}px viewport`]
        : []),
      ...(shopDecisionDesk && !shopDecisionDesk.accessibility?.ok ? ['Shop Decision Desk accessibility or mobile touch-target contract failed'] : []),
      ...(shopDecisionDesk && shopDecisionDesk.network.externalRequestCount !== 0 ? ['Shop Decision Desk made an external request'] : []),
      ...(shopDecisionDesk && shopDecisionDesk.network.failedRequestCount !== 0 ? ['Shop Decision Desk had a failed request'] : []),
      ...(decisionDeskViewportMatches ? [] : [`Shop Decision Desk viewport changed from ${testCase.width}x${testCase.height} to ${shopDecisionDesk?.viewportWidth ?? 'unknown'}x${shopDecisionDesk?.viewportHeight ?? 'unknown'}`]),
      ...(shopAccountingExport && !shopAccountingExport.ok ? [`Shop accounting export failed: ${shopAccountingExport.error || 'unknown check'}`] : []),
      ...(shopAccountingViewportMatches ? [] : [`Shop accounting viewport changed from ${testCase.width}x${testCase.height} to ${shopAccountingExport?.viewportWidth ?? 'unknown'}x${shopAccountingExport?.viewportHeight ?? 'unknown'}`]),
      ...(shopOfflineRestore && !shopOfflineRestore.ok ? [`Shop offline restore failed: ${shopOfflineRestore.error || Object.entries(shopOfflineRestore.checks || {}).filter(([, passed]) => !passed).map(([name]) => name).join(', ')}`] : []),
      ...(shopOfflineViewportMatches ? [] : [`Shop offline viewport changed from ${testCase.width}x${testCase.height} to ${shopOfflineRestore?.viewportWidth ?? 'unknown'}x${shopOfflineRestore?.viewportHeight ?? 'unknown'}`]),
      ...(ecommerceClaimBoundary && !ecommerceClaimBoundary.ok ? [`Ecommerce claim boundary failed: ${ecommerceClaimBoundary.error || 'unknown check'}`] : []),
      ...(ecommerceViewportMatches ? [] : [`Ecommerce viewport changed from ${testCase.width}x${testCase.height} to ${ecommerceClaimBoundary?.viewportWidth ?? 'unknown'}x${ecommerceClaimBoundary?.viewportHeight ?? 'unknown'}`]),
      ...(storeToShop && !storeToShop.ok ? [`Store-to-Shop journey failed: ${storeToShop.error || 'unknown check'}`] : []),
      ...(storeToShopViewportMatches ? [] : [`Store-to-Shop viewport changed from ${testCase.width}x${testCase.height} to ${storeToShop?.viewportWidth ?? 'unknown'}x${storeToShop?.viewportHeight ?? 'unknown'}`]),
      ...(sitesWorkspace && !sitesWorkspace.ok ? [`Sites workspace contract failed: ${sitesWorkspace.error || 'unknown check'}`] : []),
      ...(sitesWorkspace && sitesWorkspace.documentScrollWidth > sitesWorkspace.viewportWidth + 1
        ? [`Sites workspace horizontal overflow: ${sitesWorkspace.documentScrollWidth}px document in ${sitesWorkspace.viewportWidth}px viewport`]
        : []),
      ...(sitesViewportMatches ? [] : [`Sites workspace viewport changed from ${testCase.width}x${testCase.height} to ${sitesWorkspace?.viewportWidth ?? 'unknown'}x${sitesWorkspace?.viewportHeight ?? 'unknown'}`]),
      ...(mutatingRequests.length ? [`unexpected browser network writes: ${mutatingRequests.map((entry) => `${entry.method} ${entry.path}`).join(', ')}`] : []),
      ...missingText.map((needle) => `missing text: ${needle}`),
      ...unexpectedText.map((needle) => `unexpected text: ${needle}`),
      ...errors,
      ...warnings,
    ]
    return {
      name: testCase.name,
      route: testCase.route,
      viewport: `${testCase.width}x${testCase.height}${testCase.mobile ? ' mobile' : ''}`,
      path: finalLocation.final.path,
      ...(testCase.expectedOrigin ? { origin: finalLocation.final.origin, hash: finalLocation.final.hash } : {}),
      bodyLength: finalRendered?.bodyLength || 0,
      rendered: {
        ...(testCase.pairedAppOrigin ? { pairedTransition } : {}),
        ...(testCase.retirementCaseId ? { retirement } : {}),
        ...(testCase.requireLauncherProducts ? { launcherLinks: finalRendered.launcherLinks } : {}),
        viewportWidth: finalRendered?.viewportWidth || 0,
        viewportHeight: finalRendered?.viewportHeight || 0,
        documentScrollWidth: finalRendered?.documentScrollWidth || 0,
        noHorizontalOverflow: Boolean(finalRendered
          && finalRendered.documentScrollWidth <= finalRendered.viewportWidth + 1),
      },
      layout: shopCounter,
      decisionDesk: shopDecisionDesk,
      accountingExport: shopAccountingExport,
      offlineRestore: shopOfflineRestore,
      claimBoundary: ecommerceClaimBoundary,
      storeToShop,
      sitesWorkspace,
      briefControls,
      screenshot,
      network: { mutatingRequestCount: mutatingRequests.length, mutatingRequests },
      runtime: { clean: errors.length === 0 && warnings.length === 0, errors: [...errors], warnings: [...warnings] },
      ...(browserContextId ? { browserContextIsolated: true } : {}),
      ok: failures.length === 0,
      failures,
    }
  } finally {
    await finishPreviewCase({ cdp, targetId, browserContextId, accessGuard, disposers })
  }
}

function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}

const launcherText = [
  'Welcome back',
  'Login',
  'Sign in to your business.',
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
    name: 'desktop root presents login despite remembered product',
    requireLauncherProducts: true,
    expectedLauncherProducts: [],
    route: '/',
    width: 1280,
    height: 900,
    expectedPath: '/',
    expectedText: launcherText,
    screenshotName: 'app-launcher-desktop-1280x900',
    seed: { lastProduct: 'production', productSetups: shopSetup },
  },
  {
    name: 'desktop choose query presents login',
    requireLauncherProducts: true,
    expectedLauncherProducts: [],
    route: '/?choose=1',
    width: 1280,
    height: 900,
    expectedPath: '/?choose=1',
    expectedText: launcherText,
    seed: { lastProduct: 'commerce' },
  },
  {
    name: 'mobile root presents login',
    requireLauncherProducts: true,
    expectedLauncherProducts: [],
    route: '/',
    width: 390,
    height: 844,
    mobile: true,
    expectedPath: '/',
    expectedText: launcherText,
    screenshotName: 'app-launcher-mobile-390x844',
    seed: { lastProduct: 'ecommerce' },
  },
  {
    name: 'retired Shop demo query returns to account home',
    route: '/?demo=shop',
    width: 1280,
    height: 900,
    expectedPath: '/',
    expectedText: launcherText,
    seed: {},
  },
  {
    name: 'desktop trade link opens a complete mini-mart counter',
    route: '/shop/?template=mini-mart',
    width: 1280,
    height: 900,
    expectedPath: (path) => path.startsWith('/shop/?') && path.includes('tab=counter') && path.includes('template=mini-mart'),
    expectedPathLabel: '/shop/?tab=counter&template=mini-mart',
    expectedText: ['Mini-mart & grocery', 'Products', 'Premium rice 25kg'],
    absentText: ['PRIVATE DEVICE'],
    exerciseShopCounter: true,
    noHorizontalOverflow: true,
    screenshotName: 'shop-counter-mini-mart-desktop-1280x900',
    timeoutMs: 60_000,
    seed: miniMartCounterFixture(),
  },
  {
    name: 'mobile trade link keeps the complete mini-mart checkout in view',
    route: '/shop/?template=mini-mart',
    width: 390,
    height: 844,
    mobile: true,
    expectedPath: (path) => path.startsWith('/shop/?') && path.includes('tab=counter') && path.includes('template=mini-mart'),
    expectedPathLabel: '/shop/?tab=counter&template=mini-mart',
    expectedText: ['Mini-mart & grocery', 'Products', 'Premium rice 25kg', 'CURRENT SALE', 'Login'],
    absentText: ['CURRENT SALE · THIS DEVICE'],
    exerciseShopCounter: true,
    noHorizontalOverflow: true,
    screenshotName: 'shop-counter-mini-mart-mobile-390x844',
    timeoutMs: 60_000,
    seed: miniMartCounterFixture(),
  },
  ...[{ width: 1280, height: 900 }, { width: 390, height: 844, mobile: true }].map(viewport => ({
    name: `Shop Today keeps one accountable decision at ${viewport.width}px`,
    route: '/shop/?tab=today',
    ...viewport,
    expectedPath: '/shop/?tab=today',
    // innerText reflects the visual text-transform contract for these operator labels.
    expectedText: ['Today', 'RECOMMENDED NEXT', 'WHY NOW', 'OWNER CHECK', 'Attention', 'Orders & fulfilment', 'Inventory & purchasing', 'Advanced controls'],
    absentText: ['Local Batch review stays off', 'Open a demo', 'Start trial'],
    exerciseShopDecisionDesk: true,
    isolatedBrowserContext: true,
    noHorizontalOverflow: true,
    screenshotName: `shop-today-decision-desk-${viewport.width}`,
    timeoutMs: 60_000,
    seed: { lastProduct: 'commerce', productSetups: shopSetup, ...miniMartOwnedCatalogFixture() },
  })),
  {
    name: 'Shop Today downloads a completed accounting handoff',
    route: '/shop/?tab=today',
    width: 1280,
    height: 900,
    expectedPath: '/shop/?tab=today',
    expectedText: ['Today', 'Download accountant CSV', 'Daily close', 'MAPPING REVIEWED'],
    absentText: ['Open a demo', 'Start trial'],
    exerciseShopAccountingExport: true,
    isolatedBrowserContext: true,
    noHorizontalOverflow: true,
    screenshotName: 'shop-today-accountant-handoff-1280x900',
    timeoutMs: 60_000,
    seed: { lastProduct: 'commerce', productSetups: shopSetup, ...shopCompletedCloseFixture() },
  },
  {
    name: 'Shop Today reloads the current business offline',
    route: '/shop/?tab=today',
    width: 1280,
    height: 900,
    expectedPath: '/shop/?tab=today',
    expectedText: ['Today', 'Order queue', 'May', 'Stock watch', 'Cold drink pack', 'Daily close'],
    absentText: ['Open a demo', 'Start trial'],
    exerciseShopOfflineRestore: true,
    isolatedBrowserContext: true,
    noHorizontalOverflow: true,
    screenshotName: 'shop-today-offline-restore-1280x900',
    timeoutMs: 60_000,
    seed: { lastProduct: 'commerce', productSetups: shopSetup, ...shopCompletedCloseFixture() },
  },
  ...RETIRED_PRODUCT_CASES.map(spec => ({ ...spec, name: spec.id,
    retirementCaseId: spec.id, requireLauncherProducts: true,
    expectedLauncherProducts: [],
    isolatedBrowserContext: true, noHorizontalOverflow: true,
    expectedText: launcherText, screenshotName: spec.id,
    seed: { retained: Object.fromEntries(RETIRED_STORAGE_KEYS.map(key => [key,
      key === 'supermega.product_setups.v1' ? '{}' : JSON.stringify({ syntheticRetirementSentinel: key })])) },
  })),
  {
    name: 'retired Website demo query returns to account home',
    route: '/?demo=website',
    width: 1280,
    height: 900,
    expectedPath: '/',
    expectedText: launcherText,
    seed: {},
  },
  {
    name: 'desktop Website opens real business setup',
    route: '/website/?workspace=1',
    width: 1280,
    height: 900,
    expectedPath: '/website/?workspace=1',
    expectedText: ['Your website', 'Tell us about the business', 'Main customers', 'What do you sell or provide?', 'Create website'],
    screenshotName: 'website-business-setup-desktop-1280x900',
    seed: {},
  },
  {
    name: 'mobile Website opens real business setup',
    route: '/website/?workspace=1',
    width: 390,
    height: 844,
    mobile: true,
    expectedPath: '/website/?workspace=1',
    expectedText: ['Your website', 'Main customers', 'What do you sell or provide?', 'Create website'],
    screenshotName: 'website-business-setup-mobile-390x844',
    seed: {},
  },
  {
    name: 'desktop Sites opens the real saved page editor',
    route: '/website/?workspace=1',
    width: 1440,
    height: 900,
    expectedPath: '/website/?workspace=1',
    initialExpectedText: ['Pages', 'Mingalar Fresh Mart', 'Edit website', 'Inquiries'],
    expectedText: ['Pages', 'Home', 'Catalog', 'Contact', 'Page content', 'Page checks', 'Inquiries', 'View website'],
    absentText: ['Working sample', 'Open demo', 'Start trial'],
    exerciseSitesPages: true,
    captureSitesWorkspace: true,
    isolatedBrowserContext: true,
    screenshotName: 'sites-pages-current-desktop-1440x900',
    timeoutMs: 60_000,
    seed: sitesOwnerWorkspaceFixture(),
  },
  {
    name: 'desktop Sites opens the real inquiry workspace',
    route: '/website/?workspace=1&view=inquiries',
    width: 1440,
    height: 900,
    expectedPath: '/website/?workspace=1&view=inquiries',
    expectedText: ['Inquiries', 'INQUIRY INBOX', '1 request needs review', 'Daw Mya', 'FOLLOW-UP QUEUE', 'Review and assign'],
    absentText: ['Working sample', 'Open demo', 'Start trial'],
    inspectSitesInquiries: true,
    captureSitesWorkspace: true,
    isolatedBrowserContext: true,
    screenshotName: 'sites-inquiries-current-desktop-1440x900',
    timeoutMs: 60_000,
    seed: sitesOwnerWorkspaceFixture(),
  },
  {
    name: 'retired Commerce demo query returns to account home',
    route: '/?demo=ecommerce',
    width: 1280,
    height: 900,
    expectedPath: '/',
    expectedText: launcherText,
    seed: {},
  },
  ...[{ width: 1280, height: 900 }, { width: 390, height: 844, mobile: true }].map(viewport => ({
    name: `empty Ecommerce offers catalog help at ${viewport.width}px`,
    route: '/ecommerce/?workspace=1',
    ...viewport,
    expectedPath: '/ecommerce/?workspace=1',
    expectedText: ['Add your products', 'Your online store uses the same products and prices as Shop.', 'Add products'],
    isolatedBrowserContext: true,
    noHorizontalOverflow: true,
    screenshotName: `ecommerce-empty-catalog-${viewport.width}`,
    seed: {},
  })),
  {
    name: 'desktop Ecommerce keeps a reviewed order request locally',
    route: '/ecommerce/?workspace=1',
    width: 1280,
    height: 900,
    expectedPath: (path) => path.startsWith('/ecommerce/'),
    expectedPathLabel: '/ecommerce/',
    expectedText: ['Store', 'Request saved locally for Shop review.', 'May Thiri'],
    exerciseEcommerceClaimBoundary: true,
    noHorizontalOverflow: true,
    screenshotName: 'ecommerce-local-request-desktop-1280x900',
    timeoutMs: 60_000,
    seed: miniMartOwnedCatalogFixture(),
  },
  {
    name: 'mobile Ecommerce keeps a reviewed order request locally',
    route: '/ecommerce/?workspace=1',
    width: 390,
    height: 844,
    mobile: true,
    expectedPath: (path) => path.startsWith('/ecommerce/'),
    expectedPathLabel: '/ecommerce/',
    expectedText: ['Store', 'Request saved locally for Shop review.', 'May Thiri'],
    exerciseEcommerceClaimBoundary: true,
    noHorizontalOverflow: true,
    screenshotName: 'ecommerce-local-request-mobile-390x844',
    timeoutMs: 60_000,
    seed: miniMartOwnedCatalogFixture(),
  },
  {
    name: 'Commerce request becomes one accountable Shop order',
    route: '/ecommerce/?workspace=1',
    width: 1280,
    height: 900,
    initialExpectedPath: '/ecommerce/?workspace=1',
    initialExpectedText: ['Store', 'Open customer ordering'],
    expectedPath: '/shop/?tab=orders',
    expectedText: ['Shop', 'Orders', 'May Thiri', 'Payment pending'],
    absentText: ['Payment captured', 'Payment received'],
    exerciseStoreToShop: true,
    isolatedBrowserContext: true,
    noHorizontalOverflow: true,
    screenshotName: 'commerce-request-shop-order-desktop-1280x900',
    timeoutMs: 60_000,
    seed: { lastProduct: 'commerce', productSetups: shopSetup, ...miniMartOwnedCatalogFixture() },
  },
].map((testCase) => ({ noHorizontalOverflow: true, ...testCase }))

async function main() {
  if ([shopOnly, shopAccountingOnly, shopOfflineOnly, ecommerceClaimOnly, storeToShopOnly, sitesOnly].filter(Boolean).length > 1) throw new Error('app_entry_rendered_scope_conflict')
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
  let browser
  let cdp
  try {
    const started = await launchBrowser(browserBin, userDataDir)
    browser = started.browser
    cdp = await Cdp.connect(started.wsUrl)
    const version = await cdp.send('Browser.getVersion')
    const cases = []
    const selectedTests = shopOnly
      ? tests.filter((testCase) => testCase.exerciseShopCounter || testCase.exerciseShopDecisionDesk)
      : shopAccountingOnly
        ? tests.filter((testCase) => testCase.exerciseShopAccountingExport)
        : shopOfflineOnly
          ? tests.filter((testCase) => testCase.exerciseShopOfflineRestore)
          : ecommerceClaimOnly
            ? tests.filter((testCase) => testCase.exerciseEcommerceClaimBoundary)
            : storeToShopOnly
              ? tests.filter((testCase) => testCase.exerciseStoreToShop)
              : sitesOnly
                ? tests.filter((testCase) => testCase.captureSitesWorkspace)
                : tests
    for (const [index, testCase] of selectedTests.entries()) {
      const startedAt = Date.now()
      console.error(JSON.stringify({ event: 'rendered_case_started', case: index + 1, total: selectedTests.length, name: testCase.name }))
      const result = await verifyCase(cdp, origin, testCase)
      cases.push(result)
      console.error(JSON.stringify({ event: 'rendered_case_finished', case: index + 1, durationMs: Date.now() - startedAt, failures: result.failures.length }))
      if (process.env.GITHUB_ACTIONS === 'true' && result.failures.length) {
        // Only the source-defined case name and count belong in public annotations.
        // Page content, URLs, console messages and raw failure details stay out.
        const caseName = testCase.name.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
        console.error(`::error::Rendered journey ${index + 1}/${selectedTests.length}: ${caseName} (${result.failures.length} failed checks)`)
      }
    }
    const failures = cases.flatMap((entry) => entry.failures.map((failure) => `${entry.name}: ${failure}`))
    const provenanceAfter = await collectRenderedProofProvenance({ root, distDir, verifierPath })
    assertRenderedProofProvenanceStable(provenanceBefore, provenanceAfter)
    const body = {
      ok: failures.length === 0,
      contract: APP_ENTRY_RENDERED_CONTRACT,
      generatedAt: new Date().toISOString(),
      scope: proofScope,
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
        warningCount: cases.reduce((total, entry) => total + entry.runtime.warnings.length, 0),
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
    if (cdp) {
      await cdp.send('Browser.close', {}, '', 2_000).catch(() => {})
      await cdp.close().catch(() => {})
    }
    server.close()
    browser?.kill()
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const report = {
      ok: false,
      contract: APP_ENTRY_RENDERED_CONTRACT,
      scope: proofScope,
      sourceCommit: gitHead(),
      failures: [error.message],
    }
    console.error(JSON.stringify(report, null, 2))
    process.exit(1)
  })
}
