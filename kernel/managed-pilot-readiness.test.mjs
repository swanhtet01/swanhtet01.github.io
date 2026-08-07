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
const sourceReceipts = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((path) => ({ path, digest: readinessDigest(path) }))
const input = {
  portfolio: { schemaVersion: 'supermega.hq.portfolio.v3', products },
  databaseEvidence: {
    schemaVersion: 'supermega.hq.database-rehearsal.v2',
    recordedAt: '2026-07-31T10:00:00.000Z',
    checks: {
      ...Object.fromEntries(Array.from({ length: 53 }, (_, index) => [`check${index}`, true])),
      publicBrowserQuarantineEnforced: true,
      publicBrowserQuarantineIdempotent: true,
      restoredPublicBrowserQuarantinePreserved: true,
    },
    storage: { hostedStoragePrivacyProofRequired: true },
    localVerification: { externallyHosted: false },
  },
  storageAudit: 'Status: local verifier ready; hosted proof blocked',
  securityAudit: {
    contract: 'supermega.supabase-security-advisor-audit.v1',
    asOf: '2026-08-04T05:28:37.850Z',
    projectRef: 'abcdefghijklmnopqrst',
    targetClassification: 'protected-production',
    postgres: { major: 17 },
    advisor: { status: 'blocked', findingCount: 27 },
    catalog: { sequenceCount: 2, nonTableRelationCount: 0, publicRoutineCount: 0, browserCallableRoutineCount: 0 },
    managedBackend: { liveSchemaVersion: 7, localTargetVersion: 10, versionDrift: 3, browserRolesDenied: true, metadataRlsEnabled: false, storageBucketCount: 0 },
    conclusion: { productionMutationAuthorized: false, indirectExposureAudited: true, nextAction: 'Rehearse hardening on an isolated target.' },
    controls: { databaseWrites: 0 },
  },
  hqNow: 'Live operating mode: `isolated_demo`\nLive managed persistence ready: `false`\nLive security ready: `false`\nexact current-head verification reports release drift\nNo named pilot customer',
  packageManifest: { supermega: { productionSupabaseTargetStatus: 'protected-unapproved', productionSupabaseProjectRef: 'abcdefghijklmnopqrst' } },
  sourceReceipts,
}

test('derives one blocked four-product ledger from current bounded evidence', () => {
  const ledger = buildManagedPilotReadiness(input)
  assert.equal(ledger.overall.blockingGateCount, 7)
  assert.equal(ledger.gates[0].status, 'ready-local')
  assert.equal(
    ledger.gates.find((gate) => gate.id === 'security')?.evidence,
    '27 fail-closed public-table advisor findings remain; browser object/default grants are not yet quarantined on hosted Supabase, and protected managed schema v7 trails local target v10.',
  )
  assert.doesNotMatch(JSON.stringify(ledger), /app_product_contract_drift/)
  assert.equal(ledger.products.length, 4)
  assert.equal(ledger.controls.modelCallsRequiredToBuild, 0)
  assert.equal(ledger.asOf, '2026-08-04T05:28:37.850Z')
  assert.equal(
    ledger.overall.nextAction,
    'Approve one isolated non-production Supabase target and one named Shop pilot operator; protected production remains unchanged.',
  )
  assert.equal(ledger.gates.at(-1)?.id, 'production_activation')
  assert.equal(ledger.gates.at(-1)?.status, 'blocked')
  assert.equal(ledger.controls.productionWritesEnabled, false)
  assert.equal(ledger.controls.ownerApprovalRequired, true)
  assert.ok(ledger.controls.forbiddenUntilReady.includes('production_write'))
  assert.ok(ledger.controls.forbiddenUntilReady.includes('deploy'))
  assert.ok(ledger.controls.forbiddenUntilReady.includes('hosted_scheduler_activation'))
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

test('rejects evidence or ledger state that could touch protected production', () => {
  const approvedTarget = structuredClone(input)
  approvedTarget.packageManifest.supermega.productionSupabaseTargetStatus = 'approved'
  assert.throws(() => buildManagedPilotReadiness(approvedTarget), /managed_pilot_readiness_production_boundary_invalid/)

  const mutationAuthorized = structuredClone(input)
  mutationAuthorized.securityAudit.conclusion.productionMutationAuthorized = true
  assert.throws(() => buildManagedPilotReadiness(mutationAuthorized), /managed_pilot_readiness_security_audit_invalid/)

  const writesPerformed = structuredClone(input)
  writesPerformed.securityAudit.controls.databaseWrites = 1
  assert.throws(() => buildManagedPilotReadiness(writesPerformed), /managed_pilot_readiness_security_audit_invalid/)

  const productionEnabled = buildManagedPilotReadiness(input)
  productionEnabled.controls.productionWritesEnabled = true
  assert.throws(() => validateManagedPilotReadiness(productionEnabled), /managed_pilot_readiness_controls_invalid/)

  const activationUnlocked = buildManagedPilotReadiness(input)
  activationUnlocked.gates.at(-1).status = 'ready-hosted'
  assert.throws(() => validateManagedPilotReadiness(activationUnlocked), /managed_pilot_readiness_gates_invalid/)
})

test('rejects broadened, incomplete, or contradictory ledger authority', () => {
  const broadened = buildManagedPilotReadiness(input)
  broadened.controls.ownerApprovalRequired = false
  assert.throws(() => validateManagedPilotReadiness(broadened), /managed_pilot_readiness_controls_invalid/)

  const selfDirected = buildManagedPilotReadiness(input)
  selfDirected.products[0].automationStatus = 'autonomous'
  assert.throws(() => validateManagedPilotReadiness(selfDirected), /managed_pilot_readiness_products_invalid/)

  const incomplete = buildManagedPilotReadiness(input)
  incomplete.gates.pop()
  assert.throws(() => validateManagedPilotReadiness(incomplete), /managed_pilot_readiness_gates_invalid/)

  const contradictory = buildManagedPilotReadiness(input)
  contradictory.overall.hostedActivationReady = true
  assert.throws(() => validateManagedPilotReadiness(contradictory), /managed_pilot_readiness_overall_invalid/)

  const tampered = buildManagedPilotReadiness(input)
  tampered.sourceReceipts = tampered.sourceReceipts.slice(0, -1)
  assert.throws(() => validateManagedPilotReadiness(tampered), /managed_pilot_readiness_digest_invalid/)
})
