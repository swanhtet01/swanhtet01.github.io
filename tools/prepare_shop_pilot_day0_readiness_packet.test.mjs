import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  SHOP_PILOT_BASELINE_INPUT_CONTRACT,
  buildShopPilotBaselinePacket,
  renderShopPilotBaselineWorksheetMarkdown,
} from './prepare_shop_pilot_baseline_packet.mjs'
import {
  buildShopPilotPrivateIntakePacket,
  sampleShopPilotPrivateIntakeInput,
} from './prepare_shop_pilot_private_intake_packet.mjs'
import {
  assessShopPilotLaunchGate,
  sampleShopPilotLaunchGateInput,
} from './verify_shop_pilot_launch_gate.mjs'
import {
  SHOP_PILOT_DAY0_READINESS_CONTRACT,
  buildShopPilotDay0ReadinessPacket,
  renderShopPilotDay0ReadinessMarkdown,
  sampleShopPilotDay0ReadinessInput,
  validateShopPilotDay0ReadinessPacket,
} from './prepare_shop_pilot_day0_readiness_packet.mjs'

function baselineInput() {
  return {
    contract: SHOP_PILOT_BASELINE_INPUT_CONTRACT,
    product: 'shop',
    pilotMode: 'owner_named',
    verticalPack: 'spa-services',
    observedAt: '2026-08-25T08:00:00.000Z',
    businessName: 'Private Day Zero Spa',
    namedOperator: 'Private Day Zero Operator',
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
      { runId: 'close-run-001', observedAt: '2026-08-25T18:01:00.000Z', startedWhen: 'last treatment finished', endedWhen: 'manual close completed', durationMinutes: 40, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'close-run-002', observedAt: '2026-08-25T18:20:00.000Z', startedWhen: 'last treatment finished', endedWhen: 'manual close completed', durationMinutes: 45, interrupted: false, errorOccurred: false, errorCostLabel: null },
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

test('reports missing Day-0 prerequisites without allowing external effects', () => {
  const packet = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput())
  assert.equal(packet.contract, SHOP_PILOT_DAY0_READINESS_CONTRACT)
  assert.equal(packet.ok, true)
  assert.equal(packet.status, 'blocked_owner_baseline_and_intake_required')
  assert.equal(packet.day0ReadyForOwnerPrivateHandoff, false)
  assert.equal(packet.day0Readiness.readyForCustomerContact, false)
  assert.equal(packet.day0Readiness.readyForPromotionEvidence, false)
  assert.equal(packet.promotionEvidenceRequirement.requiredAcceptedConsecutiveRuns, 20)
  assert.equal(packet.promotionEvidenceRequirement.acceptedConsecutiveRuns, 0)
  assert.deepEqual(packet.promotionEvidenceRequirement.requiredPilotDayIndexes, [1, 2, 3, 4, 5])
  assert.deepEqual(packet.promotionEvidenceRequirement.acceptedConsecutivePilotDayIndexes, [])
  assert.equal(packet.promotionEvidenceRequirement.pilotSequenceCoverageMet, false)
  assert.equal(packet.promotionEvidenceRequirement.requiredPilotCalendarDates, 5)
  assert.equal(packet.promotionEvidenceRequirement.acceptedConsecutiveObservedDateCount, 0)
  assert.deepEqual(packet.promotionEvidenceRequirement.acceptedConsecutiveObservedDates, [])
  assert.equal(packet.promotionEvidenceRequirement.pilotCalendarCoverageMet, false)
  assert.equal(packet.promotionEvidenceRequirement.syntheticEvidenceAccepted, false)
  assert.equal(packet.controls.githubWritesAllowed, false)
  assert.equal(packet.controls.supabaseWritesAllowed, false)
  assert.equal(packet.nextOwnerPrivateStep.id, 'capture-baseline-then-intake')
  assert.equal(packet.nextOwnerPrivateStep.safeBeforeReleaseGate, true)
  assert.equal(packet.nextOwnerPrivateStep.externalEffectsAllowed, false)
  assert.deepEqual(packet.nextOwnerPrivateStep.requiredPrivateInputs, ['manual_order_runs', 'package_redemption_runs', 'daily_close_runs', 'daily_close_minutes', 'exception_count'])
  assert.match(packet.ownerAction, /orders, package redemptions, and daily close/)
  assert.equal(packet.ownerPrivateObservationBridge.contract, 'supermega.shop-run001-private-observation-bridge.v1')
  assert.equal(packet.ownerPrivateObservationBridge.workspaceLabel, 'private-shop-pilots/run-001-private')
  assert.equal(packet.ownerPrivateObservationBridge.state, 'private_observation_incomplete')
  assert.equal(packet.ownerPrivateObservationBridge.allowedNow, 'owner_private_local_observation_only')
  assert.equal(packet.ownerPrivateObservationBridge.relativeOrchestratorCommand, '.\\complete-run-001-after-observation.ps1')
  assert.equal(packet.ownerPrivateObservationBridge.expectedCurrentGate, 'private_observation_incomplete')
  assert.equal(packet.ownerPrivateObservationBridge.readyForObservationExpected, true)
  assert.equal(packet.ownerPrivateObservationBridge.readyToRecordInitialState, false)
  assert.equal(packet.ownerPrivateObservationBridge.promotionEvidenceAccepted, false)
  assert.deepEqual(packet.ownerPrivateObservationBridge.requiredPrivateArtifacts, [
    'evidence.private.md',
    'anchor.private.md',
    'run-001.commands.private.ps1',
    'observed-summary.private.json',
  ])
  assert.equal(packet.ownerPrivateObservationBridge.authorizations.customerContactAllowed, false)
  assert.equal(packet.ownerPrivateObservationBridge.authorizations.paymentAllowed, false)
  assert.equal(packet.ownerPrivateObservationBridge.authorizations.stockMovementAllowed, false)
  assert.equal(packet.ownerPrivateObservationBridge.authorizations.hostedWritesAllowed, false)
  assert.equal(packet.ownerPrivateObservationBridge.authorizations.serverWritesAllowed, false)
  assert.equal(packet.ownerPrivateObservationBridge.authorizations.githubWritesAllowed, false)
  assert.equal(packet.ownerPrivateObservationBridge.authorizations.vercelDeployAllowed, false)
  assert.equal(packet.ownerPrivateObservationBridge.authorizations.supabaseWritesAllowed, false)
  assert.equal(packet.ownerPrivateObservationBridge.authorizations.managedActivationAllowed, false)
  assert.equal(packet.ownerPrivateObservationBridge.authorizations.privateIdentityIncluded, false)
  assert.equal(packet.ownerPrivateObservationBridge.authorizations.credentialValuesIncluded, false)
  assert.equal(packet.ownerPrivateBaselineChecklist.contract, 'supermega.shop-pilot-owner-private-baseline-checklist.v1')
  assert.equal(packet.ownerPrivateBaselineChecklist.state, 'owner_private_baseline_capture_required')
  assert.equal(packet.ownerPrivateBaselineChecklist.readyToGeneratePublicBaselinePacket, false)
  assert.deepEqual(packet.ownerPrivateBaselineChecklist.requiredFlows.map((flow) => flow.id), ['manual_order', 'package_redemption', 'daily_close'])
  assert.equal(packet.ownerPrivateBaselineChecklist.requiredFlows[0].requiredUninterruptedRuns, 3)
  assert.equal(packet.ownerPrivateBaselineChecklist.requiredFlows[0].accepted, false)
  assert.equal(packet.ownerPrivateBaselineChecklist.requiredFlows[2].requiredUninterruptedRuns, 3)
  assert.equal(packet.ownerPrivateBaselineChecklist.requiredFlows[2].accepted, false)
  assert.ok(packet.ownerPrivateBaselineChecklist.requiredMetrics.includes('daily_close_minutes'))
  assert.ok(packet.ownerPrivateBaselineChecklist.requiredConfirmations.includes('no_external_effects'))
  assert.equal(packet.ownerPrivateBaselineChecklist.promotionEvidenceRequirement.requiredAcceptedConsecutiveRuns, 20)
  assert.deepEqual(packet.ownerPrivateBaselineChecklist.promotionEvidenceRequirement.requiredPilotDayIndexes, [1, 2, 3, 4, 5])
  assert.equal(packet.ownerPrivateBaselineChecklist.promotionEvidenceRequirement.requiredPilotCalendarDates, 5)
  assert.ok(packet.ownerPrivateBaselineChecklist.stopConditions.includes('fewer_than_three_uninterrupted_daily_close_runs'))
  assert.ok(packet.ownerPrivateBaselineChecklist.stopConditions.includes('raw_identity_or_private_note_would_enter_owner_safe_packet'))
  assert.equal(packet.ownerPrivateBaselineChecklist.publicOutputAllowed.rawIdentity, false)
  assert.equal(packet.ownerPrivateBaselineChecklist.publicOutputAllowed.rawNotes, false)
  assert.equal(packet.ownerPrivateBaselineChecklist.publicOutputAllowed.localPaths, false)
  assert.equal(packet.ownerPrivateBaselineChecklist.publicOutputAllowed.credentials, false)
  assert.equal(packet.ownerPrivateBaselineChecklist.forbiddenActions.customerContactAllowed, false)
  assert.ok(packet.privateCommands.some((command) => command.includes('--worksheet-output "<private-baseline-worksheet.md>"')))
  assert.ok(packet.privateCommands.some((command) => command.includes('--lint-input "<private-baseline-input.json>"')))
  assert.ok(packet.privateCommands.some((command) => command.includes('--output "<owner-safe-launch-gate-report.json>"')))
  assert.ok(packet.privateCommands.some((command) => command.includes('--verify-report "<owner-safe-launch-gate-report.json>"')))
  assert.ok(packet.privateCommands.some((command) => command.includes('--launch-gate-report "<owner-safe-launch-gate-report.json>"') && command.includes('--release-handoff "<release-handoff.json>"') && command.includes('--github-protection-snapshot "<github-protection-snapshot.json>"')))
  assert.equal(validateShopPilotDay0ReadinessPacket(packet), packet)
})

test('accepts intake-only state while requiring owner-observed baseline', () => {
  const intakePacket = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  const packet = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ intakePacket })),
  }))
  assert.equal(packet.status, 'blocked_owner_observed_baseline_required')
  assert.equal(packet.day0Readiness.intakePacketAccepted, true)
  assert.equal(packet.day0Readiness.baselinePacketAccepted, false)
  assert.equal(packet.nextOwnerPrivateStep.id, 'capture-owner-observed-baseline')
  assert.equal(packet.nextOwnerPrivateStep.completionSignal, 'public_safe_baseline_packet_digest')
  assert.deepEqual(packet.nextOwnerPrivateStep.requiredPrivateInputs, ['manual_order_runs', 'package_redemption_runs', 'daily_close_runs', 'daily_close_minutes', 'exception_count'])
  assert.match(packet.ownerAction, /three daily-close runs/)
  assert.equal(packet.ownerPrivateObservationBridge.expectedCurrentGate, 'private_observation_incomplete')
  assert.equal(packet.ownerPrivateObservationBridge.completionSignal, 'public_safe_baseline_packet_digest')
  assert.ok(packet.blockers.includes('owner_observed_baseline_packet_missing'))
  assert.equal(validateShopPilotDay0ReadinessPacket(packet), packet)
})

test('carries owner-private preparation digests without paths or authority', () => {
  const intakePacket = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  const packet = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ intakePacket })),
    ownerPrivatePreparation: {
      baselineInputTemplateDigest: `sha256:${'a'.repeat(64)}`,
      baselineInputTemplateBlank: true,
      baselineWorksheetDigest: `sha256:${'b'.repeat(64)}`,
      baselineWorksheetBlank: true,
    },
  }))
  assert.equal(packet.ownerPrivatePreparation.artifactPolicy, 'digests_only_no_paths')
  assert.equal(packet.ownerPrivatePreparation.baselineInputTemplate.provided, true)
  assert.equal(packet.ownerPrivatePreparation.baselineInputTemplate.blankTemplate, true)
  assert.equal(packet.ownerPrivatePreparation.baselineWorksheet.provided, true)
  assert.equal(packet.ownerPrivatePreparation.baselineWorksheet.blankWorksheet, true)
  assert.equal(packet.ownerPrivatePreparation.acceptedIntakePacketDigest, intakePacket.digest)
  assert.equal(packet.ownerPrivatePreparation.outputPolicy.localPathsIncluded, false)
  assert.equal(packet.ownerPrivatePreparation.outputPolicy.externalEffectsAllowed, false)
  const markdown = renderShopPilotDay0ReadinessMarkdown(packet)
  assert.match(markdown, /Artifact policy: digests_only_no_paths/)
  assert.match(markdown, /daily-close runs/)
  assert.match(markdown, /Baseline input template digest: sha256:a{64}/)
  assert.match(markdown, /Required promotion evidence: 20 consecutive accepted real runs covering pilot days 1, 2, 3, 4, 5 and at least 5 distinct observed calendar dates/)
  assert.match(markdown, /Calendar-date coverage met: false/)
  assert.match(markdown, /Synthetic evidence accepted: false/)
  assert.doesNotMatch(markdown, /[A-Za-z]:\\/)
  assert.equal(validateShopPilotDay0ReadinessPacket(packet), packet)
})

test('accepts baseline plus intake as owner-private handoff only', () => {
  const baselinePacket = buildShopPilotBaselinePacket(baselineInput(), { generatedAt: '2026-08-25T00:00:00.000Z' })
  const intakePacket = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  const packet = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    launchGateReport: assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ baselinePacket, intakePacket })),
  }))
  assert.equal(packet.status, 'day0_owner_private_handoff_ready')
  assert.equal(packet.day0ReadyForOwnerPrivateHandoff, true)
  assert.equal(packet.day0Readiness.baselinePacketAccepted, true)
  assert.equal(packet.day0Readiness.intakePacketAccepted, true)
  assert.equal(packet.day0Readiness.medianMinutesPerOrder, 8)
  assert.equal(packet.nextOwnerPrivateStep.id, 'prepare-day-one-private-handoff')
  assert.equal(packet.nextOwnerPrivateStep.releaseGateStillRequiredBeforePilotActivation, true)
  assert.equal(packet.nextOwnerPrivateStep.customerContactAllowed, false)
  assert.equal(packet.day0Readiness.readyForManagedActivation, false)
  assert.equal(packet.ownerPrivateBaselineChecklist.state, 'baseline_public_packet_accepted')
  assert.equal(packet.ownerPrivateBaselineChecklist.readyToGeneratePublicBaselinePacket, true)
  assert.equal(packet.ownerPrivateBaselineChecklist.requiredFlows[0].uninterruptedRuns, 3)
  assert.equal(packet.ownerPrivateBaselineChecklist.requiredFlows[0].accepted, true)
  assert.equal(packet.ownerPrivateBaselineChecklist.requiredFlows[1].uninterruptedRuns, 3)
  assert.equal(packet.ownerPrivateBaselineChecklist.requiredFlows[1].accepted, true)
  assert.equal(packet.ownerPrivateBaselineChecklist.requiredFlows[2].uninterruptedRuns, 3)
  assert.equal(packet.ownerPrivateBaselineChecklist.requiredFlows[2].accepted, true)
  assert.equal(packet.sourceDigests.baselinePacketDigest, baselinePacket.digest)
  assert.equal(packet.sourceDigests.intakePacketDigest, intakePacket.digest)
  assert.equal(packet.ownerPrivateObservationBridge.state, 'day0_private_handoff_ready')
  assert.equal(packet.ownerPrivateObservationBridge.allowedNow, 'owner_private_handoff_preparation_only')
  assert.equal(packet.ownerPrivateObservationBridge.expectedCurrentGate, null)
  assert.equal(validateShopPilotDay0ReadinessPacket(packet), packet)
})

test('carries launch-gate failures as blocked Day-0 state', () => {
  const failedLaunchGate = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    gitState: { ...sampleShopPilotLaunchGateInput().gitState, clean: false },
  }))
  const packet = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({ launchGateReport: failedLaunchGate }))
  assert.equal(packet.ok, false)
  assert.equal(packet.status, 'blocked_launch_gate_failed')
  assert.equal(packet.nextOwnerPrivateStep.id, 'fix-launch-gate-evidence')
  assert.equal(packet.nextOwnerPrivateStep.safeBeforeReleaseGate, false)
  assert.equal(packet.ownerPrivateObservationBridge.state, 'blocked_until_launch_gate_clean')
  assert.equal(packet.ownerPrivateObservationBridge.allowedNow, 'none_until_launch_gate_clean')
  assert.ok(packet.blockers.includes('shop_pilot_launch_gate_worktree_dirty'))
  assert.equal(packet.controls.externalEffectsAllowed, false)
  assert.equal(validateShopPilotDay0ReadinessPacket(packet), packet)
})

test('rejects private identity and tampered packets', () => {
  const packet = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput())
  assert.throws(
    () => validateShopPilotDay0ReadinessPacket({ ...packet, status: 'day0_owner_private_handoff_ready' }),
    /shop_pilot_day0_digest_invalid/,
  )

  const launchGateReport = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput())
  assert.throws(
    () => buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
      launchGateReport: {
        ...launchGateReport,
        ownerEmail: 'owner@example.invalid',
      },
    })),
    /shop_pilot_day0_private_or_secret_shape/,
  )

  assert.throws(
    () => buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
      ownerPrivatePreparation: {
        baselineInputTemplateDigest: `sha256:${'a'.repeat(64)}`,
        localPath: 'C:\\Users\\owner\\private-baseline-input.json',
      },
    })),
    /shop_pilot_day0_private_or_secret_shape/,
  )

  assert.throws(
    () => validateShopPilotDay0ReadinessPacket({
      ...packet,
      ownerPrivateObservationBridge: {
        ...packet.ownerPrivateObservationBridge,
        workspaceLabel: 'C:\\Users\\owner\\private-shop-pilots\\run-001-private',
      },
    }),
    /shop_pilot_day0_private_or_secret_shape/,
  )

  const nonBlankWorksheetPacket = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({
    ownerPrivatePreparation: {
      baselineWorksheetDigest: `sha256:${'c'.repeat(64)}`,
      baselineWorksheetBlank: false,
    },
  }))
  assert.throws(
    () => validateShopPilotDay0ReadinessPacket(nonBlankWorksheetPacket),
    /shop_pilot_day0_owner_private_preparation_invalid/,
  )
})

test('renders Markdown and verifies CLI packet without private values', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-day0-'))
  try {
    const packetPath = join(parent, 'day0.json')
    const markdownPath = join(parent, 'day0.md')
    const filledWorksheetPath = join(parent, 'filled-baseline-worksheet.md')
    const launchGateReportPath = join(parent, 'launch-gate-report.json')
    const generatedFromReportPath = join(parent, 'day0-from-launch-gate.json')
    const packet = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput())
    const launchGateReport = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput())
    await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`)
    await writeFile(markdownPath, `${renderShopPilotDay0ReadinessMarkdown(packet)}\n`)
    await writeFile(filledWorksheetPath, `${renderShopPilotBaselineWorksheetMarkdown().replace('| weeklyOrders | integer | Current weekly order volume. |', '| weeklyOrders | 120 | Current weekly order volume. |')}\n`)
    await writeFile(launchGateReportPath, `${JSON.stringify(launchGateReport, null, 2)}\n`)
    const verified = spawnSync(process.execPath, [resolve('tools/prepare_shop_pilot_day0_readiness_packet.mjs'), '--verify', packetPath], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr)
    assert.equal(JSON.parse(verified.stdout).status, 'blocked_owner_baseline_and_intake_required')
    const fromSavedLaunchGate = spawnSync(process.execPath, [
      resolve('tools/prepare_shop_pilot_day0_readiness_packet.mjs'),
      '--launch-gate-report',
      launchGateReportPath,
      '--output',
      generatedFromReportPath,
    ], { encoding: 'utf8' })
    assert.equal(fromSavedLaunchGate.status, 0, fromSavedLaunchGate.stderr)
    const generatedFromSavedReport = JSON.parse(await readFile(generatedFromReportPath, 'utf8'))
    assert.equal(generatedFromSavedReport.sourceDigests.launchGateDigest, launchGateReport.digest)
    assert.equal(generatedFromSavedReport.status, 'blocked_owner_baseline_and_intake_required')
    assert.equal(validateShopPilotDay0ReadinessPacket(generatedFromSavedReport), generatedFromSavedReport)
    const rejected = spawnSync(process.execPath, [
      resolve('tools/prepare_shop_pilot_day0_readiness_packet.mjs'),
      '--baseline-worksheet',
      filledWorksheetPath,
    ], { encoding: 'utf8' })
    assert.notEqual(rejected.status, 0)
    assert.match(rejected.stderr, /shop_pilot_day0_baseline_worksheet_not_blank/)
    const markdown = await readFile(markdownPath, 'utf8')
    assert.match(markdown, /Next owner-private step/)
    assert.match(markdown, /Owner-private prep artifacts/)
    assert.match(markdown, /Private Run001 observation bridge/)
    assert.match(markdown, /Owner-private baseline capture checklist/)
    assert.match(markdown, /raw_identity_or_private_note_would_enter_owner_safe_packet/)
    assert.match(markdown, /Ready to generate owner-safe baseline packet: false/)
    assert.match(markdown, /Owner-safe baseline metrics/)
    assert.doesNotMatch(markdown, /public baseline packet|Public-safe baseline metrics|raw_identity_or_private_note_would_enter_public_packet/)
    assert.match(markdown, /Required observed flows/)
    assert.match(markdown, /capture-baseline-then-intake/)
    assert.match(markdown, /complete-run-001-after-observation\.ps1/)
    assert.match(markdown, /private_observation_incomplete/)
    assert.match(markdown, /--worksheet-output "<private-baseline-worksheet\.md>"/)
    assert.match(markdown, /--lint-input "<private-baseline-input\.json>"/)
    assert.match(markdown, /--output "<owner-safe-launch-gate-report\.json>"/)
    assert.match(markdown, /--verify-report "<owner-safe-launch-gate-report\.json>"/)
    assert.match(markdown, /--launch-gate-report "<owner-safe-launch-gate-report\.json>"/)
    assert.match(markdown, /--release-handoff "<release-handoff\.json>"/)
    assert.match(markdown, /--github-protection-snapshot "<github-protection-snapshot\.json>"/)
    assert.doesNotMatch(markdown, /Private Day Zero Spa|Private Day Zero Operator|owner@example|ready for managed activation|[A-Za-z]:\\/i)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
