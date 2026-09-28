import test from 'node:test'
import assert from 'node:assert/strict'
import { captureError } from './alert.mjs'

test('error alerts distinguish HTTP acceptance from rejection and transport failure', async (t) => {
  t.mock.method(console, 'error', () => {})
  const env = { TELEGRAM_BOT_TOKEN: 'synthetic-token', TELEGRAM_ALERT_CHAT_ID: 'synthetic-chat' }
  for (const status of [200, 400, 401, 429, 500]) {
    let calls = 0
    const accepted = await captureError('synthetic', 'test_failure', {}, {
      env,
      fetch: async (_url, options) => {
        calls += 1
        assert.equal(options.method, 'POST')
        assert.ok(options.signal instanceof AbortSignal)
        return { ok: status === 200, status }
      },
    })
    assert.equal(accepted, status === 200)
    assert.equal(calls, 1)
  }
  assert.equal(await captureError('synthetic', 'test_failure', {}, {
    env, fetch: async () => { throw new Error('synthetic timeout') },
  }), false)
})

test('unconfigured error alerts log locally without attempting a request', async (t) => {
  const logger = t.mock.method(console, 'error', () => {})
  let calls = 0
  const accepted = await captureError('synthetic', 'test_failure', {}, {
    env: {}, fetch: async () => { calls += 1; return { ok: true } },
  })
  assert.equal(accepted, false)
  assert.equal(calls, 0)
  assert.equal(logger.mock.callCount(), 1)
})
