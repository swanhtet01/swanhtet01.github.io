#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SHOP_PILOT_LAUNCH_GATE_CONTRACT,
  assessShopPilotLaunchGate,
  currentShopPilotLaunchGateReport,
  sampleShopPilotLaunchGateInput,
  validateShopPilotLaunchGate,
} from './verify_shop_pilot_launch_gate.mjs'
import {
  SHOP_PILOT_BASELINE_INPUT_CONTRACT,
  SHOP_PILOT_BASELINE_WORKSHEET_CONTRACT,
  baselineInputTemplate,
  buildShopPilotBaselinePacket,
  renderShopPilotBaselineWorksheetMarkdown,
} from './prepare_shop_pilot_baseline_packet.mjs'
import {
  buildShopPilotPrivateIntakePacket,
  sampleShopPilotPrivateIntakeInput,
} from './prepare_shop_pilot_private_intake_packet.mjs'
import { validateGitHubMainProtectionSnapshot } from './collect_github_main_protection_snapshot.mjs'
import { validateReleaseHandoffPacket } from './prepare_release_handoff.mjs'

export const SHOP_PILOT_DAY0_READINESS_CONTRACT = 'supermega.shop-pilot-day0-readiness.v1'

const SHOP_RUN001_PRIVATE_OBSERVATION_BRIDGE_CONTRACT = 'supermega.shop-run001-private-observation-bridge.v1'
const SHOP_PILOT_BASELINE_CAPTURE_CHECKLIST_CONTRACT = 'supermega.shop-pilot-owner-private-baseline-checklist.v1'
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const STATUSES = [
  'blocked_launch_gate_failed',
  'blocked_owner_baseline_and_intake_required',
  'blocked_owner_private_intake_required',
  'blocked_owner_observed_baseline_required',
  'day0_owner_private_handoff_ready',
]
const RELEASE_CONTROL_GATE_IDS = [
  'github_main_protection',
  'review_branch_push',
  'pull_request_creation',
]
const SECRET_OR_PRIVATE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /[A-Za-z]:\\+[^"\n]+/,
  /(?:^|["\s])\/(?:Users|home)\/[^\s"]+/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /(?<![A-Za-z0-9])(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}(?![A-Za-z0-9])/u,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]
const REQUIRED_FALSE_CONTROLS = [
  'noWritePacket',
  'customerContactAllowed',
  'paymentAllowed',
  'stockMovementAllowed',
  'hostedWritesAllowed',
  'githubWritesAllowed',
  'vercelDeployAllowed',
  'supabaseWritesAllowed',
  'productionReleaseAllowed',
  'managedActivationAllowed',
  'externalEffectsAllowed',
  'privateIdentityIncluded',
  'credentialValuesIncluded',
]
const RUN001_REQUIRED_PRIVATE_ARTIFACTS = [
  'evidence.private.md',
  'anchor.private.md',
  'run-001.commands.private.ps1',
  'observed-summary.private.json',
]
const RUN001_BRIDGE_AUTHORIZATION_KEYS = [
  'customerContactAllowed',
  'paymentAllowed',
  'stockMovementAllowed',
  'hostedWritesAllowed',
  'serverWritesAllowed',
  'githubWritesAllowed',
  'vercelDeployAllowed',
  'supabaseWritesAllowed',
  'managedActivationAllowed',
  'privateIdentityIncluded',
  'credentialValuesIncluded',
]
const BASELINE_CAPTURE_REQUIRED_METRICS = [
  'weekly_orders',
  'median_minutes_per_order',
  'weekly_exception_count',
  'daily_close_minutes',
  'median_minutes_per_redemption',
]
const BASELINE_CAPTURE_REQUIRED_CONFIRMATIONS = [
  'operator_review_every_run',
  'owner_confirmed_baseline',
  'no_supermega_demo_measured',
  'no_external_effects',
]
const BASELINE_CAPTURE_STOP_CONDITIONS = [
  'fewer_than_three_uninterrupted_manual_order_runs',
  'fewer_than_three_uninterrupted_package_redemption_runs',
  'synthetic_or_supermega_demo_run_used_as_baseline',
  'raw_identity_or_private_note_would_enter_owner_safe_packet',
  'customer_message_payment_stock_or_hosted_write_needed',
  'operator_declines_review_every_run',
  'owner_cannot_confirm_baseline',
]
const REQUIRED_PROMOTION_ACCEPTED_RUNS = 20
const REQUIRED_PROMOTION_PILOT_DAY_INDEXES = Object.freeze([1, 2, 3, 4, 5])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(code) {
  throw new Error(code)
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function hasPrivateOrSecretShape(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  return SECRET_OR_PRIVATE_PATTERNS.some((pattern) => pattern.test(text))
}

function assertNoPrivateOrSecretShape(value, code = 'shop_pilot_day0_private_or_secret_shape') {
  if (hasPrivateOrSecretShape(value)) fail(code)
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
}

function promotionEvidenceRequirementFor(launchGateReport) {
  const readiness = launchGateReport.launchReadiness || {}
  return {
    requiredAcceptedConsecutiveRuns: readiness.promotionEvidenceRequiredAcceptedRuns ?? REQUIRED_PROMOTION_ACCEPTED_RUNS,
    acceptedConsecutiveRuns: readiness.promotionEvidenceAcceptedRuns ?? 0,
    requiredPilotDayIndexes: Array.isArray(readiness.promotionEvidenceRequiredPilotDayIndexes)
      ? [...readiness.promotionEvidenceRequiredPilotDayIndexes]
      : [...REQUIRED_PROMOTION_PILOT_DAY_INDEXES],
    acceptedConsecutivePilotDayIndexes: Array.isArray(readiness.promotionEvidenceAcceptedPilotDayIndexes)
      ? [...readiness.promotionEvidenceAcceptedPilotDayIndexes]
      : [],
    pilotSequenceCoverageMet: readiness.promotionEvidencePilotSequenceCoverageMet === true,
    readyForPromotionEvidence: false,
    syntheticEvidenceAccepted: false,
  }
}

function validateLaunchGateDigest(report) {
  if (!isRecord(report) || report.contract !== SHOP_PILOT_LAUNCH_GATE_CONTRACT) {
    fail('shop_pilot_day0_launch_gate_contract_invalid')
  }
  const { digest: actualDigest, ...body } = report
  if (!DIGEST_PATTERN.test(actualDigest || '') || actualDigest !== digest(JSON.stringify(body))) {
    fail('shop_pilot_day0_launch_gate_digest_invalid')
  }
  if (report.ok === true) validateShopPilotLaunchGate(report)
  return report
}

function day0Status(launchGateReport) {
  if (launchGateReport.ok !== true) return 'blocked_launch_gate_failed'
  const baselineReady = launchGateReport.launchReadiness?.baselinePacketAccepted === true
  const intakeReady = launchGateReport.launchReadiness?.intakePacketAccepted === true
  if (baselineReady && intakeReady) return 'day0_owner_private_handoff_ready'
  if (baselineReady) return 'blocked_owner_private_intake_required'
  if (intakeReady) return 'blocked_owner_observed_baseline_required'
  return 'blocked_owner_baseline_and_intake_required'
}

function releaseBlockerForGate(gateId) {
  if (gateId === 'github_main_protection') return 'github_main_protection_unverified'
  if (gateId === 'review_branch_push') return 'review_branch_push_missing'
  if (gateId === 'pull_request_creation') return 'pull_request_creation_missing'
  fail('shop_pilot_day0_release_gate_invalid')
}

export function buildShopPilotDay0ReleaseGateEvidence({ releaseHandoff, githubProtectionSnapshot } = {}) {
  const handoff = validateReleaseHandoffPacket(releaseHandoff)
  const snapshot = validateGitHubMainProtectionSnapshot(githubProtectionSnapshot)
  const currentGateId = snapshot.assessment?.ok !== true
    ? 'github_main_protection'
    : handoff.remote?.candidateBranchState === 'exact'
      ? 'pull_request_creation'
      : 'review_branch_push'
  return {
    source: 'release_handoff_and_github_snapshot',
    candidateCommit: handoff.candidate.commit,
    currentGateId,
    releaseHandoffDigest: handoff.digest,
    githubMainProtectionSnapshotDigest: snapshot.digest,
    mainProtectionVerified: snapshot.assessment?.ok === true,
  }
}

function releaseGateSummaryFor(input, launchGateReport) {
  const evidence = input?.releaseGateEvidence || null
  if (!evidence) {
    return {
      provided: false,
      releaseHandoffDigest: null,
      githubMainProtectionSnapshotDigest: null,
      currentGateId: 'github_main_protection',
      mainProtectionVerified: false,
      currentBlocker: 'github_main_protection_unverified',
      source: 'not_supplied_fail_closed',
    }
  }
  assertNoPrivateOrSecretShape(evidence, 'shop_pilot_day0_release_gate_private_or_secret_shape')
  if (!isRecord(evidence) || evidence.source !== 'release_handoff_and_github_snapshot') {
    fail('shop_pilot_day0_release_gate_evidence_invalid')
  }
  const gateId = String(evidence.currentGateId || '')
  if (!RELEASE_CONTROL_GATE_IDS.includes(gateId)) fail('shop_pilot_day0_release_gate_invalid')
  const releaseCommit = String(evidence.candidateCommit || '')
  const launchCommit = String(launchGateReport.candidate?.head || '')
  if (releaseCommit && launchCommit && releaseCommit !== launchCommit) {
    fail('shop_pilot_day0_release_gate_candidate_mismatch')
  }
  if (!DIGEST_PATTERN.test(String(evidence.releaseHandoffDigest || ''))
    || !DIGEST_PATTERN.test(String(evidence.githubMainProtectionSnapshotDigest || ''))) {
    fail('shop_pilot_day0_release_gate_digest_invalid')
  }
  if (evidence.mainProtectionVerified !== (gateId !== 'github_main_protection')) fail('shop_pilot_day0_release_gate_invalid')
  return {
    provided: true,
    releaseHandoffDigest: evidence.releaseHandoffDigest,
    githubMainProtectionSnapshotDigest: evidence.githubMainProtectionSnapshotDigest,
    currentGateId: gateId,
    mainProtectionVerified: gateId !== 'github_main_protection',
    currentBlocker: releaseBlockerForGate(gateId),
    source: 'release_handoff_and_github_snapshot',
  }
}

function blockersFor(status, launchGateReport, releaseGate) {
  const blockers = []
  if (status === 'blocked_launch_gate_failed') blockers.push(...(launchGateReport.failures || ['launch_gate_failed']))
  if (status === 'blocked_owner_baseline_and_intake_required' || status === 'blocked_owner_observed_baseline_required') {
    blockers.push('owner_observed_baseline_packet_missing')
  }
  if (status === 'blocked_owner_baseline_and_intake_required' || status === 'blocked_owner_private_intake_required') {
    blockers.push('owner_private_intake_packet_missing')
  }
  blockers.push(releaseGate.currentBlocker)
  blockers.push('preview_rehearsal_missing')
  blockers.push('real_pilot_evidence_missing')
  return [...new Set(blockers)]
}

function ownerActionFor(status) {
  if (status === 'day0_owner_private_handoff_ready') {
    return 'Prepare the owner-private Shop handoff using the accepted baseline and intake digests; still do not contact the participant or enable hosted writes.'
  }
  if (status === 'blocked_owner_observed_baseline_required') {
    return 'Capture at least three owner-observed manual Shop order runs and three package-redemption runs, then generate the owner-safe baseline packet.'
  }
  if (status === 'blocked_owner_private_intake_required') {
    return 'Generate and review the owner-private Shop intake packet before day-one handoff.'
  }
  if (status === 'blocked_owner_baseline_and_intake_required') {
    return 'Complete both private prerequisites: owner-observed baseline packet and owner-private intake packet.'
  }
  return 'Fix the failing launch-gate evidence before day-zero pilot readiness can be assessed.'
}

function nextOwnerPrivateStepFor(status) {
  const base = {
    ownerRole: 'Founder plus Product',
    privateWorkspaceRequired: true,
    publicSafe: true,
    safeBeforeReleaseGate: true,
    releaseGateStillRequiredBeforePilotActivation: true,
    allowedNow: 'owner_private_local_preparation_only',
    externalEffectsAllowed: false,
    customerContactAllowed: false,
    paymentAllowed: false,
    stockMovementAllowed: false,
    hostedWritesAllowed: false,
    managedActivationAllowed: false,
  }
  if (status === 'blocked_owner_observed_baseline_required') {
    return {
      ...base,
      id: 'capture-owner-observed-baseline',
      label: 'Capture owner-observed baseline runs',
      commandId: 'shop:pilot:baseline-packet',
      requiredPrivateInputs: ['manual_order_runs', 'package_redemption_runs', 'daily_close_minutes', 'exception_count'],
      completionSignal: 'public_safe_baseline_packet_digest',
    }
  }
  if (status === 'blocked_owner_private_intake_required') {
    return {
      ...base,
      id: 'prepare-owner-private-intake',
      label: 'Prepare owner-private pilot intake packet',
      commandId: 'shop:pilot:intake-packet',
      requiredPrivateInputs: ['participant_stage', 'pilot_window', 'review_roles', 'no_external_effects_confirmation'],
      completionSignal: 'public_safe_intake_packet_digest',
    }
  }
  if (status === 'blocked_owner_baseline_and_intake_required') {
    return {
      ...base,
      id: 'capture-baseline-then-intake',
      label: 'Capture baseline first, then prepare intake',
      commandId: 'shop:pilot:baseline-packet',
      requiredPrivateInputs: ['manual_order_runs', 'package_redemption_runs', 'daily_close_minutes', 'exception_count'],
      completionSignal: 'baseline_packet_digest_then_intake_packet_digest',
    }
  }
  if (status === 'day0_owner_private_handoff_ready') {
    return {
      ...base,
      id: 'prepare-day-one-private-handoff',
      label: 'Prepare day-one private handoff without contact or hosted writes',
      commandId: 'shop:pilot:day0-readiness',
      requiredPrivateInputs: ['accepted_baseline_digest', 'accepted_intake_digest', 'owner_review_schedule'],
      completionSignal: 'owner_private_handoff_ready_digest',
    }
  }
  return {
    ...base,
    safeBeforeReleaseGate: false,
    id: 'fix-launch-gate-evidence',
    label: 'Fix launch-gate evidence before any Day-0 handoff',
    commandId: 'shop:pilot:launch-gate:verify',
    requiredPrivateInputs: ['clean_worktree', 'accepted_public_boundary', 'release_gate_evidence'],
    completionSignal: 'launch_gate_ok_digest',
  }
}

function boolValue(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function digestValue(value) {
  if (value === null || value === undefined || value === '') return null
  const normalized = String(value)
  if (!DIGEST_PATTERN.test(normalized)) fail('shop_pilot_day0_owner_prep_digest_invalid')
  return normalized
}

function ownerPrivatePreparationFor(status, sourceDigests, input = {}) {
  const baselineInputTemplateDigest = digestValue(input.baselineInputTemplateDigest)
  const baselineWorksheetDigest = digestValue(input.baselineWorksheetDigest)
  const acceptedBaselinePacketDigest = sourceDigests.baselinePacketDigest || null
  const acceptedIntakePacketDigest = sourceDigests.intakePacketDigest || null
  return {
    artifactPolicy: 'digests_only_no_paths',
    workspacePolicy: 'owner_private_local_workspace_only',
    nextRequiredDigest: status === 'blocked_owner_private_intake_required'
      ? 'intake_packet_digest'
      : status === 'day0_owner_private_handoff_ready'
        ? 'owner_private_handoff_digest'
        : 'baseline_packet_digest',
    baselineInputTemplate: {
      provided: Boolean(baselineInputTemplateDigest),
      contract: SHOP_PILOT_BASELINE_INPUT_CONTRACT,
      digest: baselineInputTemplateDigest,
      blankTemplate: baselineInputTemplateDigest ? boolValue(input.baselineInputTemplateBlank, false) : null,
    },
    baselineWorksheet: {
      provided: Boolean(baselineWorksheetDigest),
      contract: SHOP_PILOT_BASELINE_WORKSHEET_CONTRACT,
      digest: baselineWorksheetDigest,
      blankWorksheet: baselineWorksheetDigest ? boolValue(input.baselineWorksheetBlank, false) : null,
    },
    acceptedBaselinePacketDigest,
    acceptedIntakePacketDigest,
    minimumEvidence: {
      uninterruptedManualOrderRuns: 3,
      uninterruptedPackageRedemptionRuns: 3,
      weeklyOrdersRequired: true,
      weeklyExceptionsRequired: true,
      dailyCloseMinutesRequired: true,
      operatorReviewEveryRunRequired: true,
      noSuperMegaDemoMeasuredRequired: true,
      noExternalEffectsRequired: true,
    },
    outputPolicy: {
      generatedBaselinePacketPublicSafe: true,
      rawIdentityStaysPrivate: true,
      localPathsIncluded: false,
      externalEffectsAllowed: false,
    },
  }
}

function ownerPrivateObservationBridgeFor(status) {
  const baselineMissing = status === 'blocked_owner_baseline_and_intake_required'
    || status === 'blocked_owner_observed_baseline_required'
  const state = status === 'blocked_launch_gate_failed'
    ? 'blocked_until_launch_gate_clean'
    : baselineMissing
      ? 'private_observation_incomplete'
      : status === 'blocked_owner_private_intake_required'
        ? 'baseline_public_packet_accepted'
        : 'day0_private_handoff_ready'
  const allowedNow = status === 'blocked_launch_gate_failed'
    ? 'none_until_launch_gate_clean'
    : baselineMissing
      ? 'owner_private_local_observation_only'
      : status === 'blocked_owner_private_intake_required'
        ? 'owner_private_intake_only'
        : 'owner_private_handoff_preparation_only'
  const nextLocalAction = status === 'blocked_launch_gate_failed'
    ? 'fix_launch_gate_evidence_before_private_observation_bridge'
    : baselineMissing
      ? 'perform_real_observation_and_fill_private_evidence_anchor'
      : status === 'blocked_owner_private_intake_required'
        ? 'generate_owner_private_intake_packet_without_contacting_participant'
        : 'prepare_owner_private_day_one_handoff_from_accepted_digests'
  const completionSignal = status === 'blocked_launch_gate_failed'
    ? 'launch_gate_ok_digest'
    : baselineMissing
      ? 'public_safe_baseline_packet_digest'
      : status === 'blocked_owner_private_intake_required'
        ? 'public_safe_intake_packet_digest'
        : 'owner_private_handoff_digest'
  return {
    contract: SHOP_RUN001_PRIVATE_OBSERVATION_BRIDGE_CONTRACT,
    workspaceLabel: 'private-shop-pilots/run-001-private',
    privateWorkspaceRequired: true,
    publicSafe: true,
    state,
    allowedNow,
    relativeOrchestratorCommand: '.\\complete-run-001-after-observation.ps1',
    expectedCurrentGate: baselineMissing ? 'private_observation_incomplete' : null,
    nextLocalAction,
    requiredPrivateArtifacts: [...RUN001_REQUIRED_PRIVATE_ARTIFACTS],
    readyForObservationExpected: baselineMissing,
    readyToRecordInitialState: false,
    promotionEvidenceAccepted: false,
    completionSignal,
    authorizations: Object.fromEntries(RUN001_BRIDGE_AUTHORIZATION_KEYS.map((key) => [key, false])),
  }
}

function ownerPrivateBaselineChecklistFor(status, launchGateReport) {
  const baselineAccepted = launchGateReport.launchReadiness?.baselinePacketAccepted === true
  const metrics = launchGateReport.baselineEvidence?.metrics || {}
  const requiredOrderRuns = 3
  const requiredRedemptionRuns = 3
  const uninterruptedOrderRunCount = metrics.uninterruptedOrderRunCount ?? 0
  const uninterruptedRedemptionRunCount = metrics.uninterruptedRedemptionRunCount ?? 0
  const readyToGeneratePublicBaselinePacket = baselineAccepted
    || (uninterruptedOrderRunCount >= requiredOrderRuns && uninterruptedRedemptionRunCount >= requiredRedemptionRuns)
  return {
    contract: SHOP_PILOT_BASELINE_CAPTURE_CHECKLIST_CONTRACT,
    state: baselineAccepted
      ? 'baseline_public_packet_accepted'
      : status === 'blocked_launch_gate_failed'
        ? 'blocked_until_launch_gate_clean'
        : 'owner_private_baseline_capture_required',
    privateWorkspaceRequired: true,
    publicSafe: true,
    evidenceKind: 'owner_observed_manual_operations_only',
    readyToGeneratePublicBaselinePacket,
    completionSignal: baselineAccepted ? 'accepted_baseline_packet_digest' : 'public_safe_baseline_packet_digest',
    requiredFlows: [
      {
        id: 'manual_order',
        label: 'Manual order entry',
        requiredUninterruptedRuns: requiredOrderRuns,
        observedRuns: metrics.observedOrderRunCount ?? 0,
        uninterruptedRuns: uninterruptedOrderRunCount,
        accepted: uninterruptedOrderRunCount >= requiredOrderRuns,
      },
      {
        id: 'package_redemption',
        label: 'Package redemption',
        requiredUninterruptedRuns: requiredRedemptionRuns,
        observedRuns: metrics.observedRedemptionRunCount ?? 0,
        uninterruptedRuns: uninterruptedRedemptionRunCount,
        accepted: uninterruptedRedemptionRunCount >= requiredRedemptionRuns,
      },
    ],
    requiredMetrics: [...BASELINE_CAPTURE_REQUIRED_METRICS],
    requiredConfirmations: [...BASELINE_CAPTURE_REQUIRED_CONFIRMATIONS],
    promotionEvidenceRequirement: promotionEvidenceRequirementFor(launchGateReport),
    stopConditions: [...BASELINE_CAPTURE_STOP_CONDITIONS],
    publicOutputAllowed: {
      counts: true,
      timings: true,
      booleans: true,
      digests: true,
      rawIdentity: false,
      rawNotes: false,
      localPaths: false,
      credentials: false,
    },
    forbiddenActions: {
      customerContactAllowed: false,
      automaticMessageAllowed: false,
      paymentAllowed: false,
      stockMovementAllowed: false,
      hostedWriteAllowed: false,
      managedActivationAllowed: false,
    },
  }
}

function sampleBaselineInput() {
  return {
    contract: SHOP_PILOT_BASELINE_INPUT_CONTRACT,
    product: 'shop',
    pilotMode: 'owner_named',
    verticalPack: 'spa-services',
    observedAt: '2026-08-25T08:00:00.000Z',
    businessName: 'Private Day Zero Spa',
    namedOperator: 'Private Day Zero Operator',
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
  }
}

export function buildShopPilotDay0ReadinessPacket(input = {}) {
  assertNoPrivateOrSecretShape(input.launchGateReport)
  assertNoPrivateOrSecretShape(input.ownerPrivatePreparation)
  const launchGateReport = validateLaunchGateDigest(input.launchGateReport)
  const releaseGate = releaseGateSummaryFor(input, launchGateReport)
  const status = day0Status(launchGateReport)
  const baselineAccepted = launchGateReport.launchReadiness?.baselinePacketAccepted === true
  const intakeAccepted = launchGateReport.launchReadiness?.intakePacketAccepted === true
  const ownerPrivateHandoffReady = status === 'day0_owner_private_handoff_ready'
  const promotionEvidenceRequirement = promotionEvidenceRequirementFor(launchGateReport)
  const sourceDigests = {
    launchGateDigest: launchGateReport.digest,
    baselinePacketDigest: launchGateReport.launchReadiness?.baselinePacketDigest || null,
    baselinePrivateInputDigest: launchGateReport.launchReadiness?.baselinePrivateInputDigest || null,
    intakePacketDigest: launchGateReport.launchReadiness?.intakePacketDigest || null,
    publicBoundaryDigest: launchGateReport.publicBoundary?.fileDigest || null,
    releaseHandoffDigest: releaseGate.releaseHandoffDigest,
    githubMainProtectionSnapshotDigest: releaseGate.githubMainProtectionSnapshotDigest,
  }
  const body = {
    contract: SHOP_PILOT_DAY0_READINESS_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: input.generatedAt || new Date().toISOString(),
    product: 'shop',
    pilotMode: 'owner_named',
    status,
    ok: launchGateReport.ok === true,
    day0ReadyForOwnerPrivateHandoff: ownerPrivateHandoffReady,
    repository: launchGateReport.repository || null,
    candidate: {
      branch: launchGateReport.candidate?.branch || null,
      head: launchGateReport.candidate?.head || null,
      clean: launchGateReport.candidate?.clean === true,
      aheadOfOriginMain: launchGateReport.candidate?.aheadOfOriginMain ?? null,
    },
    sourceDigests,
    day0Readiness: {
      baselinePacketAccepted: baselineAccepted,
      intakePacketAccepted: intakeAccepted,
      ownerPrivateHandoffReady,
      measuredManualRunsRequiredPerFlow: 3,
      observedOrderRunCount: launchGateReport.baselineEvidence?.metrics?.observedOrderRunCount ?? 0,
      uninterruptedOrderRunCount: launchGateReport.baselineEvidence?.metrics?.uninterruptedOrderRunCount ?? 0,
      observedRedemptionRunCount: launchGateReport.baselineEvidence?.metrics?.observedRedemptionRunCount ?? 0,
      uninterruptedRedemptionRunCount: launchGateReport.baselineEvidence?.metrics?.uninterruptedRedemptionRunCount ?? 0,
      medianMinutesPerOrder: launchGateReport.baselineEvidence?.metrics?.medianMinutesPerOrder ?? null,
      medianMinutesPerRedemption: launchGateReport.baselineEvidence?.metrics?.medianMinutesPerRedemption ?? null,
      weeklyExceptionCount: launchGateReport.baselineEvidence?.metrics?.weeklyExceptionCount ?? null,
      closeMinutesPerDay: launchGateReport.baselineEvidence?.metrics?.closeMinutesPerDay ?? null,
      readyForCustomerContact: false,
      readyForPayment: false,
      readyForDeployment: false,
      readyForManagedActivation: false,
      readyForPromotionEvidence: false,
    },
    promotionEvidenceRequirement,
    pilotWindow: launchGateReport.baselineEvidence?.pilotWindow || null,
    releaseGate: {
      source: releaseGate.source,
      currentGateId: releaseGate.currentGateId,
      currentBlocker: releaseGate.currentBlocker,
      releaseEvidenceProvided: releaseGate.provided,
      releaseHandoffDigest: releaseGate.releaseHandoffDigest,
      githubMainProtectionSnapshotDigest: releaseGate.githubMainProtectionSnapshotDigest,
      mainProtectionVerified: releaseGate.mainProtectionVerified,
      ownerApprovalStillRequired: true,
      branchPushAllowedNow: false,
      pullRequestAllowedNow: false,
      deployAllowedNow: false,
      supabaseWriteAllowedNow: false,
      customerContactAllowedNow: false,
      paymentOrStockAllowedNow: false,
      managedActivationAllowedNow: false,
    },
    ownerAction: ownerActionFor(status),
    nextOwnerPrivateStep: nextOwnerPrivateStepFor(status),
    ownerPrivatePreparation: ownerPrivatePreparationFor(status, sourceDigests, input.ownerPrivatePreparation),
    ownerPrivateObservationBridge: ownerPrivateObservationBridgeFor(status),
    ownerPrivateBaselineChecklist: ownerPrivateBaselineChecklistFor(status, launchGateReport),
    blockers: blockersFor(status, launchGateReport, releaseGate),
    privateCommands: [
      'npm.cmd run shop:pilot:baseline-packet -- --template "<private-baseline-input.json>" --worksheet-output "<private-baseline-worksheet.md>"',
      'npm.cmd run shop:pilot:baseline-packet -- --lint-input "<private-baseline-input.json>"',
      'npm.cmd run shop:pilot:baseline-packet -- --input "<private-baseline-input.json>" --output "<owner-safe-baseline-packet.json>" --markdown-output "<owner-safe-baseline-packet.md>"',
      'npm.cmd run shop:pilot:intake-packet -- --output "<owner-safe-intake-packet.json>"',
      'npm.cmd run shop:pilot:launch-gate:verify -- --baseline-packet "<owner-safe-baseline-packet.json>" --intake-packet "<owner-safe-intake-packet.json>"',
      'npm.cmd run shop:pilot:day0-readiness -- --baseline-packet "<owner-safe-baseline-packet.json>" --intake-packet "<owner-safe-intake-packet.json>" --release-handoff "<release-handoff.json>" --github-protection-snapshot "<github-protection-snapshot.json>" --output "<owner-safe-day0-packet.json>" --markdown-output "<owner-safe-day0-packet.md>"',
    ],
    forbiddenActions: [
      'customer_contact',
      'automatic_message_send',
      'payment',
      'stock_movement',
      'hosted_write',
      'github_write',
      'vercel_deploy_or_promote',
      'supabase_mutation',
      'production_release',
      'managed_activation',
    ],
    controls: {
      noWritePacket: false,
      customerContactAllowed: false,
      paymentAllowed: false,
      stockMovementAllowed: false,
      hostedWritesAllowed: false,
      githubWritesAllowed: false,
      vercelDeployAllowed: false,
      supabaseWritesAllowed: false,
      productionReleaseAllowed: false,
      managedActivationAllowed: false,
      externalEffectsAllowed: false,
      privateIdentityIncluded: false,
      credentialValuesIncluded: false,
    },
  }
  body.controls.noWritePacket = true
  assertNoPrivateOrSecretShape(body)
  return { ...body, digest: digest(JSON.stringify(body)) }
}

export function validateShopPilotDay0ReadinessPacket(packet) {
  assertNoPrivateOrSecretShape(packet)
  if (!isRecord(packet) || packet.contract !== SHOP_PILOT_DAY0_READINESS_CONTRACT) fail('shop_pilot_day0_contract_invalid')
  const { digest: actualDigest, ...body } = packet
  if (!DIGEST_PATTERN.test(actualDigest || '') || actualDigest !== digest(JSON.stringify(body))) fail('shop_pilot_day0_digest_invalid')
  if (!STATUSES.includes(packet.status)) fail('shop_pilot_day0_status_invalid')
  if (packet.product !== 'shop' || packet.pilotMode !== 'owner_named') fail('shop_pilot_day0_scope_invalid')
  if (packet.ok !== (packet.status !== 'blocked_launch_gate_failed')) fail('shop_pilot_day0_ok_invalid')
  const baselineAccepted = packet.day0Readiness?.baselinePacketAccepted === true
  const intakeAccepted = packet.day0Readiness?.intakePacketAccepted === true
  const shouldBeReady = packet.ok === true && baselineAccepted && intakeAccepted
  const promotion = packet.promotionEvidenceRequirement
  if (packet.day0ReadyForOwnerPrivateHandoff !== shouldBeReady
    || packet.day0Readiness?.ownerPrivateHandoffReady !== shouldBeReady
    || packet.day0Readiness?.readyForCustomerContact !== false
    || packet.day0Readiness?.readyForPayment !== false
    || packet.day0Readiness?.readyForDeployment !== false
    || packet.day0Readiness?.readyForManagedActivation !== false
    || packet.day0Readiness?.readyForPromotionEvidence !== false) {
    fail('shop_pilot_day0_readiness_invalid')
  }
  if (!isRecord(promotion)
    || promotion.requiredAcceptedConsecutiveRuns !== REQUIRED_PROMOTION_ACCEPTED_RUNS
    || promotion.acceptedConsecutiveRuns !== 0
    || !sameArray(promotion.requiredPilotDayIndexes, REQUIRED_PROMOTION_PILOT_DAY_INDEXES)
    || !sameArray(promotion.acceptedConsecutivePilotDayIndexes, [])
    || promotion.pilotSequenceCoverageMet !== false
    || promotion.readyForPromotionEvidence !== false
    || promotion.syntheticEvidenceAccepted !== false) {
    fail('shop_pilot_day0_promotion_evidence_requirement_invalid')
  }
  if (packet.status === 'day0_owner_private_handoff_ready' && !shouldBeReady) fail('shop_pilot_day0_ready_status_invalid')
  if (packet.status !== 'day0_owner_private_handoff_ready' && shouldBeReady) fail('shop_pilot_day0_blocked_status_invalid')
  if (!isRecord(packet.sourceDigests)
    || !DIGEST_PATTERN.test(packet.sourceDigests.launchGateDigest || '')
    || (baselineAccepted && !DIGEST_PATTERN.test(packet.sourceDigests.baselinePacketDigest || ''))
    || (intakeAccepted && !DIGEST_PATTERN.test(packet.sourceDigests.intakePacketDigest || ''))
    || (packet.sourceDigests.releaseHandoffDigest !== null && !DIGEST_PATTERN.test(packet.sourceDigests.releaseHandoffDigest || ''))
    || (packet.sourceDigests.githubMainProtectionSnapshotDigest !== null && !DIGEST_PATTERN.test(packet.sourceDigests.githubMainProtectionSnapshotDigest || ''))) {
    fail('shop_pilot_day0_source_digests_invalid')
  }
  if (!Array.isArray(packet.blockers) || packet.blockers.length < 3) fail('shop_pilot_day0_blockers_invalid')
  if (!isRecord(packet.releaseGate)
    || !RELEASE_CONTROL_GATE_IDS.includes(packet.releaseGate.currentGateId)
    || packet.releaseGate.currentBlocker !== releaseBlockerForGate(packet.releaseGate.currentGateId)
    || packet.releaseGate.ownerApprovalStillRequired !== true
    || packet.releaseGate.branchPushAllowedNow !== false
    || packet.releaseGate.pullRequestAllowedNow !== false
    || packet.releaseGate.deployAllowedNow !== false
    || packet.releaseGate.supabaseWriteAllowedNow !== false
    || packet.releaseGate.customerContactAllowedNow !== false
    || packet.releaseGate.paymentOrStockAllowedNow !== false
    || packet.releaseGate.managedActivationAllowedNow !== false
    || packet.releaseGate.releaseHandoffDigest !== packet.sourceDigests.releaseHandoffDigest
    || packet.releaseGate.githubMainProtectionSnapshotDigest !== packet.sourceDigests.githubMainProtectionSnapshotDigest
    || (packet.releaseGate.releaseEvidenceProvided !== true && packet.releaseGate.source !== 'not_supplied_fail_closed')
    || (packet.releaseGate.releaseEvidenceProvided === true && packet.releaseGate.source !== 'release_handoff_and_github_snapshot')
    || (packet.releaseGate.releaseEvidenceProvided === true && !DIGEST_PATTERN.test(packet.releaseGate.releaseHandoffDigest || ''))
    || (packet.releaseGate.releaseEvidenceProvided === true && !DIGEST_PATTERN.test(packet.releaseGate.githubMainProtectionSnapshotDigest || ''))
    || (packet.releaseGate.releaseEvidenceProvided !== true && packet.releaseGate.releaseHandoffDigest !== null)
    || (packet.releaseGate.releaseEvidenceProvided !== true && packet.releaseGate.githubMainProtectionSnapshotDigest !== null)
    || packet.releaseGate.mainProtectionVerified !== (packet.releaseGate.currentGateId !== 'github_main_protection')) {
    fail('shop_pilot_day0_release_gate_invalid')
  }
  if (!packet.blockers.includes(packet.releaseGate.currentBlocker)) fail('shop_pilot_day0_release_gate_blocker_missing')
  if (packet.releaseGate.currentGateId !== 'github_main_protection' && packet.blockers.includes('github_main_protection_unverified')) {
    fail('shop_pilot_day0_stale_github_main_protection_blocker')
  }
  if (!isRecord(packet.nextOwnerPrivateStep)
    || typeof packet.nextOwnerPrivateStep.id !== 'string'
    || typeof packet.nextOwnerPrivateStep.label !== 'string'
    || typeof packet.nextOwnerPrivateStep.commandId !== 'string'
    || packet.nextOwnerPrivateStep.ownerRole !== 'Founder plus Product'
    || packet.nextOwnerPrivateStep.privateWorkspaceRequired !== true
    || packet.nextOwnerPrivateStep.publicSafe !== true
    || packet.nextOwnerPrivateStep.allowedNow !== 'owner_private_local_preparation_only'
    || packet.nextOwnerPrivateStep.releaseGateStillRequiredBeforePilotActivation !== true
    || packet.nextOwnerPrivateStep.externalEffectsAllowed !== false
    || packet.nextOwnerPrivateStep.customerContactAllowed !== false
    || packet.nextOwnerPrivateStep.paymentAllowed !== false
    || packet.nextOwnerPrivateStep.stockMovementAllowed !== false
    || packet.nextOwnerPrivateStep.hostedWritesAllowed !== false
    || packet.nextOwnerPrivateStep.managedActivationAllowed !== false
    || !Array.isArray(packet.nextOwnerPrivateStep.requiredPrivateInputs)
    || packet.nextOwnerPrivateStep.requiredPrivateInputs.length < 1
    || typeof packet.nextOwnerPrivateStep.completionSignal !== 'string') {
    fail('shop_pilot_day0_next_owner_private_step_invalid')
  }
  if (!isRecord(packet.ownerPrivatePreparation)
    || packet.ownerPrivatePreparation.artifactPolicy !== 'digests_only_no_paths'
    || packet.ownerPrivatePreparation.workspacePolicy !== 'owner_private_local_workspace_only'
    || !['baseline_packet_digest', 'intake_packet_digest', 'owner_private_handoff_digest'].includes(packet.ownerPrivatePreparation.nextRequiredDigest)
    || !isRecord(packet.ownerPrivatePreparation.baselineInputTemplate)
    || packet.ownerPrivatePreparation.baselineInputTemplate.contract !== SHOP_PILOT_BASELINE_INPUT_CONTRACT
    || typeof packet.ownerPrivatePreparation.baselineInputTemplate.provided !== 'boolean'
    || (packet.ownerPrivatePreparation.baselineInputTemplate.provided && !DIGEST_PATTERN.test(packet.ownerPrivatePreparation.baselineInputTemplate.digest || ''))
    || (packet.ownerPrivatePreparation.baselineInputTemplate.provided && packet.ownerPrivatePreparation.baselineInputTemplate.blankTemplate !== true)
    || (!packet.ownerPrivatePreparation.baselineInputTemplate.provided && packet.ownerPrivatePreparation.baselineInputTemplate.digest !== null)
    || (!packet.ownerPrivatePreparation.baselineInputTemplate.provided && packet.ownerPrivatePreparation.baselineInputTemplate.blankTemplate !== null)
    || !isRecord(packet.ownerPrivatePreparation.baselineWorksheet)
    || packet.ownerPrivatePreparation.baselineWorksheet.contract !== SHOP_PILOT_BASELINE_WORKSHEET_CONTRACT
    || typeof packet.ownerPrivatePreparation.baselineWorksheet.provided !== 'boolean'
    || (packet.ownerPrivatePreparation.baselineWorksheet.provided && !DIGEST_PATTERN.test(packet.ownerPrivatePreparation.baselineWorksheet.digest || ''))
    || (packet.ownerPrivatePreparation.baselineWorksheet.provided && packet.ownerPrivatePreparation.baselineWorksheet.blankWorksheet !== true)
    || (!packet.ownerPrivatePreparation.baselineWorksheet.provided && packet.ownerPrivatePreparation.baselineWorksheet.digest !== null)
    || (!packet.ownerPrivatePreparation.baselineWorksheet.provided && packet.ownerPrivatePreparation.baselineWorksheet.blankWorksheet !== null)
    || (packet.ownerPrivatePreparation.acceptedBaselinePacketDigest !== null && !DIGEST_PATTERN.test(packet.ownerPrivatePreparation.acceptedBaselinePacketDigest))
    || (packet.ownerPrivatePreparation.acceptedIntakePacketDigest !== null && !DIGEST_PATTERN.test(packet.ownerPrivatePreparation.acceptedIntakePacketDigest))
    || packet.ownerPrivatePreparation.outputPolicy?.localPathsIncluded !== false
    || packet.ownerPrivatePreparation.outputPolicy?.externalEffectsAllowed !== false) {
    fail('shop_pilot_day0_owner_private_preparation_invalid')
  }
  const bridge = packet.ownerPrivateObservationBridge
  const expectedBridge = ownerPrivateObservationBridgeFor(packet.status)
  const baselineMissing = packet.status === 'blocked_owner_baseline_and_intake_required'
    || packet.status === 'blocked_owner_observed_baseline_required'
  if (!isRecord(bridge)
    || bridge.contract !== SHOP_RUN001_PRIVATE_OBSERVATION_BRIDGE_CONTRACT
    || bridge.workspaceLabel !== 'private-shop-pilots/run-001-private'
    || bridge.privateWorkspaceRequired !== true
    || bridge.publicSafe !== true
    || bridge.state !== expectedBridge.state
    || bridge.allowedNow !== expectedBridge.allowedNow
    || bridge.relativeOrchestratorCommand !== '.\\complete-run-001-after-observation.ps1'
    || bridge.expectedCurrentGate !== (baselineMissing ? 'private_observation_incomplete' : null)
    || bridge.nextLocalAction !== expectedBridge.nextLocalAction
    || bridge.completionSignal !== expectedBridge.completionSignal
    || bridge.readyForObservationExpected !== baselineMissing
    || bridge.readyToRecordInitialState !== false
    || bridge.promotionEvidenceAccepted !== false
    || !Array.isArray(bridge.requiredPrivateArtifacts)
    || bridge.requiredPrivateArtifacts.length !== RUN001_REQUIRED_PRIVATE_ARTIFACTS.length
    || !RUN001_REQUIRED_PRIVATE_ARTIFACTS.every((artifact) => bridge.requiredPrivateArtifacts.includes(artifact))
    || !isRecord(bridge.authorizations)
    || RUN001_BRIDGE_AUTHORIZATION_KEYS.some((key) => bridge.authorizations[key] !== false)) {
    fail('shop_pilot_day0_owner_private_observation_bridge_invalid')
  }
  const checklist = packet.ownerPrivateBaselineChecklist
  const expectedChecklist = ownerPrivateBaselineChecklistFor(packet.status, {
    launchReadiness: {
      baselinePacketAccepted: packet.day0Readiness.baselinePacketAccepted,
      promotionEvidenceRequiredAcceptedRuns: promotion.requiredAcceptedConsecutiveRuns,
      promotionEvidenceAcceptedRuns: promotion.acceptedConsecutiveRuns,
      promotionEvidenceRequiredPilotDayIndexes: promotion.requiredPilotDayIndexes,
      promotionEvidenceAcceptedPilotDayIndexes: promotion.acceptedConsecutivePilotDayIndexes,
      promotionEvidencePilotSequenceCoverageMet: promotion.pilotSequenceCoverageMet,
    },
    baselineEvidence: {
      metrics: {
        observedOrderRunCount: packet.day0Readiness.observedOrderRunCount,
        uninterruptedOrderRunCount: packet.day0Readiness.uninterruptedOrderRunCount,
        observedRedemptionRunCount: packet.day0Readiness.observedRedemptionRunCount,
        uninterruptedRedemptionRunCount: packet.day0Readiness.uninterruptedRedemptionRunCount,
      },
    },
  })
  if (!isRecord(checklist)
    || checklist.contract !== SHOP_PILOT_BASELINE_CAPTURE_CHECKLIST_CONTRACT
    || checklist.privateWorkspaceRequired !== true
    || checklist.publicSafe !== true
    || checklist.evidenceKind !== 'owner_observed_manual_operations_only'
    || checklist.state !== expectedChecklist.state
    || checklist.readyToGeneratePublicBaselinePacket !== expectedChecklist.readyToGeneratePublicBaselinePacket
    || checklist.completionSignal !== expectedChecklist.completionSignal
    || !Array.isArray(checklist.requiredFlows)
    || checklist.requiredFlows.length !== 2
    || checklist.requiredFlows.some((flow, index) => JSON.stringify(flow) !== JSON.stringify(expectedChecklist.requiredFlows[index]))
    || !Array.isArray(checklist.requiredMetrics)
    || checklist.requiredMetrics.length !== BASELINE_CAPTURE_REQUIRED_METRICS.length
    || !BASELINE_CAPTURE_REQUIRED_METRICS.every((metric) => checklist.requiredMetrics.includes(metric))
    || !Array.isArray(checklist.requiredConfirmations)
    || checklist.requiredConfirmations.length !== BASELINE_CAPTURE_REQUIRED_CONFIRMATIONS.length
    || !BASELINE_CAPTURE_REQUIRED_CONFIRMATIONS.every((confirmation) => checklist.requiredConfirmations.includes(confirmation))
    || !isRecord(checklist.promotionEvidenceRequirement)
    || JSON.stringify(checklist.promotionEvidenceRequirement) !== JSON.stringify(promotion)
    || !Array.isArray(checklist.stopConditions)
    || checklist.stopConditions.length !== BASELINE_CAPTURE_STOP_CONDITIONS.length
    || !BASELINE_CAPTURE_STOP_CONDITIONS.every((condition) => checklist.stopConditions.includes(condition))
    || checklist.publicOutputAllowed?.rawIdentity !== false
    || checklist.publicOutputAllowed?.rawNotes !== false
    || checklist.publicOutputAllowed?.localPaths !== false
    || checklist.publicOutputAllowed?.credentials !== false
    || Object.values(checklist.forbiddenActions || {}).some((value) => value !== false)) {
    fail('shop_pilot_day0_owner_private_baseline_checklist_invalid')
  }
  if (packet.status === 'blocked_launch_gate_failed' && packet.nextOwnerPrivateStep.safeBeforeReleaseGate !== false) fail('shop_pilot_day0_next_step_gate_invalid')
  if (packet.status !== 'blocked_launch_gate_failed' && packet.nextOwnerPrivateStep.safeBeforeReleaseGate !== true) fail('shop_pilot_day0_next_step_gate_invalid')
  if (packet.status === 'blocked_owner_private_intake_required' && packet.nextOwnerPrivateStep.id !== 'prepare-owner-private-intake') fail('shop_pilot_day0_next_step_status_mismatch')
  if (packet.status === 'blocked_owner_observed_baseline_required' && packet.nextOwnerPrivateStep.id !== 'capture-owner-observed-baseline') fail('shop_pilot_day0_next_step_status_mismatch')
  if (packet.status === 'blocked_owner_baseline_and_intake_required' && packet.nextOwnerPrivateStep.id !== 'capture-baseline-then-intake') fail('shop_pilot_day0_next_step_status_mismatch')
  if (packet.status === 'day0_owner_private_handoff_ready' && packet.nextOwnerPrivateStep.id !== 'prepare-day-one-private-handoff') fail('shop_pilot_day0_next_step_status_mismatch')
  if (!Array.isArray(packet.privateCommands)
    || packet.privateCommands.length < 5
    || !packet.privateCommands.some((command) => command.includes('--release-handoff "<release-handoff.json>"') && command.includes('--github-protection-snapshot "<github-protection-snapshot.json>"'))) {
    fail('shop_pilot_day0_private_commands_invalid')
  }
  if (!Array.isArray(packet.forbiddenActions) || !packet.forbiddenActions.includes('managed_activation')) fail('shop_pilot_day0_forbidden_actions_invalid')
  if (!isRecord(packet.controls) || REQUIRED_FALSE_CONTROLS.some((key) => packet.controls[key] !== (key === 'noWritePacket'))) {
    fail('shop_pilot_day0_controls_invalid')
  }
  return packet
}

export function renderShopPilotDay0ReadinessMarkdown(packet) {
  validateShopPilotDay0ReadinessPacket(packet)
  const ownerFacingToken = (value) => String(value || '')
    .replace(/public_safe/g, 'owner_safe')
    .replace(/public_packet/g, 'owner_safe_packet')
  const blockers = packet.blockers.length ? packet.blockers.map((blocker) => `- ${blocker}`).join('\n') : '- none'
  const commands = packet.privateCommands.map((command) => `- ${command}`).join('\n')
  const prep = packet.ownerPrivatePreparation
  const baselineTemplateDigest = prep.baselineInputTemplate.digest || 'not provided'
  const baselineWorksheetDigest = prep.baselineWorksheet.digest || 'not provided'
  const acceptedIntakeDigest = prep.acceptedIntakePacketDigest || 'not accepted yet'
  const nextDigest = prep.nextRequiredDigest
  const bridge = packet.ownerPrivateObservationBridge
  const bridgeArtifacts = bridge.requiredPrivateArtifacts.map((artifact) => `- ${artifact}`).join('\n')
  const checklist = packet.ownerPrivateBaselineChecklist
  const checklistFlows = checklist.requiredFlows.map((flow) => `- ${flow.label}: ${flow.uninterruptedRuns}/${flow.observedRuns} uninterrupted/observed; required uninterrupted ${flow.requiredUninterruptedRuns}; accepted ${flow.accepted}`).join('\n')
  const checklistMetrics = checklist.requiredMetrics.map((metric) => `- ${metric}`).join('\n')
  const checklistConfirmations = checklist.requiredConfirmations.map((confirmation) => `- ${confirmation}`).join('\n')
  const promotion = packet.promotionEvidenceRequirement
  const checklistStopConditions = checklist.stopConditions.map((condition) => `- ${condition}`).join('\n')
  return `# Shop Pilot Day-0 Readiness

Contract: \`${packet.contract}\`
Digest: \`${packet.digest}\`
Status: \`${packet.status}\`
Candidate: \`${packet.candidate.branch || 'unknown'} @ ${packet.candidate.head || 'unknown'}\`

## Day-0 result

- Baseline packet accepted: ${packet.day0Readiness.baselinePacketAccepted}
- Intake packet accepted: ${packet.day0Readiness.intakePacketAccepted}
- Owner-private handoff ready: ${packet.day0Readiness.ownerPrivateHandoffReady}
- Ready for customer contact: false
- Ready for deployment or managed activation: false
- Ready for promotion evidence: false
- Required promotion evidence: ${promotion.requiredAcceptedConsecutiveRuns} consecutive accepted real runs covering pilot days ${promotion.requiredPilotDayIndexes.join(', ')}
- Current promotion accepted run count: ${promotion.acceptedConsecutiveRuns}
- Five-day pilot sequence covered: ${promotion.pilotSequenceCoverageMet}

## Release gate

- Source: ${packet.releaseGate.source}
- Current gate: \`${packet.releaseGate.currentGateId}\`
- Current release blocker: \`${packet.releaseGate.currentBlocker}\`
- Main protection verified: ${packet.releaseGate.mainProtectionVerified}
- Owner approval still required: true

## Next owner-private step

- Step: ${packet.nextOwnerPrivateStep.label} (${packet.nextOwnerPrivateStep.id})
- Command: ${packet.nextOwnerPrivateStep.commandId}
- Safe before release gate: ${packet.nextOwnerPrivateStep.safeBeforeReleaseGate}
- Release gate still required before pilot activation: true
- External effects allowed: false
- Next required digest: ${nextDigest}

## Owner-private prep artifacts

- Artifact policy: ${prep.artifactPolicy}
- Baseline input template digest: ${baselineTemplateDigest}
- Baseline worksheet digest: ${baselineWorksheetDigest}
- Accepted intake packet digest: ${acceptedIntakeDigest}
- Local paths included: false
- Raw identity stays private: true

## Private Run001 observation bridge

- Workspace label: ${bridge.workspaceLabel}
- State: ${bridge.state}
- Allowed now: ${bridge.allowedNow}
- Relative orchestrator command: ${bridge.relativeOrchestratorCommand}
- Expected current gate: ${bridge.expectedCurrentGate || 'not required for current Day-0 state'}
- Next local action: ${bridge.nextLocalAction}
- Completion signal: ${ownerFacingToken(bridge.completionSignal)}
- Ready to record initial state: false
- External effects allowed: false

Required private artifacts:

${bridgeArtifacts}

## Owner-private baseline capture checklist

- Contract: \`${checklist.contract}\`
- State: ${ownerFacingToken(checklist.state)}
- Evidence kind: ${checklist.evidenceKind}
- Completion signal: ${ownerFacingToken(checklist.completionSignal)}
- Ready to generate owner-safe baseline packet: ${checklist.readyToGeneratePublicBaselinePacket}
- Owner-safe packet allows raw identity: false
- Owner-safe packet allows raw notes: false
- Owner-safe packet allows local paths: false
- External effects allowed: false

Required observed flows:

${checklistFlows}

Required metrics:

${checklistMetrics}

Required confirmations:

${checklistConfirmations}

Promotion evidence threshold:

- Required accepted real runs: ${promotion.requiredAcceptedConsecutiveRuns}
- Required pilot days covered: ${promotion.requiredPilotDayIndexes.join(', ')}
- Accepted run count now: ${promotion.acceptedConsecutiveRuns}
- Accepted pilot days now: ${promotion.acceptedConsecutivePilotDayIndexes.length ? promotion.acceptedConsecutivePilotDayIndexes.join(', ') : 'none'}
- Synthetic evidence accepted: false

Stop and do not generate the owner-safe baseline packet if any condition occurs:

${checklistStopConditions}

## Owner-safe baseline metrics

- Observed order runs: ${packet.day0Readiness.uninterruptedOrderRunCount}/${packet.day0Readiness.observedOrderRunCount}
- Observed redemption runs: ${packet.day0Readiness.uninterruptedRedemptionRunCount}/${packet.day0Readiness.observedRedemptionRunCount}
- Median minutes per order: ${packet.day0Readiness.medianMinutesPerOrder ?? 'missing'}
- Median minutes per redemption: ${packet.day0Readiness.medianMinutesPerRedemption ?? 'missing'}
- Weekly exceptions: ${packet.day0Readiness.weeklyExceptionCount ?? 'missing'}
- Daily close minutes: ${packet.day0Readiness.closeMinutesPerDay ?? 'missing'}

## Owner action

${packet.ownerAction}

## Blockers still active

${blockers}

## Private commands

${commands}

## Boundary

This packet includes digests, counts, booleans, commands, and gate labels only. It does not include the business name, operator name, raw notes, contact details, credentials, payment, stock movement, hosted writes, production release, or managed activation.
`
}

export function sampleShopPilotDay0ReadinessInput(overrides = {}) {
  return {
    generatedAt: '2026-08-25T00:00:00.000Z',
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput()),
    ...overrides,
  }
}

function runSelfTest() {
  const baselinePacket = buildShopPilotBaselinePacket(sampleBaselineInput(), { generatedAt: '2026-08-25T00:00:00.000Z' })
  const intakePacket = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  const empty = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput())
  const withIntake = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ intakePacket })),
  }))
  const withBoth = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ baselinePacket, intakePacket })),
  }))
  const releaseEvidenceInput = sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ intakePacket })),
  })
  const releaseGateEvidence = {
    source: 'release_handoff_and_github_snapshot',
    candidateCommit: releaseEvidenceInput.launchGateReport.candidate.head,
    currentGateId: 'review_branch_push',
    releaseHandoffDigest: `sha256:${'a'.repeat(64)}`,
    githubMainProtectionSnapshotDigest: `sha256:${'b'.repeat(64)}`,
    mainProtectionVerified: true,
  }
  const withReleaseGateEvidence = buildShopPilotDay0ReadinessPacket({
    ...releaseEvidenceInput,
    releaseGateEvidence,
  })
  const dirty = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
      gitState: { ...sampleShopPilotLaunchGateInput().gitState, clean: false },
    })),
  }))
  const checks = {
    missing_prerequisites_stay_owner_private: empty.ok === true
      && empty.status === 'blocked_owner_baseline_and_intake_required'
      && empty.day0Readiness.readyForCustomerContact === false
      && empty.ownerPrivateObservationBridge.expectedCurrentGate === 'private_observation_incomplete'
      && empty.ownerPrivateObservationBridge.relativeOrchestratorCommand === '.\\complete-run-001-after-observation.ps1'
      && empty.ownerPrivateObservationBridge.authorizations.githubWritesAllowed === false
      && empty.ownerPrivateBaselineChecklist.state === 'owner_private_baseline_capture_required'
      && empty.ownerPrivateBaselineChecklist.readyToGeneratePublicBaselinePacket === false
      && empty.promotionEvidenceRequirement.requiredAcceptedConsecutiveRuns === 20
      && JSON.stringify(empty.promotionEvidenceRequirement.requiredPilotDayIndexes) === JSON.stringify([1, 2, 3, 4, 5])
      && empty.promotionEvidenceRequirement.pilotSequenceCoverageMet === false
      && empty.ownerPrivateBaselineChecklist.promotionEvidenceRequirement.requiredAcceptedConsecutiveRuns === 20
      && empty.ownerPrivateBaselineChecklist.stopConditions.includes('synthetic_or_supermega_demo_run_used_as_baseline')
      && validateShopPilotDay0ReadinessPacket(empty) === empty,
    intake_only_requires_baseline: withIntake.ok === true
      && withIntake.status === 'blocked_owner_observed_baseline_required'
      && withIntake.day0Readiness.intakePacketAccepted === true
      && withIntake.day0Readiness.baselinePacketAccepted === false
      && validateShopPilotDay0ReadinessPacket(withIntake) === withIntake,
    release_evidence_replaces_stale_github_blocker: withReleaseGateEvidence.releaseGate.currentGateId === 'review_branch_push'
      && withReleaseGateEvidence.releaseGate.mainProtectionVerified === true
      && withReleaseGateEvidence.blockers.includes('review_branch_push_missing')
      && !withReleaseGateEvidence.blockers.includes('github_main_protection_unverified')
      && withReleaseGateEvidence.privateCommands.some((command) => command.includes('--release-handoff "<release-handoff.json>"') && command.includes('--github-protection-snapshot "<github-protection-snapshot.json>"'))
      && validateShopPilotDay0ReadinessPacket(withReleaseGateEvidence) === withReleaseGateEvidence,
    both_packets_ready_still_no_external_effects: withBoth.ok === true
      && withBoth.status === 'day0_owner_private_handoff_ready'
      && withBoth.day0ReadyForOwnerPrivateHandoff === true
      && withBoth.nextOwnerPrivateStep.id === 'prepare-day-one-private-handoff'
      && withBoth.day0Readiness.readyForManagedActivation === false
      && withBoth.ownerPrivateBaselineChecklist.state === 'baseline_public_packet_accepted'
      && withBoth.ownerPrivateBaselineChecklist.requiredFlows.every((flow) => flow.accepted === true)
      && validateShopPilotDay0ReadinessPacket(withBoth) === withBoth,
    launch_gate_failure_blocks_day0: dirty.ok === false
      && dirty.status === 'blocked_launch_gate_failed'
      && dirty.blockers.includes('shop_pilot_launch_gate_worktree_dirty')
      && validateShopPilotDay0ReadinessPacket(dirty) === dirty,
    markdown_public_safe: !/Private Day Zero Spa|Private Day Zero Operator|ready for managed activation/i.test(renderShopPilotDay0ReadinessMarkdown(withBoth)),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ok: failedChecks.length === 0,
    contract: `${SHOP_PILOT_DAY0_READINESS_CONTRACT}.self-test`,
    checks,
    failedChecks,
    externalWritesPerformed: false,
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path || ''), 'utf8'))
}

async function writeOutput(path, content) {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
}

function parseArgs(argv) {
  const options = {
    selfTest: false,
    verify: null,
    baselinePacketPath: null,
    intakePacketPath: null,
    baselineTemplatePath: null,
    baselineWorksheetPath: null,
    releaseHandoffPath: null,
    githubProtectionSnapshotPath: null,
    output: null,
    markdownOutput: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--verify') options.verify = argv[++index] || null
    else if (arg === '--baseline-packet') options.baselinePacketPath = argv[++index] || null
    else if (arg === '--intake-packet') options.intakePacketPath = argv[++index] || null
    else if (arg === '--baseline-template') options.baselineTemplatePath = argv[++index] || null
    else if (arg === '--baseline-worksheet') options.baselineWorksheetPath = argv[++index] || null
    else if (arg === '--release-handoff') options.releaseHandoffPath = argv[++index] || null
    else if (arg === '--github-protection-snapshot') options.githubProtectionSnapshotPath = argv[++index] || null
    else if (arg === '--output') options.output = argv[++index] || null
    else if (arg === '--markdown-output') options.markdownOutput = argv[++index] || null
    else fail(`shop_pilot_day0_usage_invalid:${arg}`)
  }
  return options
}

async function ownerPrivatePreparationFromFiles(options) {
  const ownerPrivatePreparation = {}
  if (options.baselineTemplatePath) {
    const content = await readFile(resolve(options.baselineTemplatePath), 'utf8')
    assertNoPrivateOrSecretShape(content)
    let parsed = null
    try {
      parsed = JSON.parse(content)
    } catch {
      fail('shop_pilot_day0_baseline_template_json_invalid')
    }
    if (JSON.stringify(parsed) !== JSON.stringify(baselineInputTemplate())) {
      fail('shop_pilot_day0_baseline_template_not_blank')
    }
    ownerPrivatePreparation.baselineInputTemplateDigest = digest(content)
    ownerPrivatePreparation.baselineInputTemplateBlank = true
  }
  if (options.baselineWorksheetPath) {
    const content = await readFile(resolve(options.baselineWorksheetPath), 'utf8')
    assertNoPrivateOrSecretShape(content)
    if (!content.includes(SHOP_PILOT_BASELINE_WORKSHEET_CONTRACT)) {
      fail('shop_pilot_day0_baseline_worksheet_contract_invalid')
    }
    if (content.replace(/\r\n?/g, '\n').trimEnd() !== renderShopPilotBaselineWorksheetMarkdown().trimEnd()) {
      fail('shop_pilot_day0_baseline_worksheet_not_blank')
    }
    ownerPrivatePreparation.baselineWorksheetDigest = digest(content)
    ownerPrivatePreparation.baselineWorksheetBlank = true
  }
  return ownerPrivatePreparation
}

async function releaseGateEvidenceFromFiles(options) {
  if (!options.releaseHandoffPath && !options.githubProtectionSnapshotPath) return null
  if (!options.releaseHandoffPath || !options.githubProtectionSnapshotPath) fail('shop_pilot_day0_release_gate_evidence_files_required')
  return buildShopPilotDay0ReleaseGateEvidence({
    releaseHandoff: await readJson(options.releaseHandoffPath),
    githubProtectionSnapshot: await readJson(options.githubProtectionSnapshotPath),
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.selfTest) {
    const result = runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (options.verify) {
    const packet = validateShopPilotDay0ReadinessPacket(await readJson(options.verify))
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      status: packet.status,
      day0ReadyForOwnerPrivateHandoff: packet.day0ReadyForOwnerPrivateHandoff,
      externalWritesPerformed: false,
    }))
    return
  }
  const packet = validateShopPilotDay0ReadinessPacket(buildShopPilotDay0ReadinessPacket({
    launchGateReport: await currentShopPilotLaunchGateReport({
      baselinePacketPath: options.baselinePacketPath,
      intakePacketPath: options.intakePacketPath,
    }),
    ownerPrivatePreparation: await ownerPrivatePreparationFromFiles(options),
    releaseGateEvidence: await releaseGateEvidenceFromFiles(options),
  }))
  if (options.output) await writeOutput(options.output, `${JSON.stringify(packet, null, 2)}\n`)
  if (options.markdownOutput) await writeOutput(options.markdownOutput, `${renderShopPilotDay0ReadinessMarkdown(packet)}\n`)
  if (!options.output && !options.markdownOutput) {
    console.log(JSON.stringify({
      ok: packet.ok,
      contract: packet.contract,
      status: packet.status,
      day0ReadyForOwnerPrivateHandoff: packet.day0ReadyForOwnerPrivateHandoff,
      baselinePacketAccepted: packet.day0Readiness.baselinePacketAccepted,
      intakePacketAccepted: packet.day0Readiness.intakePacketAccepted,
      blockers: packet.blockers,
      externalWritesPerformed: false,
    }, null, 2))
  } else {
    console.log(JSON.stringify({
      ok: packet.ok,
      contract: packet.contract,
      status: packet.status,
      output: options.output ? resolve(options.output) : null,
      markdownOutput: options.markdownOutput ? resolve(options.markdownOutput) : null,
      digest: packet.digest,
      externalWritesPerformed: false,
    }))
  }
  if (!packet.ok) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: SHOP_PILOT_DAY0_READINESS_CONTRACT,
      error: String(error?.message || 'shop_pilot_day0_failed').slice(0, 260),
      externalWritesPerformed: false,
    }))
    process.exitCode = 1
  })
}
