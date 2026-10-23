#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve, sep } from 'node:path'

import { Cdp, findBrowser, launchBrowser } from './verify_app_entry_rendered.mjs'

const root = resolve(import.meta.dirname, '..')
const staticDir = resolve(root, '.vercel/output/static')
const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]
const routes = ['/shop/', '/my/shop/']
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function serveStatic() {
  const server = createServer((request, response) => {
    let pathname
    try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname) }
    catch { response.writeHead(400).end(); return }
    let path = normalize(join(staticDir, pathname))
    if (path !== staticDir && !path.startsWith(staticDir + sep)) { response.writeHead(403).end(); return }
    if (!existsSync(path) || !statSync(path).isFile()) path = join(path, 'index.html')
    if (!existsSync(path) || !statSync(path).isFile()) { response.writeHead(404).end(); return }
    response.writeHead(200, { 'cache-control': 'no-store', 'content-type': mime[extname(path)] || 'application/octet-stream' })
    createReadStream(path).pipe(response)
  })
  return new Promise(resolveStarted => server.listen(0, '127.0.0.1', () => resolveStarted(server)))
}

async function evaluate(cdp, sessionId, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
  if (exceptionDetails) throw new Error(exceptionDetails.text || 'responsive_page_evaluation_failed')
  return result.value
}

async function waitForReady(cdp, sessionId) {
  for (let attempts = 0; attempts < 80; attempts += 1) {
    if (await evaluate(cdp, sessionId, 'document.readyState === "complete"')) return
    await new Promise(done => setTimeout(done, 50))
  }
  throw new Error('responsive_page_load_timeout')
}

const server = await serveStatic()
const userDataDir = await mkdtemp(join(tmpdir(), 'supermega-public-responsive-'))
let browser
let cdp
try {
  const started = await launchBrowser(findBrowser(), userDataDir)
  browser = started.browser
  cdp = await Cdp.connect(started.wsUrl)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)
  const { port } = server.address()
  const cases = []
  for (const route of routes) {
    for (const viewport of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false,
      }, sessionId)
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}${route}` }, sessionId)
      await waitForReady(cdp, sessionId)
      const result = await evaluate(cdp, sessionId, `(() => {
        const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
        const primary = [...document.querySelectorAll('.button-primary')].filter(visible)
        const targets = [...document.querySelectorAll('.site-header a, .button-primary')].filter(visible)
        const tableau = document.querySelector('.native-shop-tableau')
        const figures = [...document.querySelectorAll('.native-shop-tableau .native-shop-shot')].filter(visible)
        const switchLink = document.querySelector('[data-language-switch]')
        const focusTarget = primary[0]
        focusTarget && focusTarget.focus()
        const focusStyle = focusTarget ? getComputedStyle(focusTarget) : null
        return {
          lang: document.documentElement.lang,
          viewportWidth: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          primaryCount: primary.length,
          targetHeights: targets.map(element => Math.round(element.getBoundingClientRect().height)),
          focusVisible: Boolean(focusStyle && focusStyle.outlineStyle !== 'none' && Number.parseFloat(focusStyle.outlineWidth) > 0),
          switchHref: switchLink && switchLink.getAttribute('href'),
          tableauCount: document.querySelectorAll('.native-shop-tableau').length,
          figureCount: figures.length,
          tableauHeight: tableau ? Math.round(tableau.getBoundingClientRect().height) : 0,
          deviceLabels: [...document.querySelectorAll('figcaption')].some(node => /^(Desktop|Tablet|Phone)$/.test(node.textContent.trim())),
          forbiddenCopy: /SuperMega Shop|Request a Shop pilot|Request a Shop walkthrough/i.test(document.body.innerText),
        }
      })()`)
      const expectedLang = route.startsWith('/my/') ? 'my' : 'en'
      const expectedSwitch = expectedLang === 'my' ? '/shop/' : '/my/shop/'
      const failures = []
      if (result.lang !== expectedLang) failures.push('locale')
      if (result.viewportWidth !== viewport.width || result.scrollWidth > viewport.width) failures.push('overflow')
      if (result.primaryCount !== 1) failures.push('primary_action')
      if (result.targetHeights.some(height => height < 48)) failures.push('touch_target')
      if (!result.focusVisible) failures.push('keyboard_focus')
      if (result.switchHref !== expectedSwitch) failures.push('language_switch')
      if (result.tableauCount !== 1 || result.figureCount !== 3 || result.tableauHeight < 360) failures.push('tableau')
      if (result.deviceLabels) failures.push('device_label')
      if (result.forbiddenCopy) failures.push('copy')
      cases.push({ route, ...viewport, ...result, failures })
    }
  }
  const failures = cases.flatMap(entry => entry.failures.map(failure => `${entry.route}@${entry.width}:${failure}`))
  const report = { ok: failures.length === 0, contract: 'supermega.public-shop-responsive.v1', cases, failures }
  console.log(JSON.stringify(report, null, 2))
  if (failures.length) process.exitCode = 1
} finally {
  if (cdp) {
    await cdp.send('Browser.close', {}, '', 2_000).catch(() => {})
    await cdp.close().catch(() => {})
  }
  server.close()
  browser?.kill()
  await rm(userDataDir, { recursive: true, force: true })
}
