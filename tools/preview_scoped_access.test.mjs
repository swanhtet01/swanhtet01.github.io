import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPreviewScopedAccess, capturePreviewAccessEnvironment, consumePreviewAccessEnvironment, installPreviewBrowserAccess } from './preview_scoped_access.mjs'
import { readFile } from 'node:fs/promises'
const publicOrigin = 'https://supermega-public-123456789-swanhtet01s-projects.vercel.app'
const appOrigin = 'https://megaos-123456789-swanhtet01s-projects.vercel.app'
const input = () => ({ publicOrigin, appOrigin, publicToken: 'synthetic-public-fixture-not-a-secret', appToken: 'synthetic-app-fixture-not-a-secret' })
test('credentials remain bound to exact immutable origin and readonly methods', () => {
  const access = createPreviewScopedAccess(input())
  assert.equal(access.headersFor(publicOrigin)['x-vercel-protection-bypass'], input().publicToken)
  assert.equal(access.headersFor(appOrigin)['x-vercel-protection-bypass'], input().appToken)
  assert.equal(access.headersFor(new URL(`${appOrigin}/__release.json`))['x-vercel-protection-bypass'], input().appToken)
  for (const url of ['https://app.supermega.dev/', `${appOrigin}.evil.example/`, 'https://evil.example/',
    `${appOrigin}/?token=value`, appOrigin.replace('https://', 'https://user@')]) assert.throws(() => access.headersFor(url), /denied/)
  assert.throws(() => access.headersFor(appOrigin, 'POST'), /denied/)
  assert.equal(JSON.stringify(access).includes(input().appToken), false)
  access.dispose(); assert.throws(() => access.headersFor(appOrigin), /disposed/)
})
test('transport refuses redirect and sanitizes upstream exceptions', async () => {
  const access = createPreviewScopedAccess(input())
  await assert.rejects(() => access.fetchReadOnly(appOrigin, async (_, options) => {
    assert.equal(options.redirect, 'manual'); assert.equal(options.credentials, 'omit')
    return { status: 302 }
  }), /redirect_denied/)
  await assert.rejects(() => access.fetchReadOnly(appOrigin, async () => { throw new Error(input().appToken) }), error => error.message === 'preview_access_fetch_failed')
  const result = await access.fetchReadOnly(appOrigin, async () => ({ status: 200 }))
  assert.equal(result.status, 200)
  access.dispose()
})

test('process-local inputs are consumed even when incomplete and never inherited', () => {
  const environment = { SUPERMEGA_PUBLIC_PREVIEW_BYPASS: input().publicToken, SUPERMEGA_APP_PREVIEW_BYPASS: input().appToken, KEEP: 'unchanged' }
  const access = consumePreviewAccessEnvironment({ publicOrigin, appOrigin }, environment)
  assert.deepEqual(environment, { KEEP: 'unchanged' })
  access.assertNoCredential({ status: 'ok' })
  assert.throws(() => access.assertNoCredential({ nested: input().appToken }), /credential_reflected/)
  assert.throws(() => access.headersFor(`${appOrigin}/${input().appToken}`), /denied/)
  access.dispose()
  const incomplete = { SUPERMEGA_PUBLIC_PREVIEW_BYPASS: input().publicToken }
  assert.throws(() => consumePreviewAccessEnvironment({ publicOrigin, appOrigin }, incomplete), /credential_invalid/)
  assert.deepEqual(incomplete, {})
  assert.equal(consumePreviewAccessEnvironment({ publicOrigin, appOrigin }, {}), null)
})

function fakeCdp(failMethod = '') {
  const calls = []
  const listeners = new Map()
  return {
    calls,
    listeners,
    async send(method, params, sessionId) {
      calls.push({ method, params, sessionId })
      if (method === failMethod) throw new Error(input().appToken)
      return method === 'Target.closeTarget' ? { success: true } : {}
    },
    on(sessionId, method, callback) {
      const key = `${sessionId}:${method}`
      listeners.set(key, callback)
      return () => listeners.delete(key)
    },
    emit(method, event) { listeners.get(`session:${method}`)?.(event) },
  }
}
const paused = (url, method = 'GET', headers = {}) => ({ requestId: 'request', request: { url, method, headers } })

test('browser access intercepts before navigation and replaces credential-bearing headers', async () => {
  const access = createPreviewScopedAccess(input())
  const cdp = fakeCdp()
  const guard = await installPreviewBrowserAccess({ cdp, sessionId: 'session', targetId: 'target', access })
  assert.deepEqual(cdp.calls.map(call => call.method), ['Network.setBypassServiceWorker', 'Network.setCacheDisabled', 'Target.setAutoAttach', 'Fetch.enable'])
  assert.equal(cdp.calls[2].params.waitForDebuggerOnStart, true)
  assert.deepEqual(cdp.calls[3].params.patterns, [{ urlPattern: '*', requestStage: 'Request' }])
  for (const origin of [publicOrigin, appOrigin]) {
    cdp.emit('Fetch.requestPaused', paused(`${origin}/`, 'GET', { Accept: 'text/html', Cookie: 'old', Authorization: 'old', Referer: 'old', 'X-Vercel-Protection-Bypass': 'old' }))
    await guard.assertClean()
    const command = cdp.calls.at(-1)
    assert.equal(command.method, 'Fetch.continueRequest')
    assert.deepEqual(command.params.headers, [{ name: 'Accept', value: 'text/html' },
      { name: 'x-vercel-protection-bypass', value: origin === publicOrigin ? input().publicToken : input().appToken }])
  }
  await guard.dispose()
  assert.equal(cdp.calls.at(-1).method, 'Target.closeTarget')
  assert.equal(cdp.listeners.size, 0)
  assert.equal(cdp.calls.some(call => call.method === 'Fetch.disable'), false)
  access.dispose()
})

test('outside origins, write methods, reflected credentials and redirect destinations fail closed', async () => {
  for (const event of [paused('https://example.com/'), paused(appOrigin, 'POST'), paused(`${appOrigin}/?token=value`), paused(`${appOrigin}/${input().appToken}`)]) {
    const access = createPreviewScopedAccess(input())
    const cdp = fakeCdp()
    const guard = await installPreviewBrowserAccess({ cdp, sessionId: 'session', targetId: 'target', access })
    cdp.emit('Fetch.requestPaused', event)
    await assert.rejects(() => guard.assertClean(), /preview_browser_access_request_failed/)
    assert.equal(cdp.calls.some(call => call.method === 'Fetch.continueRequest'), false)
    assert.equal(cdp.calls.at(-1).method, 'Fetch.failRequest')
    await assert.rejects(() => guard.dispose(), /preview_browser_access_request_failed/)
    access.dispose()
  }
})

test('browser authentication challenges and child targets cannot escape the scoped session', async () => {
  for (const [method, event, expectedMethod] of [
    ['Fetch.authRequired', { requestId: 'auth' }, 'Fetch.continueWithAuth'],
    ['Target.attachedToTarget', { targetInfo: { targetId: 'worker' } }, 'Target.closeTarget'],
  ]) {
    const access = createPreviewScopedAccess(input())
    const cdp = fakeCdp()
    const guard = await installPreviewBrowserAccess({ cdp, sessionId: 'session', targetId: 'target', access })
    cdp.emit(method, event)
    await assert.rejects(() => guard.assertClean(), /preview_browser_access_request_failed/)
    assert.equal(cdp.calls.at(-1).method, expectedMethod)
    await assert.rejects(() => guard.dispose(), /preview_browser_access_request_failed/)
    access.dispose()
  }
})

test('interception setup and continuation failures close the target without leaking errors', async () => {
  const access = createPreviewScopedAccess(input())
  const setup = fakeCdp('Fetch.enable')
  await assert.rejects(() => installPreviewBrowserAccess({ cdp: setup, sessionId: 'session', targetId: 'target', access }),
    error => error.message === 'preview_browser_access_setup_failed')
  assert.equal(setup.calls.at(-1).method, 'Target.closeTarget')
  assert.equal(setup.listeners.size, 0)
  const cdp = fakeCdp('Fetch.continueRequest')
  const guard = await installPreviewBrowserAccess({ cdp, sessionId: 'session', targetId: 'target', access })
  cdp.emit('Fetch.requestPaused', paused(appOrigin))
  await assert.rejects(() => guard.assertClean(), error => error.message === 'preview_browser_access_request_failed')
  assert.equal(cdp.calls.at(-1).method, 'Target.closeTarget')
  await assert.rejects(() => guard.dispose(), /preview_browser_access_request_failed/)
  access.dispose()
})

test('CLI and harness keep protected transport inside isolated cases and before capture', async () => {
  const verifier = await readFile(new URL('./verify_exact_app_preview.mjs', import.meta.url), 'utf8')
  const harness = await readFile(new URL('./verify_app_entry_rendered.mjs', import.meta.url), 'utf8')
  const main = verifier.slice(verifier.indexOf('async function main()'))
  for (const operation of ['parseExactAppPreviewArgs(', 'collectCurrentVerifierBinding()', 'findBrowser()', 'launchBrowser(']) {
    assert.ok(main.indexOf('capturePreviewAccessEnvironment()') < main.indexOf(operation), operation)
  }
  assert.match(verifier, /releaseBefore = await probeExactPairedReleaseIdentity\(\{\s*scopedAccess,/)
  assert.match(verifier, /releaseAfter = await probeExactPairedReleaseIdentity\(\{\s*scopedAccess,/)
  assert.match(verifier, /browserCase\([^\n]+\), scopedAccess\)/)
  assert.match(harness, /scopedAccess && testCase.isolatedBrowserContext !== true/)
  assert.ok(harness.indexOf('accessGuard = await installPreviewBrowserAccess') < harness.indexOf("await cdp.send('Page.navigate'"))
  assert.ok(harness.indexOf('await accessGuard.assertClean()') < harness.indexOf("await cdp.send('Page.captureScreenshot'"))
  assert.match(harness, /if \(accessGuard\) await accessGuard.dispose\(\)/)
})

test('captured inputs cannot reach mocked Git preflight or command-name browser discovery', () => {
  const environment = { SUPERMEGA_PUBLIC_PREVIEW_BYPASS: input().publicToken, SUPERMEGA_APP_PREVIEW_BYPASS: input().appToken }
  const captured = capturePreviewAccessEnvironment(environment)
  const subprocess = (name) => {
    assert.equal(environment.SUPERMEGA_PUBLIC_PREVIEW_BYPASS, undefined, name)
    assert.equal(environment.SUPERMEGA_APP_PREVIEW_BYPASS, undefined, name)
  }
  subprocess('git status')
  subprocess('chromium --version')
  const access = captured.bind({ publicOrigin, appOrigin })
  captured.dispose()
  assert.throws(() => captured.bind({ publicOrigin, appOrigin }), /inputs_disposed/)
  access.dispose()
})

test('closure rejection, timeout or negative acknowledgement cannot remove interception or pass', async () => {
  for (const mode of ['reject', 'timeout', 'negative']) {
    const access = createPreviewScopedAccess(input())
    const cdp = fakeCdp()
    const send = cdp.send.bind(cdp)
    cdp.send = (method, params, sessionId) => method !== 'Target.closeTarget' ? send(method, params, sessionId)
      : mode === 'reject' ? Promise.reject(new Error('synthetic close error'))
        : mode === 'timeout' ? new Promise(() => {}) : Promise.resolve({ success: false })
    const guard = await installPreviewBrowserAccess({ cdp, sessionId: 'session', targetId: 'target', access, commandTimeoutMs: 10 })
    await assert.rejects(() => guard.dispose(), error => error.message === 'preview_browser_access_close_failed')
    assert.equal(cdp.listeners.size, 3)
    access.dispose()
  }
})

test('a denial arriving during confirmed closure prevents a successful case', async () => {
  const access = createPreviewScopedAccess(input())
  const cdp = fakeCdp()
  const send = cdp.send.bind(cdp)
  cdp.send = async (method, params, sessionId) => {
    if (method === 'Target.closeTarget') cdp.emit('Fetch.requestPaused', paused(appOrigin, 'POST'))
    return send(method, params, sessionId)
  }
  const guard = await installPreviewBrowserAccess({ cdp, sessionId: 'session', targetId: 'target', access })
  await guard.assertClean()
  await assert.rejects(() => guard.dispose(), /preview_browser_access_request_failed/)
  assert.equal(cdp.listeners.size, 0)
  access.dispose()
})
