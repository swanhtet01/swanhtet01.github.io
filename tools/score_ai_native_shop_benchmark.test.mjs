import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { ARMS, CONTRACT, RECEIPT_CONTRACT, scoreShopBenchmark } from './score_ai_native_shop_benchmark.mjs'

const digest = (value) => createHash('sha256').update(value).digest('hex')
const pathFor = (arm) => `hq/readiness/agent-benchmark/first-sale-${arm}.json`
const receiptBytes = Object.fromEntries(ARMS.map((arm) => [pathFor(arm), Buffer.from(JSON.stringify({
  contract: RECEIPT_CONTRACT,
  sourceRevision: 'a'.repeat(40),
  caseDigest: digest('pinned synthetic first-sale task'),
  arm,
  verifier: 'deterministic_test',
  status: 'PASS',
  evidenceDigest: digest(`source test ${arm}`),
}))]))

function packet() {
  return {
    contract: CONTRACT,
    sourceRevision: 'a'.repeat(40),
    dataClass: 'synthetic',
    cases: [{ id: 'first-sale', digest: digest('pinned synthetic first-sale task'), verifier: 'deterministic_test' }],
    runs: ARMS.map((arm, index) => ({
      caseId: 'first-sale',
      caseDigest: digest('pinned synthetic first-sale task'),
      arm,
      status: 'PASS',
      durationMs: [120_000, 90_000, 80_000][index],
      corrections: [2, 1, 0][index],
      costUsd: [0, 0.04, 0.07][index],
      receipt: {
        path: pathFor(arm),
        sha256: digest(receiptBytes[pathFor(arm)]),
        verifier: 'deterministic_test',
      },
    })),
  }
}

const readReceipt = async (path) => receiptBytes[path]

test('scores identical pinned cases only after reading exact non-model receipts', async () => {
  const score = await scoreShopBenchmark(packet(), { readReceipt })
  assert.equal(score.caseCount, 1)
  assert.equal(score.arms.current.receiptBackedPassRate, 1)
  assert.equal(score.arms.current.medianDurationMs, 120_000)
  assert.equal(score.arms.one_agent.costPerPassUsd, 0.04)
  assert.equal(score.arms.proposer_challenger.correctionsPerPass, 0)
  assert.match(score.decision, /comparison_only/)
})

test('a model-only grade, missing receipt, changed bytes, or path escape cannot become a pass', async () => {
  for (const change of [
    (run) => { run.receipt.verifier = 'model' },
    (run) => { run.receipt = null },
    (run) => { run.receipt.sha256 = 'b'.repeat(64) },
    (run) => { run.receipt.path = 'hq/readiness/agent-benchmark/../../secret.txt' },
  ]) {
    const input = packet()
    change(input.runs[0])
    await assert.rejects(scoreShopBenchmark(input, { readReceipt }), /ai_native_benchmark_receipt_(invalid|mismatch)/)
  }
})

test('a validly hashed receipt for another source or case cannot count', async () => {
  const changed = JSON.parse(receiptBytes[pathFor('current')].toString('utf8'))
  changed.sourceRevision = 'b'.repeat(40)
  const bytes = Buffer.from(JSON.stringify(changed))
  const input = packet()
  input.runs[0].receipt.sha256 = digest(bytes)
  await assert.rejects(scoreShopBenchmark(input, {
    readReceipt: async (path) => path === pathFor('current') ? bytes : receiptBytes[path],
  }), /receipt_binding_mismatch/)
})

test('missing, duplicate, or divergent case arms fail closed', async () => {
  const missing = packet()
  missing.runs.pop()
  await assert.rejects(scoreShopBenchmark(missing, { readReceipt }), /unpaired_runs/)

  const duplicate = packet()
  duplicate.runs[2] = { ...duplicate.runs[0] }
  await assert.rejects(scoreShopBenchmark(duplicate, { readReceipt }), /duplicate_run/)

  const changedCase = packet()
  changedCase.runs[1].caseDigest = digest('different task')
  await assert.rejects(scoreShopBenchmark(changedCase, { readReceipt }), /run_invalid/)
})

test('blocked and not-run arms are visible, never counted as zero-cost success', async () => {
  const input = packet()
  input.runs[1] = { ...input.runs[1], status: 'BLOCKED', receipt: null }
  input.runs[2] = { ...input.runs[2], status: 'NOT RUN', durationMs: 0, corrections: 0, costUsd: 0, receipt: null }
  const score = await scoreShopBenchmark(input, { readReceipt })
  assert.equal(score.arms.one_agent.blocked, 1)
  assert.equal(score.arms.one_agent.costPerPassUsd, null)
  assert.equal(score.arms.proposer_challenger.notRun, 1)
  assert.equal(score.arms.proposer_challenger.medianDurationMs, null)
})

test('customer content and unmeasured money cannot enter the synthetic benchmark packet', async () => {
  const content = packet()
  content.customerMessage = 'not allowed'
  await assert.rejects(scoreShopBenchmark(content, { readReceipt }), /packet_invalid/)

  const paid = packet()
  paid.runs[1].costUsd = null
  await assert.rejects(scoreShopBenchmark(paid, { readReceipt }), /run_invalid/)
})
