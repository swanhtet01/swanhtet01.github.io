import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ENV_KEYS = [
  'SUPERMEGA_OPS_KEY',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
  'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL',
  'SUPERMEGA_DATABASE_URL', 'DATABASE_URL',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALERT_CHAT_ID', 'TELEGRAM_CHAT_ID',
]

const captureEnvironment = () => Object.fromEntries(ENV_KEYS.map((name) => [name, {
  present: Object.hasOwn(process.env, name),
  value: process.env[name],
}]))

function restoreEnvironment(saved) {
  for (const name of ENV_KEYS) {
    if (saved[name].present) process.env[name] = saved[name].value
    else delete process.env[name]
  }
}

const CONFORMING_KEY = 'console-error-recording-key-0123456789'

test('lead conversion records the won stage before it logs a clean win', async () => {
  const saved = captureEnvironment()
  try {
    for (const name of ENV_KEYS) delete process.env[name]
    process.env.SUPERMEGA_OPS_KEY = CONFORMING_KEY
    const { handle } = await import(`./console/api.mjs?convert-integrity=${Date.now()}-${Math.random()}`)
    const store = (await import('./store.mjs')).default
    assert.equal(store.mode, 'memory', 'this test must not touch a real database')

    const leadId = `lead-convert-integrity-${Date.now()}`
    const headers = { 'x-ops-key': CONFORMING_KEY }
    const created = await handle({
      method: 'POST',
      path: '/api/leads',
      headers,
      body: {
        id: leadId,
        source: 'test',
        name: 'Owner',
        company: 'Pilot Shop',
        contact: 'owner@example.invalid',
        package: 'build',
        stage: 'qualified',
      },
    })
    assert.equal(created.status, 200)

    const converted = await handle({
      method: 'POST',
      path: `/api/leads/${leadId}`,
      query: { action: 'convert' },
      headers,
      body: {},
    })
    assert.equal(converted.status, 200)
    assert.equal(converted.json.lead.stage, 'won')

    const storedLead = await store.getLead(leadId)
    assert.equal(storedLead.stage, 'won')
    const activity = await store.listActivity(100)
    const wonEntry = activity.find((entry) => entry.kind === 'won' && entry.ref === converted.json.project.id)
    assert.ok(wonEntry, 'a clean win activity entry should exist only after the lead stage is durable')
  } finally {
    restoreEnvironment(saved)
  }
})

test('console error handling contract records safe metadata and never request bodies', async () => {
  const source = await readFile(resolve(import.meta.dirname, 'console/api.mjs'), 'utf8')
  assert.match(source, /import \{ captureError \} from '\.\.\/alert\.mjs'/)
  assert.match(source, /const recordConsoleError = \(context, detail, meta = \{\}\) => captureError/)
  assert.match(source, /store\.updateLead\(seg\[1\], \{ stage: 'won' \}\)\.catch\(async \(error\) =>/)
  assert.match(source, /lead_won_stage_update_failed/)
  assert.match(source, /await recordConsoleError\('console\.api_unhandled_error', err, \{ method, path: safePath\(path\) \}\)/)
  assert.doesNotMatch(source, /console\.api_unhandled_error[\s\S]{0,160}body/)
  assert.match(source, /console\.activity_log_failed/)
  assert.match(source, /console\.deal_graduation_failed/)
  assert.match(source, /console\.project_shipped_graduation_failed/)
})
