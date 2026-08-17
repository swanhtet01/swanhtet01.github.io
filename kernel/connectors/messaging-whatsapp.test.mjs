// Contract tests for the WhatsApp Business connector — a SEND-class integration (messages
// reach real customer phones via the Meta Graph API). Covers: fail-closed on each missing
// credential/recipient/text, exact happy-path request shape, default-recipient fallback,
// access-token redaction in errors, and no-throw degradation. `node --test`.
import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'

import { send } from './messaging-whatsapp.mjs'

const originalFetch = globalThis.fetch
const trackedEnv = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_DEFAULT_RECIPIENT']
const originalEnv = new Map(trackedEnv.map((key) => [key, process.env[key]]))

const TOKEN = 'EAAG-whatsapp-secret-access-token'
const PHONE_ID = '109999999999999'

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
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

test('send fails closed without credentials, a recipient, or text — before any network', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }

  assert.match((await send('hi', { to: '959111222333' })).reason, /^whatsapp_not_configured: missing WHATSAPP_ACCESS_TOKEN/)
  process.env.WHATSAPP_ACCESS_TOKEN = TOKEN
  assert.match((await send('hi', { to: '959111222333' })).reason, /^whatsapp_not_configured: missing WHATSAPP_PHONE_NUMBER_ID/)
  process.env.WHATSAPP_PHONE_NUMBER_ID = PHONE_ID
  assert.match((await send('hi')).reason, /^whatsapp_missing_recipient/)
  assert.equal((await send('   ', { to: '959111222333' })).reason, 'whatsapp_empty_text')
  assert.equal(calls, 0)
})

test('the happy path posts an individual text message to the phone-number endpoint', async () => {
  process.env.WHATSAPP_ACCESS_TOKEN = TOKEN
  process.env.WHATSAPP_PHONE_NUMBER_ID = PHONE_ID
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, { messages: [{ id: 'wamid.ABC123' }] })
  }

  const result = await send('Your order is ready', { to: '959111222333' })
  assert.equal(result.ok, true)
  assert.equal(result.messageId, 'wamid.ABC123')
  assert.equal(result.to, '959111222333')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`)
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['content-type'], 'application/json')
  assert.equal(calls[0].options.headers.authorization, `Bearer ${TOKEN}`)
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '959111222333',
    type: 'text',
    text: { body: 'Your order is ready' },
  })
  // Token travels only in the authorization header — never in the URL or body.
  assert.doesNotMatch(calls[0].url, new RegExp(TOKEN))
  assert.doesNotMatch(calls[0].options.body, new RegExp(TOKEN))
})

test('long messages are bounded at 4096 chars and the default recipient env is honored', async () => {
  process.env.WHATSAPP_ACCESS_TOKEN = TOKEN
  process.env.WHATSAPP_PHONE_NUMBER_ID = PHONE_ID
  process.env.WHATSAPP_DEFAULT_RECIPIENT = '959000000001'
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, { messages: [{ id: 'wamid.DEF456' }] })
  }

  const result = await send('X'.repeat(5000))
  assert.equal(result.ok, true)
  assert.equal(result.to, '959000000001')
  const body = JSON.parse(calls[0].options.body)
  assert.equal(body.to, '959000000001')
  assert.equal(body.text.body.length, 4096)
})

test('provider errors return stable prefixed reasons that never leak the access token', async () => {
  process.env.WHATSAPP_ACCESS_TOKEN = TOKEN
  process.env.WHATSAPP_PHONE_NUMBER_ID = PHONE_ID

  globalThis.fetch = async () => response(400, { error: { message: 'hostile provider detail', code: 100 } })
  const badRequest = await send('hi', { to: '959111222333' })
  assert.equal(badRequest.ok, false)
  assert.match(badRequest.reason, /^whatsapp_400: /)
  assert.doesNotMatch(JSON.stringify(badRequest), new RegExp(TOKEN))

  // Graph can answer HTTP 200 with an error object — must still fail.
  globalThis.fetch = async () => response(200, { error: { message: 'token expired detail' } })
  const softFail = await send('hi', { to: '959111222333' })
  assert.equal(softFail.ok, false)
  assert.match(softFail.reason, /^whatsapp_200: /)
  assert.doesNotMatch(JSON.stringify(softFail), new RegExp(TOKEN))
})

test('network failures degrade to ok:false without throwing and without the token', async () => {
  process.env.WHATSAPP_ACCESS_TOKEN = TOKEN
  process.env.WHATSAPP_PHONE_NUMBER_ID = PHONE_ID
  globalThis.fetch = async () => { throw new Error('connect ETIMEDOUT') }
  const result = await send('hi', { to: '959111222333' })
  assert.equal(result.ok, false)
  assert.equal(typeof result.reason, 'string')
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN))
})
