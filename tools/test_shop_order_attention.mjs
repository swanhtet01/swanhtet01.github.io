import assert from 'node:assert/strict'
import test from 'node:test'

import { shopOrderAttentionLabels } from '../showroom/src/core/shop-order-attention.ts'

test('an unpaid order with an on-time promise shows payment due only', () => {
  assert.deepEqual(
    shopOrderAttentionLabels({ paymentStatus: 'pending', refundStatus: 'none' }, 'scheduled'),
    [{ kind: 'payment', text: 'payment due', tone: 'pending' }],
  )
})

test('an unpaid order with a late promise keeps payment and fulfilment signals separate', () => {
  assert.deepEqual(
    shopOrderAttentionLabels({ paymentStatus: 'pending', refundStatus: 'none' }, 'late'),
    [
      { kind: 'payment', text: 'payment due', tone: 'pending' },
      { kind: 'promise', text: 'Order late', tone: 'late' },
    ],
  )
})

test('a paid order with a late promise does not show payment due', () => {
  assert.deepEqual(
    shopOrderAttentionLabels({ paymentStatus: 'reconciled', refundStatus: 'none' }, 'late'),
    [{ kind: 'promise', text: 'Order late', tone: 'late' }],
  )
})

test('payment due, refund due, and a late promise remain distinct signals', () => {
  assert.deepEqual(
    shopOrderAttentionLabels({ paymentStatus: 'pending', refundStatus: 'due' }, 'late'),
    [
      { kind: 'payment', text: 'payment due', tone: 'pending' },
      { kind: 'refund', text: 'refund due', tone: 'pending' },
      { kind: 'promise', text: 'Order late', tone: 'late' },
    ],
  )
})
