import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const { decideEcommerceAttention } = await import(
  pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'ecommerce-next-action.ts')).href
)

const base = {
  agedRequestCount: 0,
  expiringQuoteCount: 0,
  paymentAttentionCount: 0,
  paymentRiskCount: 0,
  pendingRequestCount: 0,
  refundAttentionCount: 0,
  stockRiskCount: 0,
}

test('rejects invalid counts', () => {
  assert.throws(() => decideEcommerceAttention({ ...base, stockRiskCount: -1 }), /non-negative safe integers/)
  assert.throws(() => decideEcommerceAttention({ ...base, pendingRequestCount: 1.5 }), /non-negative safe integers/)
  assert.throws(() => decideEcommerceAttention({ ...base, refundAttentionCount: Infinity }), /non-negative safe integers/)
})

test('returns no attention action when the queue is clear', () => {
  assert.equal(decideEcommerceAttention(base), null)
})

test('prioritizes refunds, then payment, before request risks', () => {
  const refund = decideEcommerceAttention({ ...base, refundAttentionCount: 1, paymentAttentionCount: 2, stockRiskCount: 3 })
  assert.equal(refund?.kind, 'shop-orders')
  assert.equal(refund?.action, 'Review refunds in Shop')

  const payment = decideEcommerceAttention({ ...base, paymentAttentionCount: 2, stockRiskCount: 3 })
  assert.equal(payment?.kind, 'shop-orders')
  assert.equal(payment?.action, 'Review payments in Shop')
})

test('prioritizes stock risk, expiring quotes, payment requests, aged requests, then the normal queue', () => {
  const stock = decideEcommerceAttention({ ...base, stockRiskCount: 2, expiringQuoteCount: 2, agedRequestCount: 2, pendingRequestCount: 4 })
  assert.equal(stock?.filter, 'stock')
  assert.equal(stock?.action, 'Review stock-risk request')

  const expiring = decideEcommerceAttention({ ...base, expiringQuoteCount: 2, agedRequestCount: 2, pendingRequestCount: 4 })
  assert.equal(expiring?.filter, 'expiring')
  assert.equal(expiring?.headline, '2 quotes expire soon')

  const paymentRisk = decideEcommerceAttention({ ...base, paymentRiskCount: 2, agedRequestCount: 2, pendingRequestCount: 4 })
  assert.equal(paymentRisk?.filter, 'payment')
  assert.equal(paymentRisk?.action, 'Review payment request')

  const aged = decideEcommerceAttention({ ...base, agedRequestCount: 1, pendingRequestCount: 4 })
  assert.equal(aged?.filter, 'aged')
  assert.equal(aged?.headline, '1 request has waited over 30 minutes')

  const pending = decideEcommerceAttention({ ...base, pendingRequestCount: 4 })
  assert.equal(pending?.filter, 'all')
  assert.equal(pending?.action, 'Review next request')
})
