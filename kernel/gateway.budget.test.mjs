// Company-wide AI admission budget. Runs fully offline with the memory store and a stubbed provider.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'

const ENV_KEYS = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
  'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL',
  'SUPERMEGA_DATABASE_URL', 'DATABASE_URL', 'SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS',
  'VERCEL', 'VERCEL_ENV', 'AWS_LAMBDA_FUNCTION_NAME', 'K_SERVICE', 'NODE_ENV',
  'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENROUTER_API_KEY',
]
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
for (const key of ENV_KEYS) delete process.env[key]
process.env.ANTHROPIC_API_KEY = 'sk-ant-offline-budget-test'

const {
  COMPANY_DAILY_BUDGET_HARD_MAX_UNITS,
  companyDailyBudgetCap,
  complete,
  estimateCallBudgetUnits,
} = await import('./gateway.mjs')
const store = (await import('./store.mjs')).default
assert.equal(store.mode, 'memory', 'budget tests must never touch a real database')

const realFetch = globalThis.fetch
after(() => {
  globalThis.fetch = realFetch
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

test('daily budget atomically blocks concurrent calls, charges failures, preserves cache hits, and fails closed when hosted without durable state', async () => {
  const request = {
    system: 'budget test',
    messages: [{ role: 'user', content: 'same bounded request' }],
    tier: 'reason',
    maxTokens: 8,
  }
  const units = estimateCallBudgetUnits(request)
  assert.ok(units > 0 && units < COMPANY_DAILY_BUDGET_HARD_MAX_UNITS)
  const invalidReservation = await store.reserveAiBudget({
    reservationId: 'invalid-numeric-budget', window: '2026-01-01', reservedUnits: Number.NaN, capUnits: units,
  })
  assert.equal(invalidReservation.granted, false, 'non-finite budget inputs fail closed')
  process.env.SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS = String(units)

  let fetchCalls = 0
  let responseMode = 'hold'
  let startFetch
  let releaseFetch
  const fetchStarted = new Promise((resolve) => { startFetch = resolve })
  const fetchGate = new Promise((resolve) => { releaseFetch = resolve })
  globalThis.fetch = async (_url, options = {}) => {
    fetchCalls += 1
    if (responseMode === 'hold') {
      startFetch()
      await fetchGate
    }
    if (responseMode === 'fail') {
      return { ok: false, status: 400, text: async () => 'offline provider rejection' }
    }
    const body = JSON.parse(options.body)
    assert.equal(body.max_tokens, 8, 'caller output budget is bounded on the provider wire')
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 4, output_tokens: 2 } }),
      text: async () => '',
    }
  }

  const first = complete({ ...request, cacheKey: 'budget-concurrency-a' })
  await fetchStarted
  await assert.rejects(
    complete({ ...request, cacheKey: 'budget-concurrency-b' }),
    /gateway_company_daily_budget_reached/,
    'a concurrent call cannot pass while the only daily reservation is in flight',
  )
  assert.equal(fetchCalls, 1, 'the blocked call never reached a paid provider')
  responseMode = 'success'
  releaseFetch()
  const firstResult = await first
  assert.equal(firstResult.text, 'ok')

  const cached = await complete({ ...request, cacheKey: 'budget-concurrency-a' })
  assert.equal(cached.cached, true)
  assert.equal(fetchCalls, 1, 'cache hits do not consume another provider reservation')

  process.env.SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS = String(units * 2)
  responseMode = 'fail'
  await assert.rejects(
    complete({ ...request, cacheKey: 'budget-provider-failure' }),
    /anthropic_400/,
  )
  assert.equal(fetchCalls, 2)
  responseMode = 'success'
  await assert.rejects(
    complete({ ...request, cacheKey: 'budget-after-failure' }),
    /gateway_company_daily_budget_reached/,
    'an ambiguous or rejected provider attempt remains conservatively charged',
  )
  assert.equal(fetchCalls, 2)

  process.env.SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS = String(units * 3)
  process.env.VERCEL = '1'
  // hostedRuntime() is read live (not snapshotted at module load), so the per-tenant spend
  // reservation — which runs before the company-wide budget reservation — is the first
  // checkpoint to see the hosted runtime and fail closed on the non-durable memory store.
  await assert.rejects(
    complete({ ...request, cacheKey: 'budget-hosted-memory-store' }),
    /gateway_durable_spend_required/,
    'a hosted runtime may not rely on a per-process budget map',
  )
  delete process.env.VERCEL
  assert.equal(fetchCalls, 2)

  process.env.SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS = '999999999'
  assert.equal(companyDailyBudgetCap(), COMPANY_DAILY_BUDGET_HARD_MAX_UNITS, 'configuration cannot exceed the compiled hard maximum')
})
