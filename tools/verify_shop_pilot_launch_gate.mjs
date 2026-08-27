#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateManagedPilotReadiness } from '../kernel/managed-pilot-readiness.mjs'
import { validateTechnicalEstate } from './manage_technical_estate.mjs'
import {
  buildShopPilotBaselinePacket,
  validateShopPilotBaselinePacket,
} from './prepare_shop_pilot_baseline_packet.mjs'
import {
  buildShopPilotPrivateIntakePacket,
  sampleShopPilotPrivateIntakeInput,
  validateShopPilotPrivateIntakePacket,
} from './prepare_shop_pilot_private_intake_packet.mjs'
import { verifyShopPilotPublicBoundary, verifyShopPilotPublicBoundaryFiles } from './verify_shop_pilot_public_boundary.mjs'

export const SHOP_PILOT_LAUNCH_GATE_CONTRACT = 'supermega.shop-pilot-launch-gate.v1'

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const REQUIRED_PRODUCTS = ['shop', 'plant', 'website', 'ecommerce']
const REQUIRED_BLOCKING_GATES = ['preview_rehearsal', 'pilot_evidence', 'production_activation']
const REQUIRED_PILOT_DAY_INDEXES = [1, 2, 3, 4, 5]
const REQUIRED_PILOT_CALENDAR_DATES = 5
const REQUIRED_FORBIDDEN_ACTIONS = [
  'deploy',
  'publish',
  'production_write',
  'customer_message',
  'payment',
  'hosted_scheduler_activation',
]
export const SHOP_PILOT_LAUNCH_HQ_RUNNER = 'node tools/run_hq_verify.mjs'
export const SHOP_PILOT_LAUNCH_HQ_CHAIN = 'node tools/record_postgres17_rehearsal.mjs --verify && node tools/verify_supabase_security_advisor_audit.mjs && node tools/manage_technical_estate.mjs --verify && node tools/manage_managed_pilot_readiness.mjs --verify && node tools/prepare_supabase_preview_rehearsal_proposal.mjs --verify && node tools/prepare_github_main_protection_packet.mjs --verify && node tools/verify_release_stack_owner_gates.mjs --verify && npm run github:main-protection:apply:self-test && npm run github:main-protection:owner-action-card:self-test && npm run github:main-protection:snapshot:self-test && npm run release:branch-push:apply:self-test && npm run release:pull-request:create:self-test && npm run operator:board:self-test && npm run operating:action-board:self-test && npm run operational:action-packet:self-test && npm run operating:action-board:verify && npm run supermega:status:brief:self-test && npm run product:readiness-matrix:self-test && npm run release:next-action-preflight:self-test && npm run release:owner-approval:packet:self-test && npm run release:control-index:self-test && npm run admin:technical-coordination:self-test && npm run release:artifact-family:self-test && npm run release:artifact-family:plan:self-test && npm run shop:pilot:intake-packet:self-test && npm run shop:pilot:baseline-packet:self-test && npm run shop:pilot:day0-readiness:self-test && npm run shop:pilot:day0-owner-baseline-card:self-test && npm run shop:pilot:owner-observation-pack:self-test && npm run shop:pilot:decision-packet:self-test && npm run shop:pilot:day0-readiness && npm run shop:receipt:print-geometry:self-test && npm run shop:receipt:print-geometry:verify && node tools/verify_shop_pilot_launch_gate.mjs --verify && npm run strategy:posture:verify && node tools/verify_hq_contract.mjs'
const REQUIRED_SCRIPTS = {
  'client:pilot:workspace': 'node tools/manage_shop_pilot_workspace.mjs',
  'client:pilot:handoff': 'node tools/create_shop_pilot_handoff.mjs',
  'client:pilot:observed-evidence': 'node tools/record_shop_pilot_observed_run.mjs',
  'client:pilot:public-boundary:verify': 'node tools/verify_shop_pilot_public_boundary.mjs --file hq/readiness/shop-pilot-public-boundary.json',
  'shop:run001:claims:verify': 'node tools/verify_shop_run001_claims_guard.mjs',
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
  'supermega:status:brief': 'node tools/prepare_supermega_status_brief.mjs',
  'supermega:status:brief:self-test': 'node --test tools/prepare_supermega_status_brief.test.mjs && node tools/prepare_supermega_status_brief.mjs --self-test',
  'product:readiness-matrix': 'node tools/prepare_product_readiness_matrix.mjs',
  'product:readiness-matrix:self-test': 'node --test tools/prepare_product_readiness_matrix.test.mjs && node tools/prepare_product_readiness_matrix.mjs --self-test',
  'operational:action-packet': 'node tools/prepare_operational_report_action_packet.mjs',
  'operational:action-packet:self-test': 'node --test tools/prepare_operational_report_action_packet.test.mjs && node tools/prepare_operational_report_action_packet.mjs --self-test',
  'admin:technical-coordination': 'node tools/prepare_admin_technical_coordination_packet.mjs',
  'admin:technical-coordination:self-test': 'node --test tools/prepare_admin_technical_coordination_packet.test.mjs && node tools/prepare_admin_technical_coordination_packet.mjs --self-test',
  'release:next-action-preflight': 'node tools/prepare_next_release_action_preflight.mjs',
  'release:next-action-preflight:self-test': 'node --test tools/prepare_next_release_action_preflight.test.mjs && node tools/prepare_next_release_action_preflight.mjs --self-test',
  'release:artifact-family:plan': 'node tools/prepare_release_artifact_family_plan.mjs',
  'release:artifact-family:plan:self-test': 'node --test tools/prepare_release_artifact_family_plan.test.mjs && node tools/prepare_release_artifact_family_plan.mjs --self-test',
}
const PUBLIC_BOUNDARY_FALSE_CONTROLS = [
  'automaticSendAllowed',
  'paymentAllowed',
  'deploymentAllowed',
  'productionActivationAllowed',
  'hostedWritesAllowed',
  'externalWritesPerformed',
  'customerContactPerformed',
  'managedActivation',
  'managedActivationReady',
  'managedPersistenceReady',
  'shopPilotProof',
  'pilotProof',
  'promotionEvidence',
  'readyToRecord',
  'paymentAccepted',
  'stockMovementPerformed',
  'serverWritePerformed',
  'hostedWritePerformed',
  'credentialChangePerformed',
  'providerMutationPerformed',
]
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

function falseOnly(record, keys) {
  return isRecord(record) && keys.every((key) => record[key] === false)
}

function addFailure(failures, code) {
  if (!failures.includes(code)) failures.push(code)
}

function hasSecretShape(value) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(JSON.stringify(value || {})))
}

function gate(id, label, status, blocks, evidence) {
  return { id, label, status, blocks, evidence }
}

function summarizeBaselinePacket(input, failures) {
  if (input === undefined || input === null) {
    return {
      present: false,
      accepted: false,
      contract: null,
      status: 'missing',
      digest: null,
      privateInputDigest: null,
      metrics: null,
      pilotWindow: null,
    }
  }
  let packet = null
  try {
    packet = validateShopPilotBaselinePacket(input)
  } catch (error) {
    addFailure(failures, `shop_pilot_launch_gate_baseline_packet_invalid:${String(error?.message || 'failed').slice(0, 120)}`)
    return {
      present: true,
      accepted: false,
      contract: input?.contract || null,
      status: input?.status || 'invalid',
      digest: input?.digest || null,
      privateInputDigest: input?.privateInputDigest || null,
      metrics: null,
      pilotWindow: null,
    }
  }
  if (packet.ok !== true || packet.status !== 'baseline_ready_for_private_pilot_handoff') {
    addFailure(failures, 'shop_pilot_launch_gate_baseline_packet_not_ready')
  }
  if (packet.controls?.externalWritesPerformed !== false
    || packet.controls?.customerContactPerformed !== false
    || packet.controls?.paymentAccepted !== false
    || packet.controls?.stockMovementPerformed !== false
    || packet.controls?.serverWritePerformed !== false
    || packet.controls?.hostedWritePerformed !== false
    || packet.controls?.deploymentPerformed !== false
    || packet.controls?.managedActivationPerformed !== false
    || packet.controls?.privateIdentityExposed !== false) {
    addFailure(failures, 'shop_pilot_launch_gate_baseline_packet_controls_invalid')
  }
  return {
    present: true,
    accepted: packet.ok === true && packet.status === 'baseline_ready_for_private_pilot_handoff',
    contract: packet.contract,
    status: packet.status,
    digest: packet.digest,
    privateInputDigest: packet.privateInputDigest,
    metrics: {
      observedOrderRunCount: packet.metrics.observedOrderRunCount,
      uninterruptedOrderRunCount: packet.metrics.uninterruptedOrderRunCount,
      observedRedemptionRunCount: packet.metrics.observedRedemptionRunCount,
      uninterruptedRedemptionRunCount: packet.metrics.uninterruptedRedemptionRunCount,
      observedCloseRunCount: packet.metrics.observedCloseRunCount,
      uninterruptedCloseRunCount: packet.metrics.uninterruptedCloseRunCount,
      medianMinutesPerOrder: packet.metrics.medianMinutesPerOrder,
      medianMinutesPerRedemption: packet.metrics.medianMinutesPerRedemption,
      closeMinutesPerDay: packet.metrics.closeMinutesPerDay,
      medianCloseMinutesPerDay: packet.metrics.medianCloseMinutesPerDay,
      weeklyExceptionCount: packet.metrics.weeklyExceptionCount,
      weeklyPackageCorrectionCount: packet.metrics.weeklyPackageCorrectionCount,
    },
    pilotWindow: { ...packet.pilotWindow },
  }
}

function summarizeIntakePacket(input, failures) {
  if (input === undefined || input === null) {
    return {
      present: false,
      accepted: false,
      contract: null,
      status: 'missing',
      digest: null,
      publicBoundaryDigest: null,
      readinessDigest: null,
      privateStages: [],
    }
  }
  let packet = null
  try {
    packet = validateShopPilotPrivateIntakePacket(input)
  } catch (error) {
    addFailure(failures, `shop_pilot_launch_gate_intake_packet_invalid:${String(error?.message || 'failed').slice(0, 120)}`)
    return {
      present: true,
      accepted: false,
      contract: input?.contract || null,
      status: input?.status || 'invalid',
      digest: input?.digest || null,
      publicBoundaryDigest: input?.sourceState?.publicBoundaryDigest || null,
      readinessDigest: input?.sourceState?.readinessDigest || null,
      privateStages: [],
    }
  }
  if (packet.ok !== true || packet.status !== 'owner_private_intake_ready') {
    addFailure(failures, 'shop_pilot_launch_gate_intake_packet_not_ready')
  }
  if (packet.controls?.customerContactAllowed !== false
    || packet.controls?.paymentAllowed !== false
    || packet.controls?.stockMovementAllowed !== false
    || packet.controls?.hostedWritesAllowed !== false
    || packet.controls?.githubWritesAllowed !== false
    || packet.controls?.vercelDeployAllowed !== false
    || packet.controls?.supabaseWritesAllowed !== false
    || packet.controls?.productionReleaseAllowed !== false
    || packet.controls?.managedActivationAllowed !== false
    || packet.controls?.externalEffectsAllowed !== false
    || packet.controls?.credentialValuesIncluded !== false) {
    addFailure(failures, 'shop_pilot_launch_gate_intake_packet_controls_invalid')
  }
  return {
    present: true,
    accepted: packet.ok === true && packet.status === 'owner_private_intake_ready',
    contract: packet.contract,
    status: packet.status,
    digest: packet.digest,
    publicBoundaryDigest: packet.sourceState?.publicBoundaryDigest || null,
    readinessDigest: packet.sourceState?.readinessDigest || null,
    privateStages: (packet.ownerPrivateIntake?.requiredPrivateStages || []).map((stage) => ({
      id: stage.id,
      storedOutsideGit: stage.storedOutsideGit === true,
      mayContainIdentity: stage.mayContainIdentity === true,
    })),
  }
}

function launchStatus({ failures, baselineReady, intakeReady }) {
  if (failures.length) return 'failed'
  if (baselineReady && intakeReady) return 'owner_private_handoff_ready'
  if (baselineReady) return 'owner_private_baseline_ready'
  if (intakeReady) return 'owner_private_intake_ready'
  return 'owner_private_intake_required'
}

function launchAuthority({ baselineReady, intakeReady }) {
  if (baselineReady && intakeReady) return 'owner_private_baseline_and_intake_ready'
  if (baselineReady) return 'owner_private_intake_and_baseline_ready'
  if (intakeReady) return 'owner_private_intake_ready_baseline_required'
  return 'owner_private_intake_only'
}

export function assessShopPilotLaunchGate(input = {}) {
  const failures = []
  const packageManifest = input.packageManifest || {}
  const scripts = packageManifest.scripts || {}
  const technicalEstate = input.technicalEstate || {}
  const readiness = input.readiness || {}
  const publicBoundary = input.publicBoundary || {}
  const publicBoundaryVerification = input.publicBoundaryVerification || {}
  const gitState = input.gitState || {}
  const baselineEvidence = summarizeBaselinePacket(input.baselinePacket, failures)
  const intakeEvidence = summarizeIntakePacket(input.intakePacket, failures)

  if (input.repository !== REPOSITORY) addFailure(failures, 'shop_pilot_launch_gate_repository_invalid')
  if (packageManifest.supermega?.productionSupabaseTargetStatus !== 'protected-unapproved') {
    addFailure(failures, 'shop_pilot_launch_gate_supabase_target_status_invalid')
  }
  for (const [name, command] of Object.entries(REQUIRED_SCRIPTS)) {
    if (scripts[name] !== command) addFailure(failures, `shop_pilot_launch_gate_script_missing:${name}`)
  }
  if (scripts['hq:verify'] !== SHOP_PILOT_LAUNCH_HQ_RUNNER) addFailure(failures, 'shop_pilot_launch_gate_hq_runner_missing')
  if (scripts['hq:verify:steps'] !== SHOP_PILOT_LAUNCH_HQ_CHAIN) addFailure(failures, 'shop_pilot_launch_gate_hq_chain_missing')

  if (technicalEstate.schemaVersion !== 'supermega.technical-estate.v1') addFailure(failures, 'shop_pilot_launch_gate_estate_contract_invalid')
  if (technicalEstate.canonicalSource?.repository !== REPOSITORY) addFailure(failures, 'shop_pilot_launch_gate_estate_repository_invalid')
  if (!sameArray((technicalEstate.products || []).map((product) => product.productId), REQUIRED_PRODUCTS)) {
    addFailure(failures, 'shop_pilot_launch_gate_product_set_invalid')
  }
  if (technicalEstate.lifecycle?.currentPriority !== 'shop-first-managed-pilot-readiness'
    || !sameArray(technicalEstate.lifecycle?.nextProductSequence, REQUIRED_PRODUCTS)) {
    addFailure(failures, 'shop_pilot_launch_gate_lifecycle_order_invalid')
  }
  if (technicalEstate.ownerGates?.externalEffectsAllowed !== false
    || technicalEstate.ownerGates?.productionWritesAllowed !== false
    || technicalEstate.ownerGates?.localSubagentsAllowedByDefault !== false) {
    addFailure(failures, 'shop_pilot_launch_gate_estate_owner_gates_invalid')
  }

  if (readiness.contract !== 'supermega.managed-pilot-readiness.v5') addFailure(failures, 'shop_pilot_launch_gate_readiness_contract_invalid')
  if (readiness.pilotMode !== 'owner_named') addFailure(failures, 'shop_pilot_launch_gate_pilot_mode_invalid')
  if (readiness.overall?.status !== 'blocked'
    || readiness.overall?.hostedActivationReady !== false
    || readiness.overall?.blockingGateCount !== REQUIRED_BLOCKING_GATES.length
    || !sameArray(readiness.overall?.blockingGateIds, REQUIRED_BLOCKING_GATES)) {
    addFailure(failures, 'shop_pilot_launch_gate_overall_state_invalid')
  }
  if (readiness.liveProduction?.operatingMode !== 'isolated_demo'
    || readiness.liveProduction?.managedWritesEnabled !== false
    || readiness.liveProduction?.productionMutationAuthorized !== false) {
    addFailure(failures, 'shop_pilot_launch_gate_live_production_state_invalid')
  }
  if (readiness.previewRehearsal?.proofComplete !== false
    || readiness.previewRehearsal?.productionRefsRejected !== true
    || readiness.previewRehearsal?.productionDataRejected !== true
    || readiness.previewRehearsal?.privilegedRuntimeCredentialsRejected !== true) {
    addFailure(failures, 'shop_pilot_launch_gate_preview_rehearsal_state_invalid')
  }
  if (readiness.pilotEvidence?.pilotMode !== 'owner_named'
    || readiness.pilotEvidence?.productId !== 'shop'
    || readiness.pilotEvidence?.proofComplete !== false
    || readiness.pilotEvidence?.requiredAcceptedConsecutiveRuns !== 20
    || readiness.pilotEvidence?.acceptedConsecutiveRuns !== 0
    || !sameArray(readiness.pilotEvidence?.requiredPilotDayIndexes, REQUIRED_PILOT_DAY_INDEXES)
    || !sameArray(readiness.pilotEvidence?.acceptedConsecutivePilotDayIndexes, [])
    || readiness.pilotEvidence?.pilotSequenceCoverageMet !== false
    || readiness.pilotEvidence?.requiredPilotCalendarDates !== REQUIRED_PILOT_CALENDAR_DATES
    || readiness.pilotEvidence?.acceptedConsecutiveObservedDateCount !== 0
    || !sameArray(readiness.pilotEvidence?.acceptedConsecutiveObservedDates, [])
    || readiness.pilotEvidence?.pilotCalendarCoverageMet !== false
    || readiness.pilotEvidence?.syntheticEvidenceAccepted !== false
    || readiness.pilotEvidence?.publicIdentityAllowed !== false
    || readiness.pilotEvidence?.privateWorkspaceRequired !== true) {
    addFailure(failures, 'shop_pilot_launch_gate_pilot_evidence_state_invalid')
  }
  if (readiness.controls?.externalWritesPerformed !== false
    || readiness.controls?.productionWritesEnabled !== false
    || readiness.controls?.ownerApprovalRequired !== true
    || !includesAll(readiness.controls?.forbiddenUntilReady, REQUIRED_FORBIDDEN_ACTIONS)) {
    addFailure(failures, 'shop_pilot_launch_gate_readiness_controls_invalid')
  }

  try {
    verifyShopPilotPublicBoundary(publicBoundary)
  } catch (error) {
    addFailure(failures, `shop_pilot_launch_gate_public_boundary_invalid:${String(error?.message || 'failed').slice(0, 120)}`)
  }
  if (publicBoundary.contract !== 'supermega.shop.pilot_public_boundary.v1'
    || publicBoundary.product !== 'shop'
    || publicBoundary.pilotMode !== 'owner_named'
    || publicBoundary.stage !== 'owner-decision-required'
    || !['revise', 'decline'].includes(publicBoundary.decision)
    || publicBoundary.acceptedRuns !== 0
    || publicBoundary.consecutiveAcceptedRuns !== 0
    || publicBoundary.participantIdentityPresent !== false
    || publicBoundary.secretValuesExposed !== false
    || !falseOnly(publicBoundary.controls, PUBLIC_BOUNDARY_FALSE_CONTROLS)) {
    addFailure(failures, 'shop_pilot_launch_gate_public_boundary_state_invalid')
  }
  if (publicBoundaryVerification.ok !== true
    || publicBoundaryVerification.externalWritesPerformed !== false
    || publicBoundaryVerification.customerContactPerformed !== false
    || !Array.isArray(publicBoundaryVerification.fileDigests)
    || publicBoundaryVerification.fileDigests.length !== 1) {
    addFailure(failures, 'shop_pilot_launch_gate_public_boundary_file_invalid')
  }

  if (gitState.clean !== true) addFailure(failures, 'shop_pilot_launch_gate_worktree_dirty')
  if (!/^[0-9a-f]{40}$/.test(String(gitState.head || ''))) addFailure(failures, 'shop_pilot_launch_gate_head_invalid')
  if (!gitState.branch || typeof gitState.branch !== 'string') addFailure(failures, 'shop_pilot_launch_gate_branch_invalid')
  if (Number.isInteger(gitState.aheadOfOriginMain) && gitState.aheadOfOriginMain < 1) addFailure(failures, 'shop_pilot_launch_gate_no_review_delta')

  if (hasSecretShape({ readiness, publicBoundary, baselineEvidence, intakeEvidence })) addFailure(failures, 'shop_pilot_launch_gate_secret_shape_detected')

  const baselineReady = baselineEvidence.accepted === true
  const intakeReady = intakeEvidence.accepted === true
  const body = {
    contract: SHOP_PILOT_LAUNCH_GATE_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: input.generatedAt || new Date().toISOString(),
    repository: REPOSITORY,
    status: launchStatus({ failures, baselineReady, intakeReady }),
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
      overallStatus: readiness.overall?.status || null,
      hostedActivationReady: readiness.overall?.hostedActivationReady === true,
      blockingGateIds: Array.isArray(readiness.overall?.blockingGateIds) ? [...readiness.overall.blockingGateIds] : [],
      liveOperatingMode: readiness.liveProduction?.operatingMode || null,
      managedWritesEnabled: readiness.liveProduction?.managedWritesEnabled === true,
      previewRehearsalProofComplete: readiness.previewRehearsal?.proofComplete === true,
      pilotProofComplete: readiness.pilotEvidence?.proofComplete === true,
      requiredAcceptedConsecutiveRuns: readiness.pilotEvidence?.requiredAcceptedConsecutiveRuns ?? null,
      acceptedConsecutiveRuns: readiness.pilotEvidence?.acceptedConsecutiveRuns ?? null,
      requiredPilotDayIndexes: Array.isArray(readiness.pilotEvidence?.requiredPilotDayIndexes) ? [...readiness.pilotEvidence.requiredPilotDayIndexes] : [],
      acceptedConsecutivePilotDayIndexes: Array.isArray(readiness.pilotEvidence?.acceptedConsecutivePilotDayIndexes) ? [...readiness.pilotEvidence.acceptedConsecutivePilotDayIndexes] : [],
      pilotSequenceCoverageMet: readiness.pilotEvidence?.pilotSequenceCoverageMet === true,
      requiredPilotCalendarDates: readiness.pilotEvidence?.requiredPilotCalendarDates ?? null,
      acceptedConsecutiveObservedDateCount: readiness.pilotEvidence?.acceptedConsecutiveObservedDateCount ?? null,
      acceptedConsecutiveObservedDates: Array.isArray(readiness.pilotEvidence?.acceptedConsecutiveObservedDates) ? [...readiness.pilotEvidence.acceptedConsecutiveObservedDates] : [],
      pilotCalendarCoverageMet: readiness.pilotEvidence?.pilotCalendarCoverageMet === true,
      syntheticEvidenceAccepted: readiness.pilotEvidence?.syntheticEvidenceAccepted === true,
      publicIdentityAllowed: readiness.pilotEvidence?.publicIdentityAllowed === true,
      privateWorkspaceRequired: readiness.pilotEvidence?.privateWorkspaceRequired === true,
    },
    publicBoundary: {
      contract: publicBoundary.contract || null,
      stage: publicBoundary.stage || null,
      decision: publicBoundary.decision || null,
      acceptedRuns: publicBoundary.acceptedRuns ?? null,
      consecutiveAcceptedRuns: publicBoundary.consecutiveAcceptedRuns ?? null,
      participantIdentityPresent: publicBoundary.participantIdentityPresent === true,
      secretValuesExposed: publicBoundary.secretValuesExposed === true,
      fileDigest: publicBoundaryVerification.fileDigests?.[0] || null,
      externalWritesPerformed: publicBoundaryVerification.externalWritesPerformed === true,
      customerContactPerformed: publicBoundaryVerification.customerContactPerformed === true,
    },
    baselineEvidence,
    intakeEvidence,
    launchReadiness: {
      authority: launchAuthority({ baselineReady, intakeReady }),
      privateWorkspaceMayBePreparedAfterOwnerInput: failures.length === 0,
      baselinePacketAccepted: baselineReady,
      baselinePacketDigest: baselineEvidence.digest,
      baselinePrivateInputDigest: baselineEvidence.privateInputDigest,
      intakePacketAccepted: intakeReady,
      intakePacketDigest: intakeEvidence.digest,
      readyForCustomerContact: false,
      readyForPayment: false,
      readyForDeployment: false,
      readyForManagedActivation: false,
      readyForPromotionEvidence: false,
      promotionEvidenceRequiredAcceptedRuns: 20,
      promotionEvidenceAcceptedRuns: readiness.pilotEvidence?.acceptedConsecutiveRuns ?? 0,
      promotionEvidenceRequiredPilotDayIndexes: [...REQUIRED_PILOT_DAY_INDEXES],
      promotionEvidenceAcceptedPilotDayIndexes: Array.isArray(readiness.pilotEvidence?.acceptedConsecutivePilotDayIndexes) ? [...readiness.pilotEvidence.acceptedConsecutivePilotDayIndexes] : [],
      promotionEvidencePilotSequenceCoverageMet: readiness.pilotEvidence?.pilotSequenceCoverageMet === true,
      promotionEvidenceRequiredPilotCalendarDates: REQUIRED_PILOT_CALENDAR_DATES,
      promotionEvidenceAcceptedObservedDateCount: readiness.pilotEvidence?.acceptedConsecutiveObservedDateCount ?? 0,
      promotionEvidenceAcceptedObservedDates: Array.isArray(readiness.pilotEvidence?.acceptedConsecutiveObservedDates) ? [...readiness.pilotEvidence.acceptedConsecutiveObservedDates] : [],
      promotionEvidencePilotCalendarCoverageMet: readiness.pilotEvidence?.pilotCalendarCoverageMet === true,
    },
    requiredNextGates: [
      gate('owner_private_baseline', 'Owner-observed manual Shop baseline packet', baselineReady ? 'satisfied_private_digest_only' : (failures.length ? 'blocked' : 'owner_action_required'), !baselineReady, 'At least three observed manual order and redemption runs must be captured privately before pilot day one.'),
      gate('owner_private_intake', 'Owner selects and reviews the private Shop pilot workspace input', intakeReady ? 'satisfied_private_digest_only' : (failures.length ? 'blocked' : 'owner_action_required'), !intakeReady, 'Only private intake preparation can proceed; participant identity remains outside Git, CI, HQ records, and reports.'),
      gate('exact_preview_rehearsal', 'Exact-candidate protected preview rehearsal', 'owner_approval_required', true, 'The preview rehearsal must be bound to the reviewed SHA and migration digests before release.'),
      gate('real_shop_pilot_evidence', 'Real owner-reviewed Shop pilot evidence', 'blocked', true, '20 consecutive accepted receipt-and-anchor-bound runs covering pilot days 1 through 5 and at least 5 distinct observed calendar dates are required; synthetic runs remain excluded.'),
      gate('managed_activation', 'Managed production activation', 'owner_approval_required', true, 'Production remains isolated-demo until every hosted proof passes and the owner approves exact activation.'),
    ],
    controls: {
      noWriteVerification: true,
      createPrivateWorkspaceAllowedByThisVerifier: false,
      customerContactAllowed: false,
      automaticSendAllowed: false,
      paymentAllowed: false,
      stockMovementAllowed: false,
      hostedWritesAllowed: false,
      vercelDeployAllowed: false,
      githubWritesAllowed: false,
      supabaseWritesAllowed: false,
      productionReleaseAllowed: false,
      managedActivationAllowed: false,
      externalEffectsAllowed: false,
      localSubagentsAllowedByDefault: false,
    },
    failures,
  }
  return { ...body, digest: digest(JSON.stringify(body)) }
}

export function validateShopPilotLaunchGate(report) {
  if (!isRecord(report) || report.contract !== SHOP_PILOT_LAUNCH_GATE_CONTRACT) {
    throw new Error('shop_pilot_launch_gate_contract_invalid')
  }
  const { digest: actualDigest, ...body } = report
  if (actualDigest !== digest(JSON.stringify(body))) throw new Error('shop_pilot_launch_gate_digest_invalid')
  if (report.ok !== true
    || !['owner_private_intake_required', 'owner_private_baseline_ready', 'owner_private_intake_ready', 'owner_private_handoff_ready'].includes(report.status)
    || report.failures?.length !== 0) {
    throw new Error('shop_pilot_launch_gate_not_passing')
  }
  const baselineAccepted = report.status === 'owner_private_baseline_ready'
    || report.status === 'owner_private_handoff_ready'
  const intakeAccepted = report.status === 'owner_private_intake_ready'
    || report.status === 'owner_private_handoff_ready'
  if (report.launchReadiness?.authority !== launchAuthority({ baselineReady: baselineAccepted, intakeReady: intakeAccepted })
    || report.launchReadiness?.baselinePacketAccepted !== baselineAccepted
    || report.launchReadiness?.intakePacketAccepted !== intakeAccepted
    || (baselineAccepted && (report.baselineEvidence?.accepted !== true || !/^sha256:[0-9a-f]{64}$/.test(report.baselineEvidence?.privateInputDigest || '')))
    || (intakeAccepted && (report.intakeEvidence?.accepted !== true || !/^sha256:[0-9a-f]{64}$/.test(report.intakeEvidence?.digest || '')))
    || report.launchReadiness?.readyForCustomerContact !== false
    || report.launchReadiness?.readyForPayment !== false
    || report.launchReadiness?.readyForDeployment !== false
    || report.launchReadiness?.readyForManagedActivation !== false
    || report.launchReadiness?.readyForPromotionEvidence !== false
    || report.launchReadiness?.promotionEvidenceRequiredAcceptedRuns !== 20
    || report.launchReadiness?.promotionEvidenceAcceptedRuns !== 0
    || !sameArray(report.launchReadiness?.promotionEvidenceRequiredPilotDayIndexes, REQUIRED_PILOT_DAY_INDEXES)
    || !sameArray(report.launchReadiness?.promotionEvidenceAcceptedPilotDayIndexes, [])
    || report.launchReadiness?.promotionEvidencePilotSequenceCoverageMet !== false
    || report.launchReadiness?.promotionEvidenceRequiredPilotCalendarDates !== REQUIRED_PILOT_CALENDAR_DATES
    || report.launchReadiness?.promotionEvidenceAcceptedObservedDateCount !== 0
    || !sameArray(report.launchReadiness?.promotionEvidenceAcceptedObservedDates, [])
    || report.launchReadiness?.promotionEvidencePilotCalendarCoverageMet !== false
    || !sameArray(report.readiness?.requiredPilotDayIndexes, REQUIRED_PILOT_DAY_INDEXES)
    || !sameArray(report.readiness?.acceptedConsecutivePilotDayIndexes, [])
    || report.readiness?.pilotSequenceCoverageMet !== false
    || report.readiness?.requiredPilotCalendarDates !== REQUIRED_PILOT_CALENDAR_DATES
    || report.readiness?.acceptedConsecutiveObservedDateCount !== 0
    || !sameArray(report.readiness?.acceptedConsecutiveObservedDates, [])
    || report.readiness?.pilotCalendarCoverageMet !== false) {
    throw new Error('shop_pilot_launch_gate_launch_readiness_invalid')
  }
  if (report.controls?.noWriteVerification !== true
    || report.controls?.customerContactAllowed !== false
    || report.controls?.paymentAllowed !== false
    || report.controls?.hostedWritesAllowed !== false
    || report.controls?.managedActivationAllowed !== false
    || report.controls?.externalEffectsAllowed !== false) {
    throw new Error('shop_pilot_launch_gate_controls_invalid')
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
  if (!optional && result.status !== 0) throw new Error(`shop_pilot_launch_gate_git_failed:${args.join(' ')}`)
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

async function writeOutput(path, content) {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
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
    throw new Error(`shop_pilot_launch_gate_dependency_failed:${args.join(' ')}:${error}`)
  }
}

export async function currentShopPilotLaunchGateReport({ baselinePacketPath = null, intakePacketPath = null } = {}) {
  runNoWriteVerifier(['tools/manage_technical_estate.mjs', '--verify'])
  runNoWriteVerifier(['tools/manage_managed_pilot_readiness.mjs', '--verify'])
  runNoWriteVerifier(['tools/verify_shop_pilot_public_boundary.mjs', '--file', 'hq/readiness/shop-pilot-public-boundary.json'])
  runNoWriteVerifier(['tools/verify_shop_run001_claims_guard.mjs'])

  const packageManifest = await readJson('package.json')
  const technicalEstate = validateTechnicalEstate(await readJson('hq/technical-estate.json'))
  const readiness = validateManagedPilotReadiness(await readJson('hq/readiness/managed-pilot-readiness.json'))
  const publicBoundary = await readJson('hq/readiness/shop-pilot-public-boundary.json')
  const publicBoundaryVerification = verifyShopPilotPublicBoundaryFiles(['hq/readiness/shop-pilot-public-boundary.json'])
  const baselinePacket = baselinePacketPath ? await readJson(baselinePacketPath) : null
  const intakePacket = intakePacketPath ? await readJson(intakePacketPath) : null

  return assessShopPilotLaunchGate({
    generatedAt: new Date().toISOString(),
    repository: REPOSITORY,
    packageManifest,
    technicalEstate,
    readiness,
    publicBoundary,
    publicBoundaryVerification,
    baselinePacket,
    intakePacket,
    gitState: currentGitState(),
  })
}

function sampleBaselineInput(overrides = {}) {
  return {
    contract: 'supermega.shop.pilot_baseline_input.v1',
    product: 'shop',
    pilotMode: 'owner_named',
    verticalPack: 'spa-services',
    observedAt: '2026-08-25T08:00:00.000Z',
    businessName: 'Private pilot business',
    namedOperator: 'Private pilot operator',
    operatorRole: 'Shop manager',
    founderObserver: 'Founder',
    observationPlace: 'Private shop floor',
    processSummary: 'Owner records package sale and redemption manually, then closes the day.',
    processStartsAt: 'Client asks for a prepaid package',
    processEndsAt: 'Payment reconciled, treatment completed, balance updated, and book closed',
    correctionPath: 'Owner marks the wrong entry and writes the correction beside the record',
    recordSystem: 'Notebook',
    observedOrderRuns: [
      { runId: 'order-run-001', observedAt: '2026-08-25T08:01:00.000Z', startedWhen: 'client request began', endedWhen: 'manual entry completed', durationMinutes: 7, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'order-run-002', observedAt: '2026-08-25T08:20:00.000Z', startedWhen: 'client request began', endedWhen: 'manual entry completed', durationMinutes: 8, interrupted: false, errorOccurred: true, errorCostLabel: 'one correction before final balance' },
      { runId: 'order-run-003', observedAt: '2026-08-25T08:40:00.000Z', startedWhen: 'client request began', endedWhen: 'manual entry completed', durationMinutes: 9, interrupted: false, errorOccurred: false, errorCostLabel: null },
    ],
    observedRedemptionRuns: [
      { runId: 'redemption-run-001', observedAt: '2026-08-25T09:01:00.000Z', startedWhen: 'treatment completed', endedWhen: 'package balance updated', durationMinutes: 2, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'redemption-run-002', observedAt: '2026-08-25T09:20:00.000Z', startedWhen: 'treatment completed', endedWhen: 'package balance updated', durationMinutes: 3, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'redemption-run-003', observedAt: '2026-08-25T09:40:00.000Z', startedWhen: 'treatment completed', endedWhen: 'package balance updated', durationMinutes: 4, interrupted: false, errorOccurred: false, errorCostLabel: null },
    ],
    observedCloseRuns: [
      { runId: 'close-run-001', observedAt: '2026-08-25T18:01:00.000Z', startedWhen: 'last treatment finished', endedWhen: 'manual close completed', durationMinutes: 40, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'close-run-002', observedAt: '2026-08-25T18:20:00.000Z', startedWhen: 'last treatment finished', endedWhen: 'manual close completed', durationMinutes: 45, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'close-run-003', observedAt: '2026-08-25T18:40:00.000Z', startedWhen: 'last treatment finished', endedWhen: 'manual close completed', durationMinutes: 50, interrupted: false, errorOccurred: false, errorCostLabel: null },
    ],
    weeklyOrders: 120,
    claimedMedianMinutesPerOrder: 8,
    weeklyExceptionCount: 12,
    closeMinutesPerDay: 45,
    clientImportRowCount: 40,
    weeklyPackageSales: 12,
    weeklyTreatmentRedemptions: 24,
    claimedMedianMinutesPerRedemption: 3,
    weeklyPackageCorrectionCount: 2,
    observedErrorRunCount: 1,
    totalObservedErrorRunCount: 1,
    totalObservedErrorCostLabel: 'one manual correction, no monetary claim',
    ownerConfirmedBaseline: true,
    operatorAgreesReviewEveryRun: true,
    proposedPilotStartDate: '2026-08-31',
    reviewDate: '2026-09-04',
    noSuperMegaDemoMeasured: true,
    noExternalEffects: true,
    ...overrides,
  }
}

export function sampleShopPilotLaunchGateInput(overrides = {}) {
  const packageManifest = {
    supermega: { productionSupabaseTargetStatus: 'protected-unapproved' },
    scripts: {
      ...REQUIRED_SCRIPTS,
      'hq:verify': SHOP_PILOT_LAUNCH_HQ_RUNNER,
      'hq:verify:steps': SHOP_PILOT_LAUNCH_HQ_CHAIN,
    },
  }
  const technicalEstate = {
    schemaVersion: 'supermega.technical-estate.v1',
    canonicalSource: { repository: REPOSITORY },
    products: REQUIRED_PRODUCTS.map((productId) => ({ productId })),
    lifecycle: { currentPriority: 'shop-first-managed-pilot-readiness', nextProductSequence: [...REQUIRED_PRODUCTS] },
    ownerGates: {
      productionWritesAllowed: false,
      externalEffectsAllowed: false,
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
      pilotMode: 'owner_named',
      productId: 'shop',
      proofComplete: false,
      requiredAcceptedConsecutiveRuns: 20,
      acceptedConsecutiveRuns: 0,
      requiredPilotDayIndexes: [...REQUIRED_PILOT_DAY_INDEXES],
      acceptedConsecutivePilotDayIndexes: [],
      pilotSequenceCoverageMet: false,
      requiredPilotCalendarDates: REQUIRED_PILOT_CALENDAR_DATES,
      acceptedConsecutiveObservedDateCount: 0,
      acceptedConsecutiveObservedDates: [],
      pilotCalendarCoverageMet: false,
      syntheticEvidenceAccepted: false,
      publicIdentityAllowed: false,
      privateWorkspaceRequired: true,
    },
    controls: {
      externalWritesPerformed: false,
      productionWritesEnabled: false,
      ownerApprovalRequired: true,
      forbiddenUntilReady: [...REQUIRED_FORBIDDEN_ACTIONS],
    },
  }
  const publicBoundary = {
    contract: 'supermega.shop.pilot_public_boundary.v1',
    product: 'shop',
    pilotMode: 'owner_named',
    stage: 'owner-decision-required',
    decision: 'revise',
    controls: Object.fromEntries(PUBLIC_BOUNDARY_FALSE_CONTROLS.map((key) => [key, false])),
    acceptedRuns: 0,
    consecutiveAcceptedRuns: 0,
    participantIdentityPresent: false,
    secretValuesExposed: false,
  }
  return {
    generatedAt: '2026-08-25T00:00:00.000Z',
    repository: REPOSITORY,
    packageManifest,
    technicalEstate,
    readiness,
    publicBoundary,
    publicBoundaryVerification: {
      ok: true,
      fileDigests: [`sha256:${'d'.repeat(64)}`],
      externalWritesPerformed: false,
      customerContactPerformed: false,
    },
    gitState: {
      branch: 'codex/release-stack-integration-rehearsal',
      head: 'a'.repeat(40),
      clean: true,
      originMain: 'b'.repeat(40),
      aheadOfOriginMain: 5,
      diffShortstat: ' 10 files changed, 200 insertions(+), 4 deletions(-)',
    },
    ...overrides,
  }
}

function runSelfTest() {
  const valid = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput())
  const baselinePacket = buildShopPilotBaselinePacket(sampleBaselineInput(), { generatedAt: '2026-08-25T00:00:00.000Z' })
  const intakePacket = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  const withBaseline = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ baselinePacket }))
  const withIntake = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ intakePacket }))
  const withBoth = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ baselinePacket, intakePacket }))
  const blockedBaseline = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    baselinePacket: buildShopPilotBaselinePacket(sampleBaselineInput({
      claimedMedianMinutesPerOrder: 11,
    }), { generatedAt: '2026-08-25T00:00:00.000Z' }),
  }))
  const dirty = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    gitState: { ...sampleShopPilotLaunchGateInput().gitState, clean: false },
  }))
  const syntheticProof = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    readiness: {
      ...sampleShopPilotLaunchGateInput().readiness,
      pilotEvidence: { ...sampleShopPilotLaunchGateInput().readiness.pilotEvidence, syntheticEvidenceAccepted: true },
    },
  }))
  const contactAllowed = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    publicBoundary: {
      ...sampleShopPilotLaunchGateInput().publicBoundary,
      controls: { ...sampleShopPilotLaunchGateInput().publicBoundary.controls, customerContactPerformed: true },
    },
  }))
  const tamperedIntake = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    intakePacket: { ...intakePacket, controls: { ...intakePacket.controls, customerContactAllowed: true } },
  }))
  const checks = {
    valid_candidate_is_private_intake_only: valid.ok === true && validateShopPilotLaunchGate(valid) === valid,
    public_safe_baseline_advances_private_handoff: withBaseline.ok === true
      && withBaseline.status === 'owner_private_baseline_ready'
      && withBaseline.launchReadiness.baselinePacketAccepted === true
      && withBaseline.launchReadiness.readyForCustomerContact === false
      && validateShopPilotLaunchGate(withBaseline) === withBaseline,
    public_safe_intake_advances_private_handoff: withIntake.ok === true
      && withIntake.status === 'owner_private_intake_ready'
      && withIntake.launchReadiness.intakePacketAccepted === true
      && withIntake.launchReadiness.readyForDeployment === false
      && validateShopPilotLaunchGate(withIntake) === withIntake,
    baseline_and_intake_ready_still_no_external_effects: withBoth.ok === true
      && withBoth.status === 'owner_private_handoff_ready'
      && withBoth.launchReadiness.baselinePacketAccepted === true
      && withBoth.launchReadiness.intakePacketAccepted === true
      && withBoth.launchReadiness.readyForCustomerContact === false
      && validateShopPilotLaunchGate(withBoth) === withBoth,
    blocked_baseline_fails_closed: blockedBaseline.ok === false
      && blockedBaseline.failures.includes('shop_pilot_launch_gate_baseline_packet_not_ready'),
    tampered_intake_fails_closed: tamperedIntake.ok === false
      && tamperedIntake.failures.some((failure) => failure.startsWith('shop_pilot_launch_gate_intake_packet_invalid')),
    dirty_worktree_fails_closed: dirty.ok === false && dirty.failures.includes('shop_pilot_launch_gate_worktree_dirty'),
    synthetic_proof_fails_closed: syntheticProof.ok === false && syntheticProof.failures.includes('shop_pilot_launch_gate_pilot_evidence_state_invalid'),
    contact_control_fails_closed: contactAllowed.ok === false && contactAllowed.failures.some((failure) => failure.startsWith('shop_pilot_launch_gate_public_boundary_invalid')),
    no_external_effects_allowed: Object.entries(valid.controls)
      .filter(([key]) => key !== 'noWriteVerification')
      .every(([, value]) => value === false),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ok: failedChecks.length === 0,
    contract: `${SHOP_PILOT_LAUNCH_GATE_CONTRACT}.self-test`,
    checks,
    failedChecks,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const options = { selfTest: false, verifyReportPath: null, baselinePacketPath: null, intakePacketPath: null, output: null }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--verify') {}
    else if (arg === '--verify-report') options.verifyReportPath = args[++index] || null
    else if (arg === '--baseline-packet') options.baselinePacketPath = args[++index] || null
    else if (arg === '--intake-packet') options.intakePacketPath = args[++index] || null
    else if (arg === '--output') options.output = args[++index] || null
    else throw new Error(`shop_pilot_launch_gate_usage_invalid:${arg}`)
  }
  if (options.selfTest) {
    const result = runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (options.verifyReportPath) {
    const report = validateShopPilotLaunchGate(await readJson(options.verifyReportPath))
    console.log(JSON.stringify({
      ok: true,
      contract: report.contract,
      status: report.status,
      digest: report.digest,
      head: report.candidate.head,
      externalWritesPerformed: false,
    }))
    return
  }
  const report = await currentShopPilotLaunchGateReport({
    baselinePacketPath: options.baselinePacketPath,
    intakePacketPath: options.intakePacketPath,
  })
  if (options.output) {
    await writeOutput(options.output, `${JSON.stringify(report, null, 2)}\n`)
  }
  console.log(JSON.stringify({
    ok: report.ok,
    contract: report.contract,
    status: report.status,
    head: report.candidate.head,
    clean: report.candidate.clean,
    authority: report.launchReadiness.authority,
    baselinePacketAccepted: report.launchReadiness.baselinePacketAccepted,
    intakePacketAccepted: report.launchReadiness.intakePacketAccepted,
    requiredNextGateIds: report.requiredNextGates.map((gate) => gate.id),
    failures: report.failures,
    output: options.output ? resolve(options.output) : null,
  }, null, 2))
  if (!report.ok) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: SHOP_PILOT_LAUNCH_GATE_CONTRACT,
      error: String(error?.message || 'shop_pilot_launch_gate_failed').slice(0, 260),
      externalEffectsAllowed: false,
    }))
    process.exitCode = 1
  })
}
