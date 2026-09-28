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

// Stripe sends multiple v1 signatures while endpoint secrets rotate.
test('verifyWebhook accepts a matching signature in either rotation position', () => {
  const { raw, sig } = signed({ id: 'evt_rotation', type: 'checkout.session.completed' })
  const other = '0'.repeat(64)
  assert.equal(verifyWebhook(raw, `${sig},v1=${other}`).ok, true)
  const [timestamp, signature] = sig.split(',')
  assert.equal(verifyWebhook(raw, `${timestamp},v1=${other},${signature}`).ok, true)
  assert.equal(verifyWebhook(raw, `${timestamp},v1=${other},v0=${signature.slice(3)}`).ok, false)
})

test('verifyWebhook rejects malformed timestamps even when signed', () => {
  for (const t of ['NaN', 'Infinity', '-1', '1.5', '9007199254740992']) {
    const { raw, sig } = signed({ id: 'evt_bad_timestamp', type: 'checkout.session.completed' }, { t })
    assert.equal(verifyWebhook(raw, sig).ok, false, t)
  }
})

test('verifyWebhook rejects malformed header values without throwing', () => {
  const { raw, sig } = signed({ id: 'evt_bad_header', type: 'checkout.session.completed' })
  for (const header of [[], [sig], {}, 42, `${sig},t=1`]) {
    assert.doesNotThrow(() => verifyWebhook(raw, header))
    assert.equal(verifyWebhook(raw, header).ok, false)
  }
})

test('verifyWebhook rejects signed non-event JSON without throwing', () => {
  for (const body of [null, [], 42, 'event', {}, { id: 1, type: 'x' }, { id: 'evt_missing_type' }]) {
    const { raw, sig } = signed(body)
    assert.doesNotThrow(() => verifyWebhook(raw, sig))
    assert.equal(verifyWebhook(raw, sig).ok, false)
  }
})

test('reconcile retries deposit persistence after the event was recorded', async () => {
  const project = await store.createProject({ offer: 'build' })
  const event = paidEvent('evt_retry_after_record', project.id, 5000)
  const original = store.markDepositPaid
  try {
    store.markDepositPaid = async () => { throw new Error('synthetic_storage_failure') }
    assert.equal((await reconcile(event)).ok, false)
  } finally { store.markDepositPaid = original }
  const retry = await reconcile(event)
  assert.equal(retry.ok, true)
  assert.equal(retry.paid, true)
  assert.equal((await store.getProject(project.id)).deposit_status, 'paid')
})

test('reconcile does not acknowledge a missing project as paid', async () => {
  const result = await reconcile(paidEvent('evt_missing_project', 'missing-project', 5000))
  assert.equal(result.ok, false)
  assert.notEqual(result.paid, true)
})

test('concurrent deliveries settle the project only once', async () => {
  const project = await store.createProject({ offer: 'build' })
  const event = paidEvent('evt_concurrent_retry', project.id, 5000)
  const results = await Promise.all([reconcile(event), reconcile(event)])
  assert.ok(results.every(result => result.ok && result.paid))
  assert.equal(results.filter(result => !result.alreadyPaid).length, 1)
})

test('verifyWebhook never authenticates normalized bytes in place of the received body', () => {
  const t = Math.floor(Date.now() / 1000)
  const raw = Buffer.concat([Buffer.from('{"id":"evt_bytes","type":"'), Buffer.from([0x80]), Buffer.from('"}')])
  const normalizedSignature = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${t}.${raw.toString('utf8')}`).digest('hex')
  assert.deepEqual(verifyWebhook(raw, `t=${t},v1=${normalizedSignature}`), { ok: false, reason: 'signature_mismatch' })
  const exactSignature = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${t}.`).update(raw).digest('hex')
  assert.deepEqual(verifyWebhook(raw, `t=${t},v1=${exactSignature}`), { ok: false, reason: 'bad_json' })
})

test('verifyWebhook accepts exact UTF-8 bytes for multilingual event data', () => {
  const { raw, sig } = signed({ id: 'evt_unicode_bytes', type: 'unhandled', label: 'မြန်မာ café' })
  assert.equal(verifyWebhook(Buffer.from(raw, 'utf8'), sig).ok, true)
})

test('HTTP webhook preserves incoming bytes through signature verification', async () => {
  const { Readable } = await import('node:stream')
  const { default: handler } = await import('../api/stripe-webhook.mjs')
  const t = Math.floor(Date.now() / 1000)
  const raw = Buffer.concat([Buffer.from('{"id":"evt_http_bytes","type":"'), Buffer.from([0x80]), Buffer.from('"}')])
  const digest = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${t}.${raw.toString('utf8')}`).digest('hex')
  const req = Readable.from([raw.subarray(0, 10), raw.subarray(10)])
  req.method = 'POST'
  req.headers = { 'stripe-signature': `t=${t},v1=${digest}` }
  const res = { status(code) { this.code = code; return this }, json(body) { this.body = body } }
  await handler(req, res)
  assert.equal(res.code, 400)
  assert.deepEqual(res.body, { ok: false, reason: 'signature_mismatch' })
})

test('HTTP webhook bounds streamed bodies without trusting Content-Length', async () => {
  const { Readable } = await import('node:stream')
  const { default: handler } = await import('../api/stripe-webhook.mjs')
  const req = Readable.from([Buffer.alloc(1024 * 1024), Buffer.from('x')])
  req.method = 'POST'
  req.headers = { 'content-length': '1' }
  const res = { status(code) { this.code = code; return this }, json(body) { this.body = body } }
  await handler(req, res)
  assert.equal(res.code, 413)
  assert.deepEqual(res.body, { ok: false, reason: 'body_too_large' })
})

test('HTTP webhook settles aborted requests rather than waiting forever for end', async () => {
  const { EventEmitter } = await import('node:events')
  const { default: handler } = await import('../api/stripe-webhook.mjs')
  for (const termination of ['aborted', 'close', 'error']) {
    const req = new EventEmitter()
    req.method = 'POST'
    req.headers = {}
    const res = { status(code) { this.code = code; return this }, json(body) { this.body = body } }
    const pending = handler(req, res)
    req.emit('data', Buffer.from('{'))
    req.emit(termination, new Error('private transport detail'))
    await pending
    assert.equal(res.code, 400)
    assert.deepEqual(res.body, { ok: false, reason: 'body_read_error' })
  }
})
