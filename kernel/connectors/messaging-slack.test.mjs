// Contract tests for the Slack connector — a SEND-class integration with two transports
// (incoming webhook and bot chat.postMessage). Covers: fail-closed without env, empty-message
// rejection before network, exact request shape per transport, webhook-URL and bot-token
// redaction in errors, and no-throw degradation. `node --test`.
import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'

import { send } from './messaging-slack.mjs'

const originalFetch = globalThis.fetch
const trackedEnv = ['SLACK_WEBHOOK_URL', 'SLACK_BOT_TOKEN']
const originalEnv = new Map(trackedEnv.map((key) => [key, process.env[key]]))

const WEBHOOK_SECRET_PART = 'T0AAA/B0BBB/webhooksecretpart123'
const WEBHOOK_URL = `https://hooks.slack.com/services/${WEBHOOK_SECRET_PART}`
const BOT_TOKEN = 'xoxb-secret-bot-token-456'

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

test('send fails closed without a webhook and rejects empty messages before network', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }

  assert.equal((await send('hello')).reason, 'slack_not_configured')
  process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
  assert.equal((await send('')).reason, 'slack_empty_message')
  assert.equal((await send('   ')).reason, 'slack_empty_message')
  assert.equal(calls, 0)
})

test('webhook mode posts the exact message shape with no authorization header', async () => {
  process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, null, 'ok')
  }

  const result = await send('Deploy finished', { username: 'MegaBot', icon_emoji: ':rocket:' })
  assert.deepEqual(result, { ok: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, WEBHOOK_URL)
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['content-type'], 'application/json')
  assert.equal(calls[0].options.headers['user-agent'], 'supermega-kernel/1.0')
  assert.equal('authorization' in calls[0].options.headers, false)
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    text: 'Deploy finished',
    username: 'MegaBot',
    icon_emoji: ':rocket:',
  })
})

test('bot mode targets chat.postMessage with the channel and the bearer token', async () => {
  process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
  process.env.SLACK_BOT_TOKEN = BOT_TOKEN
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, { ok: true, ts: '1234.5678' })
  }

  const result = await send('Budget alert', { channel: '#alerts' })
  assert.equal(result.ok, true)
  assert.equal(result.ts, '1234.5678')
  assert.equal(calls[0].url, 'https://slack.com/api/chat.postMessage')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers.authorization, `Bearer ${BOT_TOKEN}`)
  assert.deepEqual(JSON.parse(calls[0].options.body), { channel: '#alerts', text: 'Budget alert' })
  // The token travels only in the header — never in the URL or body.
  assert.doesNotMatch(calls[0].url, /xoxb/)
  assert.doesNotMatch(calls[0].options.body, /xoxb/)
})

test('a channel without a bot token falls back to the webhook and sends no token anywhere', async () => {
  process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, null, 'ok')
  }

  const result = await send('hello', { channel: '#alerts' })
  assert.deepEqual(result, { ok: true })
  assert.equal(calls[0].url, WEBHOOK_URL)
  assert.doesNotMatch(JSON.stringify({ headers: calls[0].options.headers, body: calls[0].options.body }), /xoxb|authorization/i)
})

test('provider failures return stable reasons that never leak the webhook URL or token', async () => {
  process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL

  globalThis.fetch = async () => response(404, null, 'no_service')
  const notFound = await send('hello')
  assert.equal(notFound.ok, false)
  assert.match(notFound.reason, /^slack_webhook_404: /)
  assert.doesNotMatch(JSON.stringify(notFound), /webhooksecretpart123/)

  // Slack signals a bad body with HTTP 200 + literal 'invalid_payload' — must still fail.
  globalThis.fetch = async () => response(200, null, 'invalid_payload')
  assert.equal((await send('hello')).ok, false)

  process.env.SLACK_BOT_TOKEN = BOT_TOKEN
  globalThis.fetch = async () => response(200, { ok: false, error: 'invalid_auth' })
  const botFail = await send('hello', { channel: '#alerts' })
  assert.equal(botFail.ok, false)
  assert.match(botFail.reason, /^slack_bot_200: invalid_auth/)
  assert.doesNotMatch(JSON.stringify(botFail), /xoxb/)
})

test('network failures degrade to ok:false without throwing', async () => {
  process.env.SLACK_WEBHOOK_URL = WEBHOOK_URL
  globalThis.fetch = async () => { throw new Error('connect ETIMEDOUT') }
  const result = await send('hello')
  assert.equal(result.ok, false)
  assert.equal(typeof result.reason, 'string')
  assert.doesNotMatch(JSON.stringify(result), /webhooksecretpart123|xoxb/)
})
