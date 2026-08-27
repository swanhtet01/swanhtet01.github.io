#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHOP_PILOT_BASELINE_INPUT_CONTRACT = 'supermega.shop.pilot_baseline_input.v1'
export const SHOP_PILOT_BASELINE_INPUT_PREFLIGHT_CONTRACT = 'supermega.shop.pilot_baseline_input_preflight.v1'
export const SHOP_PILOT_BASELINE_PACKET_CONTRACT = 'supermega.shop.pilot_baseline_packet.v1'
export const SHOP_PILOT_BASELINE_WORKSHEET_CONTRACT = 'supermega.shop.pilot_baseline_worksheet.v1'

const PRODUCT = 'shop'
const PILOT_MODE = 'owner_named'
const VERTICAL_PACK = 'spa-services'
const MIN_OBSERVED_RUNS = 3
const MIN_CLOSE_CALENDAR_DATES = 3
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]
const PUBLIC_PRIVATE_VALUE_PATTERNS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /(?<![A-Za-z0-9])(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}(?![A-Za-z0-9])/u,
]
const FALSE_CONTROL_FIELDS = [
  'externalWritesPerformed',
  'customerContactPerformed',
  'paymentAccepted',
  'stockMovementPerformed',
  'serverWritePerformed',
  'hostedWritePerformed',
  'deploymentPerformed',
  'managedActivationPerformed',
  'privateIdentityExposed',
]

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  fail('shop_pilot_baseline_value_invalid')
}

function sha256(value) {
  return createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')
}

function digest(value) {
  return `sha256:${sha256(value)}`
}

function canonicalDigest(value) {
  return digest(canonicalJson(value))
}

function assertNoCredentialShape(value, code = 'shop_pilot_baseline_credential_shape') {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) fail(code)
}

function assertPublicSafe(value, code = 'shop_pilot_baseline_public_private_value') {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  assertNoCredentialShape(text, code)
  if (PUBLIC_PRIVATE_VALUE_PATTERNS.some((pattern) => pattern.test(text))) fail(code)
}

function text(value, field, max = 240) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) fail(`${field}_invalid`)
  assertNoCredentialShape(normalized, `${field}_credential_shape`)
  if (PUBLIC_PRIVATE_VALUE_PATTERNS.some((pattern) => pattern.test(normalized))) fail(`${field}_contact_detail_rejected`)
  return normalized
}

function optionalText(value, field, max = 160) {
  if (value === null || value === undefined || value === '') return null
  return text(value, field, max)
}

function safeFailureCode(error, fallback = 'shop_pilot_baseline_input_invalid') {
  const raw = String(error?.message || fallback)
  const normalized = raw.replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 160)
  return normalized || fallback
}

function bool(value, field) {
  if (typeof value !== 'boolean') fail(`${field}_invalid`)
  return value
}

function exactTrue(value, field) {
  if (value !== true) fail(`${field}_required`)
  return true
}

function numberValue(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    fail(`${field}_invalid`)
  }
  return Math.round(value * 1000) / 1000
}

function iso(value, field) {
  const normalized = text(value, field, 40)
  if (!ISO_PATTERN.test(normalized) || new Date(Date.parse(normalized)).toISOString() !== normalized) fail(`${field}_invalid`)
  return normalized
}

function dateOnly(value, field) {
  const normalized = text(value, field, 10)
  const instant = Date.parse(`${normalized}T00:00:00.000Z`)
  if (!DATE_PATTERN.test(normalized) || !Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== normalized) {
    fail(`${field}_invalid`)
  }
  return normalized
}

function plusDays(date, days) {
  const instant = Date.parse(`${date}T00:00:00.000Z`) + (days * 86_400_000)
  return new Date(instant).toISOString().slice(0, 10)
}

function isoDate(value) {
  return String(value).slice(0, 10)
}

function uniqueSortedStrings(values) {
  return [...new Set(values.map((value) => String(value || '')).filter(Boolean))].sort()
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const raw = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return Math.round(raw * 1000) / 1000
}

function sameNumber(actual, expected) {
  return Math.abs(Number(actual) - Number(expected)) < 0.001
}

function normalizeObservedRun(run, field) {
  if (!isRecord(run)) fail(`${field}_run_invalid`)
  return {
    runId: text(run.runId, `${field}_run_id`, 80),
    observedAt: iso(run.observedAt, `${field}_observed_at`),
    startedWhen: text(run.startedWhen, `${field}_started_when`, 120),
    endedWhen: text(run.endedWhen, `${field}_ended_when`, 120),
    durationMinutes: numberValue(run.durationMinutes, `${field}_duration_minutes`, { min: 0.1, max: 1_440 }),
    interrupted: bool(run.interrupted, `${field}_interrupted`),
    errorOccurred: bool(run.errorOccurred, `${field}_error_occurred`),
    errorCostLabel: optionalText(run.errorCostLabel, `${field}_error_cost_label`, 160),
  }
}

function normalizeRunSet(value, field) {
  if (!Array.isArray(value) || value.length < MIN_OBSERVED_RUNS || value.length > 100) fail(`${field}_runs_invalid`)
  const runs = value.map((run) => normalizeObservedRun(run, field))
  const ids = new Set()
  for (const run of runs) {
    if (ids.has(run.runId)) fail(`${field}_run_duplicate`)
    ids.add(run.runId)
  }
  return runs
}

function assertUniqueRunIdsAcrossBaselineStreams(streams) {
  const ids = new Set()
  for (const runs of streams) {
    for (const run of runs) {
      if (ids.has(run.runId)) fail('shop_pilot_baseline_run_id_duplicate_across_streams')
      ids.add(run.runId)
    }
  }
}

function normalizeBaselineInput(input) {
  assertNoCredentialShape(input)
  if (!isRecord(input)) fail('shop_pilot_baseline_input_required')
  if (input.contract !== SHOP_PILOT_BASELINE_INPUT_CONTRACT) fail('shop_pilot_baseline_contract_invalid')
  if (input.product !== PRODUCT) fail('shop_pilot_baseline_product_invalid')
  if (input.pilotMode !== PILOT_MODE) fail('shop_pilot_baseline_pilot_mode_invalid')
  if (input.verticalPack !== VERTICAL_PACK) fail('shop_pilot_baseline_vertical_pack_invalid')
  const proposedPilotStartDate = dateOnly(input.proposedPilotStartDate, 'shop_pilot_baseline_start_date')
  const reviewDate = dateOnly(input.reviewDate, 'shop_pilot_baseline_review_date')
  const observedOrderRuns = normalizeRunSet(input.observedOrderRuns, 'shop_pilot_baseline_order')
  const observedRedemptionRuns = normalizeRunSet(input.observedRedemptionRuns, 'shop_pilot_baseline_redemption')
  const observedCloseRuns = normalizeRunSet(input.observedCloseRuns, 'shop_pilot_baseline_close')
  assertUniqueRunIdsAcrossBaselineStreams([observedOrderRuns, observedRedemptionRuns, observedCloseRuns])
  const normalized = {
    contract: SHOP_PILOT_BASELINE_INPUT_CONTRACT,
    product: PRODUCT,
    pilotMode: PILOT_MODE,
    verticalPack: VERTICAL_PACK,
    observedAt: iso(input.observedAt, 'shop_pilot_baseline_observed_at'),
    businessName: text(input.businessName, 'shop_pilot_baseline_business_name', 160),
    namedOperator: text(input.namedOperator, 'shop_pilot_baseline_named_operator', 160),
    operatorRole: text(input.operatorRole, 'shop_pilot_baseline_operator_role', 120),
    founderObserver: text(input.founderObserver, 'shop_pilot_baseline_founder_observer', 120),
    observationPlace: text(input.observationPlace, 'shop_pilot_baseline_observation_place', 160),
    processSummary: text(input.processSummary, 'shop_pilot_baseline_process_summary', 360),
    processStartsAt: text(input.processStartsAt, 'shop_pilot_baseline_process_starts_at', 180),
    processEndsAt: text(input.processEndsAt, 'shop_pilot_baseline_process_ends_at', 180),
    correctionPath: text(input.correctionPath, 'shop_pilot_baseline_correction_path', 240),
    recordSystem: text(input.recordSystem, 'shop_pilot_baseline_record_system', 160),
    observedOrderRuns,
    observedRedemptionRuns,
    observedCloseRuns,
    weeklyOrders: numberValue(input.weeklyOrders, 'shop_pilot_baseline_weekly_orders', { min: 1, max: 100_000, integer: true }),
    claimedMedianMinutesPerOrder: numberValue(input.claimedMedianMinutesPerOrder, 'shop_pilot_baseline_claimed_order_median', { min: 0.1, max: 1_440 }),
    weeklyExceptionCount: numberValue(input.weeklyExceptionCount, 'shop_pilot_baseline_weekly_exception_count', { min: 0, max: 100_000, integer: true }),
    closeMinutesPerDay: numberValue(input.closeMinutesPerDay, 'shop_pilot_baseline_close_minutes_per_day', { min: 0, max: 1_440 }),
    clientImportRowCount: numberValue(input.clientImportRowCount, 'shop_pilot_baseline_client_import_row_count', { min: 1, max: 100_000, integer: true }),
    weeklyPackageSales: numberValue(input.weeklyPackageSales, 'shop_pilot_baseline_weekly_package_sales', { min: 1, max: 100_000, integer: true }),
    weeklyTreatmentRedemptions: numberValue(input.weeklyTreatmentRedemptions, 'shop_pilot_baseline_weekly_treatment_redemptions', { min: 1, max: 100_000, integer: true }),
    claimedMedianMinutesPerRedemption: numberValue(input.claimedMedianMinutesPerRedemption, 'shop_pilot_baseline_claimed_redemption_median', { min: 0.1, max: 1_440 }),
    weeklyPackageCorrectionCount: numberValue(input.weeklyPackageCorrectionCount, 'shop_pilot_baseline_weekly_package_correction_count', { min: 0, max: 100_000, integer: true }),
    observedErrorRunCount: numberValue(input.observedErrorRunCount, 'shop_pilot_baseline_observed_error_run_count', { min: 0, max: 100, integer: true }),
    totalObservedErrorRunCount: numberValue(input.totalObservedErrorRunCount, 'shop_pilot_baseline_total_observed_error_run_count', { min: 0, max: 200, integer: true }),
    totalObservedErrorCostLabel: optionalText(input.totalObservedErrorCostLabel, 'shop_pilot_baseline_error_cost_label', 180),
    ownerConfirmedBaseline: exactTrue(input.ownerConfirmedBaseline, 'shop_pilot_baseline_owner_confirmed'),
    operatorAgreesReviewEveryRun: exactTrue(input.operatorAgreesReviewEveryRun, 'shop_pilot_baseline_operator_review'),
    proposedPilotStartDate,
    reviewDate,
    noSuperMegaDemoMeasured: exactTrue(input.noSuperMegaDemoMeasured, 'shop_pilot_baseline_no_demo_measured'),
    noExternalEffects: exactTrue(input.noExternalEffects, 'shop_pilot_baseline_no_external_effects'),
  }
  return normalized
}

function assessBaseline(normalized, generatedAt) {
  const failures = []
  const generatedDate = isoDate(generatedAt)
  const baselineDate = isoDate(normalized.observedAt)
  const orderRuns = normalized.observedOrderRuns.filter((run) => run.interrupted === false)
  const redemptionRuns = normalized.observedRedemptionRuns.filter((run) => run.interrupted === false)
  const closeRuns = normalized.observedCloseRuns.filter((run) => run.interrupted === false)
  const closeCalendarDates = uniqueSortedStrings(closeRuns.map((run) => isoDate(run.observedAt)))
  const orderMedian = median(orderRuns.map((run) => run.durationMinutes))
  const redemptionMedian = median(redemptionRuns.map((run) => run.durationMinutes))
  const closeMedian = median(closeRuns.map((run) => run.durationMinutes))
  const observedErrorRunCount = normalized.observedOrderRuns.filter((run) => run.errorOccurred).length
  const observedRedemptionErrorRunCount = normalized.observedRedemptionRuns.filter((run) => run.errorOccurred).length
  const observedCloseErrorRunCount = normalized.observedCloseRuns.filter((run) => run.errorOccurred).length
  for (const [kind, runs] of [['order', normalized.observedOrderRuns], ['redemption', normalized.observedRedemptionRuns], ['close', normalized.observedCloseRuns]]) {
    for (const run of runs) {
      const runDate = isoDate(run.observedAt)
      if (runDate > generatedDate) failures.push(`${kind}_observed_at_after_packet_day`)
      if (runDate >= normalized.proposedPilotStartDate) failures.push(`${kind}_observed_at_must_precede_pilot_start`)
      if (run.errorOccurred && !run.errorCostLabel) failures.push(`${kind}_error_cost_label_missing`)
      if (!run.errorOccurred && run.errorCostLabel) failures.push(`${kind}_error_cost_label_without_error`)
    }
  }
  if (baselineDate > generatedDate) failures.push('baseline_observed_at_after_packet_day')
  if (baselineDate >= normalized.proposedPilotStartDate) failures.push('baseline_observed_at_must_precede_pilot_start')
  if (generatedDate >= normalized.proposedPilotStartDate) failures.push('baseline_packet_generated_at_must_precede_pilot_start')
  if (orderRuns.length < MIN_OBSERVED_RUNS) failures.push('order_observed_runs_below_three')
  if (redemptionRuns.length < MIN_OBSERVED_RUNS) failures.push('redemption_observed_runs_below_three')
  if (closeRuns.length < MIN_OBSERVED_RUNS) failures.push('close_observed_runs_below_three')
  if (closeCalendarDates.length < MIN_CLOSE_CALENDAR_DATES) failures.push('close_observed_calendar_dates_below_three')
  if (!sameNumber(normalized.claimedMedianMinutesPerOrder, orderMedian)) failures.push('claimed_order_median_mismatch')
  if (!sameNumber(normalized.claimedMedianMinutesPerRedemption, redemptionMedian)) failures.push('claimed_redemption_median_mismatch')
  if (!sameNumber(normalized.closeMinutesPerDay, closeMedian)) failures.push('claimed_close_median_mismatch')
  if (normalized.observedErrorRunCount !== observedErrorRunCount) failures.push('observed_error_count_mismatch')
  if (normalized.totalObservedErrorRunCount !== observedErrorRunCount + observedRedemptionErrorRunCount + observedCloseErrorRunCount) failures.push('total_observed_error_count_mismatch')
  if (observedErrorRunCount + observedRedemptionErrorRunCount + observedCloseErrorRunCount > 0 && !normalized.totalObservedErrorCostLabel) failures.push('total_observed_error_cost_label_missing')
  if (observedErrorRunCount + observedRedemptionErrorRunCount + observedCloseErrorRunCount === 0 && normalized.totalObservedErrorCostLabel) failures.push('total_observed_error_cost_label_without_error')
  if (normalized.reviewDate !== plusDays(normalized.proposedPilotStartDate, 4)) failures.push('review_date_must_close_five_day_plan')
  return {
    failures,
    orderRuns,
    redemptionRuns,
    closeRuns,
    closeCalendarDateCount: closeCalendarDates.length,
    orderMedian,
    redemptionMedian,
    closeMedian,
    observedErrorRunCount,
    observedRedemptionErrorRunCount,
    observedCloseErrorRunCount,
  }
}

export function buildShopPilotBaselinePacket(input, { generatedAt = new Date().toISOString() } = {}) {
  const normalized = normalizeBaselineInput(input)
  const normalizedGeneratedAt = iso(generatedAt, 'shop_pilot_baseline_generated_at')
  const assessment = assessBaseline(normalized, normalizedGeneratedAt)
  const ready = assessment.failures.length === 0
  const privateInputDigest = canonicalDigest(normalized)
  const packetWithoutDigest = {
    contract: SHOP_PILOT_BASELINE_PACKET_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: normalizedGeneratedAt,
    product: PRODUCT,
    pilotMode: PILOT_MODE,
    verticalPack: VERTICAL_PACK,
    status: ready ? 'baseline_ready_for_private_pilot_handoff' : 'blocked_collect_more_private_baseline',
    ok: ready,
    failures: assessment.failures,
    privateInputDigest,
    privateInputRetainedByTool: false,
    publicIdentityIncluded: false,
    metrics: {
      observedOrderRunCount: normalized.observedOrderRuns.length,
      uninterruptedOrderRunCount: assessment.orderRuns.length,
      medianMinutesPerOrder: assessment.orderMedian,
      weeklyOrders: normalized.weeklyOrders,
      weeklyExceptionCount: normalized.weeklyExceptionCount,
      closeMinutesPerDay: normalized.closeMinutesPerDay,
      observedOrderErrorRunCount: assessment.observedErrorRunCount,
      totalObservedErrorRunCount: assessment.observedErrorRunCount + assessment.observedRedemptionErrorRunCount + assessment.observedCloseErrorRunCount,
      clientImportRowCount: normalized.clientImportRowCount,
      weeklyPackageSales: normalized.weeklyPackageSales,
      weeklyTreatmentRedemptions: normalized.weeklyTreatmentRedemptions,
      observedRedemptionRunCount: normalized.observedRedemptionRuns.length,
      uninterruptedRedemptionRunCount: assessment.redemptionRuns.length,
      observedRedemptionErrorRunCount: assessment.observedRedemptionErrorRunCount,
      medianMinutesPerRedemption: assessment.redemptionMedian,
      weeklyPackageCorrectionCount: normalized.weeklyPackageCorrectionCount,
      observedCloseRunCount: normalized.observedCloseRuns.length,
      uninterruptedCloseRunCount: assessment.closeRuns.length,
      requiredCloseCalendarDateCount: MIN_CLOSE_CALENDAR_DATES,
      uninterruptedCloseCalendarDateCount: assessment.closeCalendarDateCount,
      observedCloseErrorRunCount: assessment.observedCloseErrorRunCount,
      medianCloseMinutesPerDay: assessment.closeMedian,
    },
    ownerConfirmations: {
      ownerConfirmedBaseline: true,
      operatorAgreesReviewEveryRun: true,
      noSuperMegaDemoMeasured: true,
      noExternalEffects: true,
    },
    pilotWindow: {
      proposedPilotStartDate: normalized.proposedPilotStartDate,
      reviewDate: normalized.reviewDate,
      durationDays: 5,
    },
    nextAction: ready
      ? 'Use this private baseline digest in the Shop pilot handoff, then keep raw identity only in the private workspace.'
      : 'Collect more owner-observed manual baseline evidence before Shop pilot day one.',
    controls: Object.fromEntries(FALSE_CONTROL_FIELDS.map((field) => [field, false])),
  }
  assertPublicSafe(packetWithoutDigest)
  return {
    ...packetWithoutDigest,
    digest: digest(canonicalJson(packetWithoutDigest)),
  }
}

export function preflightShopPilotBaselineInput(input, { generatedAt = new Date().toISOString() } = {}) {
  const base = {
    contract: SHOP_PILOT_BASELINE_INPUT_PREFLIGHT_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: iso(generatedAt, 'shop_pilot_baseline_preflight_generated_at'),
    product: PRODUCT,
    pilotMode: PILOT_MODE,
    verticalPack: VERTICAL_PACK,
    privateInputRetainedByTool: false,
    publicIdentityIncluded: false,
    controls: Object.fromEntries(FALSE_CONTROL_FIELDS.map((field) => [field, false])),
  }
  try {
    const packet = buildShopPilotBaselinePacket(input, { generatedAt })
    const ready = packet.ok === true && packet.status === 'baseline_ready_for_private_pilot_handoff'
    const body = {
      ...base,
      ok: ready,
      status: ready ? 'baseline_input_ready' : 'baseline_input_blocked',
      safeToGeneratePublicBaselinePacket: ready,
      failures: [...packet.failures],
      privateInputDigest: packet.privateInputDigest,
      metrics: { ...packet.metrics },
      pilotWindow: { ...packet.pilotWindow },
      nextAction: ready
        ? 'Generate the owner-safe baseline packet and then run the Shop Day-0 readiness gate with the intake packet.'
        : 'Fix the private owner-observed baseline input locally; do not generate or edit an owner-safe packet yet.',
    }
    assertPublicSafe(body, 'shop_pilot_baseline_preflight_public_private_value')
    return {
      ...body,
      digest: digest(canonicalJson(body)),
    }
  } catch (error) {
    const body = {
      ...base,
      ok: false,
      status: 'baseline_input_invalid',
      safeToGeneratePublicBaselinePacket: false,
      failures: [safeFailureCode(error)],
      privateInputDigest: null,
      metrics: null,
      pilotWindow: null,
      nextAction: 'Fix the private owner-observed baseline input locally; do not generate or edit an owner-safe packet yet.',
    }
    assertPublicSafe(body, 'shop_pilot_baseline_preflight_public_private_value')
    return {
      ...body,
      digest: digest(canonicalJson(body)),
    }
  }
}

export function validateShopPilotBaselineInputPreflight(packet) {
  assertPublicSafe(packet)
  if (!isRecord(packet)) fail('shop_pilot_baseline_preflight_required')
  if (packet.contract !== SHOP_PILOT_BASELINE_INPUT_PREFLIGHT_CONTRACT) fail('shop_pilot_baseline_preflight_contract_invalid')
  if (packet.digestScope !== 'utf8_compact_json_without_digest') fail('shop_pilot_baseline_preflight_digest_scope_invalid')
  iso(packet.generatedAt, 'shop_pilot_baseline_preflight_generated_at')
  if (packet.product !== PRODUCT || packet.pilotMode !== PILOT_MODE || packet.verticalPack !== VERTICAL_PACK) fail('shop_pilot_baseline_preflight_scope_invalid')
  if (!['baseline_input_ready', 'baseline_input_blocked', 'baseline_input_invalid'].includes(packet.status)) fail('shop_pilot_baseline_preflight_status_invalid')
  if ((packet.status === 'baseline_input_ready') !== (packet.ok === true)) fail('shop_pilot_baseline_preflight_ok_invalid')
  if (packet.safeToGeneratePublicBaselinePacket !== (packet.status === 'baseline_input_ready')) fail('shop_pilot_baseline_preflight_safe_invalid')
  if (!Array.isArray(packet.failures) || (packet.ok === true && packet.failures.length !== 0)) fail('shop_pilot_baseline_preflight_failures_invalid')
  if (packet.privateInputRetainedByTool !== false || packet.publicIdentityIncluded !== false) fail('shop_pilot_baseline_preflight_privacy_invalid')
  if (packet.status === 'baseline_input_invalid') {
    if (packet.privateInputDigest !== null || packet.metrics !== null || packet.pilotWindow !== null) fail('shop_pilot_baseline_preflight_invalid_payload')
  } else if (!DIGEST_PATTERN.test(packet.privateInputDigest || '') || !isRecord(packet.metrics) || !isRecord(packet.pilotWindow)) {
    fail('shop_pilot_baseline_preflight_ready_payload_invalid')
  }
  if (!isRecord(packet.controls) || FALSE_CONTROL_FIELDS.some((field) => packet.controls[field] !== false)) fail('shop_pilot_baseline_preflight_controls_invalid')
  if (!DIGEST_PATTERN.test(packet.digest || '')) fail('shop_pilot_baseline_preflight_digest_invalid')
  const copy = { ...packet }
  delete copy.digest
  if (packet.digest !== digest(canonicalJson(copy))) fail('shop_pilot_baseline_preflight_digest_mismatch')
  return packet
}

export function validateShopPilotBaselinePacket(packet) {
  assertPublicSafe(packet)
  if (!isRecord(packet)) fail('shop_pilot_baseline_packet_required')
  if (packet.contract !== SHOP_PILOT_BASELINE_PACKET_CONTRACT) fail('shop_pilot_baseline_packet_contract_invalid')
  if (packet.digestScope !== 'utf8_compact_json_without_digest') fail('shop_pilot_baseline_packet_digest_scope_invalid')
  iso(packet.generatedAt, 'shop_pilot_baseline_packet_generated_at')
  if (packet.product !== PRODUCT || packet.pilotMode !== PILOT_MODE || packet.verticalPack !== VERTICAL_PACK) {
    fail('shop_pilot_baseline_packet_scope_invalid')
  }
  if (!['baseline_ready_for_private_pilot_handoff', 'blocked_collect_more_private_baseline'].includes(packet.status)) {
    fail('shop_pilot_baseline_packet_status_invalid')
  }
  if ((packet.status === 'baseline_ready_for_private_pilot_handoff') !== (packet.ok === true)) {
    fail('shop_pilot_baseline_packet_ok_invalid')
  }
  if (!Array.isArray(packet.failures) || (packet.ok === true && packet.failures.length !== 0)) {
    fail('shop_pilot_baseline_packet_failures_invalid')
  }
  if (!DIGEST_PATTERN.test(packet.privateInputDigest || '') || packet.privateInputRetainedByTool !== false || packet.publicIdentityIncluded !== false) {
    fail('shop_pilot_baseline_packet_privacy_invalid')
  }
  const metrics = packet.metrics
  if (!isRecord(metrics)
    || metrics.observedOrderRunCount < MIN_OBSERVED_RUNS
    || metrics.observedRedemptionRunCount < MIN_OBSERVED_RUNS
    || metrics.observedCloseRunCount < MIN_OBSERVED_RUNS
    || metrics.uninterruptedOrderRunCount > metrics.observedOrderRunCount
    || metrics.uninterruptedRedemptionRunCount > metrics.observedRedemptionRunCount
    || metrics.uninterruptedCloseRunCount > metrics.observedCloseRunCount
    || metrics.requiredCloseCalendarDateCount !== MIN_CLOSE_CALENDAR_DATES
    || !Number.isInteger(metrics.uninterruptedCloseCalendarDateCount)
    || metrics.uninterruptedCloseCalendarDateCount < 0
    || metrics.uninterruptedCloseCalendarDateCount > metrics.uninterruptedCloseRunCount
    || metrics.weeklyOrders < 1
    || metrics.observedOrderErrorRunCount < 0
    || metrics.observedRedemptionErrorRunCount < 0
    || metrics.observedCloseErrorRunCount < 0
    || metrics.totalObservedErrorRunCount !== metrics.observedOrderErrorRunCount + metrics.observedRedemptionErrorRunCount + metrics.observedCloseErrorRunCount
    || metrics.clientImportRowCount < 1
    || metrics.weeklyPackageSales < 1
    || metrics.weeklyTreatmentRedemptions < 1) {
    fail('shop_pilot_baseline_packet_metrics_invalid')
  }
  if (packet.ok === true && (metrics.uninterruptedOrderRunCount < MIN_OBSERVED_RUNS
    || metrics.uninterruptedRedemptionRunCount < MIN_OBSERVED_RUNS
    || metrics.uninterruptedCloseRunCount < MIN_OBSERVED_RUNS
    || metrics.uninterruptedCloseCalendarDateCount < MIN_CLOSE_CALENDAR_DATES
    || !sameNumber(metrics.closeMinutesPerDay, metrics.medianCloseMinutesPerDay))) {
    fail('shop_pilot_baseline_packet_ready_metrics_invalid')
  }
  const confirmations = packet.ownerConfirmations
  if (!isRecord(confirmations)
    || confirmations.ownerConfirmedBaseline !== true
    || confirmations.operatorAgreesReviewEveryRun !== true
    || confirmations.noSuperMegaDemoMeasured !== true
    || confirmations.noExternalEffects !== true) {
    fail('shop_pilot_baseline_packet_confirmations_invalid')
  }
  const pilotStartDateValid = isRecord(packet.pilotWindow) && DATE_PATTERN.test(packet.pilotWindow.proposedPilotStartDate || '')
  const reviewWindowValid = pilotStartDateValid
    && DATE_PATTERN.test(packet.pilotWindow.reviewDate || '')
    && packet.pilotWindow.durationDays === 5
    && packet.pilotWindow.reviewDate === plusDays(packet.pilotWindow.proposedPilotStartDate, 4)
  if (!reviewWindowValid
    && (packet.ok === true || !packet.failures.includes('review_date_must_close_five_day_plan'))) {
    fail('shop_pilot_baseline_packet_window_invalid')
  }
  const generatedBeforePilotStart = pilotStartDateValid && isoDate(packet.generatedAt) < packet.pilotWindow.proposedPilotStartDate
  if (pilotStartDateValid
    && !generatedBeforePilotStart
    && (packet.ok === true || !packet.failures.includes('baseline_packet_generated_at_must_precede_pilot_start'))) {
    fail('shop_pilot_baseline_packet_generated_window_invalid')
  }
  if (!isRecord(packet.controls) || FALSE_CONTROL_FIELDS.some((field) => packet.controls[field] !== false)) {
    fail('shop_pilot_baseline_packet_controls_invalid')
  }
  if (!DIGEST_PATTERN.test(packet.digest || '')) fail('shop_pilot_baseline_packet_digest_invalid')
  const copy = { ...packet }
  delete copy.digest
  if (packet.digest !== digest(canonicalJson(copy))) fail('shop_pilot_baseline_packet_digest_mismatch')
  return packet
}

export function baselineInputTemplate() {
  return {
    contract: SHOP_PILOT_BASELINE_INPUT_CONTRACT,
    product: PRODUCT,
    pilotMode: PILOT_MODE,
    verticalPack: VERTICAL_PACK,
    observedAt: '',
    businessName: '',
    namedOperator: '',
    operatorRole: '',
    founderObserver: '',
    observationPlace: '',
    processSummary: '',
    processStartsAt: '',
    processEndsAt: '',
    correctionPath: '',
    recordSystem: '',
    observedOrderRuns: [
      { runId: 'order-run-001', observedAt: '', startedWhen: '', endedWhen: '', durationMinutes: null, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'order-run-002', observedAt: '', startedWhen: '', endedWhen: '', durationMinutes: null, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'order-run-003', observedAt: '', startedWhen: '', endedWhen: '', durationMinutes: null, interrupted: false, errorOccurred: false, errorCostLabel: null },
    ],
    observedRedemptionRuns: [
      { runId: 'redemption-run-001', observedAt: '', startedWhen: '', endedWhen: '', durationMinutes: null, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'redemption-run-002', observedAt: '', startedWhen: '', endedWhen: '', durationMinutes: null, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'redemption-run-003', observedAt: '', startedWhen: '', endedWhen: '', durationMinutes: null, interrupted: false, errorOccurred: false, errorCostLabel: null },
    ],
    observedCloseRuns: [
      { runId: 'close-run-001', observedAt: '', startedWhen: '', endedWhen: '', durationMinutes: null, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'close-run-002', observedAt: '', startedWhen: '', endedWhen: '', durationMinutes: null, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'close-run-003', observedAt: '', startedWhen: '', endedWhen: '', durationMinutes: null, interrupted: false, errorOccurred: false, errorCostLabel: null },
    ],
    weeklyOrders: null,
    claimedMedianMinutesPerOrder: null,
    weeklyExceptionCount: null,
    closeMinutesPerDay: null,
    clientImportRowCount: null,
    weeklyPackageSales: null,
    weeklyTreatmentRedemptions: null,
    claimedMedianMinutesPerRedemption: null,
    weeklyPackageCorrectionCount: null,
    observedErrorRunCount: null,
    totalObservedErrorRunCount: null,
    totalObservedErrorCostLabel: null,
    ownerConfirmedBaseline: false,
    operatorAgreesReviewEveryRun: false,
    proposedPilotStartDate: '',
    reviewDate: '',
    noSuperMegaDemoMeasured: false,
    noExternalEffects: false,
  }
}

export function renderShopPilotBaselineWorksheetMarkdown() {
  const template = baselineInputTemplate()
  const orderRows = template.observedOrderRuns
    .map((run) => `| ${run.runId} |  |  |  |  | false | false |  |`)
    .join('\n')
  const redemptionRows = template.observedRedemptionRuns
    .map((run) => `| ${run.runId} |  |  |  |  | false | false |  |`)
    .join('\n')
  const closeRows = template.observedCloseRuns
    .map((run) => `| ${run.runId} |  |  |  |  | false | false |  |`)
    .join('\n')
  const body = [
    '# Shop Pilot Owner-Observed Baseline Worksheet',
    '',
    `Contract: \`${SHOP_PILOT_BASELINE_WORKSHEET_CONTRACT}\``,
    `JSON input contract: \`${SHOP_PILOT_BASELINE_INPUT_CONTRACT}\``,
    '',
    'Purpose: capture the private manual-process baseline before Shop pilot Day 1. This worksheet is for local owner use only; the generated owner-safe packet must contain counts, booleans, labels, dates, and digests only.',
    '',
    '## Safety boundary',
    '',
    '- Keep the business name, operator name, observation place, and raw notes only in the private JSON input.',
    '- Do not include customer contact details, message bodies, credential values, payment details, stock records, screenshots, or raw private evidence in owner-safe packets.',
    '- Owner-safe packets are not public website, customer-facing, or publishable artifacts.',
    '- This worksheet does not authorize customer contact, payment, stock movement, server write, hosted write, deployment, production release, or managed activation.',
    '',
    '## Minimum evidence for a ready baseline packet',
    '',
    '- At least 3 uninterrupted manual order runs.',
    '- At least 3 uninterrupted manual package-redemption runs.',
    '- At least 3 uninterrupted manual daily-close runs on 3 distinct close calendar dates.',
    '- Claimed medians must match the durations recorded below.',
    '- Observed order error count must match the recorded order runs.',
    '- Daily close minutes must match the median of observed daily-close runs.',
    '- Total observed error-run count must match order plus package-redemption plus daily-close error runs.',
    '- Every run marked as an error must include a private cost/correction label; non-error runs must leave that label blank.',
    '- Total observed error cost label is required when any observed order or redemption run had an error, and must stay blank when none did.',
    '- Review date must be exactly 4 calendar days after the proposed Day-1 pilot start date.',
    '- Generate the baseline packet before the proposed Day-1 pilot start date.',
    '- Owner confirmations must be true: baseline confirmed, operator reviews every run, no SuperMega demo measured, and no external effects.',
    '',
    '## Private baseline fields to fill in JSON',
    '',
    '| Field | Required value | Notes |',
    '| --- | --- | --- |',
    '| observedAt | ISO UTC timestamp | When the owner observation happened. |',
    '| businessName | private text | Keep only in the private input. |',
    '| namedOperator | private text | Keep only in the private input. |',
    '| operatorRole | role label | Example: shop manager. |',
    '| founderObserver | private text | The observer name stays private. |',
    '| observationPlace | private text | Keep only in the private input. |',
    '| processSummary | private process text | No raw customer identity. |',
    '| processStartsAt | process boundary | Start of the manual flow. |',
    '| processEndsAt | process boundary | End of the manual flow. |',
    '| correctionPath | process text | How manual errors are corrected today. |',
    '| recordSystem | process text | Current books, sheets, or tools. |',
    '| weeklyOrders | integer | Current weekly order volume. |',
    '| weeklyExceptionCount | integer | Current weekly exceptions. |',
    '| closeMinutesPerDay | number | Current daily close minutes; must match observed daily-close median. |',
    '| clientImportRowCount | integer | Count only; no names or contacts. |',
    '| weeklyPackageSales | integer | Current package-sale count. |',
    '| weeklyTreatmentRedemptions | integer | Current redemption count. |',
    '| weeklyPackageCorrectionCount | integer | Current package-correction count. |',
    '| observedErrorRunCount | integer | Manual order error-run count only; kept for order-baseline continuity. |',
    '| totalObservedErrorRunCount | integer | All observed error runs across manual orders, package redemptions, and daily closes. |',
    '| proposedPilotStartDate | YYYY-MM-DD | Day 1 of the five-day pilot. |',
    '| reviewDate | YYYY-MM-DD | Must equal Day 1 plus 4 days. |',
    '',
    '## Manual order runs',
    '',
    '| runId | observedAt | startedWhen | endedWhen | durationMinutes | interrupted | errorOccurred | errorCostLabel |',
    '| --- | --- | --- | --- | ---: | --- | --- | --- |',
    orderRows,
    '',
    '## Package-redemption runs',
    '',
    '| runId | observedAt | startedWhen | endedWhen | durationMinutes | interrupted | errorOccurred | errorCostLabel |',
    '| --- | --- | --- | --- | ---: | --- | --- | --- |',
    redemptionRows,
    '',
    '## Daily-close runs',
    '',
    '| runId | observedAt | startedWhen | endedWhen | durationMinutes | interrupted | errorOccurred | errorCostLabel |',
    '| --- | --- | --- | --- | ---: | --- | --- | --- |',
    closeRows,
    '',
    '## Local commands after observation',
    '',
    '```powershell',
    'node tools/prepare_shop_pilot_baseline_packet.mjs --template "<private-baseline-input.json>"',
    'node tools/prepare_shop_pilot_baseline_packet.mjs --lint-input "<private-baseline-input.json>"',
    'node tools/prepare_shop_pilot_baseline_packet.mjs --input "<private-baseline-input.json>" --output "<owner-safe-baseline-packet.json>" --markdown-output "<owner-safe-baseline-packet.md>"',
    'node tools/prepare_shop_pilot_baseline_packet.mjs --verify "<owner-safe-baseline-packet.json>"',
    '```',
    '',
    'If the packet is blocked, fix the private observation data locally and regenerate the owner-safe packet. Do not edit an owner-safe packet by hand.',
  ].join('\n')
  assertPublicSafe(body, 'shop_pilot_baseline_worksheet_private_value')
  return body
}

export function renderShopPilotBaselinePacketMarkdown(packet) {
  validateShopPilotBaselinePacket(packet)
  const failures = packet.failures.length ? packet.failures.map((failure) => `- ${failure}`).join('\n') : '- none'
  return [
    '# Shop Pilot Baseline Packet',
    '',
    `Contract: \`${packet.contract}\``,
    `Digest: \`${packet.digest}\``,
    `Status: \`${packet.status}\``,
    `Private input digest: \`${packet.privateInputDigest}\``,
    '',
    '## Public-safe metrics',
    '',
    `Observed order runs: ${packet.metrics.uninterruptedOrderRunCount}/${packet.metrics.observedOrderRunCount}`,
    `Observed order error runs: ${packet.metrics.observedOrderErrorRunCount}`,
    `Total observed error runs: ${packet.metrics.totalObservedErrorRunCount}`,
    `Median minutes per order: ${packet.metrics.medianMinutesPerOrder}`,
    `Weekly orders: ${packet.metrics.weeklyOrders}`,
    `Weekly exceptions: ${packet.metrics.weeklyExceptionCount}`,
    `Daily close minutes: ${packet.metrics.closeMinutesPerDay}`,
    `Observed close runs: ${packet.metrics.uninterruptedCloseRunCount}/${packet.metrics.observedCloseRunCount}`,
    `Observed close calendar dates: ${packet.metrics.uninterruptedCloseCalendarDateCount}/${packet.metrics.requiredCloseCalendarDateCount}`,
    `Observed close error runs: ${packet.metrics.observedCloseErrorRunCount}`,
    `Median close minutes per day: ${packet.metrics.medianCloseMinutesPerDay}`,
    `Client import rows: ${packet.metrics.clientImportRowCount}`,
    `Weekly package sales: ${packet.metrics.weeklyPackageSales}`,
    `Weekly treatment redemptions: ${packet.metrics.weeklyTreatmentRedemptions}`,
    `Median minutes per redemption: ${packet.metrics.medianMinutesPerRedemption}`,
    `Weekly package corrections: ${packet.metrics.weeklyPackageCorrectionCount}`,
    '',
    '## Failures',
    '',
    failures,
    '',
    '## Next action',
    '',
    packet.nextAction,
    '',
    '## Privacy and authority',
    '',
    'No business name, operator name, raw notes, email, phone number, credential, payment, stock movement, hosted write, or managed activation is included in this packet.',
  ].join('\n')
}

async function readJson(path) {
  let textContent = null
  try {
    textContent = await readFile(resolve(path || ''), 'utf8')
  } catch {
    fail('shop_pilot_baseline_json_read_failed')
  }
  try {
    return JSON.parse(textContent)
  } catch {
    fail('shop_pilot_baseline_json_invalid')
  }
}

async function writeOutput(path, content) {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  try {
    await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if (error?.code === 'EEXIST') fail('shop_pilot_baseline_output_exists')
    throw error
  }
  return absolute
}

function sampleInput(overrides = {}) {
  const base = {
    contract: SHOP_PILOT_BASELINE_INPUT_CONTRACT,
    product: PRODUCT,
    pilotMode: PILOT_MODE,
    verticalPack: VERTICAL_PACK,
    observedAt: '2026-08-25T08:00:00.000Z',
    businessName: 'Private Spa Sample',
    namedOperator: 'Private Operator',
    operatorRole: 'Shop manager',
    founderObserver: 'Founder',
    observationPlace: 'Private shop floor',
    processSummary: 'Owner records package sale and redemption in a notebook, then closes the day manually.',
    processStartsAt: 'Client asks for a prepaid package',
    processEndsAt: 'Payment reconciled, treatment completed, balance updated, and book closed',
    correctionPath: 'Owner crosses out the wrong entry and writes a correction beside the original record',
    recordSystem: 'Notebook and phone gallery',
    observedOrderRuns: [
      { runId: 'order-run-001', observedAt: '2026-08-25T08:01:00.000Z', startedWhen: 'client request began', endedWhen: 'manual book entry completed', durationMinutes: 7, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'order-run-002', observedAt: '2026-08-25T08:20:00.000Z', startedWhen: 'client request began', endedWhen: 'manual book entry completed', durationMinutes: 8, interrupted: false, errorOccurred: true, errorCostLabel: 'one correction before final balance' },
      { runId: 'order-run-003', observedAt: '2026-08-25T08:40:00.000Z', startedWhen: 'client request began', endedWhen: 'manual book entry completed', durationMinutes: 9, interrupted: false, errorOccurred: false, errorCostLabel: null },
    ],
    observedRedemptionRuns: [
      { runId: 'redemption-run-001', observedAt: '2026-08-25T09:01:00.000Z', startedWhen: 'treatment completed', endedWhen: 'package balance updated', durationMinutes: 2, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'redemption-run-002', observedAt: '2026-08-25T09:20:00.000Z', startedWhen: 'treatment completed', endedWhen: 'package balance updated', durationMinutes: 3, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'redemption-run-003', observedAt: '2026-08-25T09:40:00.000Z', startedWhen: 'treatment completed', endedWhen: 'package balance updated', durationMinutes: 4, interrupted: false, errorOccurred: false, errorCostLabel: null },
    ],
    observedCloseRuns: [
      { runId: 'close-run-001', observedAt: '2026-08-23T18:01:00.000Z', startedWhen: 'last treatment finished', endedWhen: 'manual close completed', durationMinutes: 40, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'close-run-002', observedAt: '2026-08-24T18:20:00.000Z', startedWhen: 'last treatment finished', endedWhen: 'manual close completed', durationMinutes: 45, interrupted: false, errorOccurred: false, errorCostLabel: null },
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
  }
  return {
    ...base,
    ...overrides,
  }
}

function runSelfTest() {
  const packet = buildShopPilotBaselinePacket(sampleInput(), { generatedAt: '2026-08-25T00:00:00.000Z' })
  validateShopPilotBaselinePacket(packet)
  const preflight = validateShopPilotBaselineInputPreflight(preflightShopPilotBaselineInput(sampleInput(), { generatedAt: '2026-08-25T00:00:00.000Z' }))
  const markdown = renderShopPilotBaselinePacketMarkdown(packet)
  if (packet.metrics.requiredCloseCalendarDateCount !== MIN_CLOSE_CALENDAR_DATES
    || packet.metrics.uninterruptedCloseCalendarDateCount !== MIN_CLOSE_CALENDAR_DATES
    || !markdown.includes('Observed close calendar dates: 3/3')) {
    fail('shop_pilot_baseline_self_test_close_calendar_dates_invalid')
  }
  if (JSON.stringify(packet).includes('Private Spa Sample') || markdown.includes('Private Operator')) {
    fail('shop_pilot_baseline_self_test_private_output')
  }
  const blocked = buildShopPilotBaselinePacket(sampleInput({
    claimedMedianMinutesPerOrder: 7,
  }), { generatedAt: '2026-08-25T00:00:00.000Z' })
  if (blocked.ok !== false || !blocked.failures.includes('claimed_order_median_mismatch')) {
    fail('shop_pilot_baseline_self_test_blocked_invalid')
  }
  const repeatedCloseDate = buildShopPilotBaselinePacket(sampleInput({
    observedCloseRuns: sampleInput().observedCloseRuns.map((run, index) => ({
      ...run,
      observedAt: `2026-08-25T18:${String(index + 1).padStart(2, '0')}:00.000Z`,
    })),
  }), { generatedAt: '2026-08-25T00:00:00.000Z' })
  if (repeatedCloseDate.ok !== false
    || repeatedCloseDate.metrics.uninterruptedCloseCalendarDateCount !== 1
    || !repeatedCloseDate.failures.includes('close_observed_calendar_dates_below_three')) {
    fail('shop_pilot_baseline_self_test_close_calendar_dates_blocked_invalid')
  }
  const invalid = validateShopPilotBaselineInputPreflight(preflightShopPilotBaselineInput({
    ...sampleInput(),
    businessName: 'owner@example.invalid',
  }, { generatedAt: '2026-08-25T00:00:00.000Z' }))
  if (preflight.status !== 'baseline_input_ready' || invalid.status !== 'baseline_input_invalid' || invalid.privateInputDigest !== null) {
    fail('shop_pilot_baseline_self_test_preflight_invalid')
  }
  return {
    ok: true,
    contract: SHOP_PILOT_BASELINE_PACKET_CONTRACT,
    cases: 4,
    externalWritesPerformed: false,
  }
}

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    markdownOutput: null,
    verify: null,
    lintInput: null,
    template: null,
    worksheetOutput: null,
    selfTest: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input') args.input = argv[++index]
    else if (arg === '--output') args.output = argv[++index]
    else if (arg === '--markdown-output') args.markdownOutput = argv[++index]
    else if (arg === '--verify') args.verify = argv[++index] || null
    else if (arg === '--lint-input') args.lintInput = argv[++index] || null
    else if (arg === '--template') args.template = argv[++index] || null
    else if (arg === '--worksheet-output') args.worksheetOutput = argv[++index] || null
    else if (arg === '--self-test') args.selfTest = true
    else fail(`shop_pilot_baseline_unknown_arg:${arg}`)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest()))
    return
  }
  if (args.template || args.worksheetOutput) {
    let output = null
    let outputDigest = null
    let worksheetOutput = null
    let worksheetDigest = null
    if (args.template) {
      const content = `${JSON.stringify(baselineInputTemplate(), null, 2)}\n`
      output = await writeOutput(args.template, content)
      outputDigest = digest(content)
    }
    if (args.worksheetOutput) {
      const worksheet = `${renderShopPilotBaselineWorksheetMarkdown()}\n`
      worksheetOutput = await writeOutput(args.worksheetOutput, worksheet)
      worksheetDigest = digest(worksheet)
    }
    console.log(JSON.stringify({
      ok: true,
      contract: SHOP_PILOT_BASELINE_INPUT_CONTRACT,
      output,
      digest: outputDigest,
      worksheetContract: SHOP_PILOT_BASELINE_WORKSHEET_CONTRACT,
      worksheetOutput,
      worksheetDigest,
      externalWritesPerformed: false,
    }))
    return
  }
  if (args.verify) {
    const packet = validateShopPilotBaselinePacket(await readJson(args.verify))
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      status: packet.status,
      digest: packet.digest,
      privateIdentityIncluded: packet.publicIdentityIncluded,
      externalWritesPerformed: false,
    }))
    return
  }
  if (args.lintInput) {
    const packet = validateShopPilotBaselineInputPreflight(preflightShopPilotBaselineInput(await readJson(args.lintInput)))
    console.log(JSON.stringify({
      ok: packet.ok,
      contract: packet.contract,
      status: packet.status,
      safeToGeneratePublicBaselinePacket: packet.safeToGeneratePublicBaselinePacket,
      failures: packet.failures,
      privateInputDigest: packet.privateInputDigest,
      digest: packet.digest,
      externalWritesPerformed: false,
    }))
    if (!packet.ok) process.exitCode = 1
    return
  }
  if (!args.input) fail('shop_pilot_baseline_input_required')
  const packet = validateShopPilotBaselinePacket(buildShopPilotBaselinePacket(await readJson(args.input)))
  if (args.output) await writeOutput(args.output, `${JSON.stringify(packet, null, 2)}\n`)
  if (args.markdownOutput) await writeOutput(args.markdownOutput, `${renderShopPilotBaselinePacketMarkdown(packet)}\n`)
  if (!args.output && !args.markdownOutput) console.log(JSON.stringify(packet, null, 2))
  else {
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      status: packet.status,
      output: args.output ? resolve(args.output) : null,
      markdownOutput: args.markdownOutput ? resolve(args.markdownOutput) : null,
      digest: packet.digest,
      externalWritesPerformed: false,
    }))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: SHOP_PILOT_BASELINE_PACKET_CONTRACT,
      error: String(error?.message || 'shop_pilot_baseline_failed').slice(0, 240),
      externalWritesPerformed: false,
    }))
    process.exitCode = 1
  })
}
