// Contract tests for the Zapier catch-hook connector — a SEND-class integration whose hook
// URL embeds a capability token and whose configured() doubles as an SSRF guard. Covers:
// fail-closed without a valid hook, host pinning (hooks.zapier.com only), exact happy-path
// request shape, hook-token redaction in errors, no-network health, and no-throw degradation.
// `node --test`.
import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'

import { send, integrationZapier } from './integration-zapier.mjs'

const originalFetch = globalThis.fetch
const trackedEnv = ['ZAPIER_HOOK_URL']
const originalEnv = new Map(trackedEnv.map((key) => [key, process.env[key]]))

const HOOK_TOKEN = 'hook-capability-token-xyz'
const HOOK_URL = `https://hooks.zapier.com/hooks/catch/12345/${HOOK_TOKEN}/`

function response(status, body, text) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
    async text() { return text !== undefined ? text : JSON.stringify(body ?? {}) },
  }
}

beforeEach(() => {
  for (const key of trackedEnv) delete process.env[key]
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('send fails closed without a configured hook and on non-object payloads', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }

  assert.equal(integrationZapier.configured(), false)
  assert.equal((await send({ event: 'order.paid' })).reason, 'zapier_not_configured')

  process.env.ZAPIER_HOOK_URL = HOOK_URL
  assert.equal(integrationZapier.configured(), true)
  assert.equal((await send('a string payload')).reason, 'zapier_invalid_payload')
  assert.equal((await send(null)).reason, 'zapier_invalid_payload')
  assert.equal(calls, 0)
})

test('a hostile ZAPIER_HOOK_URL cannot turn send into an SSRF primitive', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }

  for (const hostile of [
    `https://evil.example.com/hooks/catch/12345/${HOOK_TOKEN}/`, // wrong host
    `http://hooks.zapier.com/hooks/catch/12345/${HOOK_TOKEN}/`,  // not https
    'https://hooks.zapier.com/other/path/',                      // not a catch hook
    `https://hooks.zapier.com.evil.example.com/hooks/catch/1/x/`, // host suffix trick
    'not a url at all',
  ]) {
    process.env.ZAPIER_HOOK_URL = hostile
    assert.equal(integrationZapier.configured(), false, `must reject: ${hostile}`)
    assert.equal((await send({ event: 'x' })).reason, 'zapier_not_configured')
  }
  assert.equal(calls, 0)
})

test('the happy-path request posts the JSON event to the exact configured catch hook', async () => {
  process.env.ZAPIER_HOOK_URL = HOOK_URL
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, { status: 'success', id: 'req-1' })
  }

  const payload = { event: 'lead.captured', lead_id: 'L-1', total: 9000 }
  const result = await send(payload)
  assert.deepEqual(result, { ok: true, status: 200 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, HOOK_URL)
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['content-type'], 'application/json')
  assert.equal(calls[0].options.headers['user-agent'], 'supermega-kernel/1.0')
  assert.equal(calls[0].options.body, JSON.stringify(payload))
})

test('provider rejections map to stable reasons that never leak the hook token', async () => {
  process.env.ZAPIER_HOOK_URL = HOOK_URL

  globalThis.fetch = async () => response(410, null, 'hook expired hostile detail')
  const gone = await send({ event: 'x' })
  assert.equal(gone.ok, false)
  assert.match(gone.reason, /^zapier_hook_410: /)
  assert.doesNotMatch(JSON.stringify(gone), new RegExp(HOOK_TOKEN))

  globalThis.fetch = async () => response(200, { status: 'error' })
  const rejected = await send({ event: 'x' })
  assert.equal(rejected.ok, false)
  assert.equal(rejected.reason, 'zapier_status_error')
  assert.doesNotMatch(JSON.stringify(rejected), new RegExp(HOOK_TOKEN))
})

test('health never touches the network — a probe POST would fire the customer Zap', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }

  assert.equal((await integrationZapier.health()).ok, false)
  process.env.ZAPIER_HOOK_URL = HOOK_URL
  assert.equal((await integrationZapier.health()).ok, true)
  assert.equal(calls, 0)
})

test('network failures degrade to ok:false without throwing and without the token', async () => {
  process.env.ZAPIER_HOOK_URL = HOOK_URL
  globalThis.fetch = async () => { throw new Error('connection reset') }
  const result = await send({ event: 'x' })
  assert.equal(result.ok, false)
  assert.equal(typeof result.reason, 'string')
  assert.doesNotMatch(JSON.stringify(result), new RegExp(HOOK_TOKEN))
})
