// Contract tests for the generic outbound webhook connector — the widest-blast-radius
// integration (it can POST to ANY endpoint). Covers: pre-network URL/payload validation,
// exact signed request shape, HMAC-secret redaction (the secret feeds the signature and is
// never itself transmitted), stable sanitized provider errors, and no-throw degradation.
// `node --test`.
import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { send, integrationWebhook } from './integration-webhook.mjs'

// Public IP literals (Cloudflare's 1.1.1.1 / 1.0.0.1), same convention as infra-http.test.mjs —
// send() now runs the shared SSRF validator (real DNS lookup for hostnames), so test targets must
// resolve without a live DNS dependency; a fictitious "*.example.com" host would only ENOTFOUND.
const PARTNER_URL = 'https://1.1.1.1'
const FALLBACK_URL = 'https://1.0.0.1'

const originalFetch = globalThis.fetch
const trackedEnv = ['WEBHOOK_HMAC_SECRET', 'WEBHOOK_DEFAULT_URL']
const originalEnv = new Map(trackedEnv.map((key) => [key, process.env[key]]))

const SECRET = 'hmac-signing-secret-abc123'

function response(status, text) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return text },
    async json() { return JSON.parse(text) },
  }
}

const hmac = (secret, body) => crypto.createHmac('sha256', secret).update(body).digest('hex')

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

test('send validates the target URL and payload before any network access', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }

  assert.equal((await send(undefined, { a: 1 })).reason, 'webhook_no_url')       // no url, no default
  assert.equal((await send('not a url', { a: 1 })).reason, 'webhook_bad_url')
  assert.equal((await send('ftp://internal-host/x', { a: 1 })).reason, 'webhook_bad_scheme')
  assert.equal((await send('file:///etc/passwd', { a: 1 })).reason, 'webhook_bad_scheme')
  const circular = {}
  circular.self = circular
  assert.equal((await send(`${PARTNER_URL}/hook`, circular)).reason, 'webhook_unserializable_payload')
  assert.equal(calls, 0)
})

test('send blocks loopback/private/link-local/CGNAT/cloud-metadata targets before any network access — same SSRF policy as infra-http', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }

  const blocked = [
    'https://127.0.0.1/hook', 'https://10.0.0.5/hook', 'https://192.168.1.1/hook',
    'https://169.254.169.254/latest/meta-data/', 'https://100.64.0.1/hook', 'https://[::1]/hook',
  ]
  for (const url of blocked) {
    const result = await send(url, { a: 1 })
    assert.equal(result.ok, false)
    assert.match(result.reason, /^webhook_blocked_url: /, `expected ${url} to be blocked`)
  }
  assert.equal(calls, 0)
})

test('the happy-path request is a signed JSON POST with the kernel user-agent', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, '{"received":true}')
  }

  const payload = { event: 'order.paid', order_id: 'ORD-1', total: 5000 }
  const result = await send(`${PARTNER_URL}/hooks/orders`, payload, { secret: SECRET })
  assert.equal(result.ok, true)
  assert.equal(result.status, 200)
  assert.equal(result.body, '{"received":true}')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `${PARTNER_URL}/hooks/orders`)
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['content-type'], 'application/json')
  assert.equal(calls[0].options.headers['user-agent'], 'supermega-kernel/1.0')
  assert.equal(calls[0].options.body, JSON.stringify(payload))
  // Signature is derived FROM the secret; the secret itself never travels.
  assert.equal(calls[0].options.headers['X-Supermega-Signature'], 'sha256=' + hmac(SECRET, calls[0].options.body))
  assert.doesNotMatch(JSON.stringify({ url: calls[0].url, headers: calls[0].options.headers, body: calls[0].options.body }), new RegExp(SECRET))
})

test('signing falls back to WEBHOOK_HMAC_SECRET, honors a custom header, and is absent without a secret', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, 'ok')
  }

  process.env.WEBHOOK_HMAC_SECRET = SECRET
  await send(`${PARTNER_URL}/hook`, { a: 1 }, { signatureHeader: 'X-Partner-Sig' })
  assert.equal(calls[0].options.headers['X-Partner-Sig'], 'sha256=' + hmac(SECRET, JSON.stringify({ a: 1 })))
  assert.equal('X-Supermega-Signature' in calls[0].options.headers, false)
  assert.doesNotMatch(JSON.stringify(calls[0].options.headers), new RegExp(SECRET))

  delete process.env.WEBHOOK_HMAC_SECRET
  await send(`${PARTNER_URL}/hook`, { a: 1 })
  assert.equal('X-Supermega-Signature' in calls[1].options.headers, false)
})

test('WEBHOOK_DEFAULT_URL is the fallback target and extra headers are merged', async () => {
  process.env.WEBHOOK_DEFAULT_URL = `${FALLBACK_URL}/hook`
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, 'ok')
  }

  const result = await send(undefined, { event: 'ping' }, { extraHeaders: { 'x-tenant': 'shop-1' } })
  assert.equal(result.ok, true)
  assert.equal(calls[0].url, `${FALLBACK_URL}/hook`)
  assert.equal(calls[0].options.headers['x-tenant'], 'shop-1')
  assert.equal(calls[0].options.headers['content-type'], 'application/json')
})

test('provider errors return a stable bounded reason without the signing secret', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(503, 'upstream hostile detail '.repeat(50))
  }

  const result = await send(`${PARTNER_URL}/hook`, { a: 1 }, { secret: SECRET })
  assert.equal(result.ok, false)
  assert.match(result.reason, /^webhook_503: /)
  assert.ok(result.reason.length <= 220)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(SECRET))
})

test('network failures degrade to ok:false without throwing out of the connector', async () => {
  globalThis.fetch = async () => { throw new Error('connect ETIMEDOUT') }
  const result = await send(`${PARTNER_URL}/hook`, { a: 1 }, { secret: SECRET })
  assert.equal(result.ok, false)
  assert.equal(typeof result.reason, 'string')
  assert.doesNotMatch(JSON.stringify(result), new RegExp(SECRET))

  // health is config-only and must not hit the network either.
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }
  const health = await integrationWebhook.health()
  assert.equal(health.ok, true)
  assert.equal(calls, 0)
})
