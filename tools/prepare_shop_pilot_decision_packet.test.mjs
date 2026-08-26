import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

import {
  SHOP_PILOT_DECISION_PACKET_CONTRACT,
  buildShopPilotDecisionPacket,
  validateShopPilotDecisionPacket,
  renderShopPilotDecisionPacketMarkdown,
} from './prepare_shop_pilot_decision_packet.mjs'
import { buildShopPilotBaselinePacket } from './prepare_shop_pilot_baseline_packet.mjs'
import { recordObservedShopPilotRun } from './record_shop_pilot_observed_run.mjs'

function baselineInput() {
  return {
    contract: 'supermega.shop.pilot_baseline_input.v1',
    product: 'shop',
    pilotMode: 'owner_named',
    verticalPack: 'spa-services',
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
  }
}

function baselinePacket() {
  return buildShopPilotBaselinePacket(baselineInput(), { generatedAt: '2026-08-25T00:00:00.000Z' })
}

function digest(label) {
  return `sha256:${createHash('sha256').update(label).digest('hex')}`
}

function runInput(index, overrides = {}) {
  return {
    contract: 'supermega.shop.observed_pilot_run_input.v1',
    product: 'shop',
    pilotMode: 'owner_named',
    verticalPack: 'spa-services',
    runId: `run-${String(index).padStart(2, '0')}`,
    observedAt: new Date(Date.UTC(2026, 7, 25, 8, index, 0)).toISOString(),
    dayIndex: (index % 5) + 1,
    operatorReviewed: true,
    targetCorrect: true,
    accepted: true,
    durationMinutesPerOrder: 6,
    exceptionCount: 0,
    closeMinutes: 12,
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

async function withWorkspace(callback) {
  const workspace = await mkdtemp(join(tmpdir(), 'supermega-shop-decision-'))
  try {
    return await callback(workspace)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

test('builds owner-safe decision packet from baseline and 20 anchored accepted observed runs', async () => {
  await withWorkspace(async (workspace) => {
    let summary = null
    for (let index = 1; index <= 20; index += 1) {
      summary = await recordObservedShopPilotRun({ workspace, runInput: runInput(index) })
    }
    const packet = validateShopPilotDecisionPacket(buildShopPilotDecisionPacket({
      baselinePacket: baselinePacket(),
      observedSummary: summary,
      generatedAt: '2026-08-25T00:00:00.000Z',
    }))
    assert.equal(packet.contract, SHOP_PILOT_DECISION_PACKET_CONTRACT)
    assert.equal(packet.status, 'owner_pilot_decision_ready')
    assert.equal(packet.ok, true)
    assert.equal(packet.observedMetrics.acceptedConsecutiveRuns, 20)
    assert.equal(packet.observedMetrics.acceptedConsecutiveRunsRemaining, 0)
    assert.deepEqual(packet.observedMetrics.acceptedConsecutivePilotDayIndexes, [1, 2, 3, 4, 5])
    assert.deepEqual(packet.observedMetrics.missingPilotDayIndexes, [])
    assert.equal(packet.observedMetrics.pilotSequenceCoverageMet, true)
    assert.equal(packet.observedMetrics.readyForOwnerDecisionReview, true)
    assert.deepEqual(packet.observedMetrics.proofIntegrity, {
      uniqueRunIds: true,
      uniqueEvidenceReferenceDigests: true,
      uniqueIndependentAnchorDigests: true,
      evidenceAnchorDigestPairsDistinct: true,
    })
    assert.equal(packet.comparison.orderTimeDeltaMinutes, -4)
    assert.equal(packet.comparison.exceptionRateDeltaPerRun, -0.2)
    assert.equal(packet.comparison.closeTimeDeltaMinutes, -8)
    assert.equal(packet.pilotDecision.outcomeStatus, 'target_met_or_improved')
    assert.equal(packet.pilotDecision.managedActivationAllowedByThisPacket, false)
    assert.equal(packet.privacyBoundary.rawPrivateEvidenceIncluded, false)
    assert.doesNotMatch(JSON.stringify(packet), /run-01|supermega-shop-decision|@|https?:\/\//i)
  })
})

test('blocks decision readiness until 20 consecutive accepted runs exist', async () => {
  await withWorkspace(async (workspace) => {
    let summary = null
    for (let index = 1; index <= 19; index += 1) {
      summary = await recordObservedShopPilotRun({ workspace, runInput: runInput(index) })
    }
    const packet = validateShopPilotDecisionPacket(buildShopPilotDecisionPacket({
      baselinePacket: baselinePacket(),
      observedSummary: summary,
      generatedAt: '2026-08-25T00:00:00.000Z',
    }))
    assert.equal(packet.status, 'blocked_collect_more_or_fix_observed_evidence')
    assert.equal(packet.ok, false)
    assert.equal(packet.observedMetrics.acceptedConsecutiveRunsRemaining, 1)
    assert.deepEqual(packet.failures, ['accepted_consecutive_runs_below_20'])
    assert.equal(packet.pilotDecision.recommendation, 'collect_more_observed_evidence')
  })
})

test('blocks decision readiness when 20 accepted runs miss five-day sequence coverage', async () => {
  await withWorkspace(async (workspace) => {
    let summary = null
    for (let index = 1; index <= 20; index += 1) {
      summary = await recordObservedShopPilotRun({ workspace, runInput: runInput(index, { dayIndex: 1 }) })
    }
    const packet = validateShopPilotDecisionPacket(buildShopPilotDecisionPacket({
      baselinePacket: baselinePacket(),
      observedSummary: summary,
      generatedAt: '2026-08-25T00:00:00.000Z',
    }))
    assert.equal(packet.status, 'blocked_collect_more_or_fix_observed_evidence')
    assert.equal(packet.ok, false)
    assert.deepEqual(packet.observedMetrics.acceptedConsecutivePilotDayIndexes, [1])
    assert.deepEqual(packet.observedMetrics.missingPilotDayIndexes, [2, 3, 4, 5])
    assert.equal(packet.observedMetrics.pilotSequenceCoverageMet, false)
    assert.deepEqual(packet.failures, ['pilot_sequence_days_missing'])
    assert.equal(packet.pilotDecision.recommendation, 'collect_more_observed_evidence')
  })
})

test('rejects observed summaries without all proof-integrity gates true', async () => {
  await withWorkspace(async (workspace) => {
    let summary = null
    for (let index = 1; index <= 20; index += 1) {
      summary = await recordObservedShopPilotRun({ workspace, runInput: runInput(index) })
    }
    assert.throws(() => buildShopPilotDecisionPacket({
      baselinePacket: baselinePacket(),
      observedSummary: {
        ...summary,
        proofIntegrity: {
          ...summary.proofIntegrity,
          uniqueIndependentAnchorDigests: false,
        },
      },
      generatedAt: '2026-08-25T00:00:00.000Z',
    }), /shop_pilot_decision_proof_integrity_invalid/)
    assert.throws(() => buildShopPilotDecisionPacket({
      baselinePacket: baselinePacket(),
      observedSummary: {
        ...summary,
        proofIntegrity: undefined,
      },
      generatedAt: '2026-08-25T00:00:00.000Z',
    }), /shop_pilot_decision_proof_integrity_invalid/)
  })
})

test('rejects observed summaries with inconsistent promotion progress', async () => {
  await withWorkspace(async (workspace) => {
    let summary = null
    for (let index = 1; index <= 19; index += 1) {
      summary = await recordObservedShopPilotRun({ workspace, runInput: runInput(index) })
    }
    assert.throws(() => buildShopPilotDecisionPacket({
      baselinePacket: baselinePacket(),
      observedSummary: {
        ...summary,
        promotionProgress: {
          ...summary.promotionProgress,
          acceptedConsecutiveRunsRemaining: 0,
        },
      },
      generatedAt: '2026-08-25T00:00:00.000Z',
    }), /shop_pilot_decision_promotion_progress_invalid/)
  })
})

test('requires reload retry pass before owner decision readiness', async () => {
  await withWorkspace(async (workspace) => {
    let summary = null
    for (let index = 1; index <= 20; index += 1) {
      summary = await recordObservedShopPilotRun({
        workspace,
        runInput: runInput(index, index === 20 ? { reloadRetryOutcome: 'failed' } : {}),
      })
    }
    const packet = validateShopPilotDecisionPacket(buildShopPilotDecisionPacket({
      baselinePacket: baselinePacket(),
      observedSummary: summary,
      generatedAt: '2026-08-25T00:00:00.000Z',
    }))
    assert.equal(packet.ok, false)
    assert.equal(packet.observedMetrics.readyForOwnerDecisionReview, false)
    assert.equal(packet.pilotDecision.outcomeStatus, 'blocked_reload_retry')
    assert.deepEqual(packet.failures, ['latest_reload_retry_not_passed'])
    assert.equal(packet.pilotDecision.recommendation, 'fix_reload_retry_and_repeat_observed_runs_before_activation_review')
  })
})

test('rejects phone numbers and private paths at the observed summary boundary', async () => {
  await withWorkspace(async (workspace) => {
    let summary = null
    for (let index = 1; index <= 20; index += 1) {
      summary = await recordObservedShopPilotRun({ workspace, runInput: runInput(index) })
    }
    for (const leakedValue of ['09 123 456 789', String.raw`C:\Users\thesw\OneDrive - BDA\private-shop-pilot`]) {
      assert.throws(() => buildShopPilotDecisionPacket({
        baselinePacket: baselinePacket(),
        observedSummary: {
          ...summary,
          leakedValue,
        },
        generatedAt: '2026-08-25T00:00:00.000Z',
      }), /shop_pilot_decision_packet_private_or_secret_shape_detected/)
    }
  })
})

test('renders markdown without private identity and rejects tampering', async () => {
  await withWorkspace(async (workspace) => {
    let summary = null
    for (let index = 1; index <= 20; index += 1) {
      summary = await recordObservedShopPilotRun({ workspace, runInput: runInput(index) })
    }
    const packet = buildShopPilotDecisionPacket({
      baselinePacket: baselinePacket(),
      observedSummary: summary,
      generatedAt: '2026-08-25T00:00:00.000Z',
    })
    const markdown = renderShopPilotDecisionPacketMarkdown(packet)
    assert.match(markdown, /Shop pilot decision packet/)
    assert.doesNotMatch(markdown, /run-01|supermega-shop-decision|@|https?:\/\//i)
    assert.throws(() => validateShopPilotDecisionPacket({
      ...packet,
      pilotDecision: {
        ...packet.pilotDecision,
        recommendation: 'owner_review_required_with_target_gap_fix_plan_before_activation',
      },
    }), /digest_mismatch/)
  })
})

test('CLI verifies private workspace and writes public-safe packet only', async () => {
  await withWorkspace(async (workspace) => {
    const baselinePath = join(workspace, 'baseline-public.json')
    const outputPath = join(workspace, 'decision-public.json')
    const markdownPath = join(workspace, 'decision-public.md')
    await writeFile(baselinePath, `${JSON.stringify(baselinePacket(), null, 2)}\n`, 'utf8')
    for (let index = 1; index <= 20; index += 1) {
      await recordObservedShopPilotRun({ workspace, runInput: runInput(index) })
    }
    const tool = resolve('tools/prepare_shop_pilot_decision_packet.mjs')
    const generated = spawnSync(process.execPath, [
      tool,
      '--baseline-packet',
      baselinePath,
      '--observed-workspace',
      workspace,
      '--output',
      outputPath,
      '--markdown-output',
      markdownPath,
    ], { encoding: 'utf8' })
    assert.equal(generated.status, 0, generated.stderr || generated.stdout)
    const verified = spawnSync(process.execPath, [tool, '--verify', outputPath], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr || verified.stdout)
    assert.doesNotMatch(verified.stdout, /supermega-shop-decision|run-01|@|https?:\/\//i)
  })
})
