#!/usr/bin/env node
// Captures actual product components in isolated synthetic fixtures. This is
// local presentation evidence only, never a hosted or customer-data receipt.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cdp, findBrowser, launchBrowser } from './verify_app_entry_rendered.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const outputRoot = resolve(root, '.tmp')
const captureInputPaths = [
  'showroom',
  'tools/capture_public_gallery.mjs',
  'tools/build_shop_browser_fixture.mjs',
  'tools/build_product_clarity_fixture.mjs',
  'tools/verify_app_entry_rendered.mjs',
  'tools/public-assets/noto-sans-myanmar.woff2',
  'tools/qa-assets',
  '.github/workflows/showroom-ci.yml',
]
const captureHarnessPaths = captureInputPaths.filter(path => path !== 'showroom' && path !== 'tools/capture_public_gallery.mjs')
const samplePhotoFiles = ['sites-studio-sample.jpg', 'sites-studio-materials.jpg', 'sites-studio-entrance.jpg']
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' }

async function captureInputsDigest() {
  const tracked = spawnSync('git', ['ls-files', '-z', '--', ...captureInputPaths], { cwd: root, encoding: 'buffer', windowsHide: true })
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', ...captureInputPaths], { cwd: root, encoding: 'buffer', windowsHide: true })
  if (tracked.status !== 0 || untracked.status !== 0) throw new Error('capture_input_inventory_unavailable')
  const paths = new Set(`${tracked.stdout.toString('utf8')}${untracked.stdout.toString('utf8')}`.split('\0').filter(Boolean))
  const digest = createHash('sha256')
  for (const path of [...paths].sort()) {
    digest.update(path)
    digest.update('\0')
    try {
      const bytes = await readFile(resolve(root, path))
      digest.update(String(bytes.length))
      digest.update('\0')
      digest.update(bytes)
    } catch (cause) {
      if (cause?.code !== 'ENOENT') throw cause
      digest.update('<deleted>')
    }
    digest.update('\0')
  }
  return digest.digest('hex')
}

function buildFixture(script, outputDirectory, args = []) {
  const result = spawnSync(process.execPath, [resolve(root, 'tools', script), ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120_000,
    env: { ...process.env, SUPERMEGA_QA_FIXTURE_OUTPUT_DIR: outputDirectory },
  })
  if (result.status !== 0) throw new Error(`fixture_build_failed:${script}:${result.stderr.slice(-1000)}`)
}

async function serveFixture(fixtures) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1')
      if (url.pathname === '/fonts/noto-sans-myanmar.woff2') {
        const bytes = await readFile(resolve(root, 'tools', 'public-assets', 'noto-sans-myanmar.woff2'))
        response.writeHead(200, { 'Content-Type': mime['.woff2'], 'Cache-Control': 'no-store' }).end(bytes)
        return
      }
      const match = /^\/(shop|workspaces)\/(index\.html|fixture\.js|fixture\.css|qa\.css)?$/.exec(url.pathname)
      if (!match) { response.writeHead(404).end(); return }
      const file = match[2] || 'index.html'
      const bytes = await readFile(join(fixtures[match[1]], file))
      response.writeHead(200, { 'Content-Type': mime[extname(file)], 'Cache-Control': 'no-store' }).end(bytes)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((accept, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', accept)
  })
  return server
}

async function evaluate(cdp, sessionId, expression) {
  const answer = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
  if (answer.exceptionDetails) throw new Error(`browser_eval_failed:${answer.exceptionDetails.text}`)
  return answer.result?.value
}

async function waitFor(cdp, sessionId, text) {
  for (let i = 0; i < 50; i += 1) {
    if (await evaluate(cdp, sessionId, `document.body?.innerText.includes(${JSON.stringify(text)}) === true`)) return
    await new Promise(resolveWait => setTimeout(resolveWait, 200))
  }
  throw new Error(`visible_state_missing:${text}`)
}

async function waitForSelector(cdp, sessionId, selector) {
  for (let i = 0; i < 50; i += 1) {
    if (await evaluate(cdp, sessionId, `document.querySelector(${JSON.stringify(selector)}) !== null`)) return
    await new Promise(resolveWait => setTimeout(resolveWait, 200))
  }
  throw new Error(`visible_selector_missing:${selector}`)
}

async function waitForPaidOrderRecord(cdp, sessionId) {
  let seen = null
  for (let i = 0; i < 50; i += 1) {
    seen = await evaluate(cdp, sessionId, `(() => {
      const dialog = document.querySelector('dialog.receipt-dialog[open]');
      return dialog ? { open: true, text: dialog.innerText.slice(0, 600) } : { open: false };
    })()`)
    if (seen.open && seen.text.includes('Order record') && seen.text.includes('PAID')
      && seen.text.includes('Not a tax invoice, receipt, or payment confirmation.')) return
    await new Promise(resolveWait => setTimeout(resolveWait, 200))
  }
  throw new Error(`paid_order_record_missing:${JSON.stringify(seen)}`)
}

async function clickText(cdp, sessionId, text) {
  const clicked = await evaluate(cdp, sessionId, `(() => {
    const target = [...document.querySelectorAll('button,a')].find(node => node.textContent.trim() === ${JSON.stringify(text)});
    if (!target) return false; target.click(); return true;
  })()`)
  if (!clicked) throw new Error(`fixture_control_missing:${text}`)
}

async function clickSelector(cdp, sessionId, selector) {
  const clicked = await evaluate(cdp, sessionId, `(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!(target instanceof HTMLElement)) return false; target.click(); return true;
  })()`)
  if (!clicked) throw new Error(`fixture_control_missing:${selector}`)
}

async function typeInto(cdp, sessionId, selector, value) {
  const focused = await evaluate(cdp, sessionId, `(() => {
    const input=document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return false;
    input.focus(); input.select(); return true;
  })()`)
  if (!focused) throw new Error(`fixture_input_missing:${selector}`)
  await cdp.send('Input.insertText', { text: value }, sessionId)
  await new Promise(resolveWait => setTimeout(resolveWait, 150))
}

async function capture(cdp, sessionId, output, name, expectedTexts, view) {
  for (const expectedText of expectedTexts) await waitFor(cdp, sessionId, expectedText)
  let viewVerified = false
  let loadedImages = 0
  let lastState = null
  for (let i = 0; i < 50; i += 1) {
    const state = await evaluate(cdp, sessionId, `(() => {
      const node = document.querySelector(${JSON.stringify(view.selector)});
      const bounds = node?.getBoundingClientRect();
      const images = [...document.querySelectorAll(${JSON.stringify(view.imageSelector || 'img[data-no-gallery-images]')})];
      return { path: location.pathname, route: window.__qaGalleryRoute ?? null,
        tab: window.__qaGalleryTab ?? null, visible: Boolean(bounds && bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth),
        imageCount: images.length, loadedImages: images.filter(image => image.complete && image.naturalWidth > 0).length };
    })()`)
    lastState = state
    loadedImages = state.loadedImages
    const actualRoute = state.route ? new URL(state.route, 'http://fixture.example') : null
    const expectedRoute = view.route ? new URL(view.route, 'http://fixture.example') : null
    const routeMatches = expectedRoute ? actualRoute?.pathname === expectedRoute.pathname
      && [...expectedRoute.searchParams].every(([key, value]) => actualRoute.searchParams.get(key) === value)
      : actualRoute === null
    if (state.path === view.fixturePath && routeMatches && state.tab === (view.tab || null)
      && state.visible && state.imageCount >= (view.images || 0) && state.loadedImages >= (view.images || 0)) {
      viewVerified = true
      break
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 200))
  }
  if (!viewVerified) throw new Error(`capture_view_or_images_missing:${name}:${JSON.stringify(lastState)}`)
  const myanmarFontLoaded = await evaluate(cdp, sessionId, `(async () => {
    await document.fonts.load('16px "Noto Sans Myanmar"', 'မင်္ဂလာပါ');
    return [...document.fonts].some(face => face.family === 'Noto Sans Myanmar' && face.status === 'loaded');
  })()`)
  if (!myanmarFontLoaded) throw new Error(`myanmar_font_missing:${name}`)
  await evaluate(cdp, sessionId, `(() => {
    const style = document.createElement('style');
    style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}';
    document.head.append(style);
  })()`)
  await evaluate(cdp, sessionId, 'document.activeElement?.blur()')
  const visibleQaChrome = await evaluate(cdp, sessionId, `(() => [...document.querySelectorAll('.qa-notice,.qa-nav,#root > p,#root > button,#root > output')]
    .some(node => getComputedStyle(node).display !== 'none' && node.getClientRects().length > 0))()`)
  if (visibleQaChrome) throw new Error(`qa_fixture_controls_visible:${name}`)
  let previous = null
  let bytes = null
  // Mobile layout can settle a few frames after the viewport or scroll changes.
  // Require identical consecutive captures, but give it a bounded settle window.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await evaluate(cdp, sessionId, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
    const raw = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }, sessionId)
    const current = Buffer.from(raw.data, 'base64')
    if (previous?.equals(current)) { bytes = current; break }
    previous = current
  }
  if (!bytes) throw new Error(`capture_pixels_unstable:${name}`)
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width !== (view.width || 1440) || height !== (view.height || 900)) throw new Error(`capture_dimensions_invalid:${name}:${width}x${height}`)
  await writeFile(resolve(output, `${name}.png`), bytes, { flag: 'wx' })
  return { file: `${name}.png`, width, height, sha256: createHash('sha256').update(bytes).digest('hex'),
    fixturePath: view.fixturePath, routeState: lastState.route || lastState.tab, visibleSelector: view.selector, loadedImages }
}

async function captureMobile(cdp, sessionId, output, name, expectedTexts, view) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId)
  await cdp.send('Emulation.setScrollbarsHidden', { hidden: true }, sessionId)
  try {
    if (name === 'actual-commerce-catalog-mobile' || name === 'actual-commerce-order-request-mobile') {
      let phonePreview = false
      for (let attempt = 0; attempt < 30; attempt += 1) {
        phonePreview = await evaluate(cdp, sessionId, "document.querySelector('.ecommerce-preview-frame')?.classList.contains('is-phone') ?? false")
        if (phonePreview) break
        await new Promise(resolveWait => setTimeout(resolveWait, 100))
      }
      if (!phonePreview) throw new Error(`commerce_phone_preview_state_not_updated:${name}`)
    }
    const mobileLayout = await evaluate(cdp, sessionId, `(() => {
      const node = document.querySelector(${JSON.stringify(view.selector)});
      const top = node?.getBoundingClientRect().top ?? 0;
      window.scrollTo({top:window.scrollY + top - 94, behavior:'instant'});
      return { viewport: innerWidth, page: document.documentElement.scrollWidth };
    })()`)
    if (mobileLayout.page > mobileLayout.viewport + 1) throw new Error(`mobile_capture_horizontal_overflow:${name}:${JSON.stringify(mobileLayout)}`)
    return await capture(cdp, sessionId, output, name, expectedTexts, { ...view, width: 390, height: 844 })
  } finally {
    await cdp.send('Emulation.setScrollbarsHidden', { hidden: false }, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
    await evaluate(cdp, sessionId, 'window.scrollTo(0,0)')
  }
}

async function captureTablet(cdp, sessionId, output, name, expectedTexts, view) {
  // iPad-sized portrait viewport: the Shop switches to its tablet layout while
  // retaining touch targets and opening the sale as a compact review sheet.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: true }, sessionId)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId)
  try {
    if (view.openSale) await clickSelector(cdp, sessionId, '.shop-mobile-cart')
    const layout = await evaluate(cdp, sessionId, `(() => {
      const node = document.querySelector(${JSON.stringify(view.selector)});
      const top = node?.getBoundingClientRect().top ?? 0;
      window.scrollTo({top:${view.scrollToTop ? '0' : "window.scrollY + top - 80"}, behavior:'instant'});
      return { viewport: innerWidth, page: document.documentElement.scrollWidth };
    })()`)
    if (layout.page > layout.viewport + 1) throw new Error(`tablet_capture_horizontal_overflow:${name}:${JSON.stringify(layout)}`)
    return await capture(cdp, sessionId, output, name, expectedTexts, { ...view, width: 768, height: 1024 })
  } finally {
    if (view.openSale) await clickSelector(cdp, sessionId, '.shop-cart-close')
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
    await evaluate(cdp, sessionId, 'window.scrollTo(0,0)')
  }
}

async function assertShopMobileFits(cdp, sessionId, selector) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId)
  try {
    const layout = await evaluate(cdp, sessionId, `(() => {
      const bounds=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
      return {viewport:innerWidth,page:document.documentElement.scrollWidth,left:bounds?.left,right:bounds?.right};
    })()`)
    if (!layout || layout.page > layout.viewport + 1 || layout.left < -1 || layout.right > layout.viewport + 1)
      throw new Error(`shop_mobile_horizontal_overflow:${selector}:${JSON.stringify(layout)}`)
  } finally {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
  }
}

async function main() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true })
  const showroomTree = spawnSync('git', ['rev-parse', 'HEAD:showroom'], { cwd: root, encoding: 'utf8', windowsHide: true })
  const reviewDirtyCapture = process.env.SUPERMEGA_GALLERY_REVIEW_DIRTY_SOURCE === '1'
  const sourceChanges = spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'showroom'], { cwd: root, encoding: 'utf8', windowsHide: true })
  const captureScriptChanges = spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'tools/capture_public_gallery.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true })
  const captureChanges = spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...captureHarnessPaths], { cwd: root, encoding: 'utf8', windowsHide: true })
  const captureInputsBefore = await captureInputsDigest()
  if (head.status !== 0 || showroomTree.status !== 0 || sourceChanges.status !== 0
    || captureScriptChanges.status !== 0 || captureChanges.status !== 0
    || (!reviewDirtyCapture && (sourceChanges.stdout.trim() || captureScriptChanges.stdout.trim() || captureChanges.stdout.trim())))
    throw new Error('clean_capture_source_commit_required')
  await mkdir(outputRoot, { recursive: true })
  const output = await mkdtemp(join(outputRoot, 'gallery-candidate-'))
  const fixtureRoot = await mkdtemp(join(outputRoot, 'gallery-fixtures-'))
  const fixtures = { shop: join(fixtureRoot, 'shop'), workspaces: join(fixtureRoot, 'workspaces') }
  buildFixture('build_shop_browser_fixture.mjs', fixtures.shop, ['--today', '--gallery'])
  buildFixture('build_product_clarity_fixture.mjs', fixtures.workspaces, ['--gallery'])
  const sampleMedia = new Map(await Promise.all(samplePhotoFiles.map(async file =>
    [`https://gallery-fixture.example/media/${file}`, await readFile(resolve(root, 'tools', 'qa-assets', file))])))
  const sampleMediaDigests = [...sampleMedia].map(([url, bytes]) => ({ file: basename(url),
    sha256: createHash('sha256').update(bytes).digest('hex'), evidence: 'synthetic_sample_photo' }))
  const server = await serveFixture(fixtures)
  const origin = `http://127.0.0.1:${server.address().port}`
  const profile = await mkdtemp(join(tmpdir(), 'supermega-gallery-capture-'))
  let browser
  let cdp
  let sessionId
  let deniedExternal = 0
  const fulfilledSampleMedia = new Set()
  const captures = []
  try {
    const launched = await launchBrowser(findBrowser(), profile)
    browser = launched.browser
    cdp = await Cdp.connect(launched.wsUrl)
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    ;({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }))
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId)
    cdp.on(sessionId, 'Fetch.requestPaused', event => {
      const url = event.request?.url || ''
      const sample = sampleMedia.get(url)
      if (sample) {
        fulfilledSampleMedia.add(url)
        void cdp.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'image/jpeg' }], body: sample.toString('base64') }, sessionId).catch(() => {})
        return
      }
      const local = url.startsWith(`${origin}/`) || url === 'about:blank'
      if (!local) deniedExternal += 1
      void cdp.send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local
        ? { requestId: event.requestId } : { requestId: event.requestId, errorReason: 'BlockedByClient' }, sessionId).catch(() => {})
    })
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
    await cdp.send('Page.navigate', { url: `${origin}/shop/` }, sessionId)
    await waitFor(cdp, sessionId, 'Today')
    const overdueOpenOrders = await evaluate(cdp, sessionId, `(() => {
      const state = JSON.parse(localStorage.getItem('supermega.commerce.workspace.v2') || '{}');
      return (state.orders || []).filter(order => order.status !== 'completed' && order.status !== 'cancelled'
        && order.promisedAt && Date.parse(order.promisedAt) <= Date.now()).map(order => order.id);
    })()`)
    if (overdueOpenOrders.length) throw new Error(`shop_gallery_seed_has_overdue_open_orders:${overdueOpenOrders.join(',')}`)
    await evaluate(cdp, sessionId, `(() => { const s=document.createElement('style');s.textContent='#root > p,#root > button,#root > output{display:none!important}body{margin:0!important}';document.head.append(s) })()`)
    const stockedShop = await evaluate(cdp, sessionId, "localStorage.getItem('supermega.commerce.workspace.v2')")
    if (!stockedShop) throw new Error('synthetic_shop_seed_missing')
    await evaluate(cdp, sessionId, `(() => {
      const key='supermega.commerce.workspace.v2';
      const empty={schema:JSON.parse(${JSON.stringify(stockedShop)}).schema,items:[],orders:[],movements:[],closes:[],catalogBaselines:[],catalogChanges:[],promotionPolicies:[],shippingPolicies:[],paymentPolicies:[],websiteIntakes:[],storefrontRequests:[],purchaseBudgetEnvelopes:[],supplierSourcingDecisions:[],purchaseOrders:[]};
      localStorage.setItem(key,JSON.stringify(empty));
    })()`)
    await clickText(cdp, sessionId, 'Reopen synthetic Shop')
    await waitFor(cdp, sessionId, 'No products to sell yet')
    const emptyShopFocused = await evaluate(cdp, sessionId, `Boolean(document.querySelector('.shop-first-product-card')) && !Boolean(document.querySelector('.shop-operations-board'))`)
    if (!emptyShopFocused) throw new Error('empty_shop_operations_not_simplified')
    captures.push(await capture(cdp, sessionId, output, 'actual-shop-first-run', ['Add first product', 'Import a CSV'],
      { fixturePath: '/shop/', tab: 'today', selector: '.shop-first-product-card' }))
    await assertShopMobileFits(cdp, sessionId, '.shop-first-product-card')
    await evaluate(cdp, sessionId, `localStorage.setItem('supermega.commerce.workspace.v2',${JSON.stringify(stockedShop)})`)
    await clickText(cdp, sessionId, 'Reopen synthetic Shop')
    await waitFor(cdp, sessionId, 'Order queue')
    await clickText(cdp, sessionId, 'Show Counter')
    const saleBasket = await evaluate(cdp, sessionId, `(async () => {
      const added = [];
      for (let index = 0; index < 3; index += 1) {
        const tile = [...document.querySelectorAll('button.shop-product-tile')]
          .find(candidate => !candidate.querySelector('.shop-product-quantity'));
        if (!tile) return { added, lines: document.querySelectorAll('.shop-cart-lines article').length };
        added.push(tile.querySelector('.shop-product-name strong')?.textContent?.trim() || 'unnamed product');
        tile.click();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return { added, lines: document.querySelectorAll('.shop-cart-lines article').length };
    })()`)
    if (saleBasket.added.length !== 3 || saleBasket.lines !== 3) {
      throw new Error(`counter_multi_item_basket_missing:${JSON.stringify(saleBasket)}`)
    }
    captures.push(await capture(cdp, sessionId, output, 'actual-shop-sell', ['Products', 'Current sale', 'KAUNG 90 Days Rice'],
      { fixturePath: '/shop/', tab: 'counter', selector: '.shop-current-sale' }))
    captures.push(await captureTablet(cdp, sessionId, output, 'actual-shop-sell-tablet', ['Products', 'Current sale', 'KAUNG 90 Days Rice'],
      { fixturePath: '/shop/', tab: 'counter', selector: '.shop-counter-grid', scrollToTop: true, openSale: true }))
    captures.push(await captureMobile(cdp, sessionId, output, 'actual-shop-sell-mobile', ['Products', 'KAUNG 90 Days Rice'],
      { fixturePath: '/shop/', tab: 'counter', selector: '.shop-counter-grid' }))
    await clickSelector(cdp, sessionId, '.shop-review-sale')
    await waitFor(cdp, sessionId, 'Review counter sale')
    await typeInto(cdp, sessionId, '.accountable-action-gate input', 'Synthetic cashier')
    await clickText(cdp, sessionId, 'Complete sale')
    await waitForPaidOrderRecord(cdp, sessionId)
    await clickText(cdp, sessionId, 'Set up receipt')
    await waitForSelector(cdp, sessionId, '.receipt-profile-form input[autocomplete="organization"]')
    await typeInto(cdp, sessionId, '.receipt-profile-form input[autocomplete="organization"]', 'Example Corner Shop')
    await clickText(cdp, sessionId, 'Save details')
    await waitForPaidOrderRecord(cdp, sessionId)
    const completedSale = await evaluate(cdp, sessionId, `(() => {
      const state = JSON.parse(localStorage.getItem('supermega.commerce.workspace.v2') || '{}');
      return state.orders?.some(order => order.status === 'completed' && order.paymentStatus === 'reconciled') === true;
    })()`)
    if (!completedSale) throw new Error('synthetic_counter_sale_not_completed')
    captures.push({
      ...await capture(cdp, sessionId, output, 'actual-shop-order-record', ['Order record', 'PAID'],
        { fixturePath: '/shop/', tab: 'counter', selector: 'dialog.receipt-dialog[open]' }),
      recordKind: 'paid_order_record_not_customer_receipt',
    })
    await clickSelector(cdp, sessionId, '.receipt-dialog-actions button:last-child')
    await clickText(cdp, sessionId, 'Show Today')
    captures.unshift(await capture(cdp, sessionId, output, 'actual-shop-today', ['Today', 'Quick tasks', 'Order queue', '1 completed'],
      { fixturePath: '/shop/', tab: 'today', selector: '.shop-today-module' }))
    captures.push(await captureTablet(cdp, sessionId, output, 'actual-shop-today-tablet', ['Today', 'Quick tasks', 'Order queue', '1 completed'],
      { fixturePath: '/shop/', tab: 'today', selector: '.shop-today-module' }))
    captures.push(await captureMobile(cdp, sessionId, output, 'actual-shop-today-mobile', ['Today', 'Quick tasks', 'Order queue', '1 completed'],
      { fixturePath: '/shop/', tab: 'today', selector: '.shop-today-module' }))
    await assertShopMobileFits(cdp, sessionId, '.shop-operations-board')
    await clickText(cdp, sessionId, 'Show Orders')
    captures.push(await capture(cdp, sessionId, output, 'actual-shop-orders', ['Needs attention', 'New order'],
      { fixturePath: '/shop/', tab: 'orders', selector: '.orders-module' }))
    captures.push(await captureTablet(cdp, sessionId, output, 'actual-shop-orders-tablet', ['Needs attention', 'New order'],
      { fixturePath: '/shop/', tab: 'orders', selector: '.orders-module' }))
    captures.push(await captureMobile(cdp, sessionId, output, 'actual-shop-orders-mobile', ['Needs attention', 'New order'],
      { fixturePath: '/shop/', tab: 'orders', selector: '.orders-module' }))
    await clickText(cdp, sessionId, 'Show Inventory')
    await waitFor(cdp, sessionId, 'Inventory')
    await clickSelector(cdp, sessionId, '.stock-catalog-disclosure summary')
    await waitForSelector(cdp, sessionId, '.stock-catalog-disclosure[open]')
    captures.push(await capture(cdp, sessionId, output, 'actual-shop-inventory', ['Inventory', 'Stock', 'Other products', 'BAYDAR Laundry Detergent'],
      { fixturePath: '/shop/', tab: 'inventory', selector: '.shop-stock-module' }))
    captures.push(await captureTablet(cdp, sessionId, output, 'actual-shop-inventory-tablet', ['Inventory', 'Stock', 'Other products', 'BAYDAR Laundry Detergent'],
      { fixturePath: '/shop/', tab: 'inventory', selector: '.shop-stock-module' }))
    await clickSelector(cdp, sessionId, '.stock-catalog-disclosure summary')
    await waitForSelector(cdp, sessionId, '.stock-catalog-disclosure:not([open])')
    captures.push(await captureMobile(cdp, sessionId, output, 'actual-shop-inventory-mobile', ['Inventory', 'Stock'],
      { fixturePath: '/shop/', tab: 'inventory', selector: '.shop-stock-module' }))
    await assertShopMobileFits(cdp, sessionId, '.shop-stock-module')
    await clickText(cdp, sessionId, 'Clean synthetic databases')

    await cdp.send('Page.navigate', { url: `${origin}/workspaces/` }, sessionId)
    await waitFor(cdp, sessionId, 'Inquiries')
    await evaluate(cdp, sessionId, `(() => { const s=document.createElement('style');s.textContent='.qa-notice,.qa-nav{display:none!important}.qa-shell{display:block!important;min-height:900px!important}.qa-content{padding:0!important}.website-product,.ecommerce-product{min-height:900px!important}body{margin:0!important}';document.head.append(s) })()`)
    await clickText(cdp, sessionId, 'Pages')
    captures.push(await capture(cdp, sessionId, output, 'actual-sites-editor', ['Edit page', 'Business details', 'Page checks'],
      { fixturePath: '/workspaces/', route: '/website/', selector: '[data-content-section="hero"]', imageSelector: '.website-page-card img', images: 3 }))
    captures.push(await captureTablet(cdp, sessionId, output, 'actual-sites-editor-tablet', ['Edit page', 'Business details', 'Page checks'],
      { fixturePath: '/workspaces/', route: '/website/', selector: '[data-content-section="hero"]', imageSelector: '.website-page-card img', images: 3 }))
    captures.push(await captureMobile(cdp, sessionId, output, 'actual-sites-editor-mobile', ['Edit page', 'Business details', 'Page checks'],
      { fixturePath: '/workspaces/', route: '/website/', selector: '[data-content-section="hero"]', imageSelector: '.website-page-card img', images: 3 }))
    await clickText(cdp, sessionId, 'Inquiries')
    captures.push(await capture(cdp, sessionId, output, 'actual-sites-inquiries', ['12 requests need review', 'Ko Min'],
      { fixturePath: '/workspaces/', route: '/website/?view=inquiries', selector: '.website-inquiry-detail' }))
    captures.push(await captureTablet(cdp, sessionId, output, 'actual-sites-inquiries-tablet', ['12 requests need review', 'Ko Min'],
      { fixturePath: '/workspaces/', route: '/website/?view=inquiries', selector: '.website-inquiry-detail' }))
    captures.push(await captureMobile(cdp, sessionId, output, 'actual-sites-inquiries-mobile', ['12 requests need review', 'Ko Min'],
      { fixturePath: '/workspaces/', route: '/website/?view=inquiries', selector: '.website-inquiry-detail' }))
    await clickText(cdp, sessionId, 'Store editor')
    await waitFor(cdp, sessionId, 'Store details')
    await typeInto(cdp, sessionId, '.ecommerce-copy-fields input', 'Example Studio')
    await typeInto(cdp, sessionId, '.ecommerce-copy-fields textarea', 'Sample paper, notebooks, and design support for local businesses. Shop reviews each pickup request before confirming it.')
    await clickText(cdp, sessionId, 'Customer view')
    await clickText(cdp, sessionId, 'Save store')
    await waitFor(cdp, sessionId, 'Storefront saved on this device')
    captures.push(await capture(cdp, sessionId, output, 'actual-commerce-catalog', ['Example Studio', '3 products', 'Add to cart'],
      { fixturePath: '/workspaces/', route: '/ecommerce/?view=preview', selector: '.storefront-grid', imageSelector: '.storefront-grid img.storefront-product-photo', images: 3 }))
    captures.push(await captureTablet(cdp, sessionId, output, 'actual-commerce-catalog-tablet', ['Example Studio', '3 products', 'Add to cart'],
      { fixturePath: '/workspaces/', route: '/ecommerce/?view=preview', selector: '.storefront-grid', imageSelector: '.storefront-grid img.storefront-product-photo', images: 3 }))
    captures.push(await captureMobile(cdp, sessionId, output, 'actual-commerce-catalog-mobile', ['Example Studio', '3 products', 'Add to cart'],
      { fixturePath: '/workspaces/', route: '/ecommerce/?view=preview', selector: '.storefront-grid', imageSelector: '.storefront-grid img.storefront-product-photo', images: 3 }))
    const addedToCart = await evaluate(cdp, sessionId, "(() => { const item=document.querySelector('button.storefront-request-button'); if (!item) return false; item.click(); return true })()")
    if (!addedToCart) throw new Error('customer_store_product_not_orderable')
    await typeInto(cdp, sessionId, 'input[autocomplete="name"]', 'Ma Su')
    await typeInto(cdp, sessionId, 'input[autocomplete="tel"]', '09 123 456 789')
    await clickText(cdp, sessionId, 'Save request locally')
    try {
      await waitForSelector(cdp, sessionId, '.ecommerce-quote-receipt[data-current="true"]')
    } catch (cause) {
      const checkout = await evaluate(cdp, sessionId, `(() => ({
        notice: document.querySelector('.ecommerce-buying-notice')?.textContent?.slice(0, 240) ?? '',
        buttonDisabled: document.querySelector('button[data-request-mode="local"]')?.disabled ?? null,
        formValid: document.querySelector('#ecommerce-buying-workspace form')?.checkValidity() ?? null,
        receiptCount: document.querySelectorAll('.ecommerce-quote-receipt').length,
      }))()`)
      throw new Error(`${cause.message}:${JSON.stringify(checkout)}`)
    }
    const requestPanelShown = await evaluate(cdp, sessionId, `(() => {
      const panel = document.getElementById('ecommerce-buying-workspace');
      if (!panel) return false;
      const receipt = document.querySelector('.ecommerce-quote-receipt[data-current="true"]');
      if (!receipt) return false;
      // Give the end-of-page receipt room to align without clipping catalog cards.
      document.querySelector('.qa-shell').style.paddingBottom = '180px';
      receipt.scrollIntoView({ block: 'start', behavior: 'instant' });
      return true;
    })()`)
    if (!requestPanelShown) throw new Error('commerce_request_panel_missing')
    captures.push(await capture(cdp, sessionId, output, 'actual-commerce-order-request',
      ['Request saved on this device', 'No order or payment was confirmed.'],
      { fixturePath: '/workspaces/', route: '/ecommerce/?view=preview', selector: '.ecommerce-quote-receipt[data-current="true"]' }))
    captures.push(await captureTablet(cdp, sessionId, output, 'actual-commerce-order-request-tablet',
      ['Request saved on this device', 'No order or payment was confirmed.'],
      { fixturePath: '/workspaces/', route: '/ecommerce/?view=preview', selector: '.ecommerce-quote-receipt[data-current="true"]' }))
    captures.push(await captureMobile(cdp, sessionId, output, 'actual-commerce-order-request-mobile',
      ['Request saved on this device', 'No order or payment was confirmed.'],
      { fixturePath: '/workspaces/', route: '/ecommerce/?view=preview', selector: '.ecommerce-quote-receipt[data-current="true"]' }))
    const sourceTreeAfter = spawnSync('git', ['rev-parse', 'HEAD:showroom'], { cwd: root, encoding: 'utf8', windowsHide: true })
    const captureInputsAfter = await captureInputsDigest()
    if (sourceTreeAfter.status !== 0 || sourceTreeAfter.stdout.trim() !== showroomTree.stdout.trim()
      || captureInputsAfter !== captureInputsBefore)
      throw new Error('product_source_changed_during_capture')
    if (deniedExternal !== 0 || fulfilledSampleMedia.size !== sampleMedia.size)
      throw new Error(`sample_media_or_external_request_mismatch:${fulfilledSampleMedia.size}:${deniedExternal}`)
    console.log(JSON.stringify({ ok: true, classification: 'candidate_only_local_real_component_synthetic', publicationReady: false,
      capturedAt: new Date().toISOString(),
      captureMode: reviewDirtyCapture ? 'dirty-working-tree-review' : 'clean-commit-review',
      captureInputsSha256: captureInputsAfter,
      sourceHasLocalChanges: Boolean(sourceChanges.stdout.trim() || captureScriptChanges.stdout.trim() || captureChanges.stdout.trim()),
      captureHarnessHasLocalChanges: Boolean(captureChanges.stdout.trim()),
      sourceCommit: head.stdout.trim(), showroomTree: showroomTree.stdout.trim(), deniedExternal,
      fulfilledSyntheticMedia: fulfilledSampleMedia.size, sampleMediaDigests, completedSale,
      customerReceiptVisible: false, output, captures }, null, 2))
  } finally {
    if (cdp) {
      await cdp.send('Browser.close', {}, '', 2000).catch(() => {})
      await cdp.close().catch(() => {})
    }
    browser?.kill()
    server.close()
    if (dirname(profile) === resolve(tmpdir()) && basename(profile).startsWith('supermega-gallery-capture-')) {
      await rm(profile, { recursive: true, force: true }).catch(() => {})
    }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
