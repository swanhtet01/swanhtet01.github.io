import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  SHOP_PILOT_BASELINE_INPUT_CONTRACT,
  SHOP_PILOT_BASELINE_INPUT_PREFLIGHT_CONTRACT,
  SHOP_PILOT_BASELINE_PACKET_CONTRACT,
  SHOP_PILOT_BASELINE_WORKSHEET_CONTRACT,
  baselineInputTemplate,
  buildShopPilotBaselinePacket,
  preflightShopPilotBaselineInput,
  renderShopPilotBaselinePacketMarkdown,
  renderShopPilotBaselineWorksheetMarkdown,
  validateShopPilotBaselineInputPreflight,
  validateShopPilotBaselinePacket,
} from './prepare_shop_pilot_baseline_packet.mjs'

function input(overrides = {}) {
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

test('builds a public-safe baseline packet from private owner-observed input', () => {
  const packet = buildShopPilotBaselinePacket(input(), { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(packet.contract, SHOP_PILOT_BASELINE_PACKET_CONTRACT)
  assert.equal(packet.status, 'baseline_ready_for_private_pilot_handoff')
  assert.equal(packet.ok, true)
  assert.equal(packet.metrics.observedOrderRunCount, 3)
  assert.equal(packet.metrics.uninterruptedOrderRunCount, 3)
  assert.equal(packet.metrics.medianMinutesPerOrder, 8)
  assert.equal(packet.metrics.observedOrderErrorRunCount, 1)
  assert.equal(packet.metrics.totalObservedErrorRunCount, 1)
  assert.equal(packet.metrics.medianMinutesPerRedemption, 3)
  assert.equal(packet.metrics.observedRedemptionErrorRunCount, 0)
  assert.equal(packet.metrics.uninterruptedCloseRunCount, 3)
  assert.equal(packet.metrics.requiredCloseCalendarDateCount, 3)
  assert.equal(packet.metrics.uninterruptedCloseCalendarDateCount, 3)
  assert.equal(packet.metrics.medianCloseMinutesPerDay, 45)
  assert.equal(packet.metrics.observedCloseErrorRunCount, 0)
  assert.equal(packet.publicIdentityIncluded, false)
  assert.equal(packet.controls.externalWritesPerformed, false)
  assert.equal(validateShopPilotBaselinePacket(packet), packet)
  assert.doesNotMatch(JSON.stringify(packet), /Private Spa Sample|Private Operator|client request began|Notebook/i)
})

test('blocks mismatched medians, interrupted evidence, and wrong review window without leaking identity', () => {
  const interruptedRuns = input({
    claimedMedianMinutesPerOrder: 7,
    closeMinutesPerDay: 44,
    reviewDate: '2026-09-05',
    observedOrderRuns: [
      ...input().observedOrderRuns.slice(0, 2),
      { ...input().observedOrderRuns[2], interrupted: true },
    ],
    observedCloseRuns: [
      ...input().observedCloseRuns.slice(0, 2),
      { ...input().observedCloseRuns[2], interrupted: true },
    ],
  })
  const packet = buildShopPilotBaselinePacket(interruptedRuns, { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(packet.ok, false)
  assert.equal(packet.status, 'blocked_collect_more_private_baseline')
  assert.ok(packet.failures.includes('order_observed_runs_below_three'))
  assert.ok(packet.failures.includes('close_observed_runs_below_three'))
  assert.ok(packet.failures.includes('claimed_order_median_mismatch'))
  assert.ok(packet.failures.includes('claimed_close_median_mismatch'))
  assert.ok(packet.failures.includes('review_date_must_close_five_day_plan'))
  assert.doesNotMatch(JSON.stringify(packet), /Private Spa Sample|Private Operator/)
  assert.equal(validateShopPilotBaselinePacket(packet), packet)
})

test('blocks same-day daily-close baseline evidence without leaking identity', () => {
  const packet = buildShopPilotBaselinePacket(input({
    observedCloseRuns: input().observedCloseRuns.map((run, index) => ({
      ...run,
      observedAt: `2026-08-25T18:${String(index + 1).padStart(2, '0')}:00.000Z`,
    })),
  }), { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(packet.ok, false)
  assert.equal(packet.status, 'blocked_collect_more_private_baseline')
  assert.equal(packet.metrics.uninterruptedCloseRunCount, 3)
  assert.equal(packet.metrics.requiredCloseCalendarDateCount, 3)
  assert.equal(packet.metrics.uninterruptedCloseCalendarDateCount, 1)
  assert.ok(packet.failures.includes('close_observed_calendar_dates_below_three'))
  assert.doesNotMatch(JSON.stringify(packet), /Private Spa Sample|Private Operator/)
  assert.equal(validateShopPilotBaselinePacket(packet), packet)
})

test('rejects duplicate baseline run ids across streams without leaking private labels', () => {
  const duplicateAcrossStreams = input({
    observedRedemptionRuns: [
      { ...input().observedRedemptionRuns[0], runId: 'order-run-001' },
      ...input().observedRedemptionRuns.slice(1),
    ],
  })
  assert.throws(
    () => buildShopPilotBaselinePacket(duplicateAcrossStreams, { generatedAt: '2026-08-25T00:00:00.000Z' }),
    /shop_pilot_baseline_run_id_duplicate_across_streams/,
  )
  const preflight = preflightShopPilotBaselineInput(duplicateAcrossStreams, { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(preflight.status, 'baseline_input_invalid')
  assert.equal(preflight.safeToGeneratePublicBaselinePacket, false)
  assert.deepEqual(preflight.failures, ['shop_pilot_baseline_run_id_duplicate_across_streams'])
  assert.doesNotMatch(JSON.stringify(preflight), /order-run-001|Private Spa Sample|Private Operator/)
  assert.equal(validateShopPilotBaselineInputPreflight(preflight), preflight)
})

test('blocks baseline evidence dated after packet day or on the pilot start date', () => {
  const futureDated = buildShopPilotBaselinePacket(input({
    observedAt: '2026-08-26T08:00:00.000Z',
    observedOrderRuns: input().observedOrderRuns.map((run) => ({ ...run, observedAt: '2026-08-26T08:01:00.000Z' })),
    observedRedemptionRuns: input().observedRedemptionRuns.map((run) => ({ ...run, observedAt: '2026-08-26T09:01:00.000Z' })),
    observedCloseRuns: input().observedCloseRuns.map((run) => ({ ...run, observedAt: '2026-08-26T18:01:00.000Z' })),
  }), { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(futureDated.ok, false)
  assert.equal(futureDated.status, 'blocked_collect_more_private_baseline')
  assert.ok(futureDated.failures.includes('baseline_observed_at_after_packet_day'))
  assert.ok(futureDated.failures.includes('order_observed_at_after_packet_day'))
  assert.ok(futureDated.failures.includes('redemption_observed_at_after_packet_day'))
  assert.ok(futureDated.failures.includes('close_observed_at_after_packet_day'))
  assert.doesNotMatch(JSON.stringify(futureDated), /Private Spa Sample|Private Operator/)
  assert.equal(validateShopPilotBaselinePacket(futureDated), futureDated)

  const onPilotStart = preflightShopPilotBaselineInput(input({
    observedAt: '2026-08-31T08:00:00.000Z',
    observedOrderRuns: input().observedOrderRuns.map((run) => ({ ...run, observedAt: '2026-08-31T08:01:00.000Z' })),
    observedRedemptionRuns: input().observedRedemptionRuns.map((run) => ({ ...run, observedAt: '2026-08-31T09:01:00.000Z' })),
    observedCloseRuns: input().observedCloseRuns.map((run) => ({ ...run, observedAt: '2026-08-31T18:01:00.000Z' })),
  }), { generatedAt: '2026-09-01T00:00:00.000Z' })
  assert.equal(onPilotStart.status, 'baseline_input_blocked')
  assert.equal(onPilotStart.safeToGeneratePublicBaselinePacket, false)
  assert.ok(onPilotStart.failures.includes('baseline_observed_at_must_precede_pilot_start'))
  assert.ok(onPilotStart.failures.includes('order_observed_at_must_precede_pilot_start'))
  assert.ok(onPilotStart.failures.includes('redemption_observed_at_must_precede_pilot_start'))
  assert.ok(onPilotStart.failures.includes('close_observed_at_must_precede_pilot_start'))
  assert.doesNotMatch(JSON.stringify(onPilotStart), /Private Spa Sample|Private Operator/)
  assert.equal(validateShopPilotBaselineInputPreflight(onPilotStart), onPilotStart)

  const generatedOnPilotStart = buildShopPilotBaselinePacket(input(), { generatedAt: '2026-08-31T00:00:00.000Z' })
  assert.equal(generatedOnPilotStart.ok, false)
  assert.equal(generatedOnPilotStart.status, 'blocked_collect_more_private_baseline')
  assert.ok(generatedOnPilotStart.failures.includes('baseline_packet_generated_at_must_precede_pilot_start'))
  assert.equal(validateShopPilotBaselinePacket(generatedOnPilotStart), generatedOnPilotStart)
})

test('blocks contradictory error labels before baseline evidence can be treated as ready', () => {
  const missingRunCost = buildShopPilotBaselinePacket(input({
    observedOrderRuns: [
      input().observedOrderRuns[0],
      { ...input().observedOrderRuns[1], errorCostLabel: null },
      input().observedOrderRuns[2],
    ],
  }), { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(missingRunCost.ok, false)
  assert.ok(missingRunCost.failures.includes('order_error_cost_label_missing'))

  const missingTotalErrorCount = buildShopPilotBaselinePacket(input({
    observedRedemptionRuns: [
      input().observedRedemptionRuns[0],
      { ...input().observedRedemptionRuns[1], errorOccurred: true, errorCostLabel: 'redemption balance correction' },
      input().observedRedemptionRuns[2],
    ],
  }), { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(missingTotalErrorCount.ok, false)
  assert.equal(missingTotalErrorCount.metrics.observedOrderErrorRunCount, 1)
  assert.equal(missingTotalErrorCount.metrics.observedRedemptionErrorRunCount, 1)
  assert.equal(missingTotalErrorCount.metrics.totalObservedErrorRunCount, 2)
  assert.ok(missingTotalErrorCount.failures.includes('total_observed_error_count_mismatch'))

  const strayRunCost = buildShopPilotBaselinePacket(input({
    observedOrderRuns: [
      { ...input().observedOrderRuns[0], errorCostLabel: 'label without an error' },
      input().observedOrderRuns[1],
      input().observedOrderRuns[2],
    ],
  }), { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(strayRunCost.ok, false)
  assert.ok(strayRunCost.failures.includes('order_error_cost_label_without_error'))

  const missingTotalCost = buildShopPilotBaselinePacket(input({
    totalObservedErrorCostLabel: null,
  }), { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(missingTotalCost.ok, false)
  assert.ok(missingTotalCost.failures.includes('total_observed_error_cost_label_missing'))

  const noErrors = input({
    observedOrderRuns: input().observedOrderRuns.map((run) => ({ ...run, errorOccurred: false, errorCostLabel: null })),
    observedErrorRunCount: 0,
    totalObservedErrorRunCount: 0,
    totalObservedErrorCostLabel: null,
  })
  assert.equal(buildShopPilotBaselinePacket(noErrors, { generatedAt: '2026-08-25T00:00:00.000Z' }).ok, true)
  const strayTotalCost = buildShopPilotBaselinePacket({
    ...noErrors,
    totalObservedErrorCostLabel: 'no matching error run',
  }, { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(strayTotalCost.ok, false)
  assert.ok(strayTotalCost.failures.includes('total_observed_error_cost_label_without_error'))
  assert.doesNotMatch(JSON.stringify(strayTotalCost), /Private Spa Sample|Private Operator/)
})

test('preflights private baseline input with safe actionability codes only', () => {
  const ready = preflightShopPilotBaselineInput(input(), { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(ready.contract, SHOP_PILOT_BASELINE_INPUT_PREFLIGHT_CONTRACT)
  assert.equal(ready.status, 'baseline_input_ready')
  assert.equal(ready.ok, true)
  assert.equal(ready.safeToGeneratePublicBaselinePacket, true)
  assert.deepEqual(ready.failures, [])
  assert.equal(ready.metrics.medianMinutesPerOrder, 8)
  assert.equal(validateShopPilotBaselineInputPreflight(ready), ready)

  const blocked = preflightShopPilotBaselineInput(input({ claimedMedianMinutesPerOrder: 7 }), { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(blocked.status, 'baseline_input_blocked')
  assert.equal(blocked.ok, false)
  assert.equal(blocked.safeToGeneratePublicBaselinePacket, false)
  assert.ok(blocked.failures.includes('claimed_order_median_mismatch'))
  assert.ok(blocked.privateInputDigest)
  assert.equal(validateShopPilotBaselineInputPreflight(blocked), blocked)

  const invalid = preflightShopPilotBaselineInput(input({ businessName: 'owner@example.invalid' }), { generatedAt: '2026-08-25T00:00:00.000Z' })
  assert.equal(invalid.status, 'baseline_input_invalid')
  assert.equal(invalid.privateInputDigest, null)
  assert.equal(invalid.metrics, null)
  assert.match(invalid.failures[0], /contact_detail_rejected/)
  assert.doesNotMatch(JSON.stringify(invalid), /owner@example|Private Spa Sample|Private Operator/)
  assert.equal(validateShopPilotBaselineInputPreflight(invalid), invalid)
})

test('rejects credential/contact shapes in private input before packet generation', () => {
  assert.throws(() => buildShopPilotBaselinePacket(input({ businessName: 'owner@example.invalid' })), /contact_detail_rejected/)
  assert.throws(() => buildShopPilotBaselinePacket(input({ namedOperator: '+959123456789' })), /contact_detail_rejected/)
  assert.throws(() => buildShopPilotBaselinePacket(input({ recordSystem: 'postgres://user:pass@example.invalid/db' })), /credential_shape/)
})

test('renders Markdown without private values or promotion claims', () => {
  const markdown = renderShopPilotBaselinePacketMarkdown(buildShopPilotBaselinePacket(input(), { generatedAt: '2026-08-25T00:00:00.000Z' }))
  assert.match(markdown, /Shop Pilot Baseline Packet/)
  assert.match(markdown, /Median minutes per order: 8/)
  assert.match(markdown, /Median close minutes per day: 45/)
  assert.match(markdown, /Observed close calendar dates: 3\/3/)
  assert.match(markdown, /Total observed error runs: 1/)
  assert.match(markdown, /No business name, operator name/)
  assert.doesNotMatch(markdown, /Private Spa Sample|Private Operator|owner@example|ready for managed activation/i)
})

test('renders a local owner worksheet without private values or promotion claims', () => {
  const markdown = renderShopPilotBaselineWorksheetMarkdown()
  assert.match(markdown, /Shop Pilot Owner-Observed Baseline Worksheet/)
  assert.match(markdown, new RegExp(SHOP_PILOT_BASELINE_WORKSHEET_CONTRACT))
  assert.match(markdown, /At least 3 uninterrupted manual order runs/)
  assert.match(markdown, /At least 3 uninterrupted manual daily-close runs on 3 distinct close calendar dates/)
  assert.match(markdown, /Total observed error-run count/)
  assert.match(markdown, /Generate the baseline packet before the proposed Day-1 pilot start date/)
  assert.match(markdown, /node tools\/prepare_shop_pilot_baseline_packet\.mjs --input/)
  assert.doesNotMatch(markdown, /Private Spa Sample|Private Operator|owner@example|ready for managed activation|sk-proj-|ghp_/i)
})

test('template is blank and CLI generates metadata-only packet output', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-baseline-'))
  try {
    const templatePath = join(parent, 'baseline-input.private.json')
    const worksheetPath = join(parent, 'baseline-worksheet.private.md')
    const inputPath = join(parent, 'filled-baseline.private.json')
    const packetPath = join(parent, 'baseline-packet.json')
    const markdownPath = join(parent, 'baseline-packet.md')
    const tool = resolve('tools/prepare_shop_pilot_baseline_packet.mjs')

    const template = spawnSync(process.execPath, [tool, '--template', templatePath, '--worksheet-output', worksheetPath], { encoding: 'utf8' })
    assert.equal(template.status, 0, template.stderr)
    const templateResult = JSON.parse(template.stdout)
    assert.equal(templateResult.worksheetContract, SHOP_PILOT_BASELINE_WORKSHEET_CONTRACT)
    const templateJson = JSON.parse(await readFile(templatePath, 'utf8'))
    assert.deepEqual(templateJson, baselineInputTemplate())
    assert.equal(templateJson.businessName, '')
    const worksheet = await readFile(worksheetPath, 'utf8')
    assert.match(worksheet, /Manual order runs/)
    assert.match(worksheet, /Daily-close runs/)
    assert.match(worksheet, /--lint-input/)
    assert.doesNotMatch(worksheet, /Private Spa Sample|Private Operator|owner@example|sk-proj-|ghp_/i)

    const templateOverwrite = spawnSync(process.execPath, [tool, '--template', templatePath], { encoding: 'utf8' })
    assert.notEqual(templateOverwrite.status, 0)
    assert.match(templateOverwrite.stderr, /shop_pilot_baseline_output_exists/)

    await writeFile(inputPath, `${JSON.stringify(input(), null, 2)}\n`)
    const linted = spawnSync(process.execPath, [tool, '--lint-input', inputPath], { encoding: 'utf8' })
    assert.equal(linted.status, 0, linted.stderr)
    assert.equal(JSON.parse(linted.stdout).status, 'baseline_input_ready')
    assert.doesNotMatch(linted.stdout, /Private Spa Sample|Private Operator/)

    const invalidInputPath = join(parent, 'invalid-baseline.private.json')
    await writeFile(invalidInputPath, `${JSON.stringify(input({ businessName: 'owner@example.invalid' }), null, 2)}\n`)
    const invalidLint = spawnSync(process.execPath, [tool, '--lint-input', invalidInputPath], { encoding: 'utf8' })
    assert.notEqual(invalidLint.status, 0)
    assert.equal(JSON.parse(invalidLint.stdout).status, 'baseline_input_invalid')
    assert.doesNotMatch(`${invalidLint.stdout}${invalidLint.stderr}`, /owner@example|Private Spa Sample|Private Operator|[A-Za-z]:\\/)

    const generated = spawnSync(process.execPath, [tool, '--input', inputPath, '--output', packetPath, '--markdown-output', markdownPath], { encoding: 'utf8' })
    assert.equal(generated.status, 0, generated.stderr)
    assert.equal(JSON.parse(generated.stdout).status, 'baseline_ready_for_private_pilot_handoff')
    assert.doesNotMatch(generated.stdout, /Private Spa Sample|Private Operator/)

    const packetOverwrite = spawnSync(process.execPath, [tool, '--input', inputPath, '--output', packetPath, '--markdown-output', join(parent, 'new-baseline-packet.md')], { encoding: 'utf8' })
    assert.notEqual(packetOverwrite.status, 0)
    assert.match(packetOverwrite.stderr, /shop_pilot_baseline_output_exists/)

    const verified = spawnSync(process.execPath, [tool, '--verify', packetPath], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr)
    assert.equal(JSON.parse(verified.stdout).status, 'baseline_ready_for_private_pilot_handoff')
    assert.doesNotMatch(await readFile(markdownPath, 'utf8'), /Private Spa Sample|Private Operator/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
