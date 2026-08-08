import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ENV_KEYS = [
  'SUPERMEGA_OPS_KEY', 'SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS',
  'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENROUTER_API_KEY', 'SUPERMEGA_OLLAMA_ENABLED', 'SUPERMEGA_OLLAMA_MODEL',
  'VERCEL',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
  'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL',
  'SUPERMEGA_DATABASE_URL', 'DATABASE_URL',
]

function captureEnvironment() {
  return Object.fromEntries(ENV_KEYS.map((name) => [name, {
    present: Object.hasOwn(process.env, name),
    value: process.env[name],
  }]))
}

function restoreEnvironment(saved) {
  for (const name of ENV_KEYS) {
    if (saved[name].present) process.env[name] = saved[name].value
    else delete process.env[name]
  }
}

test('protected state exposes only truthful aggregate daily AI-budget metadata', async () => {
  const saved = captureEnvironment()
  const originalFetch = globalThis.fetch
  try {
    for (const name of ENV_KEYS) delete process.env[name]
    process.env.SUPERMEGA_OPS_KEY = 'owner-budget-key'
    process.env.SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS = '1000'
    process.env.OPENROUTER_API_KEY = 'openrouter-offline-test-key'

    const { handle } = await import(`./console/api.mjs?ai-budget-state=${Date.now()}`)
    const { currentDailyBudgetWindow } = await import('./gateway.mjs')
    const store = (await import('./store.mjs')).default
    assert.equal(store.mode, 'memory', 'operator budget tests must not touch a real database')

    const window = currentDailyBudgetWindow()
    const reserve = (id, reservedUnits) => store.reserveAiBudget({
      reservationId: id,
      window,
      reservedUnits,
      capUnits: 1000,
      tenantId: 'tenant-private-marker',
      tier: 'deep-private-marker',
      provider: 'provider-private-marker',
    })
    assert.equal((await reserve('status-consumed', 100)).granted, true)
    assert.equal((await reserve('status-failed', 200)).granted, true)
    assert.equal((await reserve('status-released', 50)).granted, true)
    assert.equal((await reserve('status-in-flight', 300)).granted, true)
    assert.equal((await store.settleAiBudgetReservation('status-consumed', 'consumed', 75)).updated, true)
    assert.equal((await store.settleAiBudgetReservation('status-failed', 'failed', 200)).updated, true)
    assert.equal((await store.settleAiBudgetReservation('status-released', 'released', 0)).updated, true)

    const denied = await handle({ method: 'GET', path: '/api/state', headers: { 'x-ops-key': 'wrong' } })
    assert.equal(denied.status, 401)
    assert.equal(Object.hasOwn(denied.json, 'aiBudget'), false)

    const response = await handle({ method: 'GET', path: '/api/state', headers: { 'x-ops-key': 'owner-budget-key' } })
    assert.equal(response.status, 200)
    assert.equal(response.json.aiConfigured, true, 'OpenRouter-only gateway configuration is reported truthfully')
    assert.deepEqual(response.json.aiBudget, {
      contract: 'supermega.company-ai-budget-status.v1',
      window,
      unit: 'bulk_equivalent_tokens',
      available: true,
      readiness: 'ephemeral',
      durableStoreReady: false,
      capUnits: 1000,
      reservedUnits: 600,
      remainingUnits: 400,
      utilizationPercent: 60,
      attempts: 3,
      states: { inFlight: 1, consumed: 1, failed: 1 },
    })
    const publicShape = JSON.stringify(response.json.aiBudget)
    for (const privateMarker of ['tenant-private-marker', 'deep-private-marker', 'provider-private-marker', 'status-consumed']) {
      assert.doesNotMatch(publicShape, new RegExp(privateMarker))
    }

    delete process.env.OPENROUTER_API_KEY
    process.env.SUPERMEGA_OLLAMA_ENABLED = '1'
    process.env.SUPERMEGA_OLLAMA_MODEL = 'llama3.2:1b'
    const localResponse = await handle({ method: 'GET', path: '/api/state', headers: { 'x-ops-key': 'owner-budget-key' } })
    assert.equal(localResponse.json.aiConfigured, true, 'explicit local Ollama configuration is reported truthfully')
    process.env.VERCEL = '1'
    const hostedResponse = await handle({ method: 'GET', path: '/api/state', headers: { 'x-ops-key': 'owner-budget-key' } })
    assert.equal(hostedResponse.json.aiConfigured, false, 'loopback Ollama is never reported as available in hosted runtime')
    delete process.env.VERCEL

    process.env.SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
    let request = null
    let remoteRows = [{ reserved_units: '725', attempts: '4', in_flight: '1', consumed: '2', failed: '1' }]
    globalThis.fetch = async (url, init) => {
      request = { url: String(url), init }
      return {
        ok: true,
        status: 200,
        json: async () => remoteRows,
        text: async () => '',
      }
    }
    const remoteStore = await import(`./store.mjs?ai-budget-usage=${Date.now()}`)
    assert.equal(remoteStore.mode, 'supabase')
    assert.deepEqual(await remoteStore.getAiBudgetUsage('2026-07-27'), {
      available: true,
      durable: true,
      window: '2026-07-27',
      reservedUnits: 725,
      attempts: 4,
      inFlight: 1,
      consumed: 2,
      failed: 1,
    })
    assert.equal(request.init.method, 'POST')
    assert.match(request.url, /\/rest\/v1\/rpc\/supermega_get_ai_budget_usage$/)
    assert.deepEqual(JSON.parse(request.init.body), { p_window: '2026-07-27' })
    remoteRows = [{ reserved_units: null, attempts: null, in_flight: null, consumed: null, failed: null }]
    assert.deepEqual(await remoteStore.getAiBudgetUsage('2026-07-28'), {
      available: false,
      durable: false,
      window: '2026-07-28',
      reason: 'budget_store_invalid_response',
    })
    request = null
    assert.deepEqual(await remoteStore.getAiBudgetUsage('not-a-day'), {
      available: false,
      durable: false,
      window: 'not-a-day',
      reason: 'invalid_budget_window',
    })
    assert.equal(request, null, 'invalid windows never reach the durable store')

    for (const sqlPath of ['./supabase/console-tables.sql', './supabase/workcell-client.sql']) {
      const sql = await readFile(new URL(sqlPath, import.meta.url), 'utf8')
      assert.match(sql, /create index if not exists supermega_ai_budget_window_status_idx[\s\S]*?\("window", status\)/)
      assert.match(sql, /create or replace function public\.supermega_get_ai_budget_usage\(p_window text\)/)
      assert.match(sql, /language sql[\s\S]*?stable[\s\S]*?security invoker/)
      assert.match(sql, /where r\."window" = p_window and r\.status <> 'released'/)
      assert.match(sql, /revoke all on function public\.supermega_get_ai_budget_usage\(text\) from public, anon, authenticated/)
      assert.match(sql, /grant execute on function public\.supermega_get_ai_budget_usage\(text\) to service_role/)
      assert.doesNotMatch(sql, /grant execute on function public\.supermega_get_ai_budget_usage\(text\) to (?:anon|authenticated)/)
    }
  } finally {
    globalThis.fetch = originalFetch
    restoreEnvironment(saved)
  }
})
