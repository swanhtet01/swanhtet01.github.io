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
const fixtures = {
  shop: resolve(root, '.tmp', 'qa-shop'),
  workspaces: resolve(root, '.tmp', 'qa-workspaces'),
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }

function buildFixture(script, args = []) {
  const result = spawnSync(process.execPath, [resolve(root, 'tools', script), ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120_000,
  })
  if (result.status !== 0) throw new Error(`fixture_build_failed:${script}:${result.stderr.slice(-1000)}`)
}

async function serveFixture() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1')
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

async function clickText(cdp, sessionId, text) {
  const clicked = await evaluate(cdp, sessionId, `(() => {
    const target = [...document.querySelectorAll('button,a')].find(node => node.textContent.trim() === ${JSON.stringify(text)});
    if (!target) return false; target.click(); return true;
  })()`)
  if (!clicked) throw new Error(`fixture_control_missing:${text}`)
}

async function typeInto(cdp, sessionId, selector, value) {
  const focused = await evaluate(cdp, sessionId, `(() => {
    const input=document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement)) return false;
    input.focus(); input.select(); return true;
  })()`)
  if (!focused) throw new Error(`fixture_input_missing:${selector}`)
  await cdp.send('Input.insertText', { text: value }, sessionId)
  await new Promise(resolveWait => setTimeout(resolveWait, 150))
}

async function capture(cdp, sessionId, output, name, expectedTexts) {
  for (const expectedText of expectedTexts) await waitFor(cdp, sessionId, expectedText)
  await evaluate(cdp, sessionId, 'document.activeElement?.blur()')
  const visibleQaChrome = await evaluate(cdp, sessionId, `(() => [...document.querySelectorAll('.qa-notice,.qa-nav,#root > p,#root > button,#root > output')]
    .some(node => getComputedStyle(node).display !== 'none' && node.getClientRects().length > 0))()`)
  if (visibleQaChrome) throw new Error(`qa_fixture_controls_visible:${name}`)
  await new Promise(resolveWait => setTimeout(resolveWait, 250))
  const raw = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }, sessionId)
  const bytes = Buffer.from(raw.data, 'base64')
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width !== 1440 || height !== 900) throw new Error(`capture_dimensions_invalid:${name}:${width}x${height}`)
  await writeFile(resolve(output, `${name}.png`), bytes, { flag: 'wx' })
  return { file: `${name}.png`, width, height, sha256: createHash('sha256').update(bytes).digest('hex') }
}

async function main() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true })
  const showroomTree = spawnSync('git', ['rev-parse', 'HEAD:showroom'], { cwd: root, encoding: 'utf8', windowsHide: true })
  const showroomChanges = spawnSync('git', ['status', '--porcelain', '--', 'showroom'], { cwd: root, encoding: 'utf8', windowsHide: true })
  if (head.status !== 0 || showroomTree.status !== 0 || showroomChanges.status !== 0 || showroomChanges.stdout.trim())
    throw new Error('clean_product_source_commit_required')
  buildFixture('build_shop_browser_fixture.mjs', ['--today'])
  buildFixture('build_product_clarity_fixture.mjs', ['--gallery'])
  await mkdir(outputRoot, { recursive: true })
  const output = await mkdtemp(join(outputRoot, 'gallery-candidate-'))
  const server = await serveFixture()
  const origin = `http://127.0.0.1:${server.address().port}`
  const profile = await mkdtemp(join(tmpdir(), 'supermega-gallery-capture-'))
  let browser
  let cdp
  let sessionId
  let deniedExternal = 0
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
      const local = url.startsWith(`${origin}/`) || url === 'about:blank'
      if (!local) deniedExternal += 1
      void cdp.send(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local
        ? { requestId: event.requestId } : { requestId: event.requestId, errorReason: 'BlockedByClient' }, sessionId).catch(() => {})
    })
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId)
    await cdp.send('Page.navigate', { url: `${origin}/shop/` }, sessionId)
    await waitFor(cdp, sessionId, 'Today')
    await evaluate(cdp, sessionId, `(() => { const s=document.createElement('style');s.textContent='#root > p,#root > button,#root > output{display:none!important}body{margin:0!important}';document.head.append(s) })()`)
    captures.push(await capture(cdp, sessionId, output, 'actual-shop-today', ['Today', 'Quick tasks', 'Order queue']))
    await clickText(cdp, sessionId, 'Show Counter')
    const saleItemAdded = await evaluate(cdp, sessionId, "(() => { const tile=document.querySelector('button.shop-product-tile'); if (!tile) return false; tile.click(); return true })()")
    if (!saleItemAdded) throw new Error('counter_product_tile_missing')
    captures.push(await capture(cdp, sessionId, output, 'actual-shop-sell', ['Products', 'Current sale', 'Daily essentials basket']))
    await clickText(cdp, sessionId, 'Show Orders')
    captures.push(await capture(cdp, sessionId, output, 'actual-shop-orders', ['Orders to finish', 'Payment pending']))
    await clickText(cdp, sessionId, 'Clean synthetic databases')

    await cdp.send('Page.navigate', { url: `${origin}/workspaces/` }, sessionId)
    await waitFor(cdp, sessionId, 'Inquiries')
    await evaluate(cdp, sessionId, `(() => { const s=document.createElement('style');s.textContent='.qa-notice,.qa-nav{display:none!important}.qa-shell{display:block!important;min-height:900px!important}.qa-content{padding:0!important}.website-product,.ecommerce-product{min-height:900px!important}body{margin:0!important}';document.head.append(s) })()`)
    await clickText(cdp, sessionId, 'Pages')
    captures.push(await capture(cdp, sessionId, output, 'actual-sites-editor', ['Edit page', 'Business details', 'Page checks']))
    await clickText(cdp, sessionId, 'Inquiries')
    captures.push(await capture(cdp, sessionId, output, 'actual-sites-inquiries', ['12 requests need review', 'Ko Min']))
    await clickText(cdp, sessionId, 'Store editor')
    await waitFor(cdp, sessionId, 'Store details')
    await typeInto(cdp, sessionId, '.ecommerce-copy-fields input', 'Mingalar Fresh Mart')
    await clickText(cdp, sessionId, 'Customer view')
    await clickText(cdp, sessionId, 'Save store')
    await waitFor(cdp, sessionId, 'Storefront saved on this device')
    captures.push(await capture(cdp, sessionId, output, 'actual-commerce-catalog', ['Mingalar Fresh Mart', '4 products', 'Add to cart']))
    const addedToCart = await evaluate(cdp, sessionId, "(() => { const item=document.querySelector('button.storefront-request-button'); if (!item) return false; item.click(); return true })()")
    if (!addedToCart) throw new Error('customer_store_product_not_orderable')
    await typeInto(cdp, sessionId, 'input[autocomplete="name"]', 'Ma Su')
    await typeInto(cdp, sessionId, 'input[autocomplete="tel"]', '09 123 456 789')
    await clickText(cdp, sessionId, 'Save request locally')
    captures.push(await capture(cdp, sessionId, output, 'actual-commerce-order-request', ['Request saved locally for Shop review.']))
    const sourceTreeAfter = spawnSync('git', ['rev-parse', 'HEAD:showroom'], { cwd: root, encoding: 'utf8', windowsHide: true })
    if (sourceTreeAfter.status !== 0 || sourceTreeAfter.stdout.trim() !== showroomTree.stdout.trim())
      throw new Error('product_source_changed_during_capture')
    console.log(JSON.stringify({ ok: true, classification: 'candidate_only_local_real_component_synthetic', publicationReady: false,
      sourceCommit: head.stdout.trim(), showroomTree: showroomTree.stdout.trim(), deniedExternal, output, captures }, null, 2))
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
