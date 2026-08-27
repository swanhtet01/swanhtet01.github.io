import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  buildShopPilotBaselinePacket,
  SHOP_PILOT_BASELINE_INPUT_CONTRACT,
} from './prepare_shop_pilot_baseline_packet.mjs'
import {
  buildShopPilotDay0ReadinessPacket,
  sampleShopPilotDay0ReadinessInput,
} from './prepare_shop_pilot_day0_readiness_packet.mjs'
import {
  buildShopPilotPrivateIntakePacket,
  sampleShopPilotPrivateIntakeInput,
} from './prepare_shop_pilot_private_intake_packet.mjs'
import {
  buildShopPilotDay0OwnerBaselineActionCard,
  renderShopPilotDay0OwnerBaselineActionCardMarkdown,
  validateShopPilotDay0OwnerBaselineActionCard,
} from './prepare_shop_pilot_day0_owner_baseline_action_card.mjs'
import {
  assessShopPilotLaunchGate,
  sampleShopPilotLaunchGateInput,
} from './verify_shop_pilot_launch_gate.mjs'

function baselineInput() {
  return {
    contract: SHOP_PILOT_BASELINE_INPUT_CONTRACT,
    product: 'shop',
    pilotMode: 'owner_named',
    verticalPack: 'spa-services',
    observedAt: '2026-08-25T08:00:00.000Z',
    businessName: 'Private Baseline Spa',
    namedOperator: 'Private Baseline Operator',
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
}

function day0Packet({ withBaseline = false, withIntake = true } = {}) {
  const baselinePacket = withBaseline
    ? buildShopPilotBaselinePacket(baselineInput(), { generatedAt: '2026-08-25T00:00:00.000Z' })
    : null
  const intakePacket = withIntake
    ? buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
    : null
  return buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ baselinePacket, intakePacket })),
    ownerPrivatePreparation: {
      baselineInputTemplateDigest: `sha256:${'a'.repeat(64)}`,
      baselineInputTemplateBlank: true,
      baselineWorksheetDigest: `sha256:${'b'.repeat(64)}`,
      baselineWorksheetBlank: true,
    },
  }))
}

function releaseEvidence(launchGateReport) {
  return {
    source: 'release_handoff_and_github_snapshot',
    candidateCommit: launchGateReport.candidate.head,
    currentGateId: 'review_branch_push',
    releaseHandoffDigest: `sha256:${'c'.repeat(64)}`,
    githubMainProtectionSnapshotDigest: `sha256:${'d'.repeat(64)}`,
    mainProtectionVerified: true,
  }
}

test('renders an owner-baseline action card without local paths, identity, or authority', () => {
  const card = buildShopPilotDay0OwnerBaselineActionCard({
    generatedAt: '2026-08-26T00:00:00.000Z',
    day0Packet: day0Packet(),
  })
  assert.equal(validateShopPilotDay0OwnerBaselineActionCard(card), card)
  assert.equal(card.status, 'owner_observed_baseline_action_required')
  assert.equal(card.source.day0Status, 'blocked_owner_observed_baseline_required')
  assert.equal(card.ownerPrivatePrepArtifacts.artifactPolicy, 'digests_only_no_paths')
  assert.equal(card.ownerPrivatePrepArtifacts.localPathsIncluded, false)
  assert.equal(card.controls.githubWritesAllowed, false)
  assert.equal(card.controls.vercelDeployAllowed, false)
  assert.equal(card.controls.supabaseWritesAllowed, false)
  assert.equal(card.controls.customerContactAllowed, false)
  assert.equal(card.controls.paymentAllowed, false)
  assert.equal(card.controls.stockMovementAllowed, false)
  assert.equal(card.action.expectedPreflightStatus, 'baseline_input_ready')
  assert.equal(card.action.baselinePacketVerificationRequired, true)
  assert.equal(card.minimumEvidence.baselinePacketVerificationRequired, true)
  assert.ok(card.commandPlan.commands.some((command) => command.includes('--lint-input "<private-baseline-input.json>"') && command.includes('--output "<owner-safe-baseline-preflight.json>"')))
  assert.ok(card.commandPlan.commands.some((command) => command.includes('--verify-preflight "<owner-safe-baseline-preflight.json>"')))
  assert.ok(card.commandPlan.commands.some((command) => command.includes('--verify "<owner-safe-baseline-packet.json>"')))
  assert.ok(card.commandPlan.commands.some((command) => command.includes('--output "<owner-safe-launch-gate-report.json>"')))
  assert.ok(card.commandPlan.commands.some((command) => command.includes('--verify-report "<owner-safe-launch-gate-report.json>"')))
  assert.ok(card.commandPlan.commands.some((command) => command.includes('--launch-gate-report "<owner-safe-launch-gate-report.json>"') && command.includes('--release-handoff "<release-handoff.json>"') && command.includes('--github-protection-snapshot "<github-protection-snapshot.json>"')))
  assert.equal(card.minimumEvidence.promotionEvidenceRequirement.requiredAcceptedConsecutiveRuns, 20)
  assert.deepEqual(card.minimumEvidence.promotionEvidenceRequirement.requiredPilotDayIndexes, [1, 2, 3, 4, 5])
  assert.equal(card.minimumEvidence.promotionEvidenceRequirement.pilotSequenceCoverageMet, false)
  assert.deepEqual(card.minimumEvidence.requiredFlows.map((flow) => flow.id), ['manual_order', 'package_redemption', 'daily_close'])
  assert.equal(card.minimumEvidence.requiredFlows[2].requiredDistinctCalendarDateCount, 3)
  assert.equal(card.minimumEvidence.requiredFlows[2].observedDistinctCalendarDateCount, 0)
  assert.ok(card.minimumEvidence.stopConditions.includes('fewer_than_three_uninterrupted_daily_close_runs'))
  assert.ok(card.minimumEvidence.stopConditions.includes('fewer_than_three_distinct_daily_close_calendar_dates'))
  assert.ok(card.minimumEvidence.stopConditions.includes('raw_identity_or_private_note_would_enter_owner_safe_packet'))

  const markdown = renderShopPilotDay0OwnerBaselineActionCardMarkdown(card)
  assert.match(markdown, /Capture the owner-observed manual Shop baseline/)
  assert.match(markdown, /preflight returns `baseline_input_ready`/)
  assert.match(markdown, /Required accepted real runs: 20/)
  assert.match(markdown, /Manual daily close/)
  assert.match(markdown, /required distinct close dates 3/)
  assert.match(markdown, /Required pilot days covered: 1, 2, 3, 4, 5/)
  assert.match(markdown, /--lint-input "<private-baseline-input\.json>"/)
  assert.match(markdown, /--verify-preflight "<owner-safe-baseline-preflight\.json>"/)
  assert.match(markdown, /--release-handoff "<release-handoff\.json>"/)
  assert.doesNotMatch(markdown, /[A-Za-z]:\\/)
  assert.doesNotMatch(markdown, /Private Baseline Spa|Private Baseline Operator/)
  assert.doesNotMatch(markdown, /ready for managed activation|production release ready|pilot proof/i)
})

test('binds owner-baseline card to the current release blocker when release evidence is present', () => {
  const intakePacket = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  const launchGateReport = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ intakePacket }))
  const packet = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport,
    releaseGateEvidence: releaseEvidence(launchGateReport),
    ownerPrivatePreparation: {
      baselineInputTemplateDigest: `sha256:${'a'.repeat(64)}`,
      baselineInputTemplateBlank: true,
      baselineWorksheetDigest: `sha256:${'b'.repeat(64)}`,
      baselineWorksheetBlank: true,
    },
  }))
  const card = buildShopPilotDay0OwnerBaselineActionCard({
    generatedAt: '2026-08-26T00:00:00.000Z',
    day0Packet: packet,
  })
  assert.equal(card.source.releaseGateEvidenceProvided, true)
  assert.equal(card.source.releaseGateCurrentGateId, 'review_branch_push')
  assert.equal(card.source.releaseGateCurrentBlocker, 'review_branch_push_missing')
  assert.equal(card.source.mainProtectionVerified, true)
  assert.equal(card.source.releaseHandoffDigest, `sha256:${'c'.repeat(64)}`)
  assert.equal(card.source.githubMainProtectionSnapshotDigest, `sha256:${'d'.repeat(64)}`)
  assert.ok(card.blockersStillActive.includes('review_branch_push_missing'))
  assert.equal(card.blockersStillActive.includes('github_main_protection_unverified'), false)
  assert.equal(validateShopPilotDay0OwnerBaselineActionCard(card), card)
})

test('can guide baseline-first state when intake is also missing', () => {
  const card = buildShopPilotDay0OwnerBaselineActionCard({
    generatedAt: '2026-08-26T00:00:00.000Z',
    day0Packet: day0Packet({ withIntake: false }),
  })
  assert.equal(card.source.day0Status, 'blocked_owner_baseline_and_intake_required')
  assert.ok(card.blockersStillActive.includes('owner_private_intake_packet_missing'))
  assert.equal(validateShopPilotDay0OwnerBaselineActionCard(card), card)
})

test('rejects non-baseline Day-0 states and private/path leakage', () => {
  assert.throws(
    () => buildShopPilotDay0OwnerBaselineActionCard({ day0Packet: day0Packet({ withBaseline: true, withIntake: true }) }),
    /shop_pilot_day0_owner_baseline_card_not_applicable/,
  )

  const packet = day0Packet()
  assert.throws(
    () => buildShopPilotDay0OwnerBaselineActionCard({
      day0Packet: {
        ...packet,
        ownerPrivatePreparation: {
          ...packet.ownerPrivatePreparation,
          localPath: 'C:\\Users\\owner\\private-baseline-input.json',
        },
      },
    }),
    /shop_pilot_day0_(?:owner_baseline_card_)?private_or_secret_shape/,
  )

  const card = buildShopPilotDay0OwnerBaselineActionCard({ day0Packet: packet })
  assert.throws(
    () => validateShopPilotDay0OwnerBaselineActionCard({
      ...card,
      commandPlan: {
        ...card.commandPlan,
        commands: [...card.commandPlan.commands, 'npm.cmd run deploy'],
      },
    }),
    /shop_pilot_day0_owner_baseline_card_digest_invalid/,
  )
})

test('CLI writes and verifies the owner-safe action card', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shop-day0-owner-card-'))
  try {
    const day0Path = join(dir, 'day0.json')
    const outputPath = join(dir, 'card.json')
    const markdownPath = join(dir, 'card.md')
    await import('node:fs/promises').then(({ writeFile }) => writeFile(day0Path, `${JSON.stringify(day0Packet(), null, 2)}\n`, 'utf8'))

    const run = spawnSync(process.execPath, [
      'tools/prepare_shop_pilot_day0_owner_baseline_action_card.mjs',
      '--day0-readiness',
      day0Path,
      '--output',
      outputPath,
      '--markdown-output',
      markdownPath,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr || run.stdout)

    const verify = spawnSync(process.execPath, [
      'tools/prepare_shop_pilot_day0_owner_baseline_action_card.mjs',
      '--verify',
      outputPath,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(verify.status, 0, verify.stderr || verify.stdout)
    assert.equal(JSON.parse(verify.stdout).ok, true)

    const markdown = await readFile(markdownPath, 'utf8')
    assert.match(markdown, /Local paths included: false/)
    assert.match(markdown, /raw_identity_or_private_note_would_enter_owner_safe_packet/)
    assert.doesNotMatch(markdown, /raw_identity_or_private_note_would_enter_public_packet|public baseline packet/i)
    assert.doesNotMatch(markdown, /[A-Za-z]:\\/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
