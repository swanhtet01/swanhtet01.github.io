#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateManagedPilotReadiness } from '../kernel/managed-pilot-readiness.mjs'
import { validateGitHubMainProtectionPacket } from './prepare_github_main_protection_packet.mjs'
import { validateSupabasePreviewRehearsalProposal } from './prepare_supabase_preview_rehearsal_proposal.mjs'
import { validateTechnicalEstate } from './manage_technical_estate.mjs'

export const RELEASE_STACK_OWNER_GATE_CONTRACT = 'supermega.release-stack-owner-gate.v1'

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const REQUIRED_PRODUCTS = ['shop', 'plant', 'website', 'ecommerce']
const REQUIRED_MAIN_CHECKS = [
  'SuperMega App CI',
  'Dependency Security Audit',
  'Kernel Console - Verify & Owner-Gated Release',
]
const REQUIRED_OWNER_APPROVALS = [
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
const REQUIRED_BLOCKING_GATES = ['preview_rehearsal', 'pilot_evidence', 'production_activation']
const REQUIRED_SAFE_AUTOMATED_ACTIONS = ['rebuild_local_evidence', 'verify_current_ledger', 'rehearse_local_client_package']
const REQUIRED_FORBIDDEN_ACTIONS = [
  'deploy',
  'publish',
  'production_write',
  'customer_message',
  'payment',
  'hosted_scheduler_activation',
]
const HQ_VERIFY_RUNNER = 'node tools/run_hq_verify.mjs'
const EXPECTED_HQ_VERIFY_CHAIN = 'node tools/record_postgres17_rehearsal.mjs --verify && node tools/verify_supabase_security_advisor_audit.mjs && node tools/manage_technical_estate.mjs --verify && node tools/manage_managed_pilot_readiness.mjs --verify && node tools/prepare_supabase_preview_rehearsal_proposal.mjs --verify && node tools/prepare_github_main_protection_packet.mjs --verify && node tools/verify_release_stack_owner_gates.mjs --verify && npm run github:main-protection:apply:self-test && npm run github:main-protection:owner-action-card:self-test && npm run github:main-protection:snapshot:self-test && npm run release:branch-push:apply:self-test && npm run release:pull-request:create:self-test && npm run operator:board:self-test && npm run operating:action-board:self-test && npm run operational:action-packet:self-test && npm run operating:action-board:verify && npm run supermega:status:brief:self-test && npm run product:readiness-matrix:self-test && npm run release:next-action-preflight:self-test && npm run release:owner-approval:packet:self-test && npm run release:control-index:self-test && npm run admin:technical-coordination:self-test && npm run release:artifact-family:self-test && npm run shop:pilot:intake-packet:self-test && npm run shop:pilot:baseline-packet:self-test && npm run shop:pilot:day0-readiness:self-test && npm run shop:pilot:day0-owner-baseline-card:self-test && npm run shop:pilot:owner-observation-pack:self-test && npm run shop:pilot:decision-packet:self-test && npm run shop:pilot:day0-readiness && npm run shop:receipt:print-geometry:self-test && npm run shop:receipt:print-geometry:verify && node tools/verify_shop_pilot_launch_gate.mjs --verify && npm run strategy:posture:verify && node tools/verify_hq_contract.mjs'
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
}

function includesAll(actual, expected) {
  return Array.isArray(actual) && expected.every((value) => actual.includes(value))
}

function addFailure(failures, code) {
  if (!failures.includes(code)) failures.push(code)
}

function hasSecretShape(value) {
  const text = JSON.stringify(value || {})
  return SECRET_PATTERNS.some((pattern) => pattern.test(text))
}

function falseOnly(record, keys) {
  return isRecord(record) && keys.every((key) => record[key] === false)
}

function gate(id, label, status, blocks, requiredApproval, evidence) {
  return { id, label, status, blocks, requiredApproval, evidence }
}

export function assessReleaseStackOwnerGates(input = {}) {
  const failures = []
  const packageManifest = input.packageManifest || {}
  const scripts = packageManifest.scripts || {}
  const technicalEstate = input.technicalEstate || {}
  const readiness = input.readiness || {}
  const githubProposal = input.githubProposal || {}
  const supabaseProposal = input.supabaseProposal || {}
  const gitState = input.gitState || {}

  if (input.repository !== REPOSITORY) addFailure(failures, 'release_stack_owner_gate_repository_invalid')
  if (packageManifest.supermega?.productionSupabaseTargetStatus !== 'protected-unapproved') {
    addFailure(failures, 'release_stack_owner_gate_supabase_target_status_invalid')
  }
  if (scripts['release:owner-gates:verify'] !== 'node tools/verify_release_stack_owner_gates.mjs --verify') {
    addFailure(failures, 'release_stack_owner_gate_package_script_missing')
  }
  if (scripts['release:owner-gates:self-test'] !== 'node --test tools/verify_release_stack_owner_gates.test.mjs && node tools/verify_release_stack_owner_gates.mjs --self-test && npm run release:owner-approval:packet:self-test') {
    addFailure(failures, 'release_stack_owner_gate_self_test_script_missing')
  }
  if (scripts['release:branch-push:apply'] !== 'node tools/apply_review_branch_push.mjs') {
    addFailure(failures, 'release_stack_owner_gate_branch_push_apply_script_missing')
  }
  if (scripts['release:branch-push:apply:self-test'] !== 'node --test tools/apply_review_branch_push.test.mjs && node tools/apply_review_branch_push.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_branch_push_apply_self_test_missing')
  }
  if (scripts['release:pull-request:create'] !== 'node tools/apply_release_pull_request.mjs') {
    addFailure(failures, 'release_stack_owner_gate_pull_request_create_script_missing')
  }
  if (scripts['release:pull-request:create:self-test'] !== 'node --test tools/apply_release_pull_request.test.mjs && node tools/apply_release_pull_request.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_pull_request_create_self_test_missing')
  }
  if (scripts['release:owner-approval:packet'] !== 'node tools/prepare_release_owner_approval_packet.mjs') {
    addFailure(failures, 'release_stack_owner_gate_owner_approval_packet_script_missing')
  }
  if (scripts['release:owner-approval:packet:self-test'] !== 'node --test tools/prepare_release_owner_approval_packet.test.mjs && node tools/prepare_release_owner_approval_packet.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_owner_approval_packet_self_test_missing')
  }
  if (scripts['release:next-action-preflight'] !== 'node tools/prepare_next_release_action_preflight.mjs') {
    addFailure(failures, 'release_stack_owner_gate_next_action_preflight_script_missing')
  }
  if (scripts['release:next-action-preflight:self-test'] !== 'node --test tools/prepare_next_release_action_preflight.test.mjs && node tools/prepare_next_release_action_preflight.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_next_action_preflight_self_test_missing')
  }
  if (scripts['github:main-protection:apply:plan'] !== 'node tools/apply_github_main_protection.mjs --plan') {
    addFailure(failures, 'release_stack_owner_gate_github_apply_plan_script_missing')
  }
  if (scripts['github:main-protection:apply:self-test'] !== 'node --test tools/apply_github_main_protection.test.mjs && node tools/apply_github_main_protection.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_github_apply_self_test_missing')
  }
  if (scripts['github:main-protection:owner-action-card'] !== 'node tools/prepare_github_main_protection_owner_action_card.mjs') {
    addFailure(failures, 'release_stack_owner_gate_github_owner_action_card_script_missing')
  }
  if (scripts['github:main-protection:owner-action-card:self-test'] !== 'node --test tools/prepare_github_main_protection_owner_action_card.test.mjs && node tools/prepare_github_main_protection_owner_action_card.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_github_owner_action_card_self_test_missing')
  }
  if (scripts['github:main-protection:snapshot'] !== 'node tools/collect_github_main_protection_snapshot.mjs') {
    addFailure(failures, 'release_stack_owner_gate_github_snapshot_script_missing')
  }
  if (scripts['github:main-protection:snapshot:self-test'] !== 'node --test tools/collect_github_main_protection_snapshot.test.mjs && node tools/collect_github_main_protection_snapshot.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_github_snapshot_self_test_missing')
  }
  if (scripts['operator:board'] !== 'node tools/prepare_current_operator_board.mjs') {
    addFailure(failures, 'release_stack_owner_gate_operator_board_script_missing')
  }
  if (scripts['operator:board:self-test'] !== 'node --test tools/prepare_current_operator_board.test.mjs && node tools/prepare_current_operator_board.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_operator_board_self_test_missing')
  }
  if (scripts['admin:technical-coordination'] !== 'node tools/prepare_admin_technical_coordination_packet.mjs') {
    addFailure(failures, 'release_stack_owner_gate_admin_technical_coordination_script_missing')
  }
  if (scripts['admin:technical-coordination:self-test'] !== 'node --test tools/prepare_admin_technical_coordination_packet.test.mjs && node tools/prepare_admin_technical_coordination_packet.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_admin_technical_coordination_self_test_missing')
  }
  if (scripts['operating:action-board:verify'] !== 'node tools/verify_operating_action_board.mjs') {
    addFailure(failures, 'release_stack_owner_gate_operating_action_board_script_missing')
  }
  if (scripts['operating:action-board:self-test'] !== 'node --test kernel/operating-action-board.test.mjs && node tools/verify_operating_action_board.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_operating_action_board_self_test_missing')
  }
  if (scripts['operational:action-packet'] !== 'node tools/prepare_operational_report_action_packet.mjs') {
    addFailure(failures, 'release_stack_owner_gate_operational_action_packet_script_missing')
  }
  if (scripts['operational:action-packet:self-test'] !== 'node --test tools/prepare_operational_report_action_packet.test.mjs && node tools/prepare_operational_report_action_packet.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_operational_action_packet_self_test_missing')
  }
  if (scripts['supermega:status:brief'] !== 'node tools/prepare_supermega_status_brief.mjs') {
    addFailure(failures, 'release_stack_owner_gate_status_brief_script_missing')
  }
  if (scripts['supermega:status:brief:self-test'] !== 'node --test tools/prepare_supermega_status_brief.test.mjs && node tools/prepare_supermega_status_brief.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_status_brief_self_test_missing')
  }
  if (scripts['product:readiness-matrix'] !== 'node tools/prepare_product_readiness_matrix.mjs') {
    addFailure(failures, 'release_stack_owner_gate_product_readiness_matrix_script_missing')
  }
  if (scripts['product:readiness-matrix:self-test'] !== 'node --test tools/prepare_product_readiness_matrix.test.mjs && node tools/prepare_product_readiness_matrix.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_product_readiness_matrix_self_test_missing')
  }
  if (scripts['shop:pilot:launch-gate:verify'] !== 'node tools/verify_shop_pilot_launch_gate.mjs --verify') {
    addFailure(failures, 'release_stack_owner_gate_shop_launch_gate_script_missing')
  }
  if (scripts['shop:pilot:launch-gate:self-test'] !== 'node --test tools/verify_shop_pilot_launch_gate.test.mjs && node tools/verify_shop_pilot_launch_gate.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_shop_launch_gate_self_test_script_missing')
  }
  if (scripts['shop:pilot:intake-packet'] !== 'node tools/prepare_shop_pilot_private_intake_packet.mjs') {
    addFailure(failures, 'release_stack_owner_gate_shop_intake_packet_script_missing')
  }
  if (scripts['shop:pilot:intake-packet:self-test'] !== 'node --test tools/prepare_shop_pilot_private_intake_packet.test.mjs && node tools/prepare_shop_pilot_private_intake_packet.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_shop_intake_packet_self_test_script_missing')
  }
  if (scripts['shop:pilot:baseline-packet'] !== 'node tools/prepare_shop_pilot_baseline_packet.mjs') {
    addFailure(failures, 'release_stack_owner_gate_shop_baseline_packet_script_missing')
  }
  if (scripts['shop:pilot:baseline-packet:self-test'] !== 'node --test tools/prepare_shop_pilot_baseline_packet.test.mjs && node tools/prepare_shop_pilot_baseline_packet.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_shop_baseline_packet_self_test_script_missing')
  }
  if (scripts['shop:pilot:day0-readiness'] !== 'node tools/prepare_shop_pilot_day0_readiness_packet.mjs') {
    addFailure(failures, 'release_stack_owner_gate_shop_day0_readiness_script_missing')
  }
  if (scripts['shop:pilot:day0-readiness:self-test'] !== 'node --test tools/prepare_shop_pilot_day0_readiness_packet.test.mjs && node tools/prepare_shop_pilot_day0_readiness_packet.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_shop_day0_readiness_self_test_script_missing')
  }
  if (scripts['shop:pilot:day0-owner-baseline-card'] !== 'node tools/prepare_shop_pilot_day0_owner_baseline_action_card.mjs') {
    addFailure(failures, 'release_stack_owner_gate_shop_day0_owner_baseline_card_script_missing')
  }
  if (scripts['shop:pilot:day0-owner-baseline-card:self-test'] !== 'node --test tools/prepare_shop_pilot_day0_owner_baseline_action_card.test.mjs && node tools/prepare_shop_pilot_day0_owner_baseline_action_card.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_shop_day0_owner_baseline_card_self_test_script_missing')
  }
  if (scripts['shop:pilot:owner-observation-pack'] !== 'node tools/prepare_shop_pilot_owner_observation_pack.mjs') {
    addFailure(failures, 'release_stack_owner_gate_shop_owner_observation_pack_script_missing')
  }
  if (scripts['shop:pilot:owner-observation-pack:self-test'] !== 'node --test tools/prepare_shop_pilot_owner_observation_pack.test.mjs && node tools/prepare_shop_pilot_owner_observation_pack.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_shop_owner_observation_pack_self_test_script_missing')
  }
  if (scripts['shop:pilot:decision-packet'] !== 'node tools/prepare_shop_pilot_decision_packet.mjs') {
    addFailure(failures, 'release_stack_owner_gate_shop_decision_packet_script_missing')
  }
  if (scripts['shop:pilot:decision-packet:self-test'] !== 'node --test tools/prepare_shop_pilot_decision_packet.test.mjs && node tools/prepare_shop_pilot_decision_packet.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_shop_decision_packet_self_test_script_missing')
  }
  if (scripts['shop:receipt:print-geometry:verify'] !== 'node tools/verify_shop_receipt_print_geometry.mjs') {
    addFailure(failures, 'release_stack_owner_gate_shop_receipt_print_geometry_script_missing')
  }
  if (scripts['shop:receipt:print-geometry:self-test'] !== 'node --test tools/verify_shop_receipt_print_geometry.test.mjs && node tools/verify_shop_receipt_print_geometry.mjs --self-test') {
    addFailure(failures, 'release_stack_owner_gate_shop_receipt_print_geometry_self_test_script_missing')
  }
  if (scripts['hq:verify'] !== HQ_VERIFY_RUNNER) addFailure(failures, 'release_stack_owner_gate_hq_runner_missing')
  if (scripts['hq:verify:steps'] !== EXPECTED_HQ_VERIFY_CHAIN) addFailure(failures, 'release_stack_owner_gate_hq_chain_missing')

  if (technicalEstate.schemaVersion !== 'supermega.technical-estate.v1') addFailure(failures, 'release_stack_owner_gate_estate_contract_invalid')
  if (technicalEstate.canonicalSource?.repository !== REPOSITORY) addFailure(failures, 'release_stack_owner_gate_estate_repository_invalid')
  if (technicalEstate.canonicalSource?.directProductionDeploymentAllowed !== false) addFailure(failures, 'release_stack_owner_gate_direct_production_allowed')
  if (!sameArray((technicalEstate.products || []).map((product) => product.productId), REQUIRED_PRODUCTS)) {
    addFailure(failures, 'release_stack_owner_gate_product_set_invalid')
  }
  if ((technicalEstate.sharedCapabilities || []).length !== 1
    || technicalEstate.sharedCapabilities?.[0]?.id !== 'ai-assistance'
    || technicalEstate.sharedCapabilities?.[0]?.classification !== 'shared-capability-not-product') {
    addFailure(failures, 'release_stack_owner_gate_ai_product_boundary_invalid')
  }
  if (technicalEstate.lifecycle?.currentPriority !== 'shop-first-managed-pilot-readiness'
    || !sameArray(technicalEstate.lifecycle?.nextProductSequence, REQUIRED_PRODUCTS)) {
    addFailure(failures, 'release_stack_owner_gate_lifecycle_order_invalid')
  }
  if (!includesAll(technicalEstate.ownerGates?.requiredApprovalFor, REQUIRED_OWNER_APPROVALS)
    || technicalEstate.ownerGates?.productionWritesAllowed !== false
    || technicalEstate.ownerGates?.externalEffectsAllowed !== false
    || technicalEstate.ownerGates?.autoMergeAllowed !== false
    || technicalEstate.ownerGates?.localSubagentsAllowedByDefault !== false) {
    addFailure(failures, 'release_stack_owner_gate_estate_owner_gates_invalid')
  }

  if (readiness.contract !== 'supermega.managed-pilot-readiness.v5') addFailure(failures, 'release_stack_owner_gate_readiness_contract_invalid')
  if (readiness.pilotMode !== 'owner_named') addFailure(failures, 'release_stack_owner_gate_pilot_mode_invalid')
  if (readiness.overall?.status !== 'blocked'
    || readiness.overall?.hostedActivationReady !== false
    || readiness.overall?.blockingGateCount !== REQUIRED_BLOCKING_GATES.length
    || !sameArray(readiness.overall?.blockingGateIds, REQUIRED_BLOCKING_GATES)) {
    addFailure(failures, 'release_stack_owner_gate_readiness_overall_invalid')
  }
  if (readiness.liveProduction?.operatingMode !== 'isolated_demo'
    || readiness.liveProduction?.managedWritesEnabled !== false
    || readiness.liveProduction?.productionMutationAuthorized !== false) {
    addFailure(failures, 'release_stack_owner_gate_live_production_boundary_invalid')
  }
  if (readiness.previewRehearsal?.proofComplete !== false
    || readiness.previewRehearsal?.productionRefsRejected !== true
    || readiness.previewRehearsal?.productionDataRejected !== true
    || readiness.previewRehearsal?.privilegedRuntimeCredentialsRejected !== true) {
    addFailure(failures, 'release_stack_owner_gate_preview_gate_invalid')
  }
  if (readiness.pilotEvidence?.productId !== 'shop'
    || readiness.pilotEvidence?.proofComplete !== false
    || readiness.pilotEvidence?.requiredAcceptedConsecutiveRuns !== 20
    || readiness.pilotEvidence?.acceptedConsecutiveRuns !== 0
    || readiness.pilotEvidence?.syntheticEvidenceAccepted !== false
    || readiness.pilotEvidence?.publicIdentityAllowed !== false
    || readiness.pilotEvidence?.privateWorkspaceRequired !== true) {
    addFailure(failures, 'release_stack_owner_gate_pilot_evidence_invalid')
  }
  if (readiness.controls?.externalWritesPerformed !== false
    || readiness.controls?.productionWritesEnabled !== false
    || readiness.controls?.ownerApprovalRequired !== true
    || !sameArray(readiness.controls?.safeAutomatedActions, REQUIRED_SAFE_AUTOMATED_ACTIONS)
    || !sameArray(readiness.controls?.forbiddenUntilReady, REQUIRED_FORBIDDEN_ACTIONS)) {
    addFailure(failures, 'release_stack_owner_gate_readiness_controls_invalid')
  }

  if (githubProposal.contract !== 'supermega.github-main-protection-proposal.v1'
    || githubProposal.repository !== REPOSITORY
    || githubProposal.mode !== 'owner_approval_required'
    || !sameArray(githubProposal.verifierCompatibility?.requiredChecks, REQUIRED_MAIN_CHECKS)
    || githubProposal.verifierCompatibility?.simulatedOk !== true
    || !falseOnly(githubProposal.controls, [
      'githubWritesApproved',
      'githubWritesPerformed',
      'repositorySettingsMutated',
      'branchMutated',
      'pullRequestCreated',
      'mergePerformed',
      'deploymentPerformed',
      'supabaseMutated',
      'credentialValuesRequired',
    ])) {
    addFailure(failures, 'release_stack_owner_gate_github_proposal_invalid')
  }

  if (supabaseProposal.contract !== 'supermega.supabase-preview-rehearsal-proposal.v1'
    || supabaseProposal.repository !== REPOSITORY
    || supabaseProposal.mode !== 'owner_approval_required'
    || supabaseProposal.state !== 'prepared-not-executed'
    || supabaseProposal.previewBranch?.kind !== 'clean_empty_ephemeral_preview'
    || supabaseProposal.previewBranch?.maximumLifetimeHours !== 24
    || supabaseProposal.previewBranch?.startsWithProductionData !== false
    || supabaseProposal.previewBranch?.seedProductionDataAllowed !== false
    || supabaseProposal.previewBranch?.productionRefsAllowed !== false
    || supabaseProposal.previewBranch?.privilegedRuntimeCredentialsAllowed !== false
    || supabaseProposal.previewBranch?.deleteAfterEvidence !== true
    || supabaseProposal.previewBranch?.failedBranchReuseAllowed !== false
    || supabaseProposal.migrationPlan?.schemaVersion !== 13
    || !/^sha256:[0-9a-f]{64}$/.test(String(supabaseProposal.migrationPlan?.chainDigest || ''))
    || supabaseProposal.migrationPlan?.productionApplyAllowed !== false
    || !includesAll(supabaseProposal.requiredEvidence, [
      'metadata-only-schema-fingerprint-comparison',
      'public-table-rls-and-anon-authenticated-denial',
      'private-schema-backend-role-policy-and-no-browser-grants',
      'private-storage-six-request-privacy-proof',
      'branch-deleted-after-evidence',
      'no-production-retry-on-failure',
    ])
    || !falseOnly(supabaseProposal.controls, [
      'supabaseBranchCreationApproved',
      'supabaseBranchCreated',
      'supabaseBranchDeleted',
      'providerMutationsPerformed',
      'productionProjectMutated',
      'productionDataCopied',
      'productionRowsRead',
      'privilegedRuntimeCredentialsIncluded',
      'managedActivationAllowed',
      'vercelDeploymentAllowed',
      'githubWritesAllowed',
      'customerContactAllowed',
      'paymentOrStockActionAllowed',
    ])) {
    addFailure(failures, 'release_stack_owner_gate_supabase_proposal_invalid')
  }

  if (gitState.clean !== true) addFailure(failures, 'release_stack_owner_gate_worktree_dirty')
  if (!/^[0-9a-f]{40}$/.test(String(gitState.head || ''))) addFailure(failures, 'release_stack_owner_gate_head_invalid')
  if (!gitState.branch || typeof gitState.branch !== 'string') addFailure(failures, 'release_stack_owner_gate_branch_invalid')
  if (Number.isInteger(gitState.aheadOfOriginMain) && gitState.aheadOfOriginMain < 1) {
    addFailure(failures, 'release_stack_owner_gate_no_review_delta')
  }

  if (hasSecretShape({
    technicalEstate,
    readiness,
    githubProposal,
    supabaseProposal,
  })) {
    addFailure(failures, 'release_stack_owner_gate_secret_shape_detected')
  }

  const body = {
    contract: RELEASE_STACK_OWNER_GATE_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: input.generatedAt || new Date().toISOString(),
    repository: REPOSITORY,
    status: failures.length ? 'failed' : 'owner_gates_pending',
    ok: failures.length === 0,
    candidate: {
      branch: gitState.branch || null,
      head: gitState.head || null,
      clean: gitState.clean === true,
      originMain: gitState.originMain || null,
      aheadOfOriginMain: Number.isInteger(gitState.aheadOfOriginMain) ? gitState.aheadOfOriginMain : null,
      diffShortstat: gitState.diffShortstat || null,
    },
    products: {
      customerProducts: REQUIRED_PRODUCTS,
      firstPilotProduct: 'shop',
      aiIsSharedCapability: true,
    },
    readiness: {
      contract: readiness.contract || null,
      pilotMode: readiness.pilotMode || null,
      hostedActivationReady: readiness.overall?.hostedActivationReady === true,
      blockingGateIds: Array.isArray(readiness.overall?.blockingGateIds) ? [...readiness.overall.blockingGateIds] : [],
      liveOperatingMode: readiness.liveProduction?.operatingMode || null,
      managedWritesEnabled: readiness.liveProduction?.managedWritesEnabled === true,
    },
    requiredOwnerGates: [
      gate('github_main_protection', 'GitHub main protection settings write', 'owner_approval_required', true, true, 'Source proposal prepared; read-only evidence still must verify protection after owner-approved settings write.'),
      gate('push_and_pr', 'Push and pull request creation', 'owner_approval_required', true, true, 'Local branch is reviewable only after explicit push and PR approval.'),
      gate('supabase_preview_rehearsal', 'Clean Supabase preview rehearsal', 'owner_approval_required', true, true, 'Source proposal prepared; no branch may be created without separate approval.'),
      gate('paired_vercel_preview_release', 'Paired Vercel preview and production promotion', 'owner_approval_required', true, true, 'Exact reviewed SHA must be previewed and owner-promoted as a pair.'),
      gate('shop_pilot_evidence', 'Owner-named Shop pilot evidence', 'owner_approval_required', true, true, '20 consecutive accepted operator-reviewed runs are required for promotion evidence.'),
      gate('managed_activation', 'Managed production activation', 'owner_approval_required', true, true, 'Production remains isolated-demo until every hosted proof passes and owner approves exact activation.'),
    ],
    proposals: {
      githubMainProtection: {
        contract: githubProposal.contract || null,
        mode: githubProposal.mode || null,
        requiredChecks: Array.isArray(githubProposal.verifierCompatibility?.requiredChecks) ? [...githubProposal.verifierCompatibility.requiredChecks] : [],
        writesApproved: githubProposal.controls?.githubWritesApproved === true,
        writesPerformed: githubProposal.controls?.githubWritesPerformed === true,
      },
      supabasePreviewRehearsal: {
        contract: supabaseProposal.contract || null,
        mode: supabaseProposal.mode || null,
        state: supabaseProposal.state || null,
        previewKind: supabaseProposal.previewBranch?.kind || null,
        maximumLifetimeHours: supabaseProposal.previewBranch?.maximumLifetimeHours ?? null,
        chainDigest: supabaseProposal.migrationPlan?.chainDigest || null,
        branchCreated: supabaseProposal.controls?.supabaseBranchCreated === true,
        productionProjectMutated: supabaseProposal.controls?.productionProjectMutated === true,
      },
    },
    controls: {
      githubWritesAllowed: false,
      supabaseWritesAllowed: false,
      vercelDeployAllowed: false,
      productionReleaseAllowed: false,
      customerContactAllowed: false,
      paymentOrStockActionAllowed: false,
      managedActivationAllowed: false,
      localSubagentsAllowedByDefault: false,
      externalEffectsAllowed: false,
      noWriteVerification: true,
    },
    nextOwnerGateIds: [
      'github_main_protection',
      'push_and_pr',
      'supabase_preview_rehearsal',
      'paired_vercel_preview_release',
      'shop_pilot_evidence',
      'managed_activation',
    ],
    failures,
  }
  return { ...body, digest: digest(JSON.stringify(body)) }
}

export function validateReleaseStackOwnerGate(report) {
  if (!isRecord(report) || report.contract !== RELEASE_STACK_OWNER_GATE_CONTRACT) {
    throw new Error('release_stack_owner_gate_contract_invalid')
  }
  const { digest: actualDigest, ...body } = report
  if (actualDigest !== digest(JSON.stringify(body))) throw new Error('release_stack_owner_gate_digest_invalid')
  if (report.ok !== true || report.status !== 'owner_gates_pending' || report.failures?.length !== 0) {
    throw new Error('release_stack_owner_gate_not_passing')
  }
  if (report.controls?.noWriteVerification !== true
    || report.controls?.githubWritesAllowed !== false
    || report.controls?.supabaseWritesAllowed !== false
    || report.controls?.vercelDeployAllowed !== false
    || report.controls?.managedActivationAllowed !== false) {
    throw new Error('release_stack_owner_gate_controls_invalid')
  }
  return report
}

function git(args, { optional = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1_000_000,
    windowsHide: true,
  })
  const output = String(result.stdout || '').trim()
  if (!optional && result.status !== 0) {
    throw new Error(`release_stack_owner_gate_git_failed:${args.join(' ')}`)
  }
  return result.status === 0 ? output : null
}

function currentGitState() {
  const statusText = git(['status', '--porcelain'])
  const originMain = git(['rev-parse', '--verify', 'origin/main'], { optional: true })
  const aheadText = originMain ? git(['rev-list', '--count', 'origin/main..HEAD'], { optional: true }) : null
  const aheadOfOriginMain = aheadText == null || aheadText === '' ? null : Number.parseInt(aheadText, 10)
  return {
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    head: git(['rev-parse', 'HEAD']),
    clean: statusText.length === 0,
    originMain,
    aheadOfOriginMain: Number.isSafeInteger(aheadOfOriginMain) ? aheadOfOriginMain : null,
    diffShortstat: originMain ? git(['diff', '--shortstat', 'origin/main..HEAD'], { optional: true }) : null,
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'))
}

function runNoWriteVerifier(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 2_000_000,
    windowsHide: true,
  })
  if (result.status !== 0) {
    const error = String(result.stderr || result.stdout || 'failed').replace(/\s+/g, ' ').slice(0, 220)
    throw new Error(`release_stack_owner_gate_dependency_failed:${args.join(' ')}:${error}`)
  }
}

async function currentReport() {
  runNoWriteVerifier(['tools/manage_technical_estate.mjs', '--verify'])
  runNoWriteVerifier(['tools/manage_managed_pilot_readiness.mjs', '--verify'])
  runNoWriteVerifier(['tools/prepare_supabase_preview_rehearsal_proposal.mjs', '--verify'])
  runNoWriteVerifier(['tools/prepare_github_main_protection_packet.mjs', '--verify'])

  const packageManifest = await readJson('package.json')
  const technicalEstate = validateTechnicalEstate(await readJson('hq/technical-estate.json'))
  const readiness = validateManagedPilotReadiness(await readJson('hq/readiness/managed-pilot-readiness.json'))
  const githubProposal = validateGitHubMainProtectionPacket(await readJson('hq/readiness/github-main-protection-proposal.json'))
  const supabaseProposal = await validateSupabasePreviewRehearsalProposal(await readJson('hq/readiness/supabase-preview-rehearsal-proposal.json'))

  return assessReleaseStackOwnerGates({
    generatedAt: new Date().toISOString(),
    repository: REPOSITORY,
    packageManifest,
    technicalEstate,
    readiness,
    githubProposal,
    supabaseProposal,
    gitState: currentGitState(),
  })
}

function sampleInput(overrides = {}) {
  const gitState = {
    branch: 'codex/release-stack-integration-rehearsal',
    head: 'a'.repeat(40),
    clean: true,
    originMain: 'b'.repeat(40),
    aheadOfOriginMain: 3,
    diffShortstat: ' 8 files changed, 120 insertions(+), 3 deletions(-)',
  }
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
      'release:next-action-preflight': 'node tools/prepare_next_release_action_preflight.mjs',
      'release:next-action-preflight:self-test': 'node --test tools/prepare_next_release_action_preflight.test.mjs && node tools/prepare_next_release_action_preflight.mjs --self-test',
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
      'hq:verify': HQ_VERIFY_RUNNER,
      'hq:verify:steps': EXPECTED_HQ_VERIFY_CHAIN,
    },
  }
  const technicalEstate = {
    schemaVersion: 'supermega.technical-estate.v1',
    canonicalSource: { repository: REPOSITORY, directProductionDeploymentAllowed: false },
    products: REQUIRED_PRODUCTS.map((productId) => ({ productId })),
    sharedCapabilities: [{ id: 'ai-assistance', classification: 'shared-capability-not-product' }],
    lifecycle: { currentPriority: 'shop-first-managed-pilot-readiness', nextProductSequence: [...REQUIRED_PRODUCTS] },
    ownerGates: {
      requiredApprovalFor: [...REQUIRED_OWNER_APPROVALS],
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
      blockingGateCount: REQUIRED_BLOCKING_GATES.length,
      blockingGateIds: [...REQUIRED_BLOCKING_GATES],
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
      safeAutomatedActions: [...REQUIRED_SAFE_AUTOMATED_ACTIONS],
      forbiddenUntilReady: [...REQUIRED_FORBIDDEN_ACTIONS],
    },
  }
  const githubProposal = {
    contract: 'supermega.github-main-protection-proposal.v1',
    repository: REPOSITORY,
    mode: 'owner_approval_required',
    verifierCompatibility: { requiredChecks: [...REQUIRED_MAIN_CHECKS], simulatedOk: true },
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
    repository: REPOSITORY,
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
    repository: REPOSITORY,
    packageManifest,
    technicalEstate,
    readiness,
    githubProposal,
    supabaseProposal,
    gitState,
    generatedAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  }
}

function runSelfTest() {
  const report = assessReleaseStackOwnerGates(sampleInput())
  const dirty = assessReleaseStackOwnerGates(sampleInput({ gitState: { ...sampleInput().gitState, clean: false } }))
  const unsafeSupabase = assessReleaseStackOwnerGates(sampleInput({
    supabaseProposal: {
      ...sampleInput().supabaseProposal,
      previewBranch: { ...sampleInput().supabaseProposal.previewBranch, startsWithProductionData: true },
    },
  }))
  const checks = {
    valid_stack_passes: report.ok === true && validateReleaseStackOwnerGate(report) === report,
    owner_gates_remain_pending: report.status === 'owner_gates_pending' && report.nextOwnerGateIds[0] === 'github_main_protection',
    dirty_worktree_fails_closed: dirty.ok === false && dirty.failures.includes('release_stack_owner_gate_worktree_dirty'),
    supabase_production_data_fails_closed: unsafeSupabase.ok === false && unsafeSupabase.failures.includes('release_stack_owner_gate_supabase_proposal_invalid'),
    no_external_effects_allowed: Object.entries(report.controls)
      .filter(([key]) => key !== 'noWriteVerification')
      .every(([, value]) => value === false),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ok: failedChecks.length === 0,
    contract: `${RELEASE_STACK_OWNER_GATE_CONTRACT}.self-test`,
    checks,
    failedChecks,
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args[0] && !['--verify', '--self-test'].includes(args[0]))) {
    throw new Error('release_stack_owner_gate_usage_invalid')
  }
  if (args[0] === '--self-test') {
    const result = runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  const report = await currentReport()
  console.log(JSON.stringify({
    ok: report.ok,
    contract: report.contract,
    status: report.status,
    head: report.candidate.head,
    clean: report.candidate.clean,
    nextOwnerGateIds: report.nextOwnerGateIds,
    failures: report.failures,
  }, null, 2))
  if (!report.ok) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: RELEASE_STACK_OWNER_GATE_CONTRACT,
      error: String(error?.message || 'release_stack_owner_gate_failed').slice(0, 260),
      externalEffectsAllowed: false,
    }))
    process.exitCode = 1
  })
}
