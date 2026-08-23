import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  SHOP_OBSERVED_EVIDENCE_CONTRACT,
  normalizeObservedRunInput,
  recordObservedShopPilotRun,
  verifyObservedShopPilotEvidence,
} from './record_shop_pilot_observed_run.mjs'

function digest(seed) {
  return `sha256:${createHash('sha256').update(seed).digest('hex')}`
}

function runInput(index, overrides = {}) {
  return {
    contract: 'supermega.shop.observed_pilot_run_input.v1',
    product: 'shop',
    pilotMode: 'owner_named',
    verticalPack: 'spa-services',
    runId: `RUN-${String(index).padStart(3, '0')}`,
    observedAt: `2026-08-${String((index % 20) + 1).padStart(2, '0')}T08:00:00.000Z`,
    dayIndex: ((index - 1) % 5) + 1,
    operatorReviewed: true,
    targetCorrect: true,
    accepted: true,
    durationMinutesPerOrder: 6,
    exceptionCount: 1,
    closeMinutes: 20,
    operatorCorrectionCount: 0,
    reloadRetryOutcome: 'passed',
    noRealMessageSent: true,
    noPaymentAccepted: true,
    noStockMovement: true,
    noServerWrite: true,
    noHostedWrite: true,
    evidenceReferenceDigest: digest(`evidence-${index}`),
    independentAnchorDigest: digest(`anchor-${index}`),
    ...overrides,
  }
}

test('valid private run appends local evidence and returns no private values', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-'))
  try {
    const summary = await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(1) })
    assert.equal(summary.contract, SHOP_OBSERVED_EVIDENCE_CONTRACT)
    assert.equal(summary.product, 'shop')
    assert.equal(summary.pilotMode, 'owner_named')
    assert.equal(summary.verticalPack, 'spa-services')
    assert.equal(summary.runCount, 1)
    assert.equal(summary.acceptedRunCount, 1)
    assert.equal(summary.acceptedConsecutiveRuns, 1)
    assert.equal(summary.promotionEvidenceMet, false)
    assert.equal(summary.privateValuesReturned, false)
    assert.equal(summary.externalWritesPerformed, false)
    assert.equal(summary.customerContactPerformed, false)
    assert.equal(summary.paymentAccepted, false)
    assert.equal(summary.stockMovementPerformed, false)
    assert.match(summary.summaryDigest, /^sha256:[0-9a-f]{64}$/)
    assert.doesNotMatch(JSON.stringify(summary), /RUN-001|owner@example|Sample Spa|private participant|phone/i)
    assert.equal((await verifyObservedShopPilotEvidence(parent)).summaryDigest, summary.summaryDigest)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('rejected or failed run breaks the consecutive accepted run streak', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-streak-'))
  try {
    await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(1) })
    await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(2, { accepted: false, reloadRetryOutcome: 'failed' }) })
    const summary = await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(3) })
    assert.equal(summary.runCount, 3)
    assert.equal(summary.acceptedRunCount, 2)
    assert.equal(summary.acceptedConsecutiveRuns, 1)
    assert.equal(summary.promotionEvidenceMet, false)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('nineteen accepted runs do not set promotionEvidenceMet', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-19-'))
  try {
    let summary
    for (let index = 1; index <= 19; index += 1) {
      summary = await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(index) })
    }
    assert.equal(summary.runCount, 19)
    assert.equal(summary.acceptedConsecutiveRuns, 19)
    assert.equal(summary.promotionEvidenceMet, false)
    assert.equal(summary.nextAction, 'collect_more_observed_evidence')
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('twenty consecutive accepted runs set promotionEvidenceMet', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-20-'))
  try {
    let summary
    for (let index = 1; index <= 20; index += 1) {
      summary = await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(index) })
    }
    assert.equal(summary.runCount, 20)
    assert.equal(summary.acceptedRunCount, 20)
    assert.equal(summary.acceptedConsecutiveRuns, 20)
    assert.equal(summary.promotionEvidenceMet, true)
    assert.equal(summary.nextAction, 'owner_review_required_before_activation')
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('external-action booleans must be explicitly safe', () => {
  for (const [field, error] of [
    ['noRealMessageSent', /no_real_message_sent_required/],
    ['noPaymentAccepted', /no_payment_accepted_required/],
    ['noStockMovement', /no_stock_movement_required/],
    ['noServerWrite', /no_server_write_required/],
    ['noHostedWrite', /no_hosted_write_required/],
  ]) {
    assert.throws(() => normalizeObservedRunInput(runInput(1, { [field]: false })), error)
  }
})

test('missing or malformed evidence and anchor digests are rejected', () => {
  assert.throws(() => normalizeObservedRunInput(runInput(1, { evidenceReferenceDigest: 'abc' })), /evidence_reference_digest_invalid/)
  assert.throws(() => normalizeObservedRunInput(runInput(1, { independentAnchorDigest: `sha256:${'A'.repeat(64)}` })), /independent_anchor_digest_invalid/)
  const missing = runInput(1)
  delete missing.evidenceReferenceDigest
  assert.throws(() => normalizeObservedRunInput(missing), /shop_observed_run_input_keys_invalid/)
})

test('attempted raw identity fields are rejected before storage', () => {
  assert.throws(() => normalizeObservedRunInput({ ...runInput(1), email: 'owner@example.invalid' }), /shop_observed_private_identity_field_rejected/)
  assert.throws(() => normalizeObservedRunInput({ ...runInput(1), company: 'Private Spa' }), /shop_observed_private_identity_field_rejected/)
  assert.throws(() => normalizeObservedRunInput({ ...runInput(1), participant: { id: 'person-1' } }), /shop_observed_private_identity_field_rejected/)
  assert.throws(() => normalizeObservedRunInput({ ...runInput(1), evidenceReferenceDigest: 'owner@example.invalid' }), /shop_observed_private_identity_value_rejected/)
})

test('tampering with stored evidence or summary digest fails verification', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-tamper-'))
  try {
    await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(1) })
    await writeFile(join(parent, 'observed-summary.private.json'), `${JSON.stringify({ bad: true })}\n`)
    await assert.rejects(() => verifyObservedShopPilotEvidence(parent), /shop_observed_summary_stale_or_tampered/)
    await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(2) })
    const runsPath = join(parent, 'observed-runs.private.jsonl')
    await writeFile(runsPath, (await readFile(runsPath, 'utf8')).replace('"accepted":true', '"accepted":false'))
    await assert.rejects(() => verifyObservedShopPilotEvidence(parent), /shop_observed_run_record_tampered/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('CLI records and verifies with metadata-only stdout', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-cli-'))
  const inputPath = join(parent, 'run.private.json')
  const workspace = join(parent, 'workspace')
  const tool = resolve('tools/record_shop_pilot_observed_run.mjs')
  try {
    await writeFile(inputPath, JSON.stringify(runInput(1), null, 2))
    const recorded = spawnSync(process.execPath, [tool, '--record', '--workspace', workspace, '--run-input', inputPath], { encoding: 'utf8' })
    assert.equal(recorded.status, 0, recorded.stderr)
    assert.equal(JSON.parse(recorded.stdout).runCount, 1)
    assert.doesNotMatch(recorded.stdout, /RUN-001|owner@example|Sample Spa|Private Spa/)

    const verified = spawnSync(process.execPath, [tool, '--verify', '--workspace', workspace], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr)
    assert.equal(JSON.parse(verified.stdout).runCount, 1)
    assert.doesNotMatch(verified.stdout, /RUN-001|owner@example|Sample Spa|Private Spa/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
