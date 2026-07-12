// Money-layer tests for the Stripe connector — signature verification + idempotent, amount-checked
// reconciliation. Runs against the in-memory store (no DB credentials). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

// Force memory-mode store BEFORE importing the connector (store resolves mode from env at import).
delete process.env.SUPABASE_URL
delete process.env.SUPABASE_SERVICE_ROLE_KEY
delete process.env.SUPABASE_SERVICE_KEY
for (const k of ['POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_PRISMA_URL', 'SUPERMEGA_DATABASE_URL', 'DATABASE_URL']) delete process.env[k]
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_123'

const store = (await import('../store.mjs')).default
const { verifyWebhook, reconcile } = await import('./payment-stripe.mjs')

assert.equal(store.mode, 'memory', 'tests must run in memory store mode')

function signed(body, { secret = 'whsec_test_secret_123', t = Math.floor(Date.now() / 1000) } = {}) {
  const raw = JSON.stringify(body)
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')
  return { raw, sig: `t=${t},v1=${v1}` }
}
const paidEvent = (id, ref, cents) => ({
  id, type: 'checkout.session.completed',
  data: { object: { payment_status: 'paid', amount_total: cents, currency: 'usd', metadata: { ref, expected_cents: String(cents), currency: 'usd' } } },
})

// --- signature verification ---
test('verifyWebhook accepts a valid signature', () => {
  const { raw, sig } = signed({ id: 'evt_ok', type: 'checkout.session.completed' })
  const r = verifyWebhook(raw, sig)
  assert.equal(r.ok, true)
  assert.equal(r.event.id, 'evt_ok')
})

test('verifyWebhook rejects a tampered body', () => {
  const { sig } = signed({ id: 'evt_t', type: 'checkout.session.completed' })
  const r = verifyWebhook(JSON.stringify({ id: 'evt_t', tampered: true }), sig)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'signature_mismatch')
})

test('verifyWebhook rejects an out-of-tolerance (replayed) timestamp', () => {
  const { raw, sig } = signed({ id: 'evt_old', type: 'checkout.session.completed' }, { t: Math.floor(Date.now() / 1000) - 10000 })
  const r = verifyWebhook(raw, sig)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'timestamp_out_of_tolerance')
})

test('verifyWebhook fails closed with no webhook secret', () => {
  const saved = process.env.STRIPE_WEBHOOK_SECRET
  delete process.env.STRIPE_WEBHOOK_SECRET
  const { raw, sig } = signed({ id: 'evt_x', type: 'checkout.session.completed' })
  const r = verifyWebhook(raw, sig)
  process.env.STRIPE_WEBHOOK_SECRET = saved
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_webhook_secret')
})

// --- reconcile: idempotency + amount integrity ---
test('reconcile marks an unpaid project paid on a matching, fresh event', async () => {
  const proj = await store.createProject({ offer: 'build' })
  const r = await reconcile(paidEvent('evt_pay_1', proj.id, 5000))
  assert.equal(r.ok, true)
  assert.equal(r.paid, true)
  assert.equal((await store.getProject(proj.id)).deposit_status, 'paid')
})

test('reconcile is idempotent — a duplicate event does not re-flip or double-handle', async () => {
  const proj = await store.createProject({ offer: 'build' })
  const ev = paidEvent('evt_pay_dup', proj.id, 5000)
  assert.equal((await reconcile(ev)).paid, true)
  const r2 = await reconcile(ev)
  assert.equal(r2.duplicate, true)
})

test('reconcile REJECTS an amount mismatch (small payment replayed onto a big project)', async () => {
  const proj = await store.createProject({ offer: 'build' })
  const ev = { id: 'evt_mismatch', type: 'checkout.session.completed', data: { object: { payment_status: 'paid', amount_total: 100, currency: 'usd', metadata: { ref: proj.id, expected_cents: '500000', currency: 'usd' } } } }
  const r = await reconcile(ev)
  assert.equal(r.mismatch, true)
  assert.equal(r.paid, false)
  assert.equal((await store.getProject(proj.id)).deposit_status, 'unpaid', 'must NOT flip on amount mismatch')
})

test('reconcile does not treat an unpaid (async) session as paid', async () => {
  const proj = await store.createProject({ offer: 'build' })
  const ev = { id: 'evt_unpaid', type: 'checkout.session.completed', data: { object: { payment_status: 'unpaid', amount_total: 5000, currency: 'usd', metadata: { ref: proj.id, expected_cents: '5000', currency: 'usd' } } } }
  const r = await reconcile(ev)
  assert.equal(r.paid, false)
  assert.equal((await store.getProject(proj.id)).deposit_status, 'unpaid')
})

test('reconcile ignores non-payment event types', async () => {
  const r = await reconcile({ id: 'evt_other', type: 'customer.created', data: { object: {} } })
  assert.equal(r.handled, false)
})

test('store.markDepositPaid only flips an unpaid project (idempotent)', async () => {
  const proj = await store.createProject({ offer: 'build' })
  assert.ok(await store.markDepositPaid(proj.id, { method: 'test' }), 'first flip returns the row')
  assert.equal(await store.markDepositPaid(proj.id, { method: 'test' }), null, 'second flip is a no-op')
})

test('store.recordPaymentEvent returns fresh only the first time', async () => {
  assert.equal((await store.recordPaymentEvent('stripe', 'uniq_evt_1')).fresh, true)
  assert.equal((await store.recordPaymentEvent('stripe', 'uniq_evt_1')).fresh, false)
})
