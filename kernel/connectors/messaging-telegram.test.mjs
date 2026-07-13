import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'

import { ownerChatConfigured, readOwnerUpdates } from './messaging-telegram.mjs'

const originalFetch = globalThis.fetch
const trackedEnv = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALERT_CHAT_ID', 'TELEGRAM_CHAT_ID']
const originalEnv = new Map(trackedEnv.map((key) => [key, process.env[key]]))

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('owner update read is bounded, non-acknowledging, owner-chat-only, and reduced', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'bot-secret-token'
  process.env.TELEGRAM_ALERT_CHAT_ID = '123456'
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, {
      ok: true,
      result: [
        { update_id: 1, message: { message_id: 10, date: 1_783_819_200, chat: { id: 999999 }, text: 'other chat' } },
        { update_id: 2, message: { message_id: 11, date: 1_783_819_201, chat: { id: 123456 }, from: { username: 'private-owner' }, text: 'Sales 450000 MMK, delivery delayed' } },
        { update_id: 3, edited_message: { message_id: 12, date: 1_783_819_202, chat: { id: 123456 }, caption: 'Supplier issue at dock' } },
        { update_id: 4, message: { message_id: 13, date: 1_783_700_000, chat: { id: 123456 }, text: 'outside window' } },
      ],
    })
  }

  const result = await readOwnerUpdates({
    startDate: '2026-07-12T00:00:00.000Z',
    endDate: '2026-07-14T00:00:00.000Z',
    limit: 500,
    chatId: '999999',
  })
  assert.equal(result.ok, true)
  assert.equal(result.updates.length, 2)
  assert.deepEqual(result.updates.map((row) => row.updateId), [2, 3])
  assert.deepEqual(Object.keys(result.updates[0]), ['updateId', 'messageId', 'at', 'text'])
  assert.doesNotMatch(JSON.stringify(result), /private-owner|other chat|outside window|123456/)
  assert.equal(calls.length, 1)
  const body = JSON.parse(calls[0].options.body)
  assert.equal(body.limit, 100)
  assert.equal(body.timeout, 0)
  assert.equal('offset' in body, false)
  assert.deepEqual(body.allowed_updates, ['message', 'edited_message', 'channel_post'])
})

test('owner update read validates owner identity and time window before network access', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'bot-secret-token'
  process.env.TELEGRAM_ALERT_CHAT_ID = 'not-a-chat'
  let calls = 0
  globalThis.fetch = async () => { calls += 1; return response(500, {}) }
  assert.equal(ownerChatConfigured(), false)
  assert.equal((await readOwnerUpdates({ startDate: '2026-07-12T00:00:00Z', endDate: '2026-07-13T00:00:00Z' })).reason, 'telegram_invalid_owner_chat_id')
  process.env.TELEGRAM_ALERT_CHAT_ID = '123456'
  assert.equal(ownerChatConfigured(), true)
  assert.equal((await readOwnerUpdates(null)).reason, 'telegram_invalid_update_window')
  assert.equal((await readOwnerUpdates({ startDate: 'bad', endDate: '2026-07-13T00:00:00Z' })).reason, 'telegram_invalid_update_window')
  assert.equal((await readOwnerUpdates({ startDate: '2026-06-01T00:00:00Z', endDate: '2026-07-13T00:00:00Z' })).reason, 'telegram_invalid_update_window')
  assert.equal(calls, 0)
})

test('owner update provider failures return a stable error without provider text', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'bot-secret-token'
  process.env.TELEGRAM_ALERT_CHAT_ID = '123456'
  globalThis.fetch = async () => response(401, { ok: false, description: 'hostile provider detail' })
  const result = await readOwnerUpdates({
    startDate: '2026-07-12T00:00:00Z',
    endDate: '2026-07-13T00:00:00Z',
  })
  assert.deepEqual(result, { ok: false, reason: 'telegram_updates_read_failed' })
})
