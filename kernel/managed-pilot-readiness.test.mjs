import test from 'node:test'
import assert from 'node:assert/strict'

import { buildManagedPilotReadiness, readinessDigest, validateManagedPilotReadiness } from './managed-pilot-readiness.mjs'

const products = ['shop', 'plant', 'website', 'ecommerce'].map((id) => ({
  id,
  status: 'release-candidate-local',
  nextGate: `${id} hosted proof`,
  localAutomation: {
    contract: 'supermega.product-work-authority.v2',
    productId: id,
    workOrderId: `${id}-managed-pilot`,
    status: 'owner-gated',
    workOrder: `${id}: run managed pilot`,
    reason: 'Named operator and isolated tenant are missing.',
  },
}))
const sourceReceipts = ['a', 'b', 'c', 'd', 'e', 'f'].map((path) => ({ path, digest: readinessDigest(path) }))
const input = {
  portfolio: { schemaVersion: 'supermega.hq.portfolio.v3', products },
  databaseEvidence: {
    schemaVersion: 'supermega.hq.database-rehearsal.v2',
    recordedAt: '2026-07-31T10:00:00.000Z',
    checks: Object.fromEntries(Array.from({ length: 52 }, (_, index) => [`check${index}`, true])),
    storage: { hostedStoragePrivacyProofRequired: true },
    localVerification: { externallyHosted: false },
  },
  storageAudit: 'Status: local verifier ready; hosted proof blocked',
  hqNow: 'Live operating mode: `isolated_demo`\nLive managed persistence ready: `false`\nLive security ready: `false`\nno release drift is present\nNo named pilot customer',
  packageManifest: { supermega: { productionSupabaseTargetStatus: 'protected-unapproved' } },
  sourceReceipts,
}

test('derives one blocked four-product ledger from current bounded evidence', () => {
  const ledger = buildManagedPilotReadiness(input)
  assert.equal(ledger.overall.blockingGateCount, 7)
  assert.equal(ledger.gates[0].status, 'ready-local')
  assert.equal(ledger.products.length, 4)
  assert.equal(ledger.controls.modelCallsRequiredToBuild, 0)
  assert.equal(validateManagedPilotReadiness(ledger), ledger)
})

test('text evidence digests are stable across Git line-ending normalization', () => {
  assert.equal(readinessDigest('line one\r\nline two\r\n'), readinessDigest('line one\nline two\n'))
})

test('rejects hosted overclaims and product authority drift', () => {
  const hosted = structuredClone(input)
  hosted.hqNow = hosted.hqNow.replace('`false`', '`true`')
  assert.throws(() => buildManagedPilotReadiness(hosted), /managed_pilot_readiness_live_boundary_invalid/)
  const ungated = structuredClone(input)
  ungated.portfolio.products[0].localAutomation.status = 'ready-local'
  assert.throws(() => buildManagedPilotReadiness(ungated), /managed_pilot_readiness_product_invalid/)
})
