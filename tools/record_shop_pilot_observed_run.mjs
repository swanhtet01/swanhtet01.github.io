import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SHOP_PILOT_MODE,
  SHOP_PILOT_PRODUCT,
  SHOP_PILOT_VERTICAL_PACK,
} from './create_shop_pilot_handoff.mjs'

export const SHOP_OBSERVED_RUN_INPUT_CONTRACT = 'supermega.shop.observed_pilot_run_input.v1'
export const SHOP_OBSERVED_EVIDENCE_CONTRACT = 'supermega.shop.observed_pilot_evidence.v1'

const RUNS_FILE = 'observed-runs.private.jsonl'
const SUMMARY_FILE = 'observed-summary.private.json'
const REQUIRED_ACCEPTED_CONSECUTIVE_RUNS = 20
const REQUIRED_PILOT_DAY_INDEXES = Object.freeze([1, 2, 3, 4, 5])
const RELOAD_RETRY_OUTCOMES = Object.freeze(['passed', 'failed', 'not-tested'])
const REQUIRED_INPUT_KEYS = Object.freeze([
  'accepted',
  'closeMinutes',
  'contract',
  'dayIndex',
  'durationMinutesPerOrder',
  'evidenceReferenceDigest',
  'exceptionCount',
  'independentAnchorDigest',
  'noHostedWrite',
  'noPaymentAccepted',
  'noRealMessageSent',
  'noServerWrite',
  'noStockMovement',
  'observedAt',
  'operatorCorrectionCount',
  'operatorReviewed',
  'pilotMode',
  'product',
  'reloadRetryOutcome',
  'runId',
  'targetCorrect',
  'verticalPack',
])
const FORBIDDEN_PRIVATE_KEYS = Object.freeze(new Set([
  'address',
  'businessname',
  'client',
  'clientname',
  'clients',
  'company',
  'companyname',
  'contact',
  'contacts',
  'customer',
  'customers',
  'displayname',
  'email',
  'message',
  'messagetext',
  'name',
  'note',
  'notes',
  'participant',
  'participantname',
  'participants',
  'phone',
  'raw',
  'recipient',
]))

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  throw new Error('shop_observed_value_invalid')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function digest(value) {
  return `sha256:${sha256(canonicalJson(value))}`
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function normalizedKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function assertNoPrivateIdentity(value, path = 'input') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateIdentity(item, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(value)) throw new Error('shop_observed_private_identity_value_rejected')
      if (/\b(?:\+?\d[\d .().-]{7,}\d)\b/.test(value)) throw new Error('shop_observed_private_identity_value_rejected')
      if (/https?:\/\//i.test(value)) throw new Error('shop_observed_private_identity_value_rejected')
    }
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PRIVATE_KEYS.has(normalizedKey(key))) throw new Error('shop_observed_private_identity_field_rejected')
    assertNoPrivateIdentity(child, `${path}.${key}`)
  }
}

function exactKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()))
}

function exactBoolean(value, field) {
  if (typeof value !== 'boolean') throw new Error(`${field}_invalid`)
  return value
}

function exactTrue(value, field) {
  if (value !== true) throw new Error(`${field}_required`)
  return true
}

function exactNumber(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${field}_invalid`)
  }
  return value
}

function exactText(value, field, max = 120) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}_required`)
  const normalized = value.trim()
  if (normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`${field}_invalid`)
  return normalized
}

function exactIsoUtc(value, field) {
  const normalized = exactText(value, field, 40)
  const instant = Date.parse(normalized)
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== normalized) throw new Error(`${field}_invalid`)
  return normalized
}

function exactShaDigest(value, field) {
  const normalized = exactText(value, field, 80)
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) throw new Error(`${field}_invalid`)
  return normalized
}

function rounded(value) {
  return Math.round(value * 1000) / 1000
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const raw = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return rounded(raw)
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0)
}

function rate(numerator, denominator) {
  if (denominator === 0) return 0
  return rounded(numerator / denominator)
}

function uniqueSortedNumbers(values) {
  return [...new Set(values)].sort((a, b) => a - b)
}

function assertStoredProofIntegrity(entries) {
  const seenRunIds = new Set()
  const seenEvidenceReferenceDigests = new Set()
  const seenIndependentAnchorDigests = new Set()
  for (const entry of entries) {
    if (seenRunIds.has(entry.runId)) throw new Error('shop_observed_run_id_duplicate')
    if (seenEvidenceReferenceDigests.has(entry.evidenceReferenceDigest)) throw new Error('shop_observed_evidence_reference_digest_duplicate')
    if (seenIndependentAnchorDigests.has(entry.independentAnchorDigest)) throw new Error('shop_observed_independent_anchor_digest_duplicate')
    if (entry.evidenceReferenceDigest === entry.independentAnchorDigest) throw new Error('shop_observed_evidence_anchor_digest_not_independent')
    seenRunIds.add(entry.runId)
    seenEvidenceReferenceDigests.add(entry.evidenceReferenceDigest)
    seenIndependentAnchorDigests.add(entry.independentAnchorDigest)
  }
  return {
    uniqueRunIds: true,
    uniqueEvidenceReferenceDigests: true,
    uniqueIndependentAnchorDigests: true,
    evidenceAnchorDigestPairsDistinct: true,
  }
}

export function normalizeObservedRunInput(input) {
  assertNoPrivateIdentity(input)
  if (!exactKeys(input, REQUIRED_INPUT_KEYS)) throw new Error('shop_observed_run_input_keys_invalid')
  if (input.contract !== SHOP_OBSERVED_RUN_INPUT_CONTRACT) throw new Error('shop_observed_run_contract_invalid')
  if (input.product !== SHOP_PILOT_PRODUCT) throw new Error('product_invalid')
  if (input.pilotMode !== SHOP_PILOT_MODE) throw new Error('pilot_mode_invalid')
  if (input.verticalPack !== SHOP_PILOT_VERTICAL_PACK) throw new Error('vertical_pack_unsupported')
  const reloadRetryOutcome = exactText(input.reloadRetryOutcome, 'reload_retry_outcome', 20)
  if (!RELOAD_RETRY_OUTCOMES.includes(reloadRetryOutcome)) throw new Error('reload_retry_outcome_invalid')
  const runId = exactText(input.runId, 'run_id', 80)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(runId)) throw new Error('run_id_invalid')
  const evidenceReferenceDigest = exactShaDigest(input.evidenceReferenceDigest, 'evidence_reference_digest')
  const independentAnchorDigest = exactShaDigest(input.independentAnchorDigest, 'independent_anchor_digest')
  if (evidenceReferenceDigest === independentAnchorDigest) throw new Error('shop_observed_evidence_anchor_digest_not_independent')
  return {
    contract: SHOP_OBSERVED_RUN_INPUT_CONTRACT,
    product: SHOP_PILOT_PRODUCT,
    pilotMode: SHOP_PILOT_MODE,
    verticalPack: SHOP_PILOT_VERTICAL_PACK,
    runId,
    observedAt: exactIsoUtc(input.observedAt, 'observed_at'),
    dayIndex: exactNumber(input.dayIndex, 'day_index', { min: 1, max: 5, integer: true }),
    operatorReviewed: exactTrue(input.operatorReviewed, 'operator_reviewed'),
    targetCorrect: exactTrue(input.targetCorrect, 'target_correct'),
    accepted: exactBoolean(input.accepted, 'accepted'),
    durationMinutesPerOrder: exactNumber(input.durationMinutesPerOrder, 'duration_minutes_per_order', { min: 0.1, max: 1440 }),
    exceptionCount: exactNumber(input.exceptionCount, 'exception_count', { min: 0, max: 100000, integer: true }),
    closeMinutes: exactNumber(input.closeMinutes, 'close_minutes', { min: 0, max: 1440 }),
    operatorCorrectionCount: exactNumber(input.operatorCorrectionCount, 'operator_correction_count', { min: 0, max: 100000, integer: true }),
    reloadRetryOutcome,
    noRealMessageSent: exactTrue(input.noRealMessageSent, 'no_real_message_sent'),
    noPaymentAccepted: exactTrue(input.noPaymentAccepted, 'no_payment_accepted'),
    noStockMovement: exactTrue(input.noStockMovement, 'no_stock_movement'),
    noServerWrite: exactTrue(input.noServerWrite, 'no_server_write'),
    noHostedWrite: exactTrue(input.noHostedWrite, 'no_hosted_write'),
    evidenceReferenceDigest,
    independentAnchorDigest,
  }
}

function evidenceEntry(run) {
  const entry = {
    schema: 'supermega.shop.observed_pilot_run_record.v1',
    product: run.product,
    pilotMode: run.pilotMode,
    verticalPack: run.verticalPack,
    runId: run.runId,
    observedAt: run.observedAt,
    dayIndex: run.dayIndex,
    operatorReviewed: run.operatorReviewed,
    targetCorrect: run.targetCorrect,
    accepted: run.accepted,
    durationMinutesPerOrder: run.durationMinutesPerOrder,
    exceptionCount: run.exceptionCount,
    closeMinutes: run.closeMinutes,
    operatorCorrectionCount: run.operatorCorrectionCount,
    reloadRetryOutcome: run.reloadRetryOutcome,
    noRealMessageSent: run.noRealMessageSent,
    noPaymentAccepted: run.noPaymentAccepted,
    noStockMovement: run.noStockMovement,
    noServerWrite: run.noServerWrite,
    noHostedWrite: run.noHostedWrite,
    evidenceReferenceDigest: run.evidenceReferenceDigest,
    independentAnchorDigest: run.independentAnchorDigest,
  }
  return { ...entry, recordDigest: digest(entry) }
}

function parseStoredRuns(text) {
  if (!text.trim()) return []
  return text.trimEnd().split(/\r?\n/).map((line) => {
    const entry = JSON.parse(line)
    const { recordDigest, ...unsigned } = entry
    if (recordDigest !== digest(unsigned)) throw new Error('shop_observed_run_record_tampered')
    return entry
  })
}

async function readStoredRuns(workspace) {
  const path = resolve(workspace, RUNS_FILE)
  if (!(await exists(path))) return []
  return parseStoredRuns(await readFile(path, 'utf8'))
}

function evidenceSummary(entries) {
  const proofIntegrity = assertStoredProofIntegrity(entries)
  const acceptedRunCount = entries.filter((entry) => entry.accepted === true).length
  const acceptedEntries = entries.filter((entry) => entry.accepted === true)
  const totalExceptionCount = sum(entries.map((entry) => entry.exceptionCount))
  const totalOperatorCorrectionCount = sum(entries.map((entry) => entry.operatorCorrectionCount))
  const acceptedExceptionCount = sum(acceptedEntries.map((entry) => entry.exceptionCount))
  const acceptedOperatorCorrectionCount = sum(acceptedEntries.map((entry) => entry.operatorCorrectionCount))
  const reloadRetryOutcomeCounts = {
    passed: entries.filter((entry) => entry.reloadRetryOutcome === 'passed').length,
    failed: entries.filter((entry) => entry.reloadRetryOutcome === 'failed').length,
    notTested: entries.filter((entry) => entry.reloadRetryOutcome === 'not-tested').length,
  }
  let acceptedConsecutiveRuns = 0
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].accepted !== true) break
    acceptedConsecutiveRuns += 1
  }
  const acceptedConsecutiveEntries = entries.slice(entries.length - acceptedConsecutiveRuns)
  const acceptedConsecutivePilotDayIndexes = uniqueSortedNumbers(acceptedConsecutiveEntries.map((entry) => entry.dayIndex))
  const pilotSequenceCoverageMet = REQUIRED_PILOT_DAY_INDEXES.every((dayIndex) => acceptedConsecutivePilotDayIndexes.includes(dayIndex))
  const promotionEvidenceMet = acceptedConsecutiveRuns >= REQUIRED_ACCEPTED_CONSECUTIVE_RUNS && pilotSequenceCoverageMet
  const summary = {
    contract: SHOP_OBSERVED_EVIDENCE_CONTRACT,
    product: SHOP_PILOT_PRODUCT,
    pilotMode: SHOP_PILOT_MODE,
    verticalPack: SHOP_PILOT_VERTICAL_PACK,
    runCount: entries.length,
    acceptedRunCount,
    acceptedConsecutiveRuns,
    requiredAcceptedConsecutiveRuns: REQUIRED_ACCEPTED_CONSECUTIVE_RUNS,
    requiredPilotDayIndexes: REQUIRED_PILOT_DAY_INDEXES,
    acceptedConsecutivePilotDayIndexes,
    pilotSequenceCoverageMet,
    promotionEvidenceMet,
    proofIntegrity,
    metrics: {
      medianMinutesPerOrder: median(entries.map((entry) => entry.durationMinutesPerOrder)),
      medianAcceptedMinutesPerOrder: median(acceptedEntries.map((entry) => entry.durationMinutesPerOrder)),
      totalExceptionCount,
      acceptedExceptionCount,
      exceptionRatePerRun: rate(totalExceptionCount, entries.length),
      acceptedExceptionRatePerRun: rate(acceptedExceptionCount, acceptedEntries.length),
      medianCloseMinutes: median(entries.map((entry) => entry.closeMinutes)),
      medianAcceptedCloseMinutes: median(acceptedEntries.map((entry) => entry.closeMinutes)),
      totalOperatorCorrectionCount,
      acceptedOperatorCorrectionCount,
      operatorCorrectionRatePerRun: rate(totalOperatorCorrectionCount, entries.length),
      acceptedOperatorCorrectionRatePerRun: rate(acceptedOperatorCorrectionCount, acceptedEntries.length),
      reloadRetryOutcomeCounts,
      latestReloadRetryOutcome: entries.at(-1)?.reloadRetryOutcome || null,
    },
    externalWritesPerformed: false,
    customerContactPerformed: false,
    paymentAccepted: false,
    stockMovementPerformed: false,
    serverWritesPerformed: false,
    hostedWritesPerformed: false,
    privateValuesReturned: false,
    nextAction: promotionEvidenceMet ? 'owner_review_required_before_activation' : 'collect_more_observed_evidence',
  }
  return { ...summary, summaryDigest: digest(summary) }
}

async function writeSummary(workspace, summary) {
  await writeFile(resolve(workspace, SUMMARY_FILE), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
}

export async function recordObservedShopPilotRun({ workspace, runInput }) {
  const root = resolve(workspace)
  await mkdir(root, { recursive: true })
  const run = normalizeObservedRunInput(runInput)
  const existing = await readStoredRuns(root)
  if (existing.some((entry) => entry.runId === run.runId)) throw new Error('shop_observed_run_id_duplicate')
  if (existing.some((entry) => entry.evidenceReferenceDigest === run.evidenceReferenceDigest)) throw new Error('shop_observed_evidence_reference_digest_duplicate')
  if (existing.some((entry) => entry.independentAnchorDigest === run.independentAnchorDigest)) throw new Error('shop_observed_independent_anchor_digest_duplicate')
  const entry = evidenceEntry(run)
  const updated = [...existing, entry]
  const lines = `${updated.map((stored) => JSON.stringify(stored)).join('\n')}\n`
  await writeFile(resolve(root, RUNS_FILE), lines, 'utf8')
  const summary = evidenceSummary(updated)
  await writeSummary(root, summary)
  return summary
}

export async function verifyObservedShopPilotEvidence(workspace) {
  const root = resolve(workspace)
  const entries = await readStoredRuns(root)
  const expected = evidenceSummary(entries)
  if (await exists(resolve(root, SUMMARY_FILE))) {
    const stored = JSON.parse(await readFile(resolve(root, SUMMARY_FILE), 'utf8'))
    if (canonicalJson(stored) !== canonicalJson(expected)) throw new Error('shop_observed_summary_stale_or_tampered')
  }
  return expected
}

async function main() {
  const args = process.argv.slice(2)
  const record = args.includes('--record')
  const verify = args.includes('--verify')
  const workspaceIndex = args.indexOf('--workspace')
  const runInputIndex = args.indexOf('--run-input')
  if (record === verify || workspaceIndex < 0 || !args[workspaceIndex + 1]) {
    throw new Error('usage: node tools/record_shop_pilot_observed_run.mjs (--record --run-input private-run.json | --verify) --workspace private-workspace')
  }
  let result
  if (record) {
    if (runInputIndex < 0 || !args[runInputIndex + 1]) throw new Error('run_input_required')
    result = await recordObservedShopPilotRun({
      workspace: args[workspaceIndex + 1],
      runInput: JSON.parse(await readFile(resolve(args[runInputIndex + 1]), 'utf8')),
    })
  } else {
    result = await verifyObservedShopPilotEvidence(args[workspaceIndex + 1])
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, externalWritesPerformed: false })}\n`)
    process.exitCode = 1
  })
}
