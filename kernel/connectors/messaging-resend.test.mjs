// Contract tests for the Resend email connector — a SEND-class integration (real outbound
// email). Covers: fail-closed without env, pre-network input validation, exact happy-path
// request shape, API-key redaction in every error path, and no-network health. `node --test`.
import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'

import { messagingResend } from './messaging-resend.mjs'

const originalFetch = globalThis.fetch
const trackedEnv = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_FROM_NAME']
const originalEnv = new Map(trackedEnv.map((key) => [key, process.env[key]]))

const SECRET = 're_test_secret_key_1234567890'

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

test('send refuses to act without RESEND_API_KEY and never touches the network', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }

  assert.equal(messagingResend.configured(), false)
  const result = await messagingResend.send({ to: 'buyer@example.com', subject: 'Hi', text: 'Hello' })
  assert.deepEqual(result, { ok: false, reason: 'resend_not_configured' })
  assert.equal(calls, 0)
})

test('send validates recipient, subject, and body before network access', async () => {
  process.env.RESEND_API_KEY = SECRET
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }

  for (const input of [
    { subject: 'Hi', text: 'Hello' },                 // no to
    { to: 'buyer@example.com', text: 'Hello' },       // no subject
    { to: 'buyer@example.com', subject: 'Hi' },       // no html and no text
    undefined,                                        // no input at all
  ]) {
    const result = await messagingResend.send(input)
    assert.equal(result.ok, false)
    assert.match(result.reason, /required/)
  }
  assert.equal(calls, 0)
})

test('the happy-path request is an exact authorized JSON POST to the emails endpoint', async () => {
  process.env.RESEND_API_KEY = SECRET
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, { id: 'email-id-1' })
  }

  const result = await messagingResend.send({
    to: 'buyer@example.com',
    subject: 'S'.repeat(600),
    html: '<p>Deposit received</p>',
    replyTo: 'reply@example.com',
    cc: 'cc@example.com',
    bcc: ['bcc@example.com'],
  })
  assert.equal(result.ok, true)
  assert.equal(result.id, 'email-id-1')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.resend.com/emails')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['content-type'], 'application/json')
  assert.equal(calls[0].options.headers.authorization, `Bearer ${SECRET}`)
  const body = JSON.parse(calls[0].options.body)
  assert.deepEqual(body, {
    from: 'SuperMega <ops@supermega.dev>',
    to: ['buyer@example.com'],
    subject: 'S'.repeat(500), // bounded at 500 chars
    html: '<p>Deposit received</p>',
    reply_to: 'reply@example.com',
    cc: ['cc@example.com'],
    bcc: ['bcc@example.com'],
  })
  // The key travels ONLY in the authorization header — never in the URL or body.
  assert.doesNotMatch(calls[0].url, new RegExp(SECRET))
  assert.doesNotMatch(calls[0].options.body, new RegExp(SECRET))
})

test('provider errors return a stable prefixed reason that never leaks the API key', async () => {
  process.env.RESEND_API_KEY = SECRET
  globalThis.fetch = async () => response(401, { name: 'validation_error', message: 'hostile provider detail' })

  const result = await messagingResend.send({ to: 'buyer@example.com', subject: 'Hi', text: 'Hello' })
  assert.equal(result.ok, false)
  assert.match(result.reason, /^resend_401/)
  assert.ok(result.reason.length <= 200)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(SECRET))
})

test('network failures degrade to ok:false without throwing and without the key', async () => {
  process.env.RESEND_API_KEY = SECRET
  globalThis.fetch = async () => { throw new Error('socket hang up') }

  const result = await messagingResend.send({ to: 'buyer@example.com', subject: 'Hi', text: 'Hello' })
  assert.equal(result.ok, false)
  assert.equal(typeof result.reason, 'string')
  assert.doesNotMatch(JSON.stringify(result), new RegExp(SECRET))
})

test('health is a no-network config check that fails closed on missing or malformed keys', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }

  assert.equal((await messagingResend.health()).ok, false)
  process.env.RESEND_API_KEY = 'not-a-resend-key'
  assert.equal((await messagingResend.health()).ok, false)
  process.env.RESEND_API_KEY = SECRET
  assert.equal((await messagingResend.health()).ok, true)
  assert.equal(calls, 0)
})
