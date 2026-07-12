// Free-tier cost gate — server-side plan resolution, forced bulk tier, cap-override rejection,
// cost-weighted ledger. Runs fully OFFLINE: the store is forced into memory mode and the Anthropic
// endpoint is a stubbed global fetch that captures each request body. `node --test`.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'

// Force memory-mode store + deterministic cap BEFORE the modules load (both read env at import).
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL', 'SUPERMEGA_DATABASE_URL', 'DATABASE_URL']) delete process.env[k]
process.env.SUPERMEGA_CLIENT_TOKEN_CAP = '150000'
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key'
delete process.env.CLAUDE_API_KEY
delete process.env.OPENROUTER_API_KEY

const { complete, policyFor, resolvePlan, usageFor, TIERS, TIER_COST_WEIGHTS, FREE_PLAN } = await import('./gateway.mjs')
const store = (await import('./store.mjs')).default
assert.equal(store.mode, 'memory', 'tests must never touch a real database')

const CAP = 150_000
const WINDOW = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`

// Stub the Anthropic endpoint: capture every request body, return fixed usage {100 in / 10 out}.
const captured = []
const realFetch = globalThis.fetch
globalThis.fetch = async (url, opts = {}) => {
  captured.push(JSON.parse(opts.body))
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 100, output_tokens: 10 } }),
    text: async () => '',
  }
}
after(() => { globalThis.fetch = realFetch })

const ask = (q, opts = {}) => complete({ system: 'test', messages: [{ role: 'user', content: q }], ...opts })

test('policyFor: free plan → forced bulk + default cap, overrides rejected (pure)', () => {
  const pol = policyFor('free', { tier: 'deep', capTokens: 5_000_000 })
  assert.equal(pol.tier, 'bulk', 'free is forced to the bulk (Haiku) tier')
  assert.equal(pol.cap, CAP, 'caller capTokens is rejected — default cap stands')
  assert.equal(pol.overridesRejected, true)
  const pro = policyFor('pro', { tier: 'deep', capTokens: 5_000_000 })
  assert.equal(pro.tier, 'deep', 'paid plans keep their requested tier')
  assert.equal(pro.cap, 5_000_000, 'paid plans may override the cap')
})

test('resolvePlan: unknown tenant / no row → free (fail closed)', async () => {
  assert.equal(await resolvePlan('tenant-nobody-knows'), FREE_PLAN)
  assert.equal(await resolvePlan(''), FREE_PLAN)
})

test('free tenant gets Haiku regardless of the tier it requests', async () => {
  const r = await ask('q-free-tier-forcing', { clientId: 'tenant-free-a', tier: 'deep' })
  assert.equal(r.tier, 'bulk', 'response reports the enforced tier')
  assert.equal(captured.at(-1).model, TIERS.bulk.model, 'the wire request used the bulk (Haiku) model')
  // and the ledger recorded it at bulk weight (1x)
  const u = usageFor('tenant-free-a')
  assert.equal(u.inTokens, 100 * TIER_COST_WEIGHTS.bulk)
  assert.equal(u.outTokens, 10 * TIER_COST_WEIGHTS.bulk)
})

test('free tenant capTokens override is rejected — cap still enforced at the default', async () => {
  await store.addTokenUsage('tenant-free-capped', WINDOW, { inTokens: CAP, outTokens: 1, calls: 1 })
  await assert.rejects(
    () => ask('q-free-cap-override', { clientId: 'tenant-free-capped', capTokens: 99_999_999 }),
    /gateway_client_cap_reached/,
    'a free tenant cannot raise its own cap',
  )
})

test('paid tenant keeps its requested tier and its cap override is honored', async () => {
  await store.createClient({ id: 'tenant-pro-a', name: 'Pro tenant A', plan: 'pro' })
  const r = await ask('q-pro-tier', { clientId: 'tenant-pro-a', tier: 'deep' })
  assert.equal(r.tier, 'deep')
  assert.equal(captured.at(-1).model, TIERS.deep.model)
  // over the default cap but under its own override → still served
  await store.createClient({ id: 'tenant-pro-b', name: 'Pro tenant B', plan: 'pro' })
  await store.addTokenUsage('tenant-pro-b', WINDOW, { inTokens: CAP + 50_000, outTokens: 0, calls: 1 })
  const r2 = await ask('q-pro-cap-override', { clientId: 'tenant-pro-b', tier: 'bulk', capTokens: 10_000_000 })
  assert.equal(r2.text, 'ok')
})

test('ledger is cost-weighted: reason (Sonnet) burns 3x bulk per token', async () => {
  await store.createClient({ id: 'tenant-pro-c', name: 'Pro tenant C', plan: 'pro' })
  await ask('q-weighted-ledger', { clientId: 'tenant-pro-c', tier: 'reason' })
  const u = usageFor('tenant-pro-c')
  assert.equal(u.inTokens, 100 * TIER_COST_WEIGHTS.reason, '100 raw in-tokens → 300 cap units at reason tier')
  assert.equal(u.outTokens, 10 * TIER_COST_WEIGHTS.reason, '10 raw out-tokens → 30 cap units at reason tier')
  assert.equal(u.calls, 1)
  // and the persisted (spine) view agrees — the cap check reads this
  const persisted = await store.getTokenUsage('tenant-pro-c', WINDOW)
  assert.equal(Number(persisted.in_tokens), 100 * TIER_COST_WEIGHTS.reason)
  assert.equal(Number(persisted.out_tokens), 10 * TIER_COST_WEIGHTS.reason)
})
