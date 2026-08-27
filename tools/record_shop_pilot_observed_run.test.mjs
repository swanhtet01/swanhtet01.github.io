import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  SHOP_OBSERVED_EVIDENCE_CONTRACT,
  SHOP_OBSERVED_RUN_INPUT_TEMPLATE_CONTRACT,
  buildObservedRunInputTemplate,
  normalizeObservedRunInput,
  recordObservedShopPilotRun,
  validateObservedRunInputTemplate,
  verifyObservedShopPilotEvidence,
} from './record_shop_pilot_observed_run.mjs'

function digest(seed) {
  return `sha256:${createHash('sha256').update(seed).digest('hex')}`
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  throw new Error('invalid_canonical_json_test_value')
}

function recordDigest(record) {
  return `sha256:${createHash('sha256').update(canonicalJson(record)).digest('hex')}`
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
    assert.equal(summary.requiredAcceptedConsecutiveRuns, 20)
    assert.deepEqual(summary.requiredPilotDayIndexes, [1, 2, 3, 4, 5])
    assert.equal(summary.requiredPilotCalendarDates, 5)
    assert.deepEqual(summary.acceptedConsecutivePilotDayIndexes, [1])
    assert.deepEqual(summary.acceptedConsecutiveObservedDates, ['2026-08-02'])
    assert.equal(summary.pilotSequenceCoverageMet, false)
    assert.equal(summary.pilotCalendarCoverageMet, false)
    assert.equal(summary.promotionEvidenceMet, false)
    assert.deepEqual(summary.promotionProgress, {
      requiredAcceptedConsecutiveRuns: 20,
      acceptedConsecutiveRuns: 1,
      acceptedConsecutiveRunsRemaining: 19,
      requiredPilotDayIndexes: [1, 2, 3, 4, 5],
      acceptedConsecutivePilotDayIndexes: [1],
      missingPilotDayIndexes: [2, 3, 4, 5],
      pilotSequenceCoverageMet: false,
      requiredPilotCalendarDates: 5,
      acceptedConsecutiveObservedDateCount: 1,
      acceptedConsecutiveObservedDates: ['2026-08-02'],
      pilotCalendarCoverageMet: false,
      proofIntegrityMet: true,
      latestReloadRetryOutcome: 'passed',
      readyForOwnerDecisionReview: false,
    })
    assert.equal(summary.metrics.medianMinutesPerOrder, 6)
    assert.equal(summary.metrics.medianAcceptedMinutesPerOrder, 6)
    assert.equal(summary.metrics.totalExceptionCount, 1)
    assert.equal(summary.metrics.acceptedExceptionCount, 1)
    assert.equal(summary.metrics.exceptionRatePerRun, 1)
    assert.equal(summary.metrics.acceptedExceptionRatePerRun, 1)
    assert.equal(summary.metrics.medianCloseMinutes, 20)
    assert.equal(summary.metrics.totalOperatorCorrectionCount, 0)
    assert.deepEqual(summary.metrics.reloadRetryOutcomeCounts, { passed: 1, failed: 0, notTested: 0 })
    assert.equal(summary.metrics.latestReloadRetryOutcome, 'passed')
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
    await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(2, {
      accepted: false,
      durationMinutesPerOrder: 10,
      exceptionCount: 3,
      closeMinutes: 40,
      operatorCorrectionCount: 2,
      reloadRetryOutcome: 'failed',
    }) })
    const summary = await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(3) })
    assert.equal(summary.runCount, 3)
    assert.equal(summary.acceptedRunCount, 2)
    assert.equal(summary.acceptedConsecutiveRuns, 1)
    assert.deepEqual(summary.acceptedConsecutivePilotDayIndexes, [3])
    assert.equal(summary.pilotSequenceCoverageMet, false)
    assert.equal(summary.promotionEvidenceMet, false)
    assert.equal(summary.promotionProgress.acceptedConsecutiveRunsRemaining, 19)
    assert.deepEqual(summary.promotionProgress.missingPilotDayIndexes, [1, 2, 4, 5])
    assert.equal(summary.promotionProgress.readyForOwnerDecisionReview, false)
    assert.equal(summary.metrics.medianMinutesPerOrder, 6)
    assert.equal(summary.metrics.medianAcceptedMinutesPerOrder, 6)
    assert.equal(summary.metrics.totalExceptionCount, 5)
    assert.equal(summary.metrics.acceptedExceptionCount, 2)
    assert.equal(summary.metrics.exceptionRatePerRun, 1.667)
    assert.equal(summary.metrics.acceptedExceptionRatePerRun, 1)
    assert.equal(summary.metrics.medianCloseMinutes, 20)
    assert.equal(summary.metrics.medianAcceptedCloseMinutes, 20)
    assert.equal(summary.metrics.totalOperatorCorrectionCount, 2)
    assert.equal(summary.metrics.acceptedOperatorCorrectionCount, 0)
    assert.equal(summary.metrics.operatorCorrectionRatePerRun, 0.667)
    assert.equal(summary.metrics.acceptedOperatorCorrectionRatePerRun, 0)
    assert.deepEqual(summary.metrics.reloadRetryOutcomeCounts, { passed: 2, failed: 1, notTested: 0 })
    assert.equal(summary.metrics.latestReloadRetryOutcome, 'passed')
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
    assert.deepEqual(summary.acceptedConsecutivePilotDayIndexes, [1, 2, 3, 4, 5])
    assert.equal(summary.pilotSequenceCoverageMet, true)
    assert.equal(summary.promotionEvidenceMet, false)
    assert.equal(summary.promotionProgress.acceptedConsecutiveRunsRemaining, 1)
    assert.deepEqual(summary.promotionProgress.missingPilotDayIndexes, [])
    assert.equal(summary.promotionProgress.readyForOwnerDecisionReview, false)
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
    assert.deepEqual(summary.acceptedConsecutivePilotDayIndexes, [1, 2, 3, 4, 5])
    assert.equal(summary.pilotSequenceCoverageMet, true)
    assert.equal(summary.promotionEvidenceMet, true)
    assert.equal(summary.promotionProgress.acceptedConsecutiveRunsRemaining, 0)
    assert.deepEqual(summary.promotionProgress.missingPilotDayIndexes, [])
    assert.equal(summary.promotionProgress.acceptedConsecutiveObservedDateCount >= 5, true)
    assert.equal(summary.promotionProgress.pilotCalendarCoverageMet, true)
    assert.equal(summary.promotionProgress.readyForOwnerDecisionReview, true)
    assert.equal(summary.nextAction, 'owner_review_required_before_activation')
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('twenty consecutive accepted runs still require five-day pilot sequence coverage', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-20-day-gap-'))
  try {
    let summary
    for (let index = 1; index <= 20; index += 1) {
      summary = await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(index, { dayIndex: 1 }) })
    }
    assert.equal(summary.runCount, 20)
    assert.equal(summary.acceptedRunCount, 20)
    assert.equal(summary.acceptedConsecutiveRuns, 20)
    assert.deepEqual(summary.acceptedConsecutivePilotDayIndexes, [1])
    assert.equal(summary.pilotSequenceCoverageMet, false)
    assert.equal(summary.promotionEvidenceMet, false)
    assert.deepEqual(summary.promotionProgress.missingPilotDayIndexes, [2, 3, 4, 5])
    assert.equal(summary.promotionProgress.readyForOwnerDecisionReview, false)
    assert.equal(summary.nextAction, 'collect_more_observed_evidence')
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('twenty accepted runs still require five distinct observed dates', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-20-date-gap-'))
  try {
    let summary
    for (let index = 1; index <= 20; index += 1) {
      summary = await recordObservedShopPilotRun({
        workspace: parent,
        runInput: runInput(index, { observedAt: '2026-08-25T08:00:00.000Z' }),
      })
    }
    assert.equal(summary.acceptedConsecutiveRuns, 20)
    assert.deepEqual(summary.acceptedConsecutivePilotDayIndexes, [1, 2, 3, 4, 5])
    assert.equal(summary.pilotSequenceCoverageMet, true)
    assert.deepEqual(summary.acceptedConsecutiveObservedDates, ['2026-08-25'])
    assert.equal(summary.pilotCalendarCoverageMet, false)
    assert.equal(summary.promotionEvidenceMet, false)
    assert.equal(summary.promotionProgress.acceptedConsecutiveObservedDateCount, 1)
    assert.equal(summary.promotionProgress.pilotCalendarCoverageMet, false)
    assert.equal(summary.promotionProgress.readyForOwnerDecisionReview, false)
    assert.equal(summary.nextAction, 'collect_more_observed_evidence')
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('twenty accepted runs do not set promotion evidence until latest reload retry passes', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-20-reload-failed-'))
  try {
    let summary
    for (let index = 1; index <= 20; index += 1) {
      summary = await recordObservedShopPilotRun({
        workspace: parent,
        runInput: runInput(index, index === 20 ? { reloadRetryOutcome: 'failed' } : {}),
      })
    }
    assert.equal(summary.acceptedConsecutiveRuns, 20)
    assert.equal(summary.pilotSequenceCoverageMet, true)
    assert.equal(summary.promotionEvidenceMet, false)
    assert.equal(summary.promotionProgress.acceptedConsecutiveRunsRemaining, 0)
    assert.equal(summary.promotionProgress.latestReloadRetryOutcome, 'failed')
    assert.equal(summary.promotionProgress.readyForOwnerDecisionReview, false)
    assert.equal(summary.nextAction, 'collect_more_observed_evidence')
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
  assert.throws(() => normalizeObservedRunInput(runInput(1, { independentAnchorDigest: digest('evidence-1') })), /shop_observed_evidence_anchor_digest_not_independent/)
  const missing = runInput(1)
  delete missing.evidenceReferenceDigest
  assert.throws(() => normalizeObservedRunInput(missing), /shop_observed_run_input_keys_invalid/)
})

test('private run input template is fillable but not recordable evidence', () => {
  const template = validateObservedRunInputTemplate(buildObservedRunInputTemplate({
    runOrdinal: 6,
    generatedAt: '2026-08-25T00:00:00.000Z',
  }))
  assert.equal(template.contract, SHOP_OBSERVED_RUN_INPUT_TEMPLATE_CONTRACT)
  assert.equal(template.runOrdinal, 6)
  assert.equal(template.runInput.runId, 'RUN-006')
  assert.equal(template.runInput.dayIndex, 1)
  assert.equal(template.runInput.accepted, false)
  assert.equal(template.runInput.reloadRetryOutcome, 'not-tested')
  assert.equal(template.runInput.noRealMessageSent, true)
  assert.equal(template.runInput.noPaymentAccepted, true)
  assert.equal(template.runInput.noStockMovement, true)
  assert.equal(template.runInput.noServerWrite, true)
  assert.equal(template.runInput.noHostedWrite, true)
  assert.equal(template.runInput.observedAt, null)
  assert.equal(template.runInput.evidenceReferenceDigest, null)
  assert.equal(template.runInput.independentAnchorDigest, null)
  assert.match(template.digest, /^sha256:[0-9a-f]{64}$/)
  assert.throws(() => normalizeObservedRunInput(template.runInput), /evidence_reference_digest_required/)
  assert.doesNotMatch(JSON.stringify(template), /owner@example|Sample Spa|Private Spa|09 123/i)
})

test('template validation rejects unsafe defaults and tampering', () => {
  const template = buildObservedRunInputTemplate({ generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.throws(() => validateObservedRunInputTemplate({
    ...template,
    runInput: {
      ...template.runInput,
      noPaymentAccepted: false,
    },
  }), /shop_observed_run_input_template_defaults_invalid/)
  assert.throws(() => validateObservedRunInputTemplate({
    ...template,
    digest: digest('wrong-template'),
  }), /shop_observed_run_input_template_digest_mismatch/)
})

test('replayed evidence and anchor digests cannot inflate accepted run count', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-replay-'))
  try {
    await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(1) })
    await assert.rejects(() => recordObservedShopPilotRun({
      workspace: parent,
      runInput: runInput(2, { evidenceReferenceDigest: digest('evidence-1') }),
    }), /shop_observed_evidence_reference_digest_duplicate/)
    await assert.rejects(() => recordObservedShopPilotRun({
      workspace: parent,
      runInput: runInput(3, { independentAnchorDigest: digest('anchor-1') }),
    }), /shop_observed_independent_anchor_digest_duplicate/)
    const summary = await verifyObservedShopPilotEvidence(parent)
    assert.equal(summary.runCount, 1)
    assert.deepEqual(summary.proofIntegrity, {
      uniqueRunIds: true,
      uniqueEvidenceReferenceDigests: true,
      uniqueIndependentAnchorDigests: true,
      evidenceAnchorDigestPairsDistinct: true,
    })
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
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

test('tampered stored proof replay fails verification even when record digests are recomputed', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-replay-tamper-'))
  try {
    await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(1) })
    await recordObservedShopPilotRun({ workspace: parent, runInput: runInput(2) })
    const runsPath = join(parent, 'observed-runs.private.jsonl')
    const records = (await readFile(runsPath, 'utf8')).trim().split(/\r?\n/).map((line) => JSON.parse(line))
    const tampered = records.map((record, index) => {
      if (index !== 1) return record
      const unsigned = {
        ...record,
        evidenceReferenceDigest: records[0].evidenceReferenceDigest,
      }
      delete unsigned.recordDigest
      return {
        ...unsigned,
        recordDigest: recordDigest(unsigned),
      }
    })
    await writeFile(runsPath, `${tampered.map((record) => JSON.stringify(record)).join('\n')}\n`)
    await assert.rejects(() => verifyObservedShopPilotEvidence(parent), /shop_observed_evidence_reference_digest_duplicate/)
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

test('CLI writes private run template and validates filled run input with metadata-only stdout', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-template-'))
  const workspace = join(parent, 'workspace')
  const templatePath = join(parent, 'private-run-template.json')
  const inputPath = join(parent, 'filled-run.private.json')
  const tool = resolve('tools/record_shop_pilot_observed_run.mjs')
  try {
    const templated = spawnSync(process.execPath, [
      tool,
      '--template',
      '--workspace',
      workspace,
      '--output',
      templatePath,
    ], { encoding: 'utf8' })
    assert.equal(templated.status, 0, templated.stderr || templated.stdout)
    const templateStdout = JSON.parse(templated.stdout)
    assert.equal(templateStdout.contract, SHOP_OBSERVED_RUN_INPUT_TEMPLATE_CONTRACT)
    assert.equal(templateStdout.outputWritten, true)
    assert.equal(templateStdout.runOrdinal, 1)
    assert.equal(templateStdout.dayIndex, 1)
    assert.doesNotMatch(templated.stdout, /RUN-001|supermega-shop-observed-template|private-run-template|@|https?:\/\//i)
    const template = validateObservedRunInputTemplate(JSON.parse(await readFile(templatePath, 'utf8')))
    assert.equal(template.runInput.runId, 'RUN-001')

    await writeFile(inputPath, JSON.stringify(runInput(1), null, 2))
    const validated = spawnSync(process.execPath, [
      tool,
      '--validate-run-input',
      '--run-input',
      inputPath,
    ], { encoding: 'utf8' })
    assert.equal(validated.status, 0, validated.stderr || validated.stdout)
    const validation = JSON.parse(validated.stdout)
    assert.equal(validation.mode, 'metadata_only_no_record_write')
    assert.equal(validation.dayIndex, 1)
    assert.match(validation.runIdDigest, /^sha256:[0-9a-f]{64}$/)
    assert.doesNotMatch(validated.stdout, /RUN-001|supermega-shop-observed-template|filled-run|@|https?:\/\//i)
    assert.equal((await verifyObservedShopPilotEvidence(workspace)).runCount, 0)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
