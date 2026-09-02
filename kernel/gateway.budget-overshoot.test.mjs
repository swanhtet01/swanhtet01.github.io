// Measures, rather than asserts by fiat, how far the two token caps can be overshot under concurrent
// callers. Pinned for the kernel/README.md "Honest Limits" entry on the token cap.
//
// What is measured. Every paid provider attempt passes two admission gates before network I/O:
//   1. the per-tenant monthly token cap   — store.reserveTokenSpend, called from gateway reserveSpend;
//   2. the company-wide UTC-day AI budget — store.reserveAiBudget, called from gateway
//      reserveProviderBudget, clamped to COMPANY_DAILY_BUDGET_HARD_MAX_UNITS (2,000,000) by
//      gateway companyDailyBudgetCap() and, independently, inside store.reserveAiBudget and the
//      SQL function (`least(p_cap_units, 2000000)`).
// "Overshoot" is (peak units admitted while every caller is in flight) minus (the cap). It is read at
// the moment of maximum contention: the stubbed provider parks every admitted caller until the
// harness has seen all N callers either parked at the provider or already rejected. Only then is the
// gate opened. Nothing here is timing-based, so the numbers do not vary run to run.
//
// Why the pinned bound is exactly 0. The README line this test pins was written for the #27-era
// ledger (66fd1b7f), whose Supabase path incremented usage AFTER dispatch with a PostgREST
// read-modify-write (store.mjs addTokenUsage: "PostgREST has no native UPSERT-with-increment").
// That path now throws `unreserved_token_usage_disabled`, and both gates are serialized
// reserve-before-dispatch steps:
//   memory   — the sum/check/insert section has no `await` inside it (store.mjs reserveAiBudget and
//              reserveTokenSpend memory branches), so it cannot interleave on one event loop;
//   postgres — reserveAiBudget runs a plpgsql function under pg_advisory_xact_lock on the window,
//              reserveTokenSpend locks the tenant ledger row `for update` inside one transaction;
//   supabase — the same SQL, reached through RPC (kernel/supabase/console-tables.sql,
//              kernel/supabase/workcell-client.sql).
// Given that shape the honest bound is 0 units at every N, not a "modest" margin. Any looser bound
// would only ever hide the one regression this harness exists to see (an `await` slipping into the
// memory critical section, a lock dropped from the SQL). Deliberately relaxing the memory branch
// (an `await` between the sum and the insert) makes every sweep below fail on its first N.
//
// Offline: globalThis.fetch is replaced before the gateway loads by a stub that records every URL
// and refuses anything but the Anthropic endpoint; the store runs in memory mode. Opt-in:
// SUPERMEGA_OVERSHOOT_PROBE_POSTGRES_URL=<loopback postgres url> re-runs the store-level sweeps
// against the real SQL on a disposable local database (non-loopback hosts are refused). That probe
// is how the Postgres figures in kernel/README.md were produced; CI runs the memory measurement.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const ENV_KEYS = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
  'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL',
  'SUPERMEGA_DATABASE_URL', 'DATABASE_URL', 'SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS',
  'SUPERMEGA_GATEWAY_PERSIST', 'SUPERMEGA_CLIENT_TOKEN_CAP', 'SUPERMEGA_CLIENT_CAP_SOFT_RATIO',
  'SUPERMEGA_PLAN_CAP_PLATFORM', 'SUPERMEGA_PLAN_CAP_PRO', 'SUPERMEGA_OLLAMA_ENABLED', 'SUPERMEGA_OLLAMA_MODEL',
  'VERCEL', 'VERCEL_ENV', 'AWS_LAMBDA_FUNCTION_NAME', 'K_SERVICE', 'NODE_ENV',
  'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENROUTER_API_KEY', 'SUPERMEGA_OVERSHOOT_PROBE_POSTGRES_URL',
]
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
const PROBE_URL = String(process.env.SUPERMEGA_OVERSHOOT_PROBE_POSTGRES_URL || '').trim()
for (const key of ENV_KEYS) delete process.env[key]
process.env.ANTHROPIC_API_KEY = 'sk-ant-offline-overshoot-test'
// The platform tenant's monthly cap is pinned by the store on its first reservation, so it must stay
// constant for the whole file, and it must never be the binding gate while the company budget is measured.
process.env.SUPERMEGA_PLAN_CAP_PLATFORM = '100000000'

// gateway.mjs API_URL — the only endpoint the stub may ever be asked for.
const PROVIDER_URL = 'https://api.anthropic.com/v1/messages'
const realFetch = globalThis.fetch
const fetchLog = []
const gate = { open: true, parked: 0, waiters: [] }
globalThis.fetch = async (url) => {
  fetchLog.push(String(url))
  if (String(url) !== PROVIDER_URL) throw new Error(`overshoot_harness_unexpected_network_call:${url}`)
  if (!gate.open) {
    gate.parked += 1
    await new Promise((resolve) => gate.waiters.push(resolve))
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 4, output_tokens: 2 } }),
    text: async () => '',
  }
}

const {
  COMPANY_DAILY_BUDGET_HARD_MAX_UNITS: HARD_MAX,
  companyDailyBudgetCap,
  complete,
  currentDailyBudgetWindow,
  estimateCallBudgetUnits,
} = await import('./gateway.mjs')
const store = (await import('./store.mjs')).default
assert.equal(store.mode, 'memory', 'the overshoot harness must never touch a real database')

after(() => {
  globalThis.fetch = realFetch
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  assert.ok(fetchLog.every((url) => url === PROVIDER_URL), 'the provider stub was the only network surface invoked')
})

const PLATFORM_TENANT = 'supermega-platform'
const WINDOW = currentDailyBudgetWindow()
const MONTH = WINDOW.slice(0, 7)
const SWEEP = [2, 8, 32, 128]
const STORE_SWEEP = [2, 8, 32, 128, 512]
// Bulk tier: weight 1 and no soft-band fallback tier, so a caller's reservation size never depends
// on what the callers ahead of it already reserved.
const REQUEST = { system: 'overshoot probe', messages: [{ role: 'user', content: 'same bounded request' }], tier: 'bulk', maxTokens: 8 }
const UNITS = estimateCallBudgetUnits(REQUEST)
const admitFor = (n) => Math.max(1, Math.floor(n / 2))
const expiry = () => new Date(Date.now() + 60_000).toISOString()

// Fire N callers, wait until every one is parked at the provider stub or already rejected, hand the
// caller its observation point, then release the parked ones.
async function burst(n, makeCall) {
  gate.open = false
  gate.parked = 0
  const settled = []
  const promises = Array.from({ length: n }, (_, index) => makeCall(index).then(
    (value) => { settled.push({ ok: true, value }); return value },
    (error) => { settled.push({ ok: false, error }); return error },
  ))
  const deadline = Date.now() + 20_000
  while (gate.parked + settled.length < n) {
    if (Date.now() > deadline) throw new Error(`overshoot_burst_stalled parked=${gate.parked} settled=${settled.length} of ${n}`)
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  return {
    parked: gate.parked,
    rejected: settled.filter((row) => !row.ok).map((row) => row.error),
    async finish() {
      gate.open = true
      const waiters = gate.waiters
      gate.waiters = []
      for (const resolve of waiters) resolve()
      return Promise.all(promises)
    },
  }
}

async function companyUsage(s, window) {
  const usage = await s.getAiBudgetUsage(window)
  assert.equal(usage.available, true, `budget usage readable for ${window}`)
  return usage
}

// Store-level sweep of both admission primitives with N simultaneous reservations against a cap
// sized so exactly half of them fit. Used for the memory store and for the optional Postgres probe.
async function storeSweep(s, { window, month, label }) {
  const rows = []
  for (const n of STORE_SWEEP) {
    const admit = admitFor(n)
    const units = 1000
    const usedBefore = (await companyUsage(s, window)).reservedUnits
    const cap = usedBefore + admit * units
    const grants = await Promise.all(Array.from({ length: n }, () => s.reserveAiBudget({
      reservationId: randomUUID(), window, reservedUnits: units, capUnits: cap, tenantId: 'overshoot-probe', tier: 'bulk', provider: 'stub',
    })))
    const granted = grants.filter((grant) => grant.granted).length
    const peak = (await companyUsage(s, window)).reservedUnits
    for (const grant of grants) if (!grant.granted) assert.equal(grant.reason, 'company_daily_budget_reached')

    const tenant = `${label}-${randomUUID().slice(0, 8)}-${n}`
    const tenantCap = admit * 25
    const attempts = await Promise.all(Array.from({ length: n }, (_, index) => s.reserveTokenSpend(
      `${tenant}-${index}`, tenant, month,
      { reservedTokens: 25, capTokens: tenantCap, expiresAt: expiry(), dispatchToken: `dispatch-${index}`, context: { probe: label } },
    )))
    const accepted = attempts.filter((row) => row.accepted).length
    const tenantPeak = (await s.getTokenUsage(tenant, month)).spend_total
    for (const row of attempts) if (!row.accepted) assert.equal(row.reason, 'cap_reached')

    rows.push({ N: n, company: { cap, admitted: granted, peak, overshoot: peak - cap }, tenant: { cap: tenantCap, admitted: accepted, peak: tenantPeak, overshoot: tenantPeak - tenantCap } })
    assert.equal(granted, admit, `${label}: exactly the ${admit} daily-budget reservations that fit are granted at N=${n}`)
    assert.equal(peak - cap, 0, `${label}: daily budget overshoot at N=${n}`)
    assert.equal(accepted, admit, `${label}: exactly the ${admit} tenant-cap reservations that fit are accepted at N=${n}`)
    assert.equal(tenantPeak - tenantCap, 0, `${label}: tenant cap overshoot at N=${n}`)
  }
  return rows
}

// The compiled 2,000,000-unit ceiling is applied inside the store independently of the gateway: an
// oversized configured cap is clamped, and concurrent reservations cannot sum past the clamp.
async function storeHardMax(s, window, label) {
  const usedBefore = (await companyUsage(s, window)).reservedUnits
  const units = 250_000
  const n = 64
  assert.ok(usedBefore + n * units > HARD_MAX, 'the burst asks for more than the hard maximum')
  const expected = Math.floor((HARD_MAX - usedBefore) / units)
  assert.ok(expected >= 1, `${label}: the window must have room for at least one hard-max reservation`)
  const grants = await Promise.all(Array.from({ length: n }, () => s.reserveAiBudget({
    reservationId: randomUUID(), window, reservedUnits: units, capUnits: 999_999_999, tenantId: 'overshoot-probe', tier: 'deep', provider: 'stub',
  })))
  const granted = grants.filter((grant) => grant.granted)
  for (const grant of grants) assert.equal(grant.capUnits, HARD_MAX, `${label}: the store clamps an oversized cap to the hard maximum`)
  const peak = (await companyUsage(s, window)).reservedUnits
  assert.equal(granted.length, expected, `${label}: hard-max admissions`)
  assert.ok(peak <= HARD_MAX, `${label}: peak ${peak} exceeds the hard maximum`)
  assert.ok(peak + units > HARD_MAX, `${label}: the ceiling was actually reached (${peak})`)
  return { admitted: granted.length, peak, hardMax: HARD_MAX, overshoot: Math.max(0, peak - HARD_MAX) }
}

test('memory store: neither admission primitive overshoots its cap at 2/8/32/128/512 simultaneous reservations', async (t) => {
  // A synthetic window keeps this sweep out of the day the gateway tests below use; the memory
  // store drops other windows' rows on its next call, so the gateway sweeps start from zero.
  const rows = await storeSweep(store, { window: '2098-12-31', month: '2098-12', label: 'memory' })
  const hardMax = await storeHardMax(store, '2098-12-31', 'memory')
  t.diagnostic(`memory store sweep ${JSON.stringify(rows)}`)
  t.diagnostic(`memory store hard max ${JSON.stringify(hardMax)}`)
})

test('company daily budget through complete(): peak admitted units equal the cap at 2/8/32/128 concurrent callers', async (t) => {
  const rows = []
  for (const n of SWEEP) {
    const admit = admitFor(n)
    const usedBefore = (await companyUsage(store, WINDOW)).reservedUnits
    const cap = usedBefore + admit * UNITS
    process.env.SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS = String(cap)
    assert.equal(companyDailyBudgetCap(), cap)
    const fetchBefore = fetchLog.length
    const run = await burst(n, (index) => complete({ ...REQUEST, cacheKey: `overshoot-company-${n}-${index}` }))
    const peak = (await companyUsage(store, WINDOW)).reservedUnits
    rows.push({ N: n, cap, admitted: run.parked, rejected: run.rejected.length, peak, overshoot: peak - cap })
    assert.equal(run.parked, admit, `exactly the ${admit} callers that fit reach the provider at N=${n}`)
    assert.equal(run.rejected.length, n - admit)
    for (const error of run.rejected) {
      assert.equal(error.message, 'gateway_company_daily_budget_reached')
      assert.equal(error.cap, cap)
    }
    assert.equal(peak - cap, 0, `daily budget overshoot at N=${n}`)
    const results = await run.finish()
    assert.equal(results.filter((result) => result?.text === 'ok').length, admit)
    assert.equal(fetchLog.length - fetchBefore, admit, 'one stubbed provider call per admitted caller, none for the rejected ones')
  }
  t.diagnostic(`company daily budget via complete() ${JSON.stringify(rows)}`)
})

test('tenant monthly cap through complete(): peak admitted tokens equal the cap at 2/8/32/128 concurrent callers', async (t) => {
  process.env.SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS = String(HARD_MAX)
  // One parked call on a throwaway pro tenant reveals the per-call reservation size.
  process.env.SUPERMEGA_PLAN_CAP_PRO = '100000000'
  await store.createClient({ id: 'overshoot-pro-probe', name: 'probe', plan: 'pro' })
  const probe = await burst(1, () => complete({ ...REQUEST, clientId: 'overshoot-pro-probe', cacheKey: 'overshoot-tenant-probe' }))
  const perCall = (await store.getTokenUsage('overshoot-pro-probe', MONTH)).reserved_tokens
  assert.ok(perCall > 0)
  await probe.finish()

  const rows = []
  for (const n of SWEEP) {
    const admit = admitFor(n)
    const tenant = `overshoot-pro-${n}`
    const cap = admit * perCall
    process.env.SUPERMEGA_PLAN_CAP_PRO = String(cap)
    await store.createClient({ id: tenant, name: tenant, plan: 'pro' })
    const companyBefore = (await companyUsage(store, WINDOW)).attempts
    const run = await burst(n, (index) => complete({ ...REQUEST, clientId: tenant, cacheKey: `overshoot-tenant-${n}-${index}` }))
    const usage = await store.getTokenUsage(tenant, MONTH)
    rows.push({ N: n, cap, admitted: run.parked, rejected: run.rejected.length, peak: usage.spend_total, overshoot: usage.spend_total - cap })
    assert.equal(usage.cap_tokens, cap, 'the server-configured cap is the one the store pinned')
    assert.equal(run.parked, admit, `exactly the ${admit} callers that fit reach the provider at N=${n}`)
    assert.equal(run.rejected.length, n - admit)
    for (const error of run.rejected) assert.equal(error.message, 'gateway_client_cap_reached')
    assert.equal(usage.spend_total - cap, 0, `tenant cap overshoot at N=${n}`)
    assert.equal((await companyUsage(store, WINDOW)).attempts - companyBefore, admit, 'a tenant-cap rejection consumes no company budget')
    await run.finish()
  }
  t.diagnostic(`tenant monthly cap via complete() ${JSON.stringify(rows)}`)
})

test('cache hits reserve nothing under concurrency, even with zero budget headroom', async (t) => {
  const before = await companyUsage(store, WINDOW)
  const tenantBefore = await store.getTokenUsage(PLATFORM_TENANT, MONTH)
  // Cap == used: any concurrent caller that missed the cache would be refused, so a green run here
  // proves every one of them was served from the cache without a reservation.
  process.env.SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS = String(before.reservedUnits)
  const fetchBefore = fetchLog.length
  const results = await Promise.all(Array.from({ length: 128 }, () => complete({ ...REQUEST, cacheKey: 'overshoot-company-2-0' })))
  assert.equal(results.length, 128)
  for (const result of results) {
    assert.equal(result.cached, true)
    assert.equal(result.text, 'ok')
  }
  assert.equal(fetchLog.length, fetchBefore, 'no provider call behind a cache hit')
  const after = await companyUsage(store, WINDOW)
  assert.equal(after.attempts, before.attempts, 'no company budget reservation behind a cache hit')
  assert.equal(after.reservedUnits, before.reservedUnits)
  const tenantAfter = await store.getTokenUsage(PLATFORM_TENANT, MONTH)
  assert.equal(tenantAfter.spend_total, tenantBefore.spend_total, 'no tenant spend reservation behind a cache hit')

  // Observation, not a pin: identical requests that all miss the cache at once each reserve and
  // dispatch on their own — there is no single-flight coalescing. They still cannot exceed the cap.
  const misses = 16
  process.env.SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS = String(after.reservedUnits + misses * UNITS)
  const missRun = await burst(misses, () => complete({ ...REQUEST, cacheKey: 'overshoot-simultaneous-miss' }))
  const missPeak = (await companyUsage(store, WINDOW)).reservedUnits
  assert.ok(missPeak <= after.reservedUnits + misses * UNITS)
  await missRun.finish()
  t.diagnostic(`simultaneous identical misses: ${misses} callers, ${missRun.parked} provider dispatches, ${missPeak - after.reservedUnits} units reserved`)
})

test('the 2,000,000-unit hard maximum is not overshootable through complete() by the same mechanism', async (t) => {
  process.env.SUPERMEGA_COMPANY_DAILY_AI_BUDGET_UNITS = '999999999'
  assert.equal(companyDailyBudgetCap(), HARD_MAX, 'configuration cannot raise the ceiling')
  const deep = { system: 'overshoot probe', messages: [{ role: 'user', content: 'largest bounded request' }], tier: 'deep', maxTokens: 8192 }
  const deepUnits = estimateCallBudgetUnits(deep)
  const usedBefore = (await companyUsage(store, WINDOW)).reservedUnits
  const n = 32
  assert.ok(usedBefore + n * deepUnits > HARD_MAX, 'the burst asks for more than the hard maximum')
  const expected = Math.floor((HARD_MAX - usedBefore) / deepUnits)
  assert.ok(expected >= 1)
  const run = await burst(n, (index) => complete({ ...deep, cacheKey: `overshoot-hardmax-${index}` }))
  const peak = (await companyUsage(store, WINDOW)).reservedUnits
  assert.equal(run.parked, expected, 'only the deep calls that fit under the ceiling reach the provider')
  assert.equal(run.rejected.length, n - expected)
  for (const error of run.rejected) {
    assert.equal(error.message, 'gateway_company_daily_budget_reached')
    assert.equal(error.cap, HARD_MAX)
  }
  assert.ok(peak <= HARD_MAX, `peak ${peak} exceeds the hard maximum`)
  assert.ok(peak + deepUnits > HARD_MAX, `the ceiling was actually reached (${peak})`)
  await run.finish()
  t.diagnostic(`hard max via complete(): ${JSON.stringify({ N: n, perCall: deepUnits, admitted: run.parked, peak, hardMax: HARD_MAX, overshoot: Math.max(0, peak - HARD_MAX) })}`)
})

test(
  'postgres probe: the durable SQL path admits exactly what fits under advisory and row locks',
  { skip: PROBE_URL ? false : 'set SUPERMEGA_OVERSHOOT_PROBE_POSTGRES_URL to a loopback Postgres to measure the durable path' },
  async (t) => {
    const host = new URL(PROBE_URL).hostname
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(host), 'the probe only ever runs against a loopback database')
    process.env.POSTGRES_URL = PROBE_URL
    let probe
    try { probe = (await import('./store.mjs?probe=postgres')).default } finally { delete process.env.POSTGRES_URL }
    assert.equal(probe.mode, 'postgres')
    // A fresh synthetic window per run keeps repeated probes against one database independent.
    const stamp = randomUUID()
    const day = String(1 + (parseInt(stamp.slice(0, 4), 16) % 28)).padStart(2, '0')
    const month = `2099-${String(1 + (parseInt(stamp.slice(4, 6), 16) % 12)).padStart(2, '0')}`
    const rows = await storeSweep(probe, { window: `${month}-${day}`, month, label: 'postgres' })
    const hardMax = await storeHardMax(probe, `${month}-${day}`, 'postgres')
    t.diagnostic(`postgres store sweep ${JSON.stringify(rows)}`)
    t.diagnostic(`postgres store hard max ${JSON.stringify(hardMax)}`)
  },
)
