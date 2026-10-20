#!/usr/bin/env node

// Compare bounded Shop task workflows without running a model or upgrading
// source/synthetic evidence into device, hosted, or customer acceptance.
import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CONTRACT = 'supermega.ai-native.shop-benchmark.v1'
export const RECEIPT_CONTRACT = 'supermega.ai-native.shop-task-receipt.v1'
export const ARMS = Object.freeze(['current', 'one_agent', 'proposer_challenger'])
const STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT RUN'])
const VERIFIERS = new Set(['deterministic_test', 'browser_qa', 'named_device', 'human_observation'])
const HASH = /^[a-f0-9]{64}$/
const COMMIT = /^[a-f0-9]{40}$/
const CASE_ID = /^[a-z][a-z0-9-]{2,79}$/
const RECEIPT_PATH = /^hq\/readiness\/agent-benchmark\/[a-zA-Z0-9._/-]+$/
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const receiptRoot = resolve(root, 'hq/readiness/agent-benchmark')

function invalid(reason) { throw new Error(`ai_native_benchmark_${reason}`) }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function keys(value, expected) {
  return isRecord(value) && Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key))
}
function hash(value) { return createHash('sha256').update(value).digest('hex') }
function amount(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000 }
function count(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000 }
function percentile(values, fraction) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * fraction) - 1]
}

async function readAllowedReceipt(path) {
  const actual = await realpath(resolve(root, path))
  if (!actual.startsWith(`${receiptRoot}${sep}`)) invalid('receipt_invalid')
  return readFile(actual)
}

/** `readReceipt` receives a repository-relative, allowlisted path and returns bytes. */
export async function scoreShopBenchmark(packet, { readReceipt = readAllowedReceipt } = {}) {
  if (!keys(packet, ['contract', 'sourceRevision', 'dataClass', 'cases', 'runs'])
    || packet.contract !== CONTRACT || !COMMIT.test(packet.sourceRevision)
    || packet.dataClass !== 'synthetic' || !Array.isArray(packet.cases)
    || packet.cases.length < 1 || packet.cases.length > 30 || !Array.isArray(packet.runs)) {
    invalid('packet_invalid')
  }
  const cases = new Map()
  for (const item of packet.cases) {
    if (!keys(item, ['id', 'digest', 'verifier']) || !CASE_ID.test(item.id)
      || !HASH.test(item.digest) || !VERIFIERS.has(item.verifier) || cases.has(item.id)) {
      invalid('case_invalid')
    }
    cases.set(item.id, item)
  }
  if (packet.runs.length !== cases.size * ARMS.length) invalid('unpaired_runs')

  const runs = new Map()
  for (const run of packet.runs) {
    if (!keys(run, ['caseId', 'caseDigest', 'arm', 'status', 'durationMs', 'corrections', 'costUsd', 'receipt'])
      || !cases.has(run.caseId) || run.caseDigest !== cases.get(run.caseId).digest
      || !ARMS.includes(run.arm) || !STATUSES.has(run.status)
      || !count(run.durationMs) || !count(run.corrections) || !amount(run.costUsd)) {
      invalid('run_invalid')
    }
    const key = `${run.caseId}:${run.arm}`
    if (runs.has(key)) invalid('duplicate_run')
    if (run.status === 'NOT RUN' && (run.durationMs !== 0 || run.corrections !== 0 || run.costUsd !== 0)) {
      invalid('not_run_metrics')
    }
    if (run.status === 'PASS') {
      if (!keys(run.receipt, ['path', 'sha256', 'verifier'])
        || !RECEIPT_PATH.test(run.receipt.path) || run.receipt.path.includes('..')
        || !HASH.test(run.receipt.sha256)
        || run.receipt.verifier !== cases.get(run.caseId).verifier) {
        invalid('receipt_invalid')
      }
      let bytes
      try { bytes = await readReceipt(run.receipt.path) } catch { invalid('receipt_unavailable') }
      if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) invalid('receipt_invalid')
      if (hash(bytes) !== run.receipt.sha256) invalid('receipt_mismatch')
      let evidence
      try { evidence = JSON.parse(Buffer.from(bytes).toString('utf8')) } catch { invalid('receipt_invalid') }
      if (!keys(evidence, ['contract', 'sourceRevision', 'caseDigest', 'arm', 'verifier', 'status', 'evidenceDigest'])
        || evidence.contract !== RECEIPT_CONTRACT
        || evidence.sourceRevision !== packet.sourceRevision
        || evidence.caseDigest !== run.caseDigest
        || evidence.arm !== run.arm
        || evidence.verifier !== run.receipt.verifier
        || evidence.status !== 'PASS'
        || !HASH.test(evidence.evidenceDigest)) invalid('receipt_binding_mismatch')
    } else if (run.receipt !== null) {
      invalid('nonpassing_receipt')
    }
    runs.set(key, run)
  }

  const arms = {}
  for (const arm of ARMS) {
    const group = [...cases.keys()].map((id) => runs.get(`${id}:${arm}`))
    if (group.some((run) => !run)) invalid('unpaired_runs')
    const passing = group.filter((run) => run.status === 'PASS')
    const attempted = group.filter((run) => run.status === 'PASS' || run.status === 'FAIL')
    const cost = group.reduce((sum, run) => sum + run.costUsd, 0)
    arms[arm] = {
      receiptBackedPasses: passing.length,
      failed: group.filter((run) => run.status === 'FAIL').length,
      blocked: group.filter((run) => run.status === 'BLOCKED').length,
      notRun: group.filter((run) => run.status === 'NOT RUN').length,
      receiptBackedPassRate: passing.length / cases.size,
      medianDurationMs: percentile(attempted.map((run) => run.durationMs), 0.5),
      p90DurationMs: percentile(attempted.map((run) => run.durationMs), 0.9),
      correctionsPerPass: passing.length
        ? passing.reduce((sum, run) => sum + run.corrections, 0) / passing.length : null,
      totalCostUsd: Math.round(cost * 1_000_000) / 1_000_000,
      costPerPassUsd: passing.length ? Math.round(cost / passing.length * 1_000_000) / 1_000_000 : null,
    }
  }
  return {
    contract: `${CONTRACT}.score`,
    sourceRevision: packet.sourceRevision,
    dataClass: packet.dataClass,
    caseCount: cases.size,
    arms,
    decision: 'comparison_only_receipt_hashes_do_not_prove_independent_review_or_hosted_device_customer_acceptance',
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2]
  if (!path || process.argv.length !== 3) {
    console.error('Usage: node tools/score_ai_native_shop_benchmark.mjs <synthetic-packet.json>')
    process.exitCode = 2
  } else {
    try {
      const packet = JSON.parse(await readFile(resolve(path), 'utf8'))
      console.log(JSON.stringify(await scoreShopBenchmark(packet), null, 2))
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}
