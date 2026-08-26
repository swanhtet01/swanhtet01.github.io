import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildCurrentReleaseControlIndex,
  sampleCurrentReleaseControlIndexInput,
} from './prepare_current_release_control_index.mjs'
import {
  buildShopPilotBaselinePacket,
  SHOP_PILOT_BASELINE_INPUT_CONTRACT,
} from './prepare_shop_pilot_baseline_packet.mjs'
import {
  buildShopPilotDay0ReadinessPacket,
  sampleShopPilotDay0ReadinessInput,
} from './prepare_shop_pilot_day0_readiness_packet.mjs'
import {
  buildShopPilotDay0OwnerBaselineActionCard,
} from './prepare_shop_pilot_day0_owner_baseline_action_card.mjs'
import {
  buildShopPilotPrivateIntakePacket,
  sampleShopPilotPrivateIntakeInput,
} from './prepare_shop_pilot_private_intake_packet.mjs'
import {
  buildShopPilotOwnerObservationPack,
  renderShopPilotOwnerObservationPackMarkdown,
  validateShopPilotOwnerObservationPack,
} from './prepare_shop_pilot_owner_observation_pack.mjs'
import {
  assessShopPilotLaunchGate,
  sampleShopPilotLaunchGateInput,
} from './verify_shop_pilot_launch_gate.mjs'

function packetDigest(body) {
  return `sha256:${createHash('sha256').update(JSON.stringify(body).replace(/\r\n?/g, '\n')).digest('hex')}`
}

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

function currentIndex(day0, card) {
  const base = sampleCurrentReleaseControlIndexInput()
  const currentGateId = 'review_branch_push'
  return buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    reviewBranchPushPlan: {
      ...base.reviewBranchPushPlan,
      possibleWrite: { kind: 'fast_forward_branch_push' },
    },
    operatorBoard: {
      ...base.operatorBoard,
      currentAction: { gateId: currentGateId },
    },
    productReadinessMatrix: {
      ...base.productReadinessMatrix,
      release: { currentGateId },
    },
    statusBrief: {
      ...base.statusBrief,
      release: { currentGateId },
    },
    nextReleaseActionPreflight: {
      ...base.nextReleaseActionPreflight,
      currentGateId,
    },
    shopPilotDay0Readiness: day0,
    shopPilotDay0OwnerBaselineActionCard: card,
  }))
}

test('builds a privacy-safe owner observation pack bound to current release control', () => {
  const day0 = day0Packet()
  const card = buildShopPilotDay0OwnerBaselineActionCard({
    generatedAt: '2026-08-26T00:00:00.000Z',
    day0Packet: day0,
  })
  const index = currentIndex(day0, card)
  const pack = buildShopPilotOwnerObservationPack({
    generatedAt: '2026-08-26T00:00:00.000Z',
    day0Packet: day0,
    ownerBaselineActionCard: card,
    currentReleaseControlIndex: index,
    sourceFileNames: {
      day0Readiness: 'supermega.shop-pilot-day0-readiness.v99.generated-20260826.json',
      ownerBaselineActionCard: 'supermega.shop-pilot-day0-owner-baseline-action-card.v99.generated-20260826.json',
      currentReleaseControlIndex: 'supermega.current-release-control-index.v99.generated-20260826.json',
    },
  })
  assert.equal(validateShopPilotOwnerObservationPack(pack), pack)
  assert.equal(pack.status, 'blocked_owner_private_observation_required')
  assert.equal(pack.currentReleaseGate.currentGateId, 'review_branch_push')
  assert.equal(pack.currentReleaseGate.branchPushAllowedNow, false)
  assert.equal(pack.currentReleaseGate.deployAllowedNow, false)
  assert.equal(pack.currentReleaseGate.supabaseWriteAllowedNow, false)
  assert.equal(pack.controls.githubWritesAllowed, false)
  assert.equal(pack.controls.customerContactAllowed, false)
  assert.equal(pack.observationChecklist.minimumUninterruptedRunsPerFlow, 3)
  assert.ok(pack.observationChecklist.requiredMetrics.includes('daily_close_minutes'))
  assert.equal(pack.observationChecklist.promotionEvidenceRequirement.requiredAcceptedConsecutiveRuns, 20)
  assert.deepEqual(pack.observationChecklist.promotionEvidenceRequirement.requiredPilotDayIndexes, [1, 2, 3, 4, 5])
  assert.equal(pack.observationChecklist.promotionEvidenceRequirement.pilotSequenceCoverageMet, false)
  assert.ok(pack.observationChecklist.runAcceptanceRules.includes('real_manual_operations_only'))
  assert.equal(pack.observedRunEvidenceCommandPlan.privateRunInputTemplateRequiredBeforeEachRun, true)
  assert.equal(pack.observedRunEvidenceCommandPlan.metadataOnlyValidationRequiredBeforeRecord, true)
  assert.equal(pack.observedRunEvidenceCommandPlan.receiptDigestRequiredBeforeRecord, true)
  assert.equal(pack.observedRunEvidenceCommandPlan.independentAnchorDigestRequiredBeforeRecord, true)
  assert.equal(pack.observedRunEvidenceCommandPlan.requiredAcceptedConsecutiveRuns, 20)
  assert.deepEqual(pack.observedRunEvidenceCommandPlan.requiredPilotDayIndexes, [1, 2, 3, 4, 5])
  assert.ok(pack.observedRunEvidenceCommandPlan.commands.some((command) => command.includes('client:pilot:observed-evidence:template')))
  assert.ok(pack.observedRunEvidenceCommandPlan.commands.some((command) => command.includes('client:pilot:observed-evidence:validate')))
  assert.ok(pack.observedRunEvidenceCommandPlan.commands.some((command) => command.includes('--record --workspace "<private-observed-workspace>"')))

  const markdown = renderShopPilotOwnerObservationPackMarkdown(pack)
  assert.match(markdown, /Observe real manual Shop work/)
  assert.match(markdown, /Required accepted real runs: 20/)
  assert.match(markdown, /Required pilot days covered: 1, 2, 3, 4, 5/)
  assert.match(markdown, /--lint-input "<private-baseline-input\.json>"/)
  assert.match(markdown, /Commands during the five-day private pilot/)
  assert.match(markdown, /client:pilot:observed-evidence:template/)
  assert.match(markdown, /client:pilot:observed-evidence:validate/)
  assert.ok(markdown.indexOf('client:pilot:observed-evidence:template') < markdown.indexOf('--record --workspace "<private-observed-workspace>"'))
  assert.ok(markdown.indexOf('client:pilot:observed-evidence:validate') < markdown.indexOf('--record --workspace "<private-observed-workspace>"'))
  assert.doesNotMatch(markdown, /[A-Za-z]:\\/)
  assert.doesNotMatch(markdown, /Private Baseline Spa|Private Baseline Operator/)
  assert.doesNotMatch(markdown, /ready for managed activation|production release ready|pilot success/i)
})

test('rejects owner observation packs that omit the private run template workflow', () => {
  const day0 = day0Packet()
  const card = buildShopPilotDay0OwnerBaselineActionCard({ day0Packet: day0 })
  const pack = buildShopPilotOwnerObservationPack({ day0Packet: day0, ownerBaselineActionCard: card })
  const withoutTemplateCommand = {
    ...pack,
    observedRunEvidenceCommandPlan: {
      ...pack.observedRunEvidenceCommandPlan,
      commands: pack.observedRunEvidenceCommandPlan.commands.filter((command) => !command.includes('client:pilot:observed-evidence:template')),
    },
  }
  delete withoutTemplateCommand.digest
  assert.throws(
    () => validateShopPilotOwnerObservationPack({
      ...withoutTemplateCommand,
      digest: packetDigest(withoutTemplateCommand),
    }),
    /shop_pilot_owner_observation_pack_observed_run_plan_invalid/,
  )
  const body = {
    ...pack,
    observedRunEvidenceCommandPlan: {
      ...pack.observedRunEvidenceCommandPlan,
      metadataOnlyValidationRequiredBeforeRecord: false,
    },
  }
  delete body.digest
  assert.throws(
    () => validateShopPilotOwnerObservationPack({
      ...body,
      digest: packetDigest(body),
    }),
    /shop_pilot_owner_observation_pack_observed_run_plan_invalid/,
  )
})

test('rejects stale release-control binding and redacts source paths to file names', () => {
  const day0 = day0Packet()
  const card = buildShopPilotDay0OwnerBaselineActionCard({ day0Packet: day0 })
  const staleIndex = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput())
  assert.throws(
    () => buildShopPilotOwnerObservationPack({ day0Packet: day0, ownerBaselineActionCard: card, currentReleaseControlIndex: staleIndex }),
    /shop_pilot_owner_observation_pack_control_index_day0_digest_mismatch/,
  )
  const pack = buildShopPilotOwnerObservationPack({
    day0Packet: day0,
    ownerBaselineActionCard: card,
    sourceFileNames: { day0Readiness: 'C:\\Users\\owner\\private-day0.json' },
  })
  assert.equal(pack.source.day0FileName, 'private-day0.json')
  assert.doesNotMatch(JSON.stringify(pack), /C:\\Users\\owner/)
})

test('rejects non-observation Day-0 states', () => {
  const day0 = day0Packet({ withBaseline: true, withIntake: true })
  const cardInput = day0Packet()
  const card = buildShopPilotDay0OwnerBaselineActionCard({ day0Packet: cardInput })
  assert.throws(
    () => buildShopPilotOwnerObservationPack({ day0Packet: day0, ownerBaselineActionCard: card }),
    /shop_pilot_owner_observation_pack_day0_card_digest_mismatch/,
  )
})

test('CLI writes and verifies the owner observation pack', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shop-owner-observation-pack-'))
  try {
    const day0 = day0Packet()
    const card = buildShopPilotDay0OwnerBaselineActionCard({
      generatedAt: '2026-08-26T00:00:00.000Z',
      day0Packet: day0,
    })
    const index = currentIndex(day0, card)
    const day0Path = join(dir, 'day0.json')
    const cardPath = join(dir, 'card.json')
    const indexPath = join(dir, 'control-index.json')
    const outputPath = join(dir, 'owner-observation-pack.json')
    const markdownPath = join(dir, 'owner-observation-pack.md')
    await writeFile(day0Path, `${JSON.stringify(day0, null, 2)}\n`, 'utf8')
    await writeFile(cardPath, `${JSON.stringify(card, null, 2)}\n`, 'utf8')
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')

    const run = spawnSync(process.execPath, [
      'tools/prepare_shop_pilot_owner_observation_pack.mjs',
      '--day0-readiness',
      day0Path,
      '--owner-baseline-action-card',
      cardPath,
      '--current-release-control-index',
      indexPath,
      '--output',
      outputPath,
      '--markdown-output',
      markdownPath,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr || run.stdout)

    const verify = spawnSync(process.execPath, [
      'tools/prepare_shop_pilot_owner_observation_pack.mjs',
      '--verify',
      outputPath,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(verify.status, 0, verify.stderr || verify.stdout)
    assert.equal(JSON.parse(verify.stdout).ok, true)

    const markdown = await readFile(markdownPath, 'utf8')
    assert.match(markdown, /External writes allowed now: false/)
    assert.match(markdown, /owner-safe packet may contain counts/)
    assert.match(markdown, /client:pilot:observed-evidence:template/)
    assert.match(markdown, /client:pilot:observed-evidence:validate/)
    assert.doesNotMatch(markdown, /[A-Za-z]:\\/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
