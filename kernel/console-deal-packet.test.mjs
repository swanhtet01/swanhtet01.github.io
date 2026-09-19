import { test } from 'node:test'
import assert from 'node:assert/strict'

const ENV_KEYS = [
  'SUPERMEGA_OPS_KEY',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
  'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL',
  'SUPERMEGA_DATABASE_URL', 'DATABASE_URL',
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

const CONFORMING_KEY = 'console-deal-packet-key-0123456789'

const samplePacket = {
  headline: 'Inventory follow-up for a Yangon shop',
  fit_score: 120,
  fit_reason: 'The work is operational and close to revenue.',
  segment: 'retail',
  pain: 'Orders and supplier follow-up are scattered across chat and notebooks.',
  modules: [
    { name: 'Order desk', why: 'Capture every request once.', script: '<script>ignored()</script>' },
    { name: 'Supplier follow-up', why: 'Keep delayed items visible.' },
    { name: '', why: '' },
  ],
  operator: 'Drafts the next owner action only.',
  phases: ['Capture', 'Review', 'Operate', 'Ignore fourth'],
  first_proof: 'A reviewed order queue within one week.',
  pricing: {
    build_fee_mmk: '3,000,000 MMK',
    pro_mrr_mmk: '300,000 MMK',
    rationale: 'Small fixed pilot before a managed plan.',
    unsafe: 'ignored',
  },
  objections: [
    { objection: 'Will this replace staff?', answer: 'No, it drafts work for owner review.', extra: 'ignored' },
  ],
  outreach_en: 'Draft only. Owner reviews before sending.',
  next_action: 'Review the draft with the owner.',
  raw_html: '<img src=x onerror=alert(1)>',
}

test('deal packet normalizer whitelists fields, bounds scores, and rejects empty packets', async () => {
  const { normalizeDealPacket } = await import(`./console/deal.mjs?normalizer=${Date.now()}-${Math.random()}`)

  const normalized = normalizeDealPacket(samplePacket)
  assert.equal(normalized.ok, true)
  assert.equal(normalized.packet.fit_score, 100)
  assert.equal(normalized.packet.modules.length, 2)
  assert.deepEqual(Object.keys(normalized.packet.modules[0]).sort(), ['name', 'why'])
  assert.deepEqual(Object.keys(normalized.packet.pricing).sort(), ['build_fee_mmk', 'pro_mrr_mmk', 'rationale'])
  assert.ok(!Object.hasOwn(normalized.packet, 'raw_html'))
  assert.equal(normalized.packet.phases.length, 3)

  assert.deepEqual(normalizeDealPacket(null), { ok: false, reason: 'invalid_packet' })
  assert.deepEqual(normalizeDealPacket([]), { ok: false, reason: 'invalid_packet' })
  assert.deepEqual(normalizeDealPacket({ modules: [{ name: 'Only module' }] }), { ok: false, reason: 'empty_packet' })
})

test('POST /api/deals persists only the normalized packet shape', async () => {
  const saved = captureEnvironment()
  try {
    for (const name of ENV_KEYS) delete process.env[name]
    process.env.SUPERMEGA_OPS_KEY = CONFORMING_KEY

    const { handle } = await import(`./console/api.mjs?deal-packet=${Date.now()}-${Math.random()}`)
    const response = await handle({
      method: 'POST',
      path: '/api/deals',
      headers: { 'x-ops-key': CONFORMING_KEY },
      body: { lead_id: 'lead-1', packet: samplePacket },
    })

    assert.equal(response.status, 200)
    assert.equal(response.json.ok, true)
    assert.equal(response.json.deal.status, 'draft')
    assert.equal(response.json.deal.packet.fit_score, 100)
    assert.ok(!Object.hasOwn(response.json.deal.packet, 'raw_html'))
    assert.deepEqual(Object.keys(response.json.deal.packet.modules[0]).sort(), ['name', 'why'])
    assert.deepEqual(Object.keys(response.json.deal.packet.pricing).sort(), ['build_fee_mmk', 'pro_mrr_mmk', 'rationale'])

    const rejected = await handle({
      method: 'POST',
      path: '/api/deals',
      headers: { 'x-ops-key': CONFORMING_KEY },
      body: { packet: { modules: [{ name: 'No lead context' }] } },
    })
    assert.equal(rejected.status, 400)
    assert.equal(rejected.json.reason, 'empty_packet')
  } finally {
    restoreEnvironment(saved)
  }
})
