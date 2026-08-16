// Contract tests for the Twilio SMS connector — a SEND+SPEND-class integration (every
// message costs money and reaches a real phone). Covers: fail-closed on any missing
// credential and missing recipient, exact form-encoded request shape, raw-auth-token
// redaction (token travels only base64-inside Basic auth), stable provider errors, and
// no-throw degradation. `node --test`.
import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'

import { send } from './messaging-sms.mjs'

const originalFetch = globalThis.fetch
const trackedEnv = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM']
const originalEnv = new Map(trackedEnv.map((key) => [key, process.env[key]]))

const SID = 'ACtestsid1234567890'
const TOKEN = 'twilio-auth-secret-token'
const FROM = '+12015550000'

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  }
}

function configureAll() {
  process.env.TWILIO_ACCOUNT_SID = SID
  process.env.TWILIO_AUTH_TOKEN = TOKEN
  process.env.TWILIO_FROM = FROM
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

test('send fails closed when any credential or the recipient is missing', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }

  // Each credential individually missing must refuse to send.
  for (const missing of trackedEnv) {
    configureAll()
    delete process.env[missing]
    const result = await send('+959111222333', 'hello')
    assert.deepEqual(result, { ok: false, reason: 'sms_not_configured' }, `must fail without ${missing}`)
  }
  configureAll()
  assert.deepEqual(await send('', 'hello'), { ok: false, reason: 'sms_missing_to' })
  assert.equal(calls, 0)
})

test('the happy-path request is a form-encoded POST to the account Messages endpoint', async () => {
  configureAll()
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(201, { sid: 'SM-message-1', status: 'queued' })
  }

  const result = await send('+959111222333', 'X'.repeat(2000))
  assert.equal(result.ok, true)
  assert.equal(result.sid, 'SM-message-1')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`)
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['content-type'], 'application/x-www-form-urlencoded')
  assert.equal(
    calls[0].options.headers.Authorization,
    'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'),
  )
  const body = calls[0].options.body
  assert.equal(body.get('To'), '+959111222333')
  assert.equal(body.get('From'), FROM)
  assert.equal(body.get('Body').length, 1600) // bounded at Twilio's segment cap
  // The raw auth token appears nowhere in the URL or body — only base64-inside Basic auth.
  assert.doesNotMatch(calls[0].url, new RegExp(TOKEN))
  assert.doesNotMatch(String(body), new RegExp(TOKEN))
})

test('provider errors return a stable prefixed reason that never leaks the auth token', async () => {
  configureAll()
  globalThis.fetch = async () => response(401, { code: 20003, message: 'hostile authenticate detail' })

  const result = await send('+959111222333', 'hello')
  assert.equal(result.ok, false)
  assert.match(result.reason, /^twilio_401/)
  assert.ok(result.reason.length <= 200)
  const serialized = JSON.stringify(result)
  assert.doesNotMatch(serialized, new RegExp(TOKEN))
  assert.doesNotMatch(serialized, new RegExp(Buffer.from(`${SID}:${TOKEN}`).toString('base64')))
})

test('a provider body that fails to parse still yields a stable error envelope', async () => {
  configureAll()
  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    async json() { throw new Error('not json') },
  })
  const result = await send('+959111222333', 'hello')
  assert.equal(result.ok, false)
  assert.match(result.reason, /^twilio_502/)
})

test('network failures degrade to ok:false without throwing and without the token', async () => {
  configureAll()
  globalThis.fetch = async () => { throw new Error('socket hang up') }
  const result = await send('+959111222333', 'hello')
  assert.equal(result.ok, false)
  assert.equal(typeof result.reason, 'string')
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN))
})
