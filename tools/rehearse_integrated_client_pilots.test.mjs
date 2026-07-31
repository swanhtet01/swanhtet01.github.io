import assert from 'node:assert/strict'
import test from 'node:test'

import {
  INTEGRATED_CLIENT_PILOT_CONTRACT,
  runIntegratedClientPilots,
} from './rehearse_integrated_client_pilots.mjs'

test('four-product client pilot closes two channel orders and creates one demand-bound Plant job', async () => {
  const receipt = await runIntegratedClientPilots()

  assert.equal(receipt.ok, true)
  assert.equal(receipt.contract, INTEGRATED_CLIENT_PILOT_CONTRACT)
  assert.deepEqual(receipt.products, ['Website', 'Ecommerce', 'Shop', 'Plant'])
  assert.equal(receipt.outcomes.website.orderStatus, 'completed')
  assert.equal(receipt.outcomes.ecommerce.orderStatus, 'completed')
  assert.equal(receipt.outcomes.shop.reconciledOrderCount, 2)
  assert.equal(receipt.outcomes.shop.sourceBoundOrderCount, 2)
  assert.equal(receipt.outcomes.plant.sourceAuthority, 'commerce')
  assert.equal(receipt.outcomes.plant.targetAuthority, 'production')
  assert.ok(receipt.outcomes.plant.demandOrderIds.includes(receipt.outcomes.ecommerce.shopOrderId))
  assert.match(receipt.outcomes.website.releaseFingerprint, /^web-[a-f0-9]{8}$/)
  assert.match(receipt.outcomes.ecommerce.previewDigest, /^sha256:[a-f0-9]{64}$/)
  assert.match(receipt.outcomes.plant.demandDigest, /^sha256:[a-f0-9]{64}$/)
  assert.deepEqual(receipt.metrics, {
    productCount: 4,
    completedOrders: 2,
    reconciledPayments: 2,
    demandBoundPlantJobs: 1,
    humanControlledActions: 16,
    externalWrites: 0,
    networkRequests: 0,
    modelCalls: 0,
  })
  assert.deepEqual(receipt.controls, {
    syntheticFixture: true,
    managedPersistenceProven: false,
    productionActivationPerformed: false,
    customerMessageSent: false,
    paymentProviderCalled: false,
    deliveryProviderCalled: false,
    connectorCalls: 0,
    humanReviewRequired: true,
  })
})

test('integrated pilot receipt is deterministic', async () => {
  const first = await runIntegratedClientPilots()
  const second = await runIntegratedClientPilots()

  assert.deepEqual(second, first)
})
