import assert from 'node:assert/strict'
import test from 'node:test'

import { shopOrderAttentionLabels } from '../showroom/src/core/shop-order-attention.ts'

test('an unpaid order with an on-time promise shows unpaid only', () => {
  assert.deepEqual(
    shopOrderAttentionLabels({ paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'delivery' }, 'scheduled'),
    [{ kind: 'payment', text: 'Unpaid', tone: 'pending' }],
  )
})

test('an unpaid order with a late delivery promise keeps payment and promise signals separate', () => {
  assert.deepEqual(
    shopOrderAttentionLabels({ paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'delivery' }, 'late'),
    [
      { kind: 'payment', text: 'Unpaid', tone: 'pending' },
      { kind: 'promise', text: 'Promise missed', tone: 'late' },
    ],
  )
})

test('a paid order with a late pickup promise does not show unpaid', () => {
  assert.deepEqual(
    shopOrderAttentionLabels({ paymentStatus: 'reconciled', refundStatus: 'none', fulfilment: 'pickup' }, 'late'),
    [{ kind: 'promise', text: 'Promise missed', tone: 'late' }],
  )
})

test('unpaid, refund due, and a late unclassified promise remain distinct signals', () => {
  assert.deepEqual(
    shopOrderAttentionLabels({ paymentStatus: 'pending', refundStatus: 'due' }, 'late'),
    [
      { kind: 'payment', text: 'Unpaid', tone: 'pending' },
      { kind: 'refund', text: 'refund due', tone: 'pending' },
      { kind: 'promise', text: 'Promise missed', tone: 'late' },
    ],
  )
})

test('an unpaid delivery order due soon is not marked late', () => {
  assert.deepEqual(
    shopOrderAttentionLabels({ paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'delivery' }, 'due_soon'),
    [
      { kind: 'payment', text: 'Unpaid', tone: 'pending' },
      { kind: 'promise', text: 'due soon', tone: 'pending' },
    ],
  )
})

test('an unrecorded fulfilment promise is described accurately', () => {
  assert.deepEqual(
    shopOrderAttentionLabels({ paymentStatus: 'pending', refundStatus: 'none' }, 'unrecorded'),
    [
      { kind: 'payment', text: 'Unpaid', tone: 'pending' },
      { kind: 'promise', text: 'promise not recorded', tone: 'pending' },
    ],
  )
})
