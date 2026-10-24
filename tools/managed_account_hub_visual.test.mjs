import assert from 'node:assert/strict'
import { createReadStream, existsSync, mkdirSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import test, { after, before } from 'node:test'

import { Cdp, findBrowser, launchBrowser } from './verify_app_entry_rendered.mjs'

const fixtureRoot = resolve(process.env.SUPERMEGA_ACCOUNT_HUB_FIXTURE || '/tmp/supermega-account-hub-fixture-20261024')
const captureRoot = process.env.SUPERMEGA_ACCOUNT_HUB_CAPTURE ? resolve(process.env.SUPERMEGA_ACCOUNT_HUB_CAPTURE) : null

let browser
let cdp
let origin
let server
let userDataDir

async function waitForBrowserExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true
  return new Promise((resolveExited) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolveExited(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolveExited(true)
    }
    child.once('exit', onExit)
  })
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
])

async function evaluate(sessionId, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  }, sessionId)
  if (exceptionDetails) throw new Error(exceptionDetails.text || 'account_hub_page_evaluation_failed')
  return result.value
}

async function waitFor(sessionId, expression, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(sessionId, expression)) return
    await new Promise((done) => setTimeout(done, 50))
  }
  throw new Error('account_hub_render_timeout')
}

async function withPage(viewport, route, action) {
  const context = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true })
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank', browserContextId: context.browserContextId,
  })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  try {
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width <= 430,
    }, sessionId)
    const loaded = new Promise((resolveLoaded, reject) => {
      const timer = setTimeout(() => reject(new Error('account_hub_load_timeout')), 8_000)
      const off = cdp.on(sessionId, 'Page.loadEventFired', () => {
        clearTimeout(timer)
        off()
        resolveLoaded()
      })
    })
    await cdp.send('Page.navigate', { url: `${origin}${route}` }, sessionId)
    await loaded
    await action(sessionId)
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {})
    await cdp.send('Target.disposeBrowserContext', { browserContextId: context.browserContextId }).catch(() => {})
  }
}

before(async () => {
  for (const file of ['index.html', 'fixture.js', 'fixture.css']) {
    assert.equal(existsSync(resolve(fixtureRoot, file)), true, `missing fixture file: ${file}`)
  }
  server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://fixture.invalid')
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname
    if (!/^\/(?:index\.html|fixture\.js|fixture\.css)$/u.test(pathname)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }
    const file = resolve(fixtureRoot, pathname.slice(1))
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentTypes.get(extname(file)) || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    })
    createReadStream(file).pipe(response)
  })
  await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady))
  const address = server.address()
  assert(address && typeof address === 'object')
  origin = `http://127.0.0.1:${address.port}`
  userDataDir = await mkdtemp(join(tmpdir(), 'supermega-account-hub-browser-'))
  const started = await launchBrowser(findBrowser(), userDataDir)
  browser = started.browser
  cdp = await Cdp.connect(started.wsUrl)
  if (captureRoot) mkdirSync(captureRoot, { recursive: true })
})

after(async () => {
  if (cdp) {
    await cdp.send('Browser.close', {}, '', 2_000).catch(() => {})
    await cdp.close().catch(() => {})
  }
  if (browser && !await waitForBrowserExit(browser, 2_000)) {
    browser.kill()
    if (!await waitForBrowserExit(browser, 2_000)) {
      browser.kill('SIGKILL')
      await waitForBrowserExit(browser, 2_000)
    }
  }
  await new Promise((resolveClosed, reject) => server?.close((error) => error ? reject(error) : resolveClosed()))
  if (userDataDir) await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
]) {
  test(`account hub is readable without horizontal clipping at ${viewport.width}px`, async () => {
    await withPage(viewport, '/', async (sessionId) => {
      await waitFor(sessionId, `document.body.innerText.includes('Awaiting manual payment verification. No provider settlement is confirmed.')`)
      const state = await evaluate(sessionId, `(() => {
        const buttons = [...document.querySelectorAll('a.core-button, button.core-button')].map((element) => {
          const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height, left: rect.left, right: rect.right }
        });
        return { text: document.body.innerText, viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, buttons }
      })()`)
      assert.match(state.text, /Mingalar Mini Mart/u)
      assert.match(state.text, /MMK\s+125,000/u)
      assert.match(state.text, /CI and debug packages are never customer downloads\./u)
      assert.equal(state.scroll <= state.viewport, true, JSON.stringify(state))
      for (const button of state.buttons) {
        assert.equal(button.height >= 48, true, JSON.stringify(button))
        assert.equal(button.left >= 0 && button.right <= state.viewport, true, JSON.stringify(button))
      }
      if (captureRoot) {
        const metrics = await cdp.send('Page.getLayoutMetrics', {}, sessionId)
        const capture = await cdp.send('Page.captureScreenshot', {
          format: 'png', fromSurface: true, captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 },
        }, sessionId)
        await writeFile(resolve(captureRoot, `account-hub-${viewport.width}.png`), Buffer.from(capture.data, 'base64'), { flag: 'w' })
      }
    })
  })
}

test('account hub reports empty billing state and signed-download boundary', async () => {
  await withPage({ width: 390, height: 844 }, '/?variant=empty', async (sessionId) => {
    await waitFor(sessionId, `document.body.innerText.includes('No invoices are available for this company.')`)
    const state = await evaluate(sessionId, `(() => ({
      unavailable: [...document.querySelectorAll('.account-downloads-card li strong')].filter((node) => node.textContent.trim() === 'Not available yet').length,
      links: document.querySelectorAll('.account-downloads-card a').length,
    }))()`)
    assert.deepEqual(state, { unavailable: 4, links: 0 })
  })
})

test('viewer without Shop or billing capability gets neither owner reads nor Shop actions', async () => {
  await withPage({ width: 390, height: 844 }, '/?access=viewer&product=none', async (sessionId) => {
    await waitFor(sessionId, `document.body.innerText.includes('Plan and billing access is not assigned to this company role.')`)
    const state = await evaluate(sessionId, `(() => ({
      text: document.body.innerText,
      billingCalls: window.__supermegaSyntheticBillingCalls || 0,
      shopLinks: [...document.querySelectorAll('a')].filter((node) => /Open Shop|Shop setup|Backup and recovery/u.test(node.textContent || '')).length,
    }))()`)
    assert.equal(state.billingCalls, 0)
    assert.equal(state.shopLinks, 0)
    assert.match(state.text, /Company role\s+viewer/u)
  })
})

test('account hub moves focus to a recoverable billing failure', async () => {
  await withPage({ width: 390, height: 844 }, '/?variant=error', async (sessionId) => {
    await waitFor(sessionId, `document.activeElement?.getAttribute('role') === 'alert'`)
    const state = await evaluate(sessionId, `(() => {
      const alert = document.querySelector('[role="alert"]'); const retry = document.querySelector('button.core-button'); const rect = retry?.getBoundingClientRect();
      return { alert: alert?.textContent, focused: document.activeElement === alert, retry: retry?.textContent, retryHeight: rect?.height }
    })()`)
    assert.deepEqual(state, {
      alert: 'Plan and billing are temporarily unavailable.', focused: true, retry: 'Try again', retryHeight: 48,
    })
  })
})
