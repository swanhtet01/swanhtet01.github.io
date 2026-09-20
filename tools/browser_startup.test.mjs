import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import { startBrowser } from './browser_startup.mjs'
import { findBrowser } from './verify_app_entry_rendered.mjs'

function child() {
  const browser = new EventEmitter()
  browser.stderr = new EventEmitter()
  browser.kills = 0
  browser.kill = () => { browser.kills++ }
  return browser
}
const endpoint = 'ws://127.0.0.1:9222/devtools/browser/test'
const response = (url = endpoint) => ({ ok: true, json: async () => ({ webSocketDebuggerUrl: url }) })
function options(browser, fetchVersion) {
  return { spawnBrowser: () => browser, fetchVersion, timeoutMs: 100, probeTimeoutMs: 20, pollMs: 1 }
}

test('explicit missing browser fails closed instead of falling back', () => {
  assert.throws(() => findBrowser({ explicit: '/missing/browser', exists: () => false }), /explicit_browser_missing/)
})

test('explicit browser is selected exactly and command probes are bounded', () => {
  assert.equal(findBrowser({ explicit: '/chosen/browser', exists: () => true }), '/chosen/browser')
  assert.equal(findBrowser({ explicit: 'chosen-browser', probe: (bin, args, config) => {
    assert.equal(bin, 'chosen-browser')
    assert.deepEqual(args, ['--version'])
    assert.equal(config.timeout, 5000)
    return { status: 0 }
  } }), 'chosen-browser')
  for (const result of [{ status: 1 }, { status: null, error: new Error('timeout') }]) {
    assert.throws(() => findBrowser({ explicit: 'bad-browser', probe: () => result }), /explicit_browser_unavailable/)
  }
})

test('healthy local endpoint returns the exact owned child without killing it', async () => {
  const browser = child()
  const result = await startBrowser('test-browser', [], 9222, options(browser, async () => response()))
  assert.equal(result.browser, browser)
  assert.equal(result.wsUrl, endpoint)
  assert.equal(browser.kills, 0)
})

test('transient probe failure can recover within startup budget', async () => {
  const browser = child()
  let attempts = 0
  await startBrowser('test-browser', [], 9222, options(browser, async () => {
    if (++attempts === 1) throw Object.assign(new Error(), { cause: { code: 'ECONNREFUSED' } })
    return response()
  }))
  assert.equal(attempts, 2)
})

test('spawn error is handled and reported rather than an unhandled process event', async () => {
  const browser = child()
  await assert.rejects(startBrowser('missing-browser', [], 9222, options(browser, async () => {
    browser.emit('error', Object.assign(new Error(), { code: 'ENOENT' }))
    throw new Error()
  })), /spawn error ENOENT.*executable=missing-browser/)
  assert.equal(browser.kills, 1)
})

test('zero exit is distinguished from a browser still running', async () => {
  const browser = child()
  await assert.rejects(startBrowser('test-browser', [], 9222, options(browser, async () => {
    browser.emit('exit', 0)
    return response()
  })), /exited with code 0/)
  assert.equal(browser.kills, 0)
})

for (const invalid of ['ws://example.com:9222/devtools/browser/test', 'ws://127.0.0.1:9223/devtools/browser/test', 'http://127.0.0.1:9222/devtools/browser/test', 'ws://127.0.0.1:9222/not-devtools', 'ws://user@127.0.0.1:9222/devtools/browser/test']) {
  test(`rejects unrelated endpoint ${invalid}`, async () => {
    const browser = child()
    await assert.rejects(startBrowser('test-browser', [], 9222, options(browser, async () => response(invalid))), /did not expose DevTools/)
    assert.equal(browser.kills, 1)
  })
}

test('real hanging HTTP response is aborted within the startup budget', async () => {
  const server = createServer(() => {})
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = child()
  const began = Date.now()
  try {
    await assert.rejects(startBrowser('test-browser', [], server.address().port, {
      spawnBrowser: () => browser, timeoutMs: 150, probeTimeoutMs: 30, pollMs: 1,
    }), /last probe=TimeoutError/)
    assert.ok(Date.now() - began < 1500)
    assert.equal(browser.kills, 1)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('failure diagnostics retain bounded stderr and HTTP status, not response content', async () => {
  const browser = child()
  await assert.rejects(startBrowser('test-browser', [], 9222, options(browser, async () => {
    browser.stderr.emit('data', 'x'.repeat(5000))
    return { ok: false, status: 503 }
  })), (error) => {
    assert.match(error.message, /last probe=HTTP 503/)
    assert.ok(error.message.length < 4500)
    return true
  })
})
