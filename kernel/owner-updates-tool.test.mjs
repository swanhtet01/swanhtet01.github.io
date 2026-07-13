import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'

import { TOOLS } from './tools.mjs'

const originalFetch = globalThis.fetch
const ENV_NAMES = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ALERT_CHAT_ID',
  'TELEGRAM_CHAT_ID',
  'WORKCELL_OWNER_EVIDENCE_ENABLED',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
]
const originalEnv = new Map(ENV_NAMES.map((name) => [name, process.env[name]]))

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body } }
}

function configure() {
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token'
  process.env.TELEGRAM_ALERT_CHAT_ID = '123456'
  process.env.WORKCELL_OWNER_EVIDENCE_ENABLED = 'true'
  process.env.SUPABASE_URL = 'https://client-project.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
}

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

test('owner update tool merges private Telegram and reviewed evidence in time order', async () => {
  configure()
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://api.telegram.org/')) {
      return response(200, { ok: true, result: [{
        update_id: 10,
        message: {
          message_id: 20,
          date: Math.floor(Date.parse('2026-07-13T03:00:00.000Z') / 1000),
          chat: { id: 123456 },
          text: 'Telegram sales update',
        },
      }] })
    }
    return response(200, [{
      id: 'owner-evidence-1', source: 'viber', source_ref: 'export-1',
      occurred_at: '2026-07-13T02:00:00.000Z', text: 'Reviewed delivery update',
      reviewed_at: '2026-07-13T03:30:00.000Z', fingerprint: 'a'.repeat(64),
    }])
  }
  assert.equal(TOOLS.owner_updates_read.available(), true)
  const result = await TOOLS.owner_updates_read.run({
    start_date: '2026-07-12T04:00:00.000Z',
    end_date: '2026-07-13T04:00:00.000Z',
    limit: 100,
  })
  assert.deepEqual(result.updates.map((item) => item.source), ['viber', 'telegram'])
  assert.deepEqual(result.sourceStatus, [
    { source: 'telegram', ok: true, items: 1, reason: null },
    { source: 'reviewed-evidence', ok: true, items: 1, reason: null },
  ])
})

test('one healthy evidence source can continue while the other fails with stable metadata', async () => {
  configure()
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://api.telegram.org/')) return response(500, { description: 'hostile provider detail' })
    return response(200, [{
      id: 'owner-evidence-2', source: 'line', source_ref: null,
      occurred_at: '2026-07-13T02:00:00.000Z', text: 'Reviewed factory update',
      reviewed_at: '2026-07-13T03:30:00.000Z', fingerprint: 'b'.repeat(64),
    }])
  }
  const result = await TOOLS.owner_updates_read.run({
    start_date: '2026-07-12T04:00:00.000Z',
    end_date: '2026-07-13T04:00:00.000Z',
  })
  assert.equal(result.updates.length, 1)
  assert.equal(result.updates[0].source, 'line')
  assert.equal(result.sourceStatus[0].ok, false)
  assert.equal(result.sourceStatus[0].reason, 'telegram_updates_read_failed')
  assert.doesNotMatch(JSON.stringify(result.sourceStatus), /hostile provider detail/)
})
