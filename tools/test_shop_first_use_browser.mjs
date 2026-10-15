import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { Cdp, findBrowser, launchBrowser } from './verify_app_entry_rendered.mjs'

const root = resolve(import.meta.dirname, '..')
const showroom = resolve(root, 'showroom')
const { build } = createRequire(resolve(showroom, 'package.json'))('esbuild')
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms))

const fixtureSource = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { EcommerceProduct } from './src/products/ecommerce/EcommerceProduct';
import { CommercePage } from './src/core/CoreApp';
import { COMMERCE_KEY, createEmptyCommerce } from './src/core/commerce-workspace';
import './src/core/core-app.css';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

window.__qaIdentityProbes = 0;
window.__qaFetchAttempts = [];
window.fetch = async (input) => {
  window.__qaFetchAttempts.push(String(input));
  throw new Error('Synthetic browser fixture blocks network access');
};
Object.defineProperty(window, 'localStorage', { value: memoryStorage() });
Object.defineProperty(window, 'sessionStorage', { value: memoryStorage() });
localStorage.setItem(COMMERCE_KEY, JSON.stringify(createEmptyCommerce()));
window.__qaCommerceKey = COMMERCE_KEY;

function RouteProbe() {
  const location = useLocation();
  return <output id="qa-route" data-path={location.pathname + location.search + location.hash}
    data-return={location.state === true ? 'true' : 'false'} />;
}

function ShopRoute() {
  const location = useLocation();
  const tab = new URLSearchParams(location.search).get('tab') || 'today';
  return <CommercePage confirmedLocalShop={true} managedIdentity={null}
    requestedRequestId={null} requestedShopTemplate={null} requestedSource={null}
    shopCounterClientId="" shopCounterCustomer="" shopCounterSearch="" tab={tab} />;
}

createRoot(document.getElementById('root')).render(
  <MemoryRouter initialEntries={['/ecommerce/?workspace=1']}>
    <RouteProbe />
    <Routes>
      <Route path="/ecommerce/*" element={<EcommerceProduct />} />
      <Route path="/shop/*" element={<ShopRoute />} />
    </Routes>
  </MemoryRouter>,
);
`

function makeFixturePlugin() {
  return {
    name: 'isolated-shop-first-use-components',
    setup(builder) {
      builder.onLoad({ filter: /CoreApp\.tsx$/ }, (args) => {
        const source = readFileSync(args.path, 'utf8')
        const marker = 'function CommercePage({'
        assert.ok(source.includes(marker), 'Shop fixture should bind to the real CommercePage component')
        return { loader: 'tsx', contents: source.replace(marker, 'export function CommercePage({') }
      })
      builder.onLoad({ filter: /managed-trial\.ts$/ }, (args) => {
        const source = readFileSync(args.path, 'utf8')
        const marker = 'export async function currentManagedIdentity('
        assert.ok(source.includes(marker), 'Shop fixture should bind to the managed identity seam')
        const localOnly = source.replace(marker, 'async function originalCurrentManagedIdentity(') + `
export async function currentManagedIdentity() {
  (window as unknown as { __qaIdentityProbes: number }).__qaIdentityProbes += 1;
  return null;
}
`
        return { loader: 'ts', contents: localOnly }
      })
    },
  }
}

async function buildFixture(outDir) {
  const result = await build({
    stdin: { resolveDir: showroom, loader: 'tsx', contents: fixtureSource },
    bundle: true,
    write: false,
    outfile: resolve(outDir, 'fixture.js'),
    format: 'iife',
    target: 'es2022',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    external: ['/fonts/noto-sans-myanmar.woff2'],
    plugins: [makeFixturePlugin()],
  })
  const js = result.outputFiles.find((file) => file.path.endsWith('.js'))?.text
  const css = result.outputFiles.find((file) => file.path.endsWith('.css'))?.text ?? ''
  assert.ok(js, 'synthetic component bundle should be generated')
  const safeCss = css.replace(/@font-face\s*\{[^}]*\}/gu, '')
  const safeJs = js.replaceAll('</script', '<\\/script')
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data: blob:; font-src 'none'; form-action 'none'; base-uri 'none">
<title>Isolated SuperMega Shop first-use fixture</title><style>${safeCss}</style></head>
<body><div id="root"></div><script>${safeJs}</script></body></html>`
}

async function evaluate(cdp, sessionId, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId)
  assert.equal(exceptionDetails, undefined, 'fixture page evaluation should not throw')
  return result.value
}

async function waitFor(cdp, sessionId, expression, description) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const value = await evaluate(cdp, sessionId, expression).catch(() => null)
    if (value) return value
    await pause(100)
  }
  const state = await evaluate(cdp, sessionId, `({ path: document.querySelector('#qa-route')?.dataset.path || '',
    text: (document.body?.innerText || '').replace(/\\s+/g, ' ').slice(0, 420),
    createPanels: document.querySelectorAll('#shop-catalog-create').length,
    createOpen: document.querySelector('#shop-catalog-create')?.open ?? null,
    inputPresent: Boolean(document.querySelector('#shop-catalog-create input[name="product-name"]')),
    inputDisabled: document.querySelector('#shop-catalog-create input[name="product-name"]')?.disabled ?? null,
    inputFocused: document.activeElement === document.querySelector('#shop-catalog-create input[name="product-name"]'),
    active: { tag: document.activeElement?.tagName || '', name: document.activeElement?.getAttribute('name') || '', text: document.activeElement?.textContent?.trim().slice(0, 60) || '' },
    createDetails: [...document.querySelectorAll('#shop-catalog-create')].map((details) => ({ open: details.open,
      focus: details.querySelector('input[name="product-name"]') === document.activeElement,
      display: getComputedStyle(details).display, parent: details.parentElement?.className || '' })),
    backLink: [...document.querySelectorAll('a')].some((node) => node.textContent.trim() === 'Back to Commerce') })`).catch(() => null)
  assert.fail(`timed out waiting for ${description}; fixture=${JSON.stringify(state)}`)
}

async function verifyViewport(cdp, origin, viewport) {
  const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true })
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const errors = []
  const externalOrigins = new Set()
  const removeRuntime = cdp.on(sessionId, 'Runtime.exceptionThrown', () => errors.push('page exception'))
  const removeConsole = cdp.on(sessionId, 'Runtime.consoleAPICalled', (event) => {
    if (event.type === 'error') errors.push('console error')
  })
  const removeFetch = cdp.on(sessionId, 'Fetch.requestPaused', (event) => {
    let local = false
    let external = false
    try {
      const url = new URL(event.request.url)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        local = url.origin === origin
        external = !local
        if (external) externalOrigins.add(url.origin)
      } else local = true
    } catch { local = true }
    const command = local ? 'Fetch.continueRequest' : 'Fetch.failRequest'
    const params = local
      ? { requestId: event.requestId }
      : { requestId: event.requestId, errorReason: 'BlockedByClient' }
    cdp.send(command, params, sessionId).catch(() => {})
  })

  try {
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Network.enable', {}, sessionId)
    await cdp.send('Network.setBypassServiceWorker', { bypass: true }, sessionId)
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId)
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.mobile ? 3 : 1,
      mobile: Boolean(viewport.mobile),
    }, sessionId)
    await cdp.send('Page.navigate', { url: origin }, sessionId)

    const commerce = await waitFor(cdp, sessionId, `(() => {
      const route = document.querySelector('#qa-route');
      const heading = [...document.querySelectorAll('h1')].some((node) => node.textContent.trim() === 'Add your first product');
      const add = [...document.querySelectorAll('a')].find((node) => node.textContent.trim() === 'Add first product');
      const csv = [...document.querySelectorAll('a')].find((node) => node.textContent.includes('Import a CSV'));
      return route?.dataset.path === '/ecommerce/?workspace=1' && heading && add && csv
        ? { path: route.dataset.path, add: true, csv: true,
            width: document.documentElement.scrollWidth, viewport: innerWidth }
        : null;
    })()`, 'empty Commerce page and both setup choices')
    assert.equal(commerce.add, true)
    assert.equal(commerce.csv, true)
    assert.ok(commerce.width <= commerce.viewport, `Commerce overflows at ${viewport.width}px`)

    await evaluate(cdp, sessionId, `([...document.querySelectorAll('a')].find((node) => node.textContent.trim() === 'Add first product')).click()`)
    const product = await waitFor(cdp, sessionId, `(() => {
      const route = document.querySelector('#qa-route');
      const details = document.querySelector('#shop-catalog-create');
      const input = details?.querySelector('input[name="product-name"]');
      const back = [...document.querySelectorAll('a')].some((node) => node.textContent.trim() === 'Back to Commerce');
      return route?.dataset.path === '/shop/?tab=inventory#shop-catalog-create' && route.dataset.return === 'true'
        && details?.open === true && input === document.activeElement && back
        ? { focused: true, back, width: document.documentElement.scrollWidth, viewport: innerWidth }
        : null;
    })()`, 'first-product form, focus, and return link')
    assert.equal(product.focused, true, 'first-product name field should receive focus')
    assert.equal(product.back, true, 'first-product setup should offer a return to Commerce')
    assert.ok(product.width <= product.viewport, `first-product form overflows at ${viewport.width}px`)

    await evaluate(cdp, sessionId, `([...document.querySelectorAll('a')].find((node) => node.textContent.trim() === 'Back to Commerce')).click()`)
    await waitFor(cdp, sessionId, `document.querySelector('#qa-route')?.dataset.path === '/ecommerce/'`, 'return to Commerce')
    await evaluate(cdp, sessionId, `([...document.querySelectorAll('a')].find((node) => node.textContent.includes('Import a CSV'))).click()`)
    const importer = await waitFor(cdp, sessionId, `(() => {
      const route = document.querySelector('#qa-route');
      const toggle = document.querySelector('button[aria-controls="shop-catalog-import-panel"]');
      const file = document.querySelector('#shop-catalog-import-panel input[type="file"]');
      return route?.dataset.path === '/shop/?tab=inventory#shop-catalog-import' && route.dataset.return === 'true'
        && toggle?.getAttribute('aria-expanded') === 'true' && file
        ? { expanded: true, acceptsCsv: (file.getAttribute('accept') || '').includes('.csv'),
            width: document.documentElement.scrollWidth, viewport: innerWidth }
        : null;
    })()`, 'open CSV importer from Commerce')
    assert.equal(importer.expanded, true, 'CSV importer should expand on the empty catalog route')
    assert.equal(importer.acceptsCsv, true, 'CSV importer should expose a CSV file input')
    assert.ok(importer.width <= importer.viewport, `CSV importer overflows at ${viewport.width}px`)

    const fixtureState = await evaluate(cdp, sessionId, `({ fetchAttempts: window.__qaFetchAttempts.length,
      identityProbes: window.__qaIdentityProbes,
      products: JSON.parse(localStorage.getItem(window.__qaCommerceKey)).items.length })`)
    assert.equal(fixtureState.fetchAttempts, 0, 'fixture should make no fetch or provider requests')
    assert.equal(fixtureState.products, 0, 'navigation and preview should not create a product')
    assert.deepEqual([...externalOrigins], [], 'fixture should make no external HTTP requests')
    assert.deepEqual(errors, [], 'fixture should have no browser runtime errors')

    return {
      viewport: `${viewport.width}x${viewport.height}`,
      firstProductFieldFocused: product.focused,
      returnToCommerce: product.back,
      csvImporterExpanded: importer.expanded,
      csvInputAvailable: importer.acceptsCsv,
      overflow: false,
      externalRequests: externalOrigins.size,
      providerFetches: fixtureState.fetchAttempts,
      productsCreated: fixtureState.products,
    }
  } finally {
    removeRuntime()
    removeConsole()
    removeFetch()
    await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {})
    await cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {})
  }
}

async function main() {
  const temp = await mkdtemp(join(tmpdir(), 'supermega-shop-first-use-'))
  let browser
  let cdp
  let server
  try {
    const html = await buildFixture(temp)
    server = createServer((request, response) => {
      if (request.url === '/favicon.ico') return response.writeHead(204).end()
      if (request.url !== '/') return response.writeHead(204).end()
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src data: blob:; font-src 'none'; form-action 'none'; base-uri 'none'",
        'x-content-type-options': 'nosniff',
      }).end(html)
    })
    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
    const origin = `http://127.0.0.1:${server.address().port}`
    const userDataDir = join(temp, 'browser-profile')
    const started = await launchBrowser(findBrowser(), userDataDir)
    browser = started.browser
    cdp = await Cdp.connect(started.wsUrl)
    const results = []
    for (const viewport of [
      { width: 1280, height: 900, mobile: false },
      { width: 390, height: 844, mobile: true },
    ]) results.push(await verifyViewport(cdp, origin, viewport))
    console.log(JSON.stringify({
      ok: true,
      classification: 'local-real-components_synthetic-empty-catalog_network-blocked_no-write',
      managedEntryShellIncluded: false,
      results,
    }, null, 2))
  } finally {
    if (cdp) {
      await cdp.send('Browser.close', {}, '', 2_000).catch(() => {})
      await cdp.close().catch(() => {})
    }
    browser?.kill()
    if (server) server.close()
    await rm(temp, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((error) => {
  console.error(`Shop first-use browser verification failed: ${error.message}`)
  process.exitCode = 1
})
