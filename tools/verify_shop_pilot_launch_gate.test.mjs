import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  SHOP_PILOT_BASELINE_INPUT_CONTRACT,
  buildShopPilotBaselinePacket,
} from './prepare_shop_pilot_baseline_packet.mjs'
import {
  buildShopPilotPrivateIntakePacket,
  sampleShopPilotPrivateIntakeInput,
} from './prepare_shop_pilot_private_intake_packet.mjs'
import {
  SHOP_PILOT_LAUNCH_GATE_CONTRACT,
  assessShopPilotLaunchGate,
  sampleShopPilotLaunchGateInput,
  validateShopPilotLaunchGate,
} from './verify_shop_pilot_launch_gate.mjs'

function baselineInput(overrides = {}) {
  return {
    contract: SHOP_PILOT_BASELINE_INPUT_CONTRACT,
    product: 'shop',
    pilotMode: 'owner_named',
    verticalPack: 'spa-services',
    observedAt: '2026-08-25T08:00:00.000Z',
    businessName: 'Private Spa Sample',
    namedOperator: 'Private Operator',
    operatorRole: 'Shop manager',
    founderObserver: 'Founder',
    observationPlace: 'Private shop floor',
    processSummary: 'Owner records package sale and redemption in a notebook, then closes the day manually.',
    processStartsAt: 'Client asks for a prepaid package',
    processEndsAt: 'Payment reconciled, treatment completed, balance updated, and book closed',
    correctionPath: 'Owner crosses out the wrong entry and writes a correction beside the original record',
    recordSystem: 'Notebook and phone gallery',
    observedOrderRuns: [
      { runId: 'order-run-001', observedAt: '2026-08-25T08:01:00.000Z', startedWhen: 'client request began', endedWhen: 'manual book entry completed', durationMinutes: 7, interrupted: false, errorOccurred: false, errorCostLabel: null },
      { runId: 'order-run-002', observedAt: '2026-08-25T08:20:00.000Z', startedWhen: 'client request began', endedWhen: 'manual book entry completed', durationMinutes: 8, interrupted: false, errorOccurred: true, errorCostLabel: 'one correction before final balance' },
      { runId: 'order-run-003', observedAt: '2026-08-25T08:40:00.000Z', startedWhen: 'client request began', endedWhen: 'manual book entry completed', durationMinutes: 9, interrupted: false, errorOccurred: false, errorCostLabel: null },
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
    ...overrides,
  }
}

test('passes only as owner-private-intake readiness, not contact or activation readiness', () => {
  const report = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput())
  assert.equal(report.contract, SHOP_PILOT_LAUNCH_GATE_CONTRACT)
  assert.equal(report.ok, true)
  assert.equal(report.status, 'owner_private_intake_required')
  assert.equal(report.launchReadiness.authority, 'owner_private_intake_only')
  assert.equal(report.launchReadiness.baselinePacketAccepted, false)
  assert.equal(report.launchReadiness.intakePacketAccepted, false)
  assert.equal(report.launchReadiness.privateWorkspaceMayBePreparedAfterOwnerInput, true)
  assert.equal(report.launchReadiness.readyForCustomerContact, false)
  assert.equal(report.launchReadiness.readyForPayment, false)
  assert.equal(report.launchReadiness.readyForDeployment, false)
  assert.equal(report.launchReadiness.readyForManagedActivation, false)
  assert.equal(report.launchReadiness.readyForPromotionEvidence, false)
  assert.equal(report.launchReadiness.promotionEvidenceRequiredAcceptedRuns, 20)
  assert.equal(report.launchReadiness.promotionEvidenceAcceptedRuns, 0)
  assert.deepEqual(report.launchReadiness.promotionEvidenceRequiredPilotDayIndexes, [1, 2, 3, 4, 5])
  assert.deepEqual(report.launchReadiness.promotionEvidenceAcceptedPilotDayIndexes, [])
  assert.equal(report.launchReadiness.promotionEvidencePilotSequenceCoverageMet, false)
  assert.equal(report.launchReadiness.promotionEvidenceRequiredPilotCalendarDates, 5)
  assert.equal(report.launchReadiness.promotionEvidenceAcceptedObservedDateCount, 0)
  assert.deepEqual(report.launchReadiness.promotionEvidenceAcceptedObservedDates, [])
  assert.equal(report.launchReadiness.promotionEvidencePilotCalendarCoverageMet, false)
  assert.deepEqual(report.readiness.requiredPilotDayIndexes, [1, 2, 3, 4, 5])
  assert.deepEqual(report.readiness.acceptedConsecutivePilotDayIndexes, [])
  assert.equal(report.readiness.pilotSequenceCoverageMet, false)
  assert.deepEqual(report.products.customerProducts, ['shop', 'plant', 'website', 'ecommerce'])
  assert.equal(report.publicBoundary.participantIdentityPresent, false)
  assert.equal(validateShopPilotLaunchGate(report), report)
})

test('accepts a public-safe baseline packet only as private handoff evidence', () => {
  const baselinePacket = buildShopPilotBaselinePacket(baselineInput(), { generatedAt: '2026-08-25T00:00:00.000Z' })
  const report = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ baselinePacket }))
  assert.equal(report.ok, true)
  assert.equal(report.status, 'owner_private_baseline_ready')
  assert.equal(report.launchReadiness.authority, 'owner_private_intake_and_baseline_ready')
  assert.equal(report.launchReadiness.baselinePacketAccepted, true)
  assert.equal(report.launchReadiness.readyForCustomerContact, false)
  assert.equal(report.launchReadiness.readyForDeployment, false)
  assert.equal(report.baselineEvidence.accepted, true)
  assert.equal(report.baselineEvidence.digest, baselinePacket.digest)
  assert.equal(report.baselineEvidence.metrics.medianMinutesPerOrder, 8)
  assert.equal(report.baselineEvidence.metrics.uninterruptedCloseRunCount, 3)
  assert.equal(report.baselineEvidence.metrics.requiredCloseCalendarDateCount, 3)
  assert.equal(report.baselineEvidence.metrics.uninterruptedCloseCalendarDateCount, 3)
  assert.equal(report.baselineEvidence.metrics.medianCloseMinutesPerDay, 45)
  assert.equal(JSON.stringify(report).includes('Private Spa Sample'), false)
  assert.equal(JSON.stringify(report).includes('Private Operator'), false)
  assert.equal(validateShopPilotLaunchGate(report), report)
})

test('accepts a public-safe intake packet while still requiring baseline and external gates', () => {
  const intakePacket = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  const report = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ intakePacket }))
  assert.equal(report.ok, true)
  assert.equal(report.status, 'owner_private_intake_ready')
  assert.equal(report.launchReadiness.authority, 'owner_private_intake_ready_baseline_required')
  assert.equal(report.launchReadiness.baselinePacketAccepted, false)
  assert.equal(report.launchReadiness.intakePacketAccepted, true)
  assert.equal(report.launchReadiness.readyForCustomerContact, false)
  assert.equal(report.launchReadiness.readyForDeployment, false)
  assert.equal(report.intakeEvidence.accepted, true)
  assert.equal(report.intakeEvidence.digest, intakePacket.digest)
  assert.equal(validateShopPilotLaunchGate(report), report)
})

test('accepts baseline plus intake only as private handoff readiness', () => {
  const baselinePacket = buildShopPilotBaselinePacket(baselineInput(), { generatedAt: '2026-08-25T00:00:00.000Z' })
  const intakePacket = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  const report = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ baselinePacket, intakePacket }))
  assert.equal(report.ok, true)
  assert.equal(report.status, 'owner_private_handoff_ready')
  assert.equal(report.launchReadiness.authority, 'owner_private_baseline_and_intake_ready')
  assert.equal(report.launchReadiness.baselinePacketAccepted, true)
  assert.equal(report.launchReadiness.intakePacketAccepted, true)
  assert.equal(report.launchReadiness.readyForCustomerContact, false)
  assert.equal(report.launchReadiness.readyForPayment, false)
  assert.equal(report.launchReadiness.readyForDeployment, false)
  assert.equal(report.launchReadiness.readyForManagedActivation, false)
  assert.equal(report.requiredNextGates.find((gate) => gate.id === 'owner_private_baseline').status, 'satisfied_private_digest_only')
  assert.equal(report.requiredNextGates.find((gate) => gate.id === 'owner_private_intake').status, 'satisfied_private_digest_only')
  assert.equal(validateShopPilotLaunchGate(report), report)
})

test('fails closed for blocked or tampered baseline packets', () => {
  const blockedPacket = buildShopPilotBaselinePacket(baselineInput({
    claimedMedianMinutesPerOrder: 11,
  }), { generatedAt: '2026-08-25T00:00:00.000Z' })
  const blocked = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({ baselinePacket: blockedPacket }))
  assert.equal(blocked.ok, false)
  assert.ok(blocked.failures.includes('shop_pilot_launch_gate_baseline_packet_not_ready'))

  const validPacket = buildShopPilotBaselinePacket(baselineInput(), { generatedAt: '2026-08-25T00:00:00.000Z' })
  const tampered = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    baselinePacket: { ...validPacket, publicIdentityIncluded: true },
  }))
  assert.equal(tampered.ok, false)
  assert.ok(tampered.failures.some((failure) => failure.startsWith('shop_pilot_launch_gate_baseline_packet_invalid')))
})

test('fails closed for tampered intake packets', () => {
  const intakePacket = buildShopPilotPrivateIntakePacket(sampleShopPilotPrivateIntakeInput())
  const tampered = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    intakePacket: {
      ...intakePacket,
      controls: { ...intakePacket.controls, customerContactAllowed: true },
    },
  }))
  assert.equal(tampered.ok, false)
  assert.ok(tampered.failures.some((failure) => failure.startsWith('shop_pilot_launch_gate_intake_packet_invalid')))
})


test('fails closed for dirty worktree and missing launch scripts', () => {
  const dirty = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    gitState: { ...sampleShopPilotLaunchGateInput().gitState, clean: false },
  }))
  assert.equal(dirty.ok, false)
  assert.ok(dirty.failures.includes('shop_pilot_launch_gate_worktree_dirty'))

  const missingScriptInput = sampleShopPilotLaunchGateInput()
  delete missingScriptInput.packageManifest.scripts['shop:pilot:launch-gate']
  const missingGenerateScript = assessShopPilotLaunchGate(missingScriptInput)
  assert.equal(missingGenerateScript.ok, false)
  assert.ok(missingGenerateScript.failures.includes('shop_pilot_launch_gate_script_missing:shop:pilot:launch-gate'))

  missingScriptInput.packageManifest.scripts['shop:pilot:launch-gate'] = 'node tools/verify_shop_pilot_launch_gate.mjs'
  delete missingScriptInput.packageManifest.scripts['shop:pilot:launch-gate:verify']
  const missingScript = assessShopPilotLaunchGate(missingScriptInput)
  assert.equal(missingScript.ok, false)
  assert.ok(missingScript.failures.includes('shop_pilot_launch_gate_script_missing:shop:pilot:launch-gate:verify'))

  const missingAtomicBaseline = sampleShopPilotLaunchGateInput()
  delete missingAtomicBaseline.packageManifest.scripts['shop:pilot:baseline-complete:self-test']
  const missingAtomicBaselineReport = assessShopPilotLaunchGate(missingAtomicBaseline)
  assert.equal(missingAtomicBaselineReport.ok, false)
  assert.ok(missingAtomicBaselineReport.failures.includes('shop_pilot_launch_gate_script_missing:shop:pilot:baseline-complete:self-test'))
})

test('rejects synthetic, public-identity, and accepted-run promotion claims', () => {
  const synthetic = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    readiness: {
      ...sampleShopPilotLaunchGateInput().readiness,
      pilotEvidence: { ...sampleShopPilotLaunchGateInput().readiness.pilotEvidence, syntheticEvidenceAccepted: true },
    },
  }))
  assert.equal(synthetic.ok, false)
  assert.ok(synthetic.failures.includes('shop_pilot_launch_gate_pilot_evidence_state_invalid'))

  const publicIdentity = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    readiness: {
      ...sampleShopPilotLaunchGateInput().readiness,
      pilotEvidence: { ...sampleShopPilotLaunchGateInput().readiness.pilotEvidence, publicIdentityAllowed: true },
    },
  }))
  assert.equal(publicIdentity.ok, false)
  assert.ok(publicIdentity.failures.includes('shop_pilot_launch_gate_pilot_evidence_state_invalid'))

  const acceptedRun = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    readiness: {
      ...sampleShopPilotLaunchGateInput().readiness,
      pilotEvidence: { ...sampleShopPilotLaunchGateInput().readiness.pilotEvidence, acceptedConsecutiveRuns: 1 },
    },
  }))
  assert.equal(acceptedRun.ok, false)
  assert.ok(acceptedRun.failures.includes('shop_pilot_launch_gate_pilot_evidence_state_invalid'))

  const prematureSequence = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    readiness: {
      ...sampleShopPilotLaunchGateInput().readiness,
      pilotEvidence: {
        ...sampleShopPilotLaunchGateInput().readiness.pilotEvidence,
        acceptedConsecutivePilotDayIndexes: [1, 2, 3, 4, 5],
        pilotSequenceCoverageMet: true,
      },
    },
  }))
  assert.equal(prematureSequence.ok, false)
  assert.ok(prematureSequence.failures.includes('shop_pilot_launch_gate_pilot_evidence_state_invalid'))

  const prematureCalendarCoverage = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    readiness: {
      ...sampleShopPilotLaunchGateInput().readiness,
      pilotEvidence: {
        ...sampleShopPilotLaunchGateInput().readiness.pilotEvidence,
        acceptedConsecutiveObservedDateCount: 5,
        acceptedConsecutiveObservedDates: ['2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29'],
        pilotCalendarCoverageMet: true,
      },
    },
  }))
  assert.equal(prematureCalendarCoverage.ok, false)
  assert.ok(prematureCalendarCoverage.failures.includes('shop_pilot_launch_gate_pilot_evidence_state_invalid'))
})

test('rejects unsafe public boundary controls and customer contact states', () => {
  const boundaryInput = sampleShopPilotLaunchGateInput()
  const unsafeBoundary = assessShopPilotLaunchGate({
    ...boundaryInput,
    publicBoundary: {
      ...boundaryInput.publicBoundary,
      controls: { ...boundaryInput.publicBoundary.controls, automaticSendAllowed: true },
    },
  })
  assert.equal(unsafeBoundary.ok, false)
  assert.ok(unsafeBoundary.failures.some((failure) => failure.startsWith('shop_pilot_launch_gate_public_boundary_invalid')))

  const unsafeVerification = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    publicBoundaryVerification: {
      ...sampleShopPilotLaunchGateInput().publicBoundaryVerification,
      customerContactPerformed: true,
    },
  }))
  assert.equal(unsafeVerification.ok, false)
  assert.ok(unsafeVerification.failures.includes('shop_pilot_launch_gate_public_boundary_file_invalid'))
})

test('rejects tampered reports', () => {
  const report = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput())
  assert.throws(
    () => validateShopPilotLaunchGate({ ...report, status: 'ready_to_contact' }),
    /shop_pilot_launch_gate_digest_invalid/,
  )
  assert.throws(
    () => validateShopPilotLaunchGate({ ...report, digest: `sha256:${'f'.repeat(64)}` }),
    /shop_pilot_launch_gate_digest_invalid/,
  )
})

test('verifies a saved full launch-gate report without exposing private details', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-launch-gate-'))
  try {
    const reportPath = join(parent, 'launch-gate-report.json')
    const tamperedPath = join(parent, 'tampered-launch-gate-report.json')
    const report = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput())
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    await writeFile(tamperedPath, `${JSON.stringify({ ...report, status: 'ready_to_contact' }, null, 2)}\n`)

    const verified = spawnSync(process.execPath, [
      resolve('tools/verify_shop_pilot_launch_gate.mjs'),
      '--verify-report',
      reportPath,
    ], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr)
    const summary = JSON.parse(verified.stdout)
    assert.equal(summary.ok, true)
    assert.equal(summary.contract, SHOP_PILOT_LAUNCH_GATE_CONTRACT)
    assert.equal(summary.digest, report.digest)
    assert.equal(summary.externalWritesPerformed, false)

    const rejected = spawnSync(process.execPath, [
      resolve('tools/verify_shop_pilot_launch_gate.mjs'),
      '--verify-report',
      tamperedPath,
    ], { encoding: 'utf8' })
    assert.notEqual(rejected.status, 0)
    assert.match(rejected.stderr, /shop_pilot_launch_gate_digest_invalid/)
    assert.doesNotMatch(await readFile(reportPath, 'utf8'), /Private Spa Sample|Private Operator/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
