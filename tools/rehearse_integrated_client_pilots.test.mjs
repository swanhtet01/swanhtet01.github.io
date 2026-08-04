import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  initializeClientWorkspace,
  prepareClientDemo,
} from './prepare_client_demo.mjs'
import {
  CLIENT_BOUND_INTEGRATED_PILOT_CONTRACT,
  INTEGRATED_CLIENT_PILOT_CONTRACT,
  INTEGRATED_CLIENT_PILOT_EVIDENCE_CONTRACT,
  bindIntegratedClientPilot,
  buildIntegratedClientPilotEvidence,
  runIntegratedClientPilots,
  validateIntegratedClientPilotEvidence,
  writeIntegratedClientPilotEvidence,
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

test('isolated Shop lifecycle evidence is commit-bound, explicit, and non-overwriting', async () => {
  const parent = await mkdtemp(resolve(tmpdir(), 'supermega-integrated-pilot-evidence-'))
  const output = resolve(parent, 'evidence.json')
  try {
    const packet = buildIntegratedClientPilotEvidence({
      generatedAt: '2026-08-05T00:00:00.000Z',
      implementation: {
        repository: 'swanhtet01/swanhtet01.github.io',
        origin: 'https://github.com/swanhtet01/swanhtet01.github.io.git',
        branch: 'codex/supermega-enterprise',
        commit: 'a'.repeat(40),
        clean: true,
      },
      pilotReceipt: await runIntegratedClientPilots(),
    })
    assert.equal(packet.contract, INTEGRATED_CLIENT_PILOT_EVIDENCE_CONTRACT)
    assert.equal(packet.pilot.shopLifecycle.status, 'passed_synthetic_isolated')
    assert.deepEqual(packet.pilot.shopLifecycle.stages, [
      'source_intake',
      'shop_confirmation',
      'stock_reservation',
      'preparing',
      'ready',
      'payment_reconciliation',
      'completion',
    ])
    assert.equal(packet.assessment.realNamedPilot, 'not_proven')
    assert.equal(packet.assessment.managedPersistence, 'not_proven')
    assert.equal(packet.controls.containsCustomerValues, false)
    assert.equal(packet.controls.ownerApprovalRecorded, false)
    assert.equal(packet.authority.ownerManualSendApproved, false)
    assert.deepEqual(validateIntegratedClientPilotEvidence(packet), packet)

    const tampered = structuredClone(packet)
    tampered.authority.productionActivationApproved = true
    assert.throws(
      () => validateIntegratedClientPilotEvidence(tampered),
      /integrated_pilot_evidence_packet_invalid/,
    )

    const receipt = await writeIntegratedClientPilotEvidence(output, packet)
    assert.equal(receipt.bytes > 0, true)
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), packet)
    await assert.rejects(
      () => writeIntegratedClientPilotEvidence(output, packet),
      /integrated_pilot_evidence_output_exists/,
    )
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('private client preparation binds to pilot proof without exposing client values or claiming activation', async () => {
  const parent = await mkdtemp(resolve(tmpdir(), 'supermega-client-bound-pilot-'))
  const directory = resolve(parent, 'client')
  try {
    await initializeClientWorkspace({
      directory,
      presetId: 'manufacturing',
      products: ['commerce', 'production', 'website', 'ecommerce'],
    })
    const profilePath = resolve(directory, 'client.json')
    const profile = JSON.parse(await readFile(profilePath, 'utf8'))
    await writeFile(profilePath, JSON.stringify({
      ...profile,
      workspace: 'Private pilot workspace',
      owner: 'Private founder reviewer',
    }), 'utf8')
    const preparation = await prepareClientDemo({
      dataDirectory: directory,
      preparedAt: '2026-07-31T06:00:00.000Z',
    })
    const pilot = await runIntegratedClientPilots()
    const receipt = bindIntegratedClientPilot(preparation, pilot, '2026-07-31T09:00:00.000Z')
    const serialized = JSON.stringify(receipt)

    assert.equal(receipt.contract, CLIENT_BOUND_INTEGRATED_PILOT_CONTRACT)
    assert.equal(receipt.preparation.bundleDigest, preparation.bundleDigest)
    assert.deepEqual(receipt.products.map((product) => product.product), ['commerce', 'production', 'website', 'ecommerce'])
    assert.equal(receipt.workflows.every((workflow) => workflow.status === 'ready_for_local_rehearsal'), true)
    assert.equal(receipt.controls.containsClientValues, false)
    assert.equal(receipt.controls.clientDataApplied, false)
    assert.equal(receipt.controls.syntheticRuntimeProofOnly, true)
    assert.equal(receipt.controls.managedPersistenceProven, false)
    assert.equal(receipt.controls.productionActivationPerformed, false)
    assert.doesNotMatch(serialized, new RegExp(preparation.client.workspace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.doesNotMatch(serialized, new RegExp(preparation.client.owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(receipt.digest, /^sha256:[a-f0-9]{64}$/)

    const tampered = structuredClone(preparation)
    tampered.products[0].rowCount += 1
    assert.throws(
      () => bindIntegratedClientPilot(tampered, pilot, '2026-07-31T09:00:00.000Z'),
      /client_demo_product_validation_drift/,
    )
    assert.throws(
      () => bindIntegratedClientPilot(preparation, { ...pilot, metrics: { ...pilot.metrics, externalWrites: 1 } }, '2026-07-31T09:00:00.000Z'),
      /client_bound_pilot_evidence_invalid/,
    )
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
