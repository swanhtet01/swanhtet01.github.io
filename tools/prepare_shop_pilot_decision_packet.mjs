import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SHOP_PILOT_MODE,
  SHOP_PILOT_PRODUCT,
  SHOP_PILOT_VERTICAL_PACK,
} from './create_shop_pilot_handoff.mjs'
import {
  SHOP_PILOT_BASELINE_PACKET_CONTRACT,
  buildShopPilotBaselinePacket,
  validateShopPilotBaselinePacket,
} from './prepare_shop_pilot_baseline_packet.mjs'
import {
  SHOP_OBSERVED_EVIDENCE_CONTRACT,
  verifyObservedShopPilotEvidence,
} from './record_shop_pilot_observed_run.mjs'

export const SHOP_PILOT_DECISION_PACKET_CONTRACT = 'supermega.shop.pilot_decision_packet.v1'

const PRODUCT = SHOP_PILOT_PRODUCT
const PILOT_MODE = SHOP_PILOT_MODE
const VERTICAL_PACK = SHOP_PILOT_VERTICAL_PACK
const REQUIRED_ACCEPTED_CONSECUTIVE_RUNS = 20
const REQUIRED_PILOT_DAY_INDEXES = Object.freeze([1, 2, 3, 4, 5])
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const SECRET_PATTERN = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|vercel_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_PATTERN = /(?<![A-Za-z0-9])(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}(?![A-Za-z0-9])/u
const PRIVATE_PATH_PATTERN = /(?:[A-Z]:\\\\Users\\\\|\/Users\/|\/home\/|OneDrive - )/iu
const FALSE_CONTROL_FIELDS = Object.freeze([
  'externalWritesPerformed',
  'gitRemoteWritesPerformed',
  'githubWritesPerformed',
  'vercelDeploymentsPerformed',
  'supabaseMutationsPerformed',
  'credentialValuesInspected',
  'customerContactPerformed',
  'automaticMessagesSent',
  'paymentOrStockActionPerformed',
  'serverWritesPerformed',
  'hostedWritesPerformed',
  'managedActivationPerformed',
  'privateIdentityExposed',
])

function fail(code) {
  throw new Error(code)
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  fail('shop_pilot_decision_value_invalid')
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

function rounded(value) {
  if (value === null) return null
  return Math.round(value * 1000) / 1000
}

function rate(numerator, denominator) {
  if (!denominator) return 0
  return rounded(numerator / denominator)
}

function pctDelta(observed, baseline) {
  if (observed === null || baseline === null || baseline === 0) return null
  return rounded(((observed - baseline) / baseline) * 100)
}

function delta(observed, baseline) {
  if (observed === null || baseline === null) return null
  return rounded(observed - baseline)
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function assertPublicSafe(value) {
  const text = JSON.stringify(value)
  if (SECRET_PATTERN.test(text)
    || EMAIL_PATTERN.test(text)
    || PHONE_PATTERN.test(text)
    || PRIVATE_PATH_PATTERN.test(text)) fail('shop_pilot_decision_packet_private_or_secret_shape_detected')
}

function finiteNumber(value, field, { min = 0, integer = false, nullable = false } = {}) {
  if (nullable && value === null) return value
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) fail(`${field}_invalid`)
  return value
}

function exactNumberArray(value, expected, field) {
  if (!Array.isArray(value)
    || value.length !== expected.length
    || value.some((item, index) => item !== expected[index])) fail(`${field}_invalid`)
  return value
}

function digestValue(value, field) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) fail(`${field}_invalid`)
  return value
}

function falseControl(value, field) {
  if (value !== false) fail(`${field}_must_be_false`)
  return false
}

function validateObservedEvidenceSummary(summary) {
  assertPublicSafe(summary)
  if (!isRecord(summary) || summary.contract !== SHOP_OBSERVED_EVIDENCE_CONTRACT) fail('shop_pilot_decision_observed_summary_contract_invalid')
  if (summary.product !== PRODUCT || summary.pilotMode !== PILOT_MODE || summary.verticalPack !== VERTICAL_PACK) fail('shop_pilot_decision_observed_summary_scope_invalid')
  finiteNumber(summary.runCount, 'shop_pilot_decision_observed_run_count', { integer: true })
  finiteNumber(summary.acceptedRunCount, 'shop_pilot_decision_observed_accepted_run_count', { integer: true })
  finiteNumber(summary.acceptedConsecutiveRuns, 'shop_pilot_decision_observed_consecutive_run_count', { integer: true })
  if (summary.acceptedRunCount > summary.runCount || summary.acceptedConsecutiveRuns > summary.acceptedRunCount) fail('shop_pilot_decision_observed_counts_invalid')
  if (finiteNumber(summary.requiredAcceptedConsecutiveRuns, 'shop_pilot_decision_required_consecutive_run_count', { integer: true }) !== REQUIRED_ACCEPTED_CONSECUTIVE_RUNS) {
    fail('shop_pilot_decision_required_consecutive_run_count_invalid')
  }
  exactNumberArray(summary.requiredPilotDayIndexes, REQUIRED_PILOT_DAY_INDEXES, 'shop_pilot_decision_required_pilot_day_indexes')
  if (!Array.isArray(summary.acceptedConsecutivePilotDayIndexes)
    || summary.acceptedConsecutivePilotDayIndexes.length > REQUIRED_PILOT_DAY_INDEXES.length
    || summary.acceptedConsecutivePilotDayIndexes.some((dayIndex, index, days) => !REQUIRED_PILOT_DAY_INDEXES.includes(dayIndex) || days.indexOf(dayIndex) !== index)) {
    fail('shop_pilot_decision_accepted_pilot_day_indexes_invalid')
  }
  const pilotSequenceCoverageMet = REQUIRED_PILOT_DAY_INDEXES.every((dayIndex) => summary.acceptedConsecutivePilotDayIndexes.includes(dayIndex))
  if (summary.pilotSequenceCoverageMet !== pilotSequenceCoverageMet) fail('shop_pilot_decision_pilot_sequence_coverage_flag_invalid')
  const requiredPromotionEvidenceMet = summary.acceptedConsecutiveRuns >= REQUIRED_ACCEPTED_CONSECUTIVE_RUNS && summary.pilotSequenceCoverageMet === true
  if (summary.promotionEvidenceMet !== requiredPromotionEvidenceMet) fail('shop_pilot_decision_promotion_evidence_flag_invalid')
  const proofIntegrity = summary.proofIntegrity
  if (!isRecord(proofIntegrity)
    || proofIntegrity.uniqueRunIds !== true
    || proofIntegrity.uniqueEvidenceReferenceDigests !== true
    || proofIntegrity.uniqueIndependentAnchorDigests !== true
    || proofIntegrity.evidenceAnchorDigestPairsDistinct !== true) {
    fail('shop_pilot_decision_proof_integrity_invalid')
  }
  const metrics = summary.metrics
  if (!isRecord(metrics)) fail('shop_pilot_decision_observed_metrics_invalid')
  finiteNumber(metrics.medianMinutesPerOrder, 'shop_pilot_decision_median_order_time', { nullable: summary.runCount === 0 })
  finiteNumber(metrics.medianAcceptedMinutesPerOrder, 'shop_pilot_decision_median_accepted_order_time', { nullable: summary.acceptedRunCount === 0 })
  finiteNumber(metrics.totalExceptionCount, 'shop_pilot_decision_total_exception_count', { integer: true })
  finiteNumber(metrics.acceptedExceptionCount, 'shop_pilot_decision_accepted_exception_count', { integer: true })
  finiteNumber(metrics.exceptionRatePerRun, 'shop_pilot_decision_exception_rate')
  finiteNumber(metrics.acceptedExceptionRatePerRun, 'shop_pilot_decision_accepted_exception_rate')
  finiteNumber(metrics.medianCloseMinutes, 'shop_pilot_decision_median_close_time', { nullable: summary.runCount === 0 })
  finiteNumber(metrics.medianAcceptedCloseMinutes, 'shop_pilot_decision_median_accepted_close_time', { nullable: summary.acceptedRunCount === 0 })
  finiteNumber(metrics.totalOperatorCorrectionCount, 'shop_pilot_decision_total_operator_correction_count', { integer: true })
  finiteNumber(metrics.acceptedOperatorCorrectionCount, 'shop_pilot_decision_accepted_operator_correction_count', { integer: true })
  finiteNumber(metrics.operatorCorrectionRatePerRun, 'shop_pilot_decision_operator_correction_rate')
  finiteNumber(metrics.acceptedOperatorCorrectionRatePerRun, 'shop_pilot_decision_accepted_operator_correction_rate')
  const outcomes = metrics.reloadRetryOutcomeCounts
  if (!isRecord(outcomes)
    || !Number.isInteger(outcomes.passed)
    || !Number.isInteger(outcomes.failed)
    || !Number.isInteger(outcomes.notTested)
    || outcomes.passed + outcomes.failed + outcomes.notTested !== summary.runCount) {
    fail('shop_pilot_decision_reload_retry_counts_invalid')
  }
  if (![null, 'passed', 'failed', 'not-tested'].includes(metrics.latestReloadRetryOutcome)) fail('shop_pilot_decision_latest_reload_retry_invalid')
  falseControl(summary.externalWritesPerformed, 'shop_pilot_decision_external_writes')
  falseControl(summary.customerContactPerformed, 'shop_pilot_decision_customer_contact')
  falseControl(summary.paymentAccepted, 'shop_pilot_decision_payment')
  falseControl(summary.stockMovementPerformed, 'shop_pilot_decision_stock')
  falseControl(summary.serverWritesPerformed, 'shop_pilot_decision_server_writes')
  falseControl(summary.hostedWritesPerformed, 'shop_pilot_decision_hosted_writes')
  falseControl(summary.privateValuesReturned, 'shop_pilot_decision_private_values')
  digestValue(summary.summaryDigest, 'shop_pilot_decision_observed_summary_digest')
  const copy = { ...summary }
  delete copy.summaryDigest
  if (summary.summaryDigest !== digest(copy)) fail('shop_pilot_decision_observed_summary_digest_mismatch')
  return summary
}

function buildBlockers(observedSummary) {
  const blockers = []
  if (observedSummary.acceptedConsecutiveRuns < REQUIRED_ACCEPTED_CONSECUTIVE_RUNS) blockers.push('accepted_consecutive_runs_below_20')
  if (observedSummary.pilotSequenceCoverageMet !== true) blockers.push('pilot_sequence_days_missing')
  if (observedSummary.promotionEvidenceMet === true && observedSummary.metrics.latestReloadRetryOutcome !== 'passed') blockers.push('latest_reload_retry_not_passed')
  return blockers
}

function targetStatus(comparison, observedSummary) {
  if (observedSummary.promotionEvidenceMet !== true) return 'collecting'
  if (observedSummary.metrics.latestReloadRetryOutcome !== 'passed') return 'blocked_reload_retry'
  const noRegression = comparison.orderTimeDeltaMinutes <= 0
    && comparison.exceptionRateDeltaPerRun <= 0
    && comparison.closeTimeDeltaMinutes <= 0
  return noRegression ? 'target_met_or_improved' : 'target_gap_found'
}

function recommendationFor(status) {
  if (status === 'collecting') return 'collect_more_observed_evidence'
  if (status === 'blocked_reload_retry') return 'fix_reload_retry_and_repeat_observed_runs_before_activation_review'
  if (status === 'target_met_or_improved') return 'owner_review_required_before_preview_rehearsal_or_managed_activation_request'
  return 'owner_review_required_with_target_gap_fix_plan_before_activation'
}

function statusFor(blockers) {
  return blockers.length === 0 ? 'owner_pilot_decision_ready' : 'blocked_collect_more_or_fix_observed_evidence'
}

export function buildShopPilotDecisionPacket({ baselinePacket, observedSummary, generatedAt = new Date().toISOString() }) {
  const baseline = validateShopPilotBaselinePacket(baselinePacket)
  const observed = validateObservedEvidenceSummary(observedSummary)
  if (baseline.contract !== SHOP_PILOT_BASELINE_PACKET_CONTRACT || baseline.ok !== true) fail('shop_pilot_decision_baseline_not_ready')
  const baselineExceptionRatePerOrder = rate(baseline.metrics.weeklyExceptionCount, baseline.metrics.weeklyOrders)
  const comparison = {
    baselineMedianMinutesPerOrder: baseline.metrics.medianMinutesPerOrder,
    observedMedianAcceptedMinutesPerOrder: observed.metrics.medianAcceptedMinutesPerOrder,
    orderTimeDeltaMinutes: delta(observed.metrics.medianAcceptedMinutesPerOrder, baseline.metrics.medianMinutesPerOrder),
    orderTimeChangePct: pctDelta(observed.metrics.medianAcceptedMinutesPerOrder, baseline.metrics.medianMinutesPerOrder),
    baselineExceptionRatePerOrder,
    observedAcceptedExceptionRatePerRun: observed.metrics.acceptedExceptionRatePerRun,
    exceptionRateDeltaPerRun: delta(observed.metrics.acceptedExceptionRatePerRun, baselineExceptionRatePerOrder),
    baselineCloseMinutesPerDay: baseline.metrics.closeMinutesPerDay,
    observedMedianAcceptedCloseMinutes: observed.metrics.medianAcceptedCloseMinutes,
    closeTimeDeltaMinutes: delta(observed.metrics.medianAcceptedCloseMinutes, baseline.metrics.closeMinutesPerDay),
    closeTimeChangePct: pctDelta(observed.metrics.medianAcceptedCloseMinutes, baseline.metrics.closeMinutesPerDay),
    observedAcceptedOperatorCorrectionRatePerRun: observed.metrics.acceptedOperatorCorrectionRatePerRun,
  }
  const blockers = buildBlockers(observed)
  const outcomeStatus = targetStatus(comparison, observed)
  const packet = {
    contract: SHOP_PILOT_DECISION_PACKET_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt,
    product: PRODUCT,
    pilotMode: PILOT_MODE,
    verticalPack: VERTICAL_PACK,
    status: statusFor(blockers),
    ok: blockers.length === 0,
    failures: blockers,
    sourceDigests: {
      baselinePacketDigest: baseline.digest,
      baselinePrivateInputDigest: baseline.privateInputDigest,
      observedSummaryDigest: observed.summaryDigest,
    },
    privacyBoundary: {
      rawPrivateEvidenceIncluded: false,
      participantIdentityIncluded: false,
      operatorIdentityIncluded: false,
      privateWorkspacePathIncluded: false,
      publicAllowedFieldsOnly: true,
    },
    baselineMetrics: {
      observedOrderRunCount: baseline.metrics.observedOrderRunCount,
      uninterruptedOrderRunCount: baseline.metrics.uninterruptedOrderRunCount,
      weeklyOrders: baseline.metrics.weeklyOrders,
      medianMinutesPerOrder: baseline.metrics.medianMinutesPerOrder,
      weeklyExceptionCount: baseline.metrics.weeklyExceptionCount,
      exceptionRatePerOrder: baselineExceptionRatePerOrder,
      closeMinutesPerDay: baseline.metrics.closeMinutesPerDay,
    },
    observedMetrics: {
      runCount: observed.runCount,
      acceptedRunCount: observed.acceptedRunCount,
      acceptedConsecutiveRuns: observed.acceptedConsecutiveRuns,
      requiredAcceptedConsecutiveRuns: observed.requiredAcceptedConsecutiveRuns,
      requiredPilotDayIndexes: observed.requiredPilotDayIndexes,
      acceptedConsecutivePilotDayIndexes: observed.acceptedConsecutivePilotDayIndexes,
      pilotSequenceCoverageMet: observed.pilotSequenceCoverageMet,
      promotionEvidenceMet: observed.promotionEvidenceMet,
      proofIntegrity: observed.proofIntegrity,
      medianAcceptedMinutesPerOrder: observed.metrics.medianAcceptedMinutesPerOrder,
      acceptedExceptionRatePerRun: observed.metrics.acceptedExceptionRatePerRun,
      medianAcceptedCloseMinutes: observed.metrics.medianAcceptedCloseMinutes,
      acceptedOperatorCorrectionRatePerRun: observed.metrics.acceptedOperatorCorrectionRatePerRun,
      reloadRetryOutcomeCounts: observed.metrics.reloadRetryOutcomeCounts,
      latestReloadRetryOutcome: observed.metrics.latestReloadRetryOutcome,
    },
    comparison,
    pilotDecision: {
      outcomeStatus,
      recommendation: recommendationFor(outcomeStatus),
      operatorDecisionCaptured: false,
      ownerDecisionRequired: true,
      ownerActivationApproved: false,
      managedActivationAllowedByThisPacket: false,
    },
    controls: Object.fromEntries(FALSE_CONTROL_FIELDS.map((field) => [field, false])),
  }
  assertPublicSafe(packet)
  return { ...packet, digest: digest(packet) }
}

export function validateShopPilotDecisionPacket(packet) {
  assertPublicSafe(packet)
  if (!isRecord(packet) || packet.contract !== SHOP_PILOT_DECISION_PACKET_CONTRACT) fail('shop_pilot_decision_packet_contract_invalid')
  if (packet.digestScope !== 'utf8_compact_json_without_digest') fail('shop_pilot_decision_digest_scope_invalid')
  if (packet.product !== PRODUCT || packet.pilotMode !== PILOT_MODE || packet.verticalPack !== VERTICAL_PACK) fail('shop_pilot_decision_scope_invalid')
  if (!['owner_pilot_decision_ready', 'blocked_collect_more_or_fix_observed_evidence'].includes(packet.status)) fail('shop_pilot_decision_status_invalid')
  if ((packet.status === 'owner_pilot_decision_ready') !== (packet.ok === true)) fail('shop_pilot_decision_ok_invalid')
  if (!Array.isArray(packet.failures) || (packet.ok === true && packet.failures.length !== 0)) fail('shop_pilot_decision_failures_invalid')
  if (!isRecord(packet.sourceDigests)
    || !DIGEST_PATTERN.test(packet.sourceDigests.baselinePacketDigest || '')
    || !DIGEST_PATTERN.test(packet.sourceDigests.baselinePrivateInputDigest || '')
    || !DIGEST_PATTERN.test(packet.sourceDigests.observedSummaryDigest || '')) fail('shop_pilot_decision_source_digests_invalid')
  const boundary = packet.privacyBoundary
  if (!isRecord(boundary)
    || boundary.rawPrivateEvidenceIncluded !== false
    || boundary.participantIdentityIncluded !== false
    || boundary.operatorIdentityIncluded !== false
    || boundary.privateWorkspacePathIncluded !== false
    || boundary.publicAllowedFieldsOnly !== true) fail('shop_pilot_decision_privacy_boundary_invalid')
  const observed = packet.observedMetrics
  if (!isRecord(observed)
    || observed.acceptedConsecutiveRuns < 0
    || observed.requiredAcceptedConsecutiveRuns !== REQUIRED_ACCEPTED_CONSECUTIVE_RUNS
    || JSON.stringify(observed.requiredPilotDayIndexes) !== JSON.stringify(REQUIRED_PILOT_DAY_INDEXES)
    || !Array.isArray(observed.acceptedConsecutivePilotDayIndexes)
    || observed.pilotSequenceCoverageMet !== REQUIRED_PILOT_DAY_INDEXES.every((dayIndex) => observed.acceptedConsecutivePilotDayIndexes.includes(dayIndex))
    || observed.promotionEvidenceMet !== (observed.acceptedConsecutiveRuns >= REQUIRED_ACCEPTED_CONSECUTIVE_RUNS && observed.pilotSequenceCoverageMet === true)
    || observed.acceptedRunCount > observed.runCount
    || !isRecord(observed.proofIntegrity)
    || observed.proofIntegrity.uniqueRunIds !== true
    || observed.proofIntegrity.uniqueEvidenceReferenceDigests !== true
    || observed.proofIntegrity.uniqueIndependentAnchorDigests !== true
    || observed.proofIntegrity.evidenceAnchorDigestPairsDistinct !== true) fail('shop_pilot_decision_observed_metrics_invalid')
  const comparison = packet.comparison
  if (!isRecord(comparison)
    || comparison.baselineMedianMinutesPerOrder < 0.1
    || comparison.baselineExceptionRatePerOrder < 0
    || comparison.baselineCloseMinutesPerDay < 0
    || comparison.observedAcceptedOperatorCorrectionRatePerRun < 0) fail('shop_pilot_decision_comparison_invalid')
  const decision = packet.pilotDecision
  if (!isRecord(decision)
    || !['collecting', 'blocked_reload_retry', 'target_met_or_improved', 'target_gap_found'].includes(decision.outcomeStatus)
    || typeof decision.recommendation !== 'string'
    || decision.operatorDecisionCaptured !== false
    || decision.ownerDecisionRequired !== true
    || decision.ownerActivationApproved !== false
    || decision.managedActivationAllowedByThisPacket !== false) fail('shop_pilot_decision_decision_invalid')
  if (!isRecord(packet.controls) || FALSE_CONTROL_FIELDS.some((field) => packet.controls[field] !== false)) fail('shop_pilot_decision_controls_invalid')
  digestValue(packet.digest, 'shop_pilot_decision_digest')
  const copy = { ...packet }
  delete copy.digest
  if (packet.digest !== digest(copy)) fail('shop_pilot_decision_digest_mismatch')
  return packet
}

export function renderShopPilotDecisionPacketMarkdown(packet) {
  validateShopPilotDecisionPacket(packet)
  return `# Shop pilot decision packet

Contract: \`${packet.contract}\`
Status: \`${packet.status}\`
Outcome: \`${packet.pilotDecision.outcomeStatus}\`
Recommendation: \`${packet.pilotDecision.recommendation}\`

## Evidence boundary

- Baseline packet digest: \`${packet.sourceDigests.baselinePacketDigest}\`
- Observed summary digest: \`${packet.sourceDigests.observedSummaryDigest}\`
- Raw private evidence included: \`${packet.privacyBoundary.rawPrivateEvidenceIncluded}\`
- Participant identity included: \`${packet.privacyBoundary.participantIdentityIncluded}\`
- Managed activation allowed by this packet: \`${packet.pilotDecision.managedActivationAllowedByThisPacket}\`

## Baseline vs observed

- Baseline median order minutes: \`${packet.comparison.baselineMedianMinutesPerOrder}\`
- Observed accepted median order minutes: \`${packet.comparison.observedMedianAcceptedMinutesPerOrder}\`
- Order-time delta minutes: \`${packet.comparison.orderTimeDeltaMinutes}\`
- Baseline exception rate per order: \`${packet.comparison.baselineExceptionRatePerOrder}\`
- Observed accepted exception rate per run: \`${packet.comparison.observedAcceptedExceptionRatePerRun}\`
- Close-time delta minutes: \`${packet.comparison.closeTimeDeltaMinutes}\`

## Promotion evidence

- Required consecutive accepted runs: \`${REQUIRED_ACCEPTED_CONSECUTIVE_RUNS}\`
- Current consecutive accepted runs: \`${packet.observedMetrics.acceptedConsecutiveRuns}\`
- Required pilot days covered: \`${packet.observedMetrics.requiredPilotDayIndexes.join(',')}\`
- Current accepted-streak pilot days covered: \`${packet.observedMetrics.acceptedConsecutivePilotDayIndexes.join(',') || 'none'}\`
- Five-day pilot sequence covered: \`${packet.observedMetrics.pilotSequenceCoverageMet}\`
- Promotion evidence met: \`${packet.observedMetrics.promotionEvidenceMet}\`
- Unique run IDs: \`${packet.observedMetrics.proofIntegrity.uniqueRunIds}\`
- Unique evidence reference digests: \`${packet.observedMetrics.proofIntegrity.uniqueEvidenceReferenceDigests}\`
- Unique independent anchor digests: \`${packet.observedMetrics.proofIntegrity.uniqueIndependentAnchorDigests}\`
- Evidence and anchor digests distinct per run: \`${packet.observedMetrics.proofIntegrity.evidenceAnchorDigestPairsDistinct}\`
- Latest reload/retry outcome: \`${packet.observedMetrics.latestReloadRetryOutcome}\`

No customer contact, payment, stock movement, hosted write, GitHub write, Vercel deployment, Supabase mutation, credential action, or managed activation was performed.
`
}

function sampleBaselinePacket() {
  return buildShopPilotBaselinePacket({
    contract: 'supermega.shop.pilot_baseline_input.v1',
    product: PRODUCT,
    pilotMode: PILOT_MODE,
    verticalPack: VERTICAL_PACK,
    observedAt: '2026-08-25T00:00:00.000Z',
    businessName: 'Sample Spa',
    namedOperator: 'Sample Operator',
    operatorRole: 'owner operator',
    founderObserver: 'founder observer',
    observationPlace: 'counter workflow',
    processSummary: 'Manual order and package-redemption baseline before SuperMega assistance.',
    processStartsAt: 'customer request arrives',
    processEndsAt: 'daily close completed',
    correctionPath: 'operator reviews and corrects exceptions manually',
    recordSystem: 'existing manual record',
    observedOrderRuns: [
      { runId: 'order-a', observedAt: '2026-08-25T00:10:00.000Z', startedWhen: 'manual order start', endedWhen: 'manual order end', durationMinutes: 8, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'order-b', observedAt: '2026-08-25T00:20:00.000Z', startedWhen: 'manual order start', endedWhen: 'manual order end', durationMinutes: 10, interrupted: false, errorOccurred: true, errorCostLabel: 'one owner-observed exception' },
      { runId: 'order-c', observedAt: '2026-08-25T00:30:00.000Z', startedWhen: 'manual order start', endedWhen: 'manual order end', durationMinutes: 12, interrupted: false, errorOccurred: false, errorCostLabel: null },
    ],
    weeklyOrders: 40,
    claimedMedianMinutesPerOrder: 10,
    weeklyExceptionCount: 8,
    closeMinutesPerDay: 20,
    clientImportRowCount: 12,
    weeklyPackageSales: 5,
    weeklyTreatmentRedemptions: 9,
    observedRedemptionRuns: [
      { runId: 'redeem-a', observedAt: '2026-08-25T00:40:00.000Z', startedWhen: 'manual redemption start', endedWhen: 'manual redemption end', durationMinutes: 7, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'redeem-b', observedAt: '2026-08-25T00:50:00.000Z', startedWhen: 'manual redemption start', endedWhen: 'manual redemption end', durationMinutes: 9, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'redeem-c', observedAt: '2026-08-25T01:00:00.000Z', startedWhen: 'manual redemption start', endedWhen: 'manual redemption end', durationMinutes: 11, interrupted: false, errorOccurred: false, errorCostLabel: null },
    ],
    claimedMedianMinutesPerRedemption: 9,
    weeklyPackageCorrectionCount: 2,
    observedErrorRunCount: 1,
    totalObservedErrorRunCount: 1,
    totalObservedErrorCostLabel: 'one owner-observed exception',
    ownerConfirmedBaseline: true,
    operatorAgreesReviewEveryRun: true,
    proposedPilotStartDate: '2026-08-26',
    reviewDate: '2026-08-30',
    noSuperMegaDemoMeasured: true,
    noExternalEffects: true,
  }, { generatedAt: '2026-08-25T00:00:00.000Z' })
}

function sampleObservedSummary(overrides = {}) {
  const summary = {
    contract: SHOP_OBSERVED_EVIDENCE_CONTRACT,
    product: PRODUCT,
    pilotMode: PILOT_MODE,
    verticalPack: VERTICAL_PACK,
    runCount: 20,
    acceptedRunCount: 20,
    acceptedConsecutiveRuns: 20,
    requiredAcceptedConsecutiveRuns: REQUIRED_ACCEPTED_CONSECUTIVE_RUNS,
    requiredPilotDayIndexes: REQUIRED_PILOT_DAY_INDEXES,
    acceptedConsecutivePilotDayIndexes: REQUIRED_PILOT_DAY_INDEXES,
    pilotSequenceCoverageMet: true,
    promotionEvidenceMet: true,
    proofIntegrity: {
      uniqueRunIds: true,
      uniqueEvidenceReferenceDigests: true,
      uniqueIndependentAnchorDigests: true,
      evidenceAnchorDigestPairsDistinct: true,
    },
    metrics: {
      medianMinutesPerOrder: 6,
      medianAcceptedMinutesPerOrder: 6,
      totalExceptionCount: 0,
      acceptedExceptionCount: 0,
      exceptionRatePerRun: 0,
      acceptedExceptionRatePerRun: 0,
      medianCloseMinutes: 12,
      medianAcceptedCloseMinutes: 12,
      totalOperatorCorrectionCount: 0,
      acceptedOperatorCorrectionCount: 0,
      operatorCorrectionRatePerRun: 0,
      acceptedOperatorCorrectionRatePerRun: 0,
      reloadRetryOutcomeCounts: { passed: 20, failed: 0, notTested: 0 },
      latestReloadRetryOutcome: 'passed',
    },
    externalWritesPerformed: false,
    customerContactPerformed: false,
    paymentAccepted: false,
    stockMovementPerformed: false,
    serverWritesPerformed: false,
    hostedWritesPerformed: false,
    privateValuesReturned: false,
    nextAction: 'owner_review_required_before_activation',
    ...overrides,
  }
  return { ...summary, summaryDigest: digest(summary) }
}

function runSelfTest() {
  const ready = buildShopPilotDecisionPacket({
    baselinePacket: sampleBaselinePacket(),
    observedSummary: sampleObservedSummary(),
    generatedAt: '2026-08-25T00:00:00.000Z',
  })
  validateShopPilotDecisionPacket(ready)
  const collecting = buildShopPilotDecisionPacket({
    baselinePacket: sampleBaselinePacket(),
    observedSummary: sampleObservedSummary({
      runCount: 19,
      acceptedRunCount: 19,
      acceptedConsecutiveRuns: 19,
      promotionEvidenceMet: false,
      metrics: {
        ...sampleObservedSummary().metrics,
        reloadRetryOutcomeCounts: { passed: 19, failed: 0, notTested: 0 },
      },
      nextAction: 'collect_more_observed_evidence',
    }),
    generatedAt: '2026-08-25T00:00:00.000Z',
  })
  validateShopPilotDecisionPacket(collecting)
  if (ready.status !== 'owner_pilot_decision_ready' || ready.pilotDecision.outcomeStatus !== 'target_met_or_improved') fail('shop_pilot_decision_self_test_ready_invalid')
  if (collecting.ok !== false || !collecting.failures.includes('accepted_consecutive_runs_below_20')) fail('shop_pilot_decision_self_test_collecting_invalid')
  if (assertPublicSafe(renderShopPilotDecisionPacketMarkdown(ready)) !== undefined) fail('shop_pilot_decision_self_test_markdown_invalid')
  return {
    ok: true,
    contract: `${SHOP_PILOT_DECISION_PACKET_CONTRACT}.self-test`,
    cases: 2,
    externalWritesPerformed: false,
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'))
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
    baselinePacket: null,
    observedWorkspace: null,
    output: null,
    markdownOutput: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--verify') options.verify = argv[++index] || null
    else if (arg === '--baseline-packet') options.baselinePacket = argv[++index] || null
    else if (arg === '--observed-workspace') options.observedWorkspace = argv[++index] || null
    else if (arg === '--output') options.output = argv[++index] || null
    else if (arg === '--markdown-output') options.markdownOutput = argv[++index] || null
    else fail(`shop_pilot_decision_usage_invalid:${arg}`)
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.selfTest) {
    console.log(JSON.stringify(runSelfTest()))
    return
  }
  if (options.verify) {
    const packet = validateShopPilotDecisionPacket(await readJson(options.verify))
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      status: packet.status,
      outcomeStatus: packet.pilotDecision.outcomeStatus,
      recommendation: packet.pilotDecision.recommendation,
      externalWritesPerformed: false,
    }))
    return
  }
  if (!options.baselinePacket || !options.observedWorkspace) fail('shop_pilot_decision_inputs_required')
  const packet = validateShopPilotDecisionPacket(buildShopPilotDecisionPacket({
    baselinePacket: await readJson(options.baselinePacket),
    observedSummary: await verifyObservedShopPilotEvidence(options.observedWorkspace),
  }))
  if (options.output) await writeOutput(options.output, `${JSON.stringify(packet, null, 2)}\n`)
  if (options.markdownOutput) await writeOutput(options.markdownOutput, `${renderShopPilotDecisionPacketMarkdown(packet)}\n`)
  if (!options.output && !options.markdownOutput) console.log(JSON.stringify(packet, null, 2))
  else {
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
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: SHOP_PILOT_DECISION_PACKET_CONTRACT,
      error: String(error?.message || 'shop_pilot_decision_failed').slice(0, 240),
      externalWritesPerformed: false,
    }))
    process.exitCode = 1
  })
}
