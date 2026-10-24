import assert from 'node:assert/strict'
import { createReadStream, existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, resolve } from 'node:path'
import test, { after, before } from 'node:test'

const fixtureRoot = resolve(process.env.SUPERMEGA_ACCOUNT_HUB_FIXTURE || '/tmp/supermega-account-hub-fixture-20261024')
const captureRoot = process.env.SUPERMEGA_ACCOUNT_HUB_CAPTURE
  ? resolve(process.env.SUPERMEGA_ACCOUNT_HUB_CAPTURE)
  : null
const require = createRequire(resolve('showroom/package.json'))
const { chromium } = require('playwright')

let browser
let origin
let server

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
])

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
  browser = await chromium.launch({
    executablePath: process.env.SUPERMEGA_CHROMIUM || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update'],
  })
  if (captureRoot) mkdirSync(captureRoot, { recursive: true })
})

after(async () => {
  await browser?.close()
  await new Promise((resolveClosed, reject) => server?.close((error) => error ? reject(error) : resolveClosed()))
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
]) {
  test(`account hub is readable without horizontal clipping at ${viewport.width}px`, async () => {
    const page = await browser.newPage({ viewport })
    await page.goto(origin, { waitUntil: 'networkidle' })
    await page.getByText('Awaiting manual payment verification. No provider settlement is confirmed.').waitFor()
    assert.equal(await page.getByRole('heading', { name: 'Mingalar Mini Mart' }).isVisible(), true)
    assert.equal(await page.getByText(/MMK\s+125,000/u).isVisible(), true)
    assert.equal(await page.getByText('CI and debug packages are never customer downloads.').isVisible(), true)
    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      buttons: [...document.querySelectorAll('a.core-button, button.core-button')].map((element) => {
        const rect = element.getBoundingClientRect()
        return { width: rect.width, height: rect.height, left: rect.left, right: rect.right }
      }),
    }))
    assert.equal(layout.scroll <= layout.viewport, true, JSON.stringify(layout))
    for (const button of layout.buttons) {
      assert.equal(button.height >= 48, true, JSON.stringify(button))
      assert.equal(button.left >= 0 && button.right <= layout.viewport, true, JSON.stringify(button))
    }
    if (captureRoot) await page.screenshot({ fullPage: true, path: resolve(captureRoot, `account-hub-${viewport.width}.png`) })
    await page.close()
  })
}

test('account hub reports empty billing state and signed-download boundary', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(`${origin}/?variant=empty`, { waitUntil: 'networkidle' })
  await page.getByText('No invoices are available for this company.').waitFor()
  assert.equal(await page.getByText('Not available yet').count(), 4)
  assert.equal(await page.locator('.account-downloads-card a').count(), 0)
  await page.close()
})

test('account hub moves focus to a recoverable billing failure', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(`${origin}/?variant=error`, { waitUntil: 'networkidle' })
  const alert = page.getByRole('alert')
  await alert.waitFor()
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'alert')
  assert.equal(await alert.textContent(), 'Plan and billing are temporarily unavailable.')
  const retry = page.getByRole('button', { name: 'Try again' })
  assert.equal(await retry.isVisible(), true)
  assert.equal((await retry.boundingBox()).height >= 48, true)
  await page.close()
})
