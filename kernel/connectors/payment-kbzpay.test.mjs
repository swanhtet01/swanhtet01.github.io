// Contract tests for the KBZPay connector — a SPEND-class integration (creates real payment
// QRs against Myanmar's largest wallet; its IPN verifier is the "was this really paid" gate).
// Covers: fail-closed without credentials/order identity, exact signed precreate/query request
// shape (self-consistent MD5 signature, secret never transmitted), sandbox routing, stable
// provider errors without the secret, and forged-notify rejection. `node --test`.
import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { createQR, queryPayment, verifyNotify } from './payment-kbzpay.mjs'

const originalFetch = globalThis.fetch
const trackedEnv = ['KBZPAY_APP_ID', 'KBZPAY_MERCH_CODE', 'KBZPAY_APP_SECRET', 'KBZPAY_NOTIFY_URL', 'KBZPAY_SANDBOX']
const originalEnv = new Map(trackedEnv.map((key) => [key, process.env[key]]))

const APP_ID = 'kbz-app-0001'
const MERCH_CODE = 'merch-0077'
const SECRET = 'kbz-signing-secret-abc'

// Mirror of the documented KBZPay sign scheme: sorted key=value pairs (excluding `sign` and
// empty values), '&key=<secret>' appended, MD5, uppercase hex.
function md5Sign(params, secret) {
  const sorted = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== '' && params[k] != null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHash('md5').update(`${sorted}&key=${secret}`, 'utf8').digest('hex').toUpperCase()
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  }
}

function configureAll() {
  process.env.KBZPAY_APP_ID = APP_ID
  process.env.KBZPAY_MERCH_CODE = MERCH_CODE
  process.env.KBZPAY_APP_SECRET = SECRET
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

  assert.equal((await createQR({ amount: 5000, orderId: 'ORD-1' })).reason, 'kbzpay_not_configured')
  assert.equal((await queryPayment({ orderId: 'ORD-1' })).reason, 'kbzpay_not_configured')

  configureAll()
  assert.equal((await createQR({})).reason, 'kbzpay_missing_amount_or_orderId')
  assert.equal((await createQR({ amount: 5000 })).reason, 'kbzpay_missing_amount_or_orderId')
  assert.equal((await queryPayment({})).reason, 'kbzpay_missing_orderId')
  assert.equal(calls, 0)
})

test('createQR posts a correctly signed precreate request without transmitting the secret', async () => {
  configureAll()
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, { return_code: 'SUCCESS', result: { qrCode: 'QR-DATA', prepay_id: 'PP-1' } })
  }

  const result = await createQR({ amount: 4999.6, orderId: 'ORD-1', title: 'Tyre deposit' })
  assert.deepEqual(result, { ok: true, qrCode: 'QR-DATA', prepayId: 'PP-1', orderId: 'ORD-1' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.kbzpay.com/payment/gateway/precreate')
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['content-type'], 'application/json')

  const body = JSON.parse(calls[0].options.body)
  assert.equal(body.appid, APP_ID)
  assert.equal(body.merch_code, MERCH_CODE)
  assert.equal(body.merch_order_id, 'ORD-1') // the merchant order id is the transaction identity
  assert.equal(body.trade_type, 'PAYSCORE')
  assert.equal(body.title, 'Tyre deposit')
  assert.equal(body.total_amount, '5000') // rounded, stringified kyat
  assert.equal(body.notify_url, 'https://console.supermega.dev/api/kbzpay-notify')
  assert.match(body.timestamp, /^\d{10}$/)
  // Self-consistent signature over the exact transmitted fields — and the secret itself
  // never appears anywhere in the request.
  const { sign: transmittedSign, ...unsigned } = body
  assert.equal(transmittedSign, md5Sign(unsigned, SECRET))
  assert.doesNotMatch(calls[0].options.body, new RegExp(SECRET))
  assert.doesNotMatch(calls[0].url, new RegExp(SECRET))
})

test('KBZPAY_SANDBOX=true routes to the UAT gateway', async () => {
  configureAll()
  process.env.KBZPAY_SANDBOX = 'true'
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return response(200, { return_code: 'SUCCESS', result: {} })
  }
  await createQR({ amount: 1000, orderId: 'ORD-UAT' })
  assert.equal(calls[0], 'https://api.kbzpay.com/payment/gateway/uat/precreate')
})

test('queryPayment posts a signed status query keyed by the merchant order id', async () => {
  configureAll()
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return response(200, { return_code: 'SUCCESS', result: { trade_status: 'PAY_SUCCESS', trade_no: 'TN-9' } })
  }

  const result = await queryPayment({ orderId: 'ORD-1' })
  assert.deepEqual(result, { ok: true, status: 'PAY_SUCCESS', tradeNo: 'TN-9', orderId: 'ORD-1' })
  assert.equal(calls[0].url, 'https://api.kbzpay.com/payment/gateway/query')
  const body = JSON.parse(calls[0].options.body)
  assert.equal(body.merch_order_id, 'ORD-1')
  const { sign: transmittedSign, ...unsigned } = body
  assert.equal(transmittedSign, md5Sign(unsigned, SECRET))
  assert.doesNotMatch(calls[0].options.body, new RegExp(SECRET))
})

test('provider failures return stable reasons without the secret and never throw', async () => {
  configureAll()

  globalThis.fetch = async () => response(500, { hostile: 'gateway stack trace detail' })
  const http = await createQR({ amount: 1000, orderId: 'ORD-1' })
  assert.deepEqual(http, { ok: false, reason: 'kbzpay_http_500' })

  globalThis.fetch = async () => response(200, { return_code: 'FAIL', return_msg: 'declined' })
  const declined = await createQR({ amount: 1000, orderId: 'ORD-1' })
  assert.equal(declined.ok, false)
  assert.match(declined.reason, /^kbzpay_precreate_fail: /)
  assert.doesNotMatch(JSON.stringify(declined), new RegExp(SECRET))

  globalThis.fetch = async () => { throw new Error('connect ETIMEDOUT') }
  const network = await queryPayment({ orderId: 'ORD-1' })
  assert.equal(network.ok, false)
  assert.doesNotMatch(JSON.stringify(network), new RegExp(SECRET))
})

test('verifyNotify accepts only a correctly signed IPN callback (forged paid-notifies rejected)', () => {
  configureAll()
  const body = {
    merch_order_id: 'ORD-1',
    total_amount: '5000',
    trade_status: 'PAY_SUCCESS',
    timestamp: '1783819200',
  }
  const signed = { ...body, sign: md5Sign(body, SECRET) }
  assert.equal(verifyNotify(signed).ok, true)

  // A forged notify with a tampered amount must NOT verify.
  const tampered = { ...signed, total_amount: '1' }
  assert.deepEqual(verifyNotify(tampered), { ok: false, reason: 'signature_mismatch' })

  assert.deepEqual(verifyNotify({ ...body }), { ok: false, reason: 'missing_sign' })
  assert.deepEqual(verifyNotify('not an object'), { ok: false, reason: 'invalid_payload' })
  assert.deepEqual(verifyNotify(null), { ok: false, reason: 'invalid_payload' })

  // Without the signing secret the verifier must fail closed, not accept blindly.
  delete process.env.KBZPAY_APP_SECRET
  assert.deepEqual(verifyNotify(signed), { ok: false, reason: 'kbzpay_not_configured' })
})
