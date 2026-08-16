// Contract tests for the WavePay connector — a SPEND-class integration (creates real payment
// QRs against Myanmar's second-largest wallet; its IPN verifier gates "was this really paid").
// Covers: fail-closed without credentials/order identity, exact hashed create/check request
// shape (self-consistent SHA-256 hash, secret never transmitted), stable provider errors
// without the secret, and forged-notify rejection. `node --test`.
import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { createQR, queryPayment, verifyNotify } from './payment-wavepay.mjs'

const originalFetch = globalThis.fetch
const trackedEnv = ['WAVEPAY_MERCHANT_ID', 'WAVEPAY_STORE_ID', 'WAVEPAY_SECRET_KEY']
const originalEnv = new Map(trackedEnv.map((key) => [key, process.env[key]]))

const MERCHANT = 'wave-merchant-01'
const STORE = 'store-09'
const SECRET = 'wave-secret-key-abc'

const sha256 = (raw) => crypto.createHash('sha256').update(raw, 'utf8').digest('hex')

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  }
}

function configureAll() {
  process.env.WAVEPAY_MERCHANT_ID = MERCHANT
  process.env.WAVEPAY_STORE_ID = STORE
  process.env.WAVEPAY_SECRET_KEY = SECRET
}

beforeEach(() => {
  for (const key of trackedEnv) delete process.env[key]
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('createQR and queryPayment fail closed without credentials or order identity', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }

  assert.equal((await createQR({ amount: 5000, orderId: 'ORD-9' })).reason, 'wavepay_not_configured')
  assert.equal((await queryPayment({ orderId: 'ORD-9' })).reason, 'wavepay_not_configured')

  configureAll()
  assert.equal((await createQR({})).reason, 'wavepay_missing_amount_or_orderId')
  assert.equal((await createQR({ orderId: 'ORD-9' })).reason, 'wavepay_missing_amount_or_orderId')
  assert.equal((await queryPayment({})).reason, 'wavepay_missing_orderId')
  assert.equal(calls, 0)
})

test('createQR posts a correctly hashed create request without transmitting the secret', async () => {
  configureAll()
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, { status: 'CREATED', qr_string: 'QR-STRING', request_id: 'RQ-1' })
  }

  const result = await createQR({ amount: 7000, orderId: 'ORD-9', description: 'Tyre deposit' })
  assert.deepEqual(result, { ok: true, qrString: 'QR-STRING', requestId: 'RQ-1', orderId: 'ORD-9' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://gateway.wavemoney.io/payment/create')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['content-type'], 'application/json')

  const body = JSON.parse(calls[0].options.body)
  assert.equal(body.merchant_id, MERCHANT)
  assert.equal(body.store_id, STORE)
  assert.equal(body.order_id, 'ORD-9') // the merchant order id is the transaction identity
  assert.equal(body.amount, '7000')
  assert.equal(body.currency, 'MMK')
  assert.equal(body.description, 'Tyre deposit')
  assert.equal(Number.isNaN(Date.parse(body.timestamp)), false)
  // Documented hash: SHA-256(merchant_id + store_id + order_id + amount + secret) —
  // the secret feeds the hash and never itself travels.
  assert.equal(body.hash, sha256(MERCHANT + STORE + 'ORD-9' + '7000' + SECRET))
  assert.doesNotMatch(calls[0].options.body, new RegExp(SECRET))
  assert.doesNotMatch(calls[0].url, new RegExp(SECRET))
})

test('queryPayment posts the amount-less status hash keyed by the order id', async () => {
  configureAll()
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, { status: 'PAID', request_id: 'RQ-2' })
  }

  const result = await queryPayment({ orderId: 'ORD-9' })
  assert.deepEqual(result, { ok: true, status: 'PAID', requestId: 'RQ-2', orderId: 'ORD-9' })
  assert.equal(calls[0].url, 'https://gateway.wavemoney.io/payment/check')
  const body = JSON.parse(calls[0].options.body)
  assert.deepEqual(Object.keys(body).sort(), ['hash', 'merchant_id', 'order_id'])
  assert.equal(body.hash, sha256(MERCHANT + STORE + 'ORD-9' + SECRET))
  assert.doesNotMatch(calls[0].options.body, new RegExp(SECRET))
})

test('provider failures return stable reasons without the secret and never throw', async () => {
  configureAll()

  globalThis.fetch = async () => response(500, { hostile: 'gateway stack trace detail' })
  const http = await createQR({ amount: 1000, orderId: 'ORD-9' })
  assert.deepEqual(http, { ok: false, reason: 'wavepay_http_500' })

  globalThis.fetch = async () => response(200, { status: 'DECLINED' })
  const declined = await createQR({ amount: 1000, orderId: 'ORD-9' })
  assert.deepEqual(declined, { ok: false, reason: 'wavepay_create_fail: DECLINED' })

  globalThis.fetch = async () => { throw new Error('connect ETIMEDOUT') }
  const network = await queryPayment({ orderId: 'ORD-9' })
  assert.equal(network.ok, false)
  assert.doesNotMatch(JSON.stringify(network), new RegExp(SECRET))
})

test('verifyNotify accepts only a correctly hashed IPN callback (forged paid-notifies rejected)', () => {
  configureAll()
  const body = {
    merchant_id: MERCHANT,
    store_id: STORE,
    order_id: 'ORD-9',
    amount: '7000',
    status: 'PAID',
    request_id: 'RQ-1',
  }
  const signed = { ...body, hash: sha256(MERCHANT + STORE + 'ORD-9' + '7000' + SECRET) }
  assert.equal(verifyNotify(signed).ok, true)

  // A forged notify with a tampered amount must NOT verify.
  const tampered = { ...signed, amount: '1' }
  assert.deepEqual(verifyNotify(tampered), { ok: false, reason: 'signature_mismatch' })

  assert.deepEqual(verifyNotify({ ...body }), { ok: false, reason: 'missing_hash' })
  assert.deepEqual(verifyNotify('not an object'), { ok: false, reason: 'invalid_payload' })
  assert.deepEqual(verifyNotify(null), { ok: false, reason: 'invalid_payload' })

  // Without the signing secret the verifier must fail closed, not accept blindly.
  delete process.env.WAVEPAY_SECRET_KEY
  assert.deepEqual(verifyNotify(signed), { ok: false, reason: 'wavepay_not_configured' })
})
