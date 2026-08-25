import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RELEASE_STACK_OWNER_GATE_CONTRACT,
  assessReleaseStackOwnerGates,
  validateReleaseStackOwnerGate,
} from './verify_release_stack_owner_gates.mjs'

const repository = 'swanhtet01/swanhtet01.github.io'
const requiredProducts = ['shop', 'plant', 'website', 'ecommerce']
const requiredChecks = [
  'SuperMega App CI',
  'Dependency Security Audit',
  'Kernel Console - Verify & Owner-Gated Release',
]
const requiredApprovals = [
  'github_push',
  'pull_request_creation',
  'merge',
  'production_release',
  'vercel_deploy_or_promotion',
  'supabase_schema_or_data_write',
  'credential_change',
  'customer_contact',
  'payment_or_refund',
  'stock_movement',
  'domain_or_publish_change',
  'managed_activation',
]
const hqChain = 'node tools/record_postgres17_rehearsal.mjs --verify && node tools/verify_supabase_security_advisor_audit.mjs && node tools/manage_technical_estate.mjs --verify && node tools/manage_managed_pilot_readiness.mjs --verify && node tools/prepare_supabase_preview_rehearsal_proposal.mjs --verify && node tools/prepare_github_main_protection_packet.mjs --verify && node tools/verify_release_stack_owner_gates.mjs --verify && node tools/verify_shop_pilot_launch_gate.mjs --verify && node tools/verify_hq_contract.mjs'

function input(overrides = {}) {
  const packageManifest = {
    supermega: { productionSupabaseTargetStatus: 'protected-unapproved' },
    scripts: {
      'release:owner-gates:verify': 'node tools/verify_release_stack_owner_gates.mjs --verify',
      'release:owner-gates:self-test': 'node --test tools/verify_release_stack_owner_gates.test.mjs && node tools/verify_release_stack_owner_gates.mjs --self-test',
      'release:branch-push:apply': 'node tools/apply_review_branch_push.mjs',
      'release:branch-push:apply:self-test': 'node --test tools/apply_review_branch_push.test.mjs && node tools/apply_review_branch_push.mjs --self-test',
      'shop:pilot:launch-gate:verify': 'node tools/verify_shop_pilot_launch_gate.mjs --verify',
      'shop:pilot:launch-gate:self-test': 'node --test tools/verify_shop_pilot_launch_gate.test.mjs && node tools/verify_shop_pilot_launch_gate.mjs --self-test',
      'hq:verify': hqChain,
    },
  }
  const technicalEstate = {
    schemaVersion: 'supermega.technical-estate.v1',
    canonicalSource: { repository, directProductionDeploymentAllowed: false },
    products: requiredProducts.map((productId) => ({ productId })),
    sharedCapabilities: [{ id: 'ai-assistance', classification: 'shared-capability-not-product' }],
    lifecycle: { currentPriority: 'shop-first-managed-pilot-readiness', nextProductSequence: [...requiredProducts] },
    ownerGates: {
      requiredApprovalFor: [...requiredApprovals],
      productionWritesAllowed: false,
      externalEffectsAllowed: false,
      autoMergeAllowed: false,
      localSubagentsAllowedByDefault: false,
    },
  }
  const readiness = {
    contract: 'supermega.managed-pilot-readiness.v5',
    pilotMode: 'owner_named',
    overall: {
      status: 'blocked',
      hostedActivationReady: false,
      blockingGateCount: 3,
      blockingGateIds: ['preview_rehearsal', 'pilot_evidence', 'production_activation'],
    },
    liveProduction: { operatingMode: 'isolated_demo', managedWritesEnabled: false, productionMutationAuthorized: false },
    previewRehearsal: {
      proofComplete: false,
      productionRefsRejected: true,
      productionDataRejected: true,
      privilegedRuntimeCredentialsRejected: true,
    },
    pilotEvidence: {
      productId: 'shop',
      proofComplete: false,
      requiredAcceptedConsecutiveRuns: 20,
      acceptedConsecutiveRuns: 0,
      syntheticEvidenceAccepted: false,
      publicIdentityAllowed: false,
      privateWorkspaceRequired: true,
    },
    controls: {
      externalWritesPerformed: false,
      productionWritesEnabled: false,
      ownerApprovalRequired: true,
      safeAutomatedActions: ['rebuild_local_evidence', 'verify_current_ledger', 'rehearse_local_client_package'],
      forbiddenUntilReady: ['deploy', 'publish', 'production_write', 'customer_message', 'payment', 'hosted_scheduler_activation'],
    },
  }
  const githubProposal = {
    contract: 'supermega.github-main-protection-proposal.v1',
    repository,
    mode: 'owner_approval_required',
    verifierCompatibility: { requiredChecks: [...requiredChecks], simulatedOk: true },
    controls: {
      githubWritesApproved: false,
      githubWritesPerformed: false,
      repositorySettingsMutated: false,
      branchMutated: false,
      pullRequestCreated: false,
      mergePerformed: false,
      deploymentPerformed: false,
      supabaseMutated: false,
      credentialValuesRequired: false,
    },
  }
  const supabaseProposal = {
    contract: 'supermega.supabase-preview-rehearsal-proposal.v1',
    repository,
    mode: 'owner_approval_required',
    state: 'prepared-not-executed',
    previewBranch: {
      kind: 'clean_empty_ephemeral_preview',
      maximumLifetimeHours: 24,
      startsWithProductionData: false,
      seedProductionDataAllowed: false,
      productionRefsAllowed: false,
      privilegedRuntimeCredentialsAllowed: false,
      deleteAfterEvidence: true,
      failedBranchReuseAllowed: false,
    },
    migrationPlan: {
      schemaVersion: 13,
      chainDigest: `sha256:${'c'.repeat(64)}`,
      productionApplyAllowed: false,
    },
    requiredEvidence: [
      'metadata-only-schema-fingerprint-comparison',
      'public-table-rls-and-anon-authenticated-denial',
      'private-schema-backend-role-policy-and-no-browser-grants',
      'private-storage-six-request-privacy-proof',
      'branch-deleted-after-evidence',
      'no-production-retry-on-failure',
    ],
    controls: {
      supabaseBranchCreationApproved: false,
      supabaseBranchCreated: false,
      supabaseBranchDeleted: false,
      providerMutationsPerformed: false,
      productionProjectMutated: false,
      productionDataCopied: false,
      productionRowsRead: false,
      privilegedRuntimeCredentialsIncluded: false,
      managedActivationAllowed: false,
      vercelDeploymentAllowed: false,
      githubWritesAllowed: false,
      customerContactAllowed: false,
      paymentOrStockActionAllowed: false,
    },
  }
  return {
    repository,
    packageManifest,
    technicalEstate,
    readiness,
    githubProposal,
    supabaseProposal,
    gitState: {
      branch: 'codex/release-stack-integration-rehearsal',
      head: 'a'.repeat(40),
      clean: true,
      originMain: 'b'.repeat(40),
      aheadOfOriginMain: 4,
      diffShortstat: ' 8 files changed, 120 insertions(+), 3 deletions(-)',
    },
    generatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  }
}

test('passes only when all release-stack owner gates are closed and explicit', () => {
  const report = assessReleaseStackOwnerGates(input())
  assert.equal(report.contract, RELEASE_STACK_OWNER_GATE_CONTRACT)
  assert.equal(report.ok, true)
  assert.equal(report.status, 'owner_gates_pending')
  assert.deepEqual(report.products.customerProducts, requiredProducts)
  assert.equal(report.products.firstPilotProduct, 'shop')
  assert.equal(report.products.aiIsSharedCapability, true)
  assert.deepEqual(report.nextOwnerGateIds, [
    'github_main_protection',
    'push_and_pr',
    'supabase_preview_rehearsal',
    'paired_vercel_preview_release',
    'shop_pilot_evidence',
    'managed_activation',
  ])
  assert.equal(report.controls.githubWritesAllowed, false)
  assert.equal(report.controls.supabaseWritesAllowed, false)
  assert.equal(report.controls.vercelDeployAllowed, false)
  assert.equal(report.controls.managedActivationAllowed, false)
  assert.equal(validateReleaseStackOwnerGate(report), report)
})

test('fails closed for dirty worktree and external-effect authority', () => {
  const dirty = assessReleaseStackOwnerGates(input({ gitState: { ...input().gitState, clean: false } }))
  assert.equal(dirty.ok, false)
  assert.ok(dirty.failures.includes('release_stack_owner_gate_worktree_dirty'))

  const external = assessReleaseStackOwnerGates(input({
    technicalEstate: {
      ...input().technicalEstate,
      ownerGates: { ...input().technicalEstate.ownerGates, externalEffectsAllowed: true },
    },
  }))
  assert.equal(external.ok, false)
  assert.ok(external.failures.includes('release_stack_owner_gate_estate_owner_gates_invalid'))
})

test('rejects fifth-product AI, weak GitHub checks, and unsafe Supabase preview data', () => {
  const fifthProduct = assessReleaseStackOwnerGates(input({
    technicalEstate: {
      ...input().technicalEstate,
      products: [...input().technicalEstate.products, { productId: 'ai' }],
    },
  }))
  assert.equal(fifthProduct.ok, false)
  assert.ok(fifthProduct.failures.includes('release_stack_owner_gate_product_set_invalid'))

  const weakGithub = assessReleaseStackOwnerGates(input({
    githubProposal: {
      ...input().githubProposal,
      verifierCompatibility: { requiredChecks: requiredChecks.slice(1), simulatedOk: true },
    },
  }))
  assert.equal(weakGithub.ok, false)
  assert.ok(weakGithub.failures.includes('release_stack_owner_gate_github_proposal_invalid'))

  const unsafeSupabase = assessReleaseStackOwnerGates(input({
    supabaseProposal: {
      ...input().supabaseProposal,
      previewBranch: { ...input().supabaseProposal.previewBranch, startsWithProductionData: true },
    },
  }))
  assert.equal(unsafeSupabase.ok, false)
  assert.ok(unsafeSupabase.failures.includes('release_stack_owner_gate_supabase_proposal_invalid'))
})

test('rejects tampered reports', () => {
  const report = assessReleaseStackOwnerGates(input())
  assert.throws(
    () => validateReleaseStackOwnerGate({ ...report, status: 'ready_to_release' }),
    /release_stack_owner_gate_digest_invalid/,
  )
  assert.throws(
    () => validateReleaseStackOwnerGate({ ...report, digest: `sha256:${'f'.repeat(64)}` }),
    /release_stack_owner_gate_digest_invalid/,
  )
})
