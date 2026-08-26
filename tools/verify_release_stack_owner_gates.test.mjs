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
const hqChain = 'node tools/record_postgres17_rehearsal.mjs --verify && node tools/verify_supabase_security_advisor_audit.mjs && node tools/manage_technical_estate.mjs --verify && node tools/manage_managed_pilot_readiness.mjs --verify && node tools/prepare_supabase_preview_rehearsal_proposal.mjs --verify && node tools/prepare_github_main_protection_packet.mjs --verify && node tools/verify_release_stack_owner_gates.mjs --verify && npm run github:main-protection:apply:self-test && npm run github:main-protection:owner-action-card:self-test && npm run github:main-protection:snapshot:self-test && npm run release:branch-push:apply:self-test && npm run release:pull-request:create:self-test && npm run operator:board:self-test && npm run operating:action-board:self-test && npm run operational:action-packet:self-test && npm run operating:action-board:verify && npm run supermega:status:brief:self-test && npm run product:readiness-matrix:self-test && npm run release:next-action-preflight:self-test && npm run release:owner-approval:packet:self-test && npm run release:control-index:self-test && npm run admin:technical-coordination:self-test && npm run release:artifact-family:self-test && npm run shop:pilot:intake-packet:self-test && npm run shop:pilot:baseline-packet:self-test && npm run shop:pilot:day0-readiness:self-test && npm run shop:pilot:day0-owner-baseline-card:self-test && npm run shop:pilot:owner-observation-pack:self-test && npm run shop:pilot:decision-packet:self-test && npm run shop:pilot:day0-readiness && npm run shop:receipt:print-geometry:self-test && npm run shop:receipt:print-geometry:verify && node tools/verify_shop_pilot_launch_gate.mjs --verify && npm run strategy:posture:verify && node tools/verify_hq_contract.mjs'
const hqRunner = 'node tools/run_hq_verify.mjs'

function input(overrides = {}) {
  const packageManifest = {
    supermega: { productionSupabaseTargetStatus: 'protected-unapproved' },
    scripts: {
      'release:owner-gates:verify': 'node tools/verify_release_stack_owner_gates.mjs --verify',
      'release:owner-gates:self-test': 'node --test tools/verify_release_stack_owner_gates.test.mjs && node tools/verify_release_stack_owner_gates.mjs --self-test && npm run release:owner-approval:packet:self-test',
      'release:branch-push:apply': 'node tools/apply_review_branch_push.mjs',
      'release:branch-push:apply:self-test': 'node --test tools/apply_review_branch_push.test.mjs && node tools/apply_review_branch_push.mjs --self-test',
      'release:pull-request:create': 'node tools/apply_release_pull_request.mjs',
      'release:pull-request:create:self-test': 'node --test tools/apply_release_pull_request.test.mjs && node tools/apply_release_pull_request.mjs --self-test',
      'release:owner-approval:packet': 'node tools/prepare_release_owner_approval_packet.mjs',
      'release:owner-approval:packet:self-test': 'node --test tools/prepare_release_owner_approval_packet.test.mjs && node tools/prepare_release_owner_approval_packet.mjs --self-test',
      'github:main-protection:apply:plan': 'node tools/apply_github_main_protection.mjs --plan',
      'github:main-protection:apply:self-test': 'node --test tools/apply_github_main_protection.test.mjs && node tools/apply_github_main_protection.mjs --self-test',
      'github:main-protection:owner-action-card': 'node tools/prepare_github_main_protection_owner_action_card.mjs',
      'github:main-protection:owner-action-card:self-test': 'node --test tools/prepare_github_main_protection_owner_action_card.test.mjs && node tools/prepare_github_main_protection_owner_action_card.mjs --self-test',
      'github:main-protection:snapshot': 'node tools/collect_github_main_protection_snapshot.mjs',
      'github:main-protection:snapshot:self-test': 'node --test tools/collect_github_main_protection_snapshot.test.mjs && node tools/collect_github_main_protection_snapshot.mjs --self-test',
      'operator:board': 'node tools/prepare_current_operator_board.mjs',
      'operator:board:self-test': 'node --test tools/prepare_current_operator_board.test.mjs && node tools/prepare_current_operator_board.mjs --self-test',
      'admin:technical-coordination': 'node tools/prepare_admin_technical_coordination_packet.mjs',
      'admin:technical-coordination:self-test': 'node --test tools/prepare_admin_technical_coordination_packet.test.mjs && node tools/prepare_admin_technical_coordination_packet.mjs --self-test',
      'operating:action-board:verify': 'node tools/verify_operating_action_board.mjs',
      'operating:action-board:self-test': 'node --test kernel/operating-action-board.test.mjs && node tools/verify_operating_action_board.mjs --self-test',
      'operational:action-packet': 'node tools/prepare_operational_report_action_packet.mjs',
      'operational:action-packet:self-test': 'node --test tools/prepare_operational_report_action_packet.test.mjs && node tools/prepare_operational_report_action_packet.mjs --self-test',
      'supermega:status:brief': 'node tools/prepare_supermega_status_brief.mjs',
      'supermega:status:brief:self-test': 'node --test tools/prepare_supermega_status_brief.test.mjs && node tools/prepare_supermega_status_brief.mjs --self-test',
      'product:readiness-matrix': 'node tools/prepare_product_readiness_matrix.mjs',
      'product:readiness-matrix:self-test': 'node --test tools/prepare_product_readiness_matrix.test.mjs && node tools/prepare_product_readiness_matrix.mjs --self-test',
      'release:next-action-preflight': 'node tools/prepare_next_release_action_preflight.mjs',
      'release:next-action-preflight:self-test': 'node --test tools/prepare_next_release_action_preflight.test.mjs && node tools/prepare_next_release_action_preflight.mjs --self-test',
      'shop:pilot:intake-packet': 'node tools/prepare_shop_pilot_private_intake_packet.mjs',
      'shop:pilot:intake-packet:self-test': 'node --test tools/prepare_shop_pilot_private_intake_packet.test.mjs && node tools/prepare_shop_pilot_private_intake_packet.mjs --self-test',
      'shop:pilot:baseline-packet': 'node tools/prepare_shop_pilot_baseline_packet.mjs',
      'shop:pilot:baseline-packet:self-test': 'node --test tools/prepare_shop_pilot_baseline_packet.test.mjs && node tools/prepare_shop_pilot_baseline_packet.mjs --self-test',
      'shop:pilot:day0-readiness': 'node tools/prepare_shop_pilot_day0_readiness_packet.mjs',
      'shop:pilot:day0-readiness:self-test': 'node --test tools/prepare_shop_pilot_day0_readiness_packet.test.mjs && node tools/prepare_shop_pilot_day0_readiness_packet.mjs --self-test',
      'shop:pilot:day0-owner-baseline-card': 'node tools/prepare_shop_pilot_day0_owner_baseline_action_card.mjs',
      'shop:pilot:day0-owner-baseline-card:self-test': 'node --test tools/prepare_shop_pilot_day0_owner_baseline_action_card.test.mjs && node tools/prepare_shop_pilot_day0_owner_baseline_action_card.mjs --self-test',
      'shop:pilot:owner-observation-pack': 'node tools/prepare_shop_pilot_owner_observation_pack.mjs',
      'shop:pilot:owner-observation-pack:self-test': 'node --test tools/prepare_shop_pilot_owner_observation_pack.test.mjs && node tools/prepare_shop_pilot_owner_observation_pack.mjs --self-test',
      'shop:pilot:decision-packet': 'node tools/prepare_shop_pilot_decision_packet.mjs',
      'shop:pilot:decision-packet:self-test': 'node --test tools/prepare_shop_pilot_decision_packet.test.mjs && node tools/prepare_shop_pilot_decision_packet.mjs --self-test',
      'shop:receipt:print-geometry:verify': 'node tools/verify_shop_receipt_print_geometry.mjs',
      'shop:receipt:print-geometry:self-test': 'node --test tools/verify_shop_receipt_print_geometry.test.mjs && node tools/verify_shop_receipt_print_geometry.mjs --self-test',
      'shop:pilot:launch-gate:verify': 'node tools/verify_shop_pilot_launch_gate.mjs --verify',
      'shop:pilot:launch-gate:self-test': 'node --test tools/verify_shop_pilot_launch_gate.test.mjs && node tools/verify_shop_pilot_launch_gate.mjs --self-test',
      'hq:verify': hqRunner,
      'hq:verify:steps': hqChain,
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
      requiredPilotDayIndexes: [1, 2, 3, 4, 5],
      acceptedConsecutivePilotDayIndexes: [],
      pilotSequenceCoverageMet: false,
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
  assert.match(report.requiredOwnerGates.find((gate) => gate.id === 'shop_pilot_evidence').evidence, /pilot days 1 through 5/)
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
