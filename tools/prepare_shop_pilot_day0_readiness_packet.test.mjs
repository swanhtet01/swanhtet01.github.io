import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
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
  assert.equal(packet.controls.githubWritesAllowed, false)
  assert.equal(packet.controls.supabaseWritesAllowed, false)
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
  assert.ok(packet.blockers.includes('owner_observed_baseline_packet_missing'))
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
  assert.equal(packet.day0Readiness.readyForManagedActivation, false)
  assert.equal(packet.sourceDigests.baselinePacketDigest, baselinePacket.digest)
  assert.equal(packet.sourceDigests.intakePacketDigest, intakePacket.digest)
  assert.equal(validateShopPilotDay0ReadinessPacket(packet), packet)
})

test('carries launch-gate failures as blocked Day-0 state', () => {
  const failedLaunchGate = assessShopPilotLaunchGate(sampleShopPilotLaunchGateInput({
    gitState: { ...sampleShopPilotLaunchGateInput().gitState, clean: false },
  }))
  const packet = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput({ launchGateReport: failedLaunchGate }))
  assert.equal(packet.ok, false)
  assert.equal(packet.status, 'blocked_launch_gate_failed')
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
})

test('renders Markdown and verifies CLI packet without private values', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-day0-'))
  try {
    const packetPath = join(parent, 'day0.json')
    const markdownPath = join(parent, 'day0.md')
    const packet = buildShopPilotDay0ReadinessPacket(sampleShopPilotDay0ReadinessInput())
    await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`)
    await writeFile(markdownPath, `${renderShopPilotDay0ReadinessMarkdown(packet)}\n`)
    const verified = spawnSync(process.execPath, [resolve('tools/prepare_shop_pilot_day0_readiness_packet.mjs'), '--verify', packetPath], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr)
    assert.equal(JSON.parse(verified.stdout).status, 'blocked_owner_baseline_and_intake_required')
    assert.doesNotMatch(await readFile(markdownPath, 'utf8'), /Private Day Zero Spa|Private Day Zero Operator|owner@example|ready for managed activation/i)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
