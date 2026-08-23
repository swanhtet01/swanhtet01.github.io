import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SHOP_OBSERVED_RUN_INPUT_CONTRACT,
  normalizeObservedRunInput,
} from './record_shop_pilot_observed_run.mjs'
import {
  SHOP_PILOT_MODE,
  SHOP_PILOT_PRODUCT,
  SHOP_PILOT_VERTICAL_PACK,
} from './create_shop_pilot_handoff.mjs'

const RELOAD_RETRY_OUTCOMES = Object.freeze(['passed', 'failed', 'not-tested'])
const SAFETY_TRUE_FIELDS = Object.freeze([
  'operatorReviewed',
  'targetCorrect',
  'noRealMessageSent',
  'noPaymentAccepted',
  'noStockMovement',
  'noServerWrite',
  'noHostedWrite',
])
const REQUIRED_FLAGS = Object.freeze([
  '--evidence-file',
  '--anchor-file',
  '--run-id',
  '--observed-at',
  '--day-index',
  '--accepted',
  '--duration-minutes-per-order',
  '--exception-count',
  '--close-minutes',
  '--operator-correction-count',
  '--reload-retry-outcome',
  '--output',
])
const ALLOWED_FLAGS = new Set(REQUIRED_FLAGS)
const PRIVATE_FIELD_FLAGS = /(?:name|email|phone|client|customer|participant|business|company|contact|message|note|raw|address)/i

function sha256Digest(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`
}

function parseArgs(args) {
  if (!args.length) throw new Error('shop_observed_input_helper_arguments_required')
  const parsed = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!flag?.startsWith('--')) throw new Error('shop_observed_input_helper_flag_required')
    if (PRIVATE_FIELD_FLAGS.test(flag)) throw new Error('shop_observed_input_helper_private_field_rejected')
    if (!ALLOWED_FLAGS.has(flag)) throw new Error('shop_observed_input_helper_unknown_field_rejected')
    if (value === undefined || value.startsWith('--')) throw new Error('shop_observed_input_helper_value_required')
    if (parsed.has(flag)) throw new Error('shop_observed_input_helper_duplicate_field_rejected')
    parsed.set(flag, value)
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!parsed.has(flag)) throw new Error('shop_observed_input_helper_missing_field')
  }
  return Object.fromEntries(parsed)
}

function parseBoolean(value, field) {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${field}_invalid`)
}

function parseNumber(value, field, { integer = false } = {}) {
  if (!/^-?\d+(?:\.\d+)?$/.test(String(value))) throw new Error(`${field}_invalid`)
  const number = Number(value)
  if (!Number.isFinite(number) || (integer && !Number.isInteger(number))) throw new Error(`${field}_invalid`)
  return number
}

function parseIsoUtc(value) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error('observed_at_invalid')
  return value
}

function assertSafeOutputPath(outputPath, evidencePath, anchorPath) {
  const resolvedOutput = resolve(outputPath)
  if (resolvedOutput === resolve(evidencePath) || resolvedOutput === resolve(anchorPath)) {
    throw new Error('shop_observed_input_helper_output_overwrites_private_source')
  }
  return resolvedOutput
}

export async function prepareObservedShopPilotRunInput(options) {
  const evidencePath = options.evidenceFile
  const anchorPath = options.anchorFile
  const outputPath = assertSafeOutputPath(options.output, evidencePath, anchorPath)
  const reloadRetryOutcome = String(options.reloadRetryOutcome || '').trim()
  if (!RELOAD_RETRY_OUTCOMES.includes(reloadRetryOutcome)) throw new Error('reload_retry_outcome_invalid')
  const runInput = normalizeObservedRunInput({
    contract: SHOP_OBSERVED_RUN_INPUT_CONTRACT,
    product: SHOP_PILOT_PRODUCT,
    pilotMode: SHOP_PILOT_MODE,
    verticalPack: SHOP_PILOT_VERTICAL_PACK,
    runId: String(options.runId || '').trim(),
    observedAt: parseIsoUtc(options.observedAt),
    dayIndex: parseNumber(options.dayIndex, 'day_index', { integer: true }),
    accepted: parseBoolean(String(options.accepted), 'accepted'),
    durationMinutesPerOrder: parseNumber(options.durationMinutesPerOrder, 'duration_minutes_per_order'),
    exceptionCount: parseNumber(options.exceptionCount, 'exception_count', { integer: true }),
    closeMinutes: parseNumber(options.closeMinutes, 'close_minutes'),
    operatorCorrectionCount: parseNumber(options.operatorCorrectionCount, 'operator_correction_count', { integer: true }),
    reloadRetryOutcome,
    operatorReviewed: true,
    targetCorrect: true,
    noRealMessageSent: true,
    noPaymentAccepted: true,
    noStockMovement: true,
    noServerWrite: true,
    noHostedWrite: true,
    evidenceReferenceDigest: sha256Digest(await readFile(resolve(evidencePath))),
    independentAnchorDigest: sha256Digest(await readFile(resolve(anchorPath))),
  })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(runInput, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return {
    ok: true,
    contract: runInput.contract,
    product: runInput.product,
    pilotMode: runInput.pilotMode,
    verticalPack: runInput.verticalPack,
    dayIndex: runInput.dayIndex,
    accepted: runInput.accepted,
    reloadRetryOutcome: runInput.reloadRetryOutcome,
    evidenceReferenceDigest: runInput.evidenceReferenceDigest,
    independentAnchorDigest: runInput.independentAnchorDigest,
    privateValuesReturned: false,
    outputWritten: true,
  }
}

function optionsFromCliArgs(args) {
  const parsed = parseArgs(args)
  return {
    evidenceFile: parsed['--evidence-file'],
    anchorFile: parsed['--anchor-file'],
    runId: parsed['--run-id'],
    observedAt: parsed['--observed-at'],
    dayIndex: parsed['--day-index'],
    accepted: parsed['--accepted'],
    durationMinutesPerOrder: parsed['--duration-minutes-per-order'],
    exceptionCount: parsed['--exception-count'],
    closeMinutes: parsed['--close-minutes'],
    operatorCorrectionCount: parsed['--operator-correction-count'],
    reloadRetryOutcome: parsed['--reload-retry-outcome'],
    output: parsed['--output'],
  }
}

async function main() {
  const result = await prepareObservedShopPilotRunInput(optionsFromCliArgs(process.argv.slice(2)))
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

function safeCliError(error) {
  if (error?.code === 'ENOENT') return 'shop_observed_input_helper_source_file_unreadable'
  if (error?.code === 'EEXIST') return 'shop_observed_input_helper_output_exists'
  return String(error?.message || 'shop_observed_input_helper_failed').slice(0, 160)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: safeCliError(error), externalWritesPerformed: false })}\n`)
    process.exitCode = 1
  })
}
