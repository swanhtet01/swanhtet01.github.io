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
  assert.equal(
    ledger.gates.find((gate) => gate.id === 'live_product_contract')?.evidence,
    'The exact paired release is verified, but its managed product contract remains isolated_demo.',
  )
  assert.doesNotMatch(JSON.stringify(ledger), /app_product_contract_drift/)
  assert.equal(ledger.products.length, 4)
  assert.equal(ledger.controls.modelCallsRequiredToBuild, 0)
  assert.equal(ledger.founderDecision.target.environment, 'preview_branch')
  assert.equal(ledger.founderDecision.target.maximumLifetimeHours, 24)
  assert.equal(ledger.founderDecision.target.startsWithProductionData, false)
  assert.equal(ledger.founderDecision.operator.productId, 'shop')
  assert.equal(ledger.founderDecision.authority, 'proposal_only')
  assert.equal(ledger.founderDecision.createsAuthority, false)
  assert.equal(ledger.founderDecision.approvalReceipt, null)
  assert.ok(ledger.founderDecision.doesNotAuthorize.includes('production_database_change'))
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

test('rejects a founder decision that can touch production or outlive the bounded rehearsal', () => {
  const ledger = buildManagedPilotReadiness(input)
  ledger.founderDecision.target.production = true
  assert.throws(() => validateManagedPilotReadiness(ledger), /managed_pilot_readiness_founder_decision_invalid/)

  const longLived = buildManagedPilotReadiness(input)
  longLived.founderDecision.target.maximumLifetimeHours = 168
  assert.throws(() => validateManagedPilotReadiness(longLived), /managed_pilot_readiness_founder_decision_invalid/)
})

test('rejects broadened, incomplete, or contradictory proposal authority', () => {
  const broadened = buildManagedPilotReadiness(input)
  broadened.founderDecision.proposedActions.push('production_deploy')
  assert.throws(() => validateManagedPilotReadiness(broadened), /managed_pilot_readiness_founder_decision_invalid/)

  const incomplete = buildManagedPilotReadiness(input)
  incomplete.founderDecision.doesNotAuthorize.pop()
  assert.throws(() => validateManagedPilotReadiness(incomplete), /managed_pilot_readiness_founder_decision_invalid/)

  const contradictory = buildManagedPilotReadiness(input)
  contradictory.founderDecision.doesNotAuthorize[0] = contradictory.founderDecision.proposedActions[0]
  assert.throws(() => validateManagedPilotReadiness(contradictory), /managed_pilot_readiness_founder_decision_invalid/)

  const authoritative = buildManagedPilotReadiness(input)
  authoritative.founderDecision.createsAuthority = true
  authoritative.founderDecision.approvalReceipt = { approvedBy: 'founder' }
  assert.throws(() => validateManagedPilotReadiness(authoritative), /managed_pilot_readiness_founder_decision_invalid/)

  const collapsed = buildManagedPilotReadiness(input)
  collapsed.founderDecision.proposedActions = [collapsed.founderDecision.proposedActions.join(',')]
  collapsed.founderDecision.doesNotAuthorize = [collapsed.founderDecision.doesNotAuthorize.join(',')]
  assert.throws(() => validateManagedPilotReadiness(collapsed), /managed_pilot_readiness_founder_decision_invalid/)
})
