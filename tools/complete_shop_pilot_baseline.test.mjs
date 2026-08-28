import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  SHOP_PILOT_BASELINE_COMPLETION_FILES,
  SHOP_PILOT_BASELINE_COMPLETION_RECEIPT_CONTRACT,
  buildShopPilotBaselineCompletionBundle,
  validateShopPilotBaselineCompletionReceipt,
  verifyShopPilotBaselineCompletionDirectory,
  writeShopPilotBaselineCompletion,
} from './complete_shop_pilot_baseline.mjs'
import { SHOP_PILOT_BASELINE_INPUT_CONTRACT } from './prepare_shop_pilot_baseline_packet.mjs'

function dayIso(generatedAt, offset, hour, minute = 0) {
  const date = new Date(`${generatedAt.slice(0, 10)}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  date.setUTCHours(hour, minute, 0, 0)
  return date.toISOString()
}

function dateOnly(generatedAt, offset) {
  return dayIso(generatedAt, offset, 0).slice(0, 10)
}

function inputFor(generatedAt, overrides = {}) {
  return {
    contract: SHOP_PILOT_BASELINE_INPUT_CONTRACT,
    product: 'shop',
    pilotMode: 'owner_named',
    verticalPack: 'spa-services',
    observedAt: dayIso(generatedAt, -1, 8),
    businessName: 'Private Test Business',
    namedOperator: 'Private Test Operator',
    operatorRole: 'Shop manager',
    founderObserver: 'Private Founder',
    observationPlace: 'Private shop floor',
    processSummary: 'Owner records the package sale and redemption manually, then closes the day.',
    processStartsAt: 'Manual request begins',
    processEndsAt: 'Manual record and close are complete',
    correctionPath: 'Owner marks the original record and adds a reviewed correction',
    recordSystem: 'Private manual ledger',
    observedOrderRuns: [7, 8, 9].map((durationMinutes, index) => ({
      runId: `order-run-00${index + 1}`,
      observedAt: dayIso(generatedAt, -1, 9, index * 10),
      startedWhen: 'manual order begins',
      endedWhen: 'manual order is recorded',
      durationMinutes,
      interrupted: false,
      errorOccurred: index === 1,
      errorCostLabel: index === 1 ? 'one reviewed manual correction' : null,
    })),
    observedRedemptionRuns: [2, 3, 4].map((durationMinutes, index) => ({
      runId: `redemption-run-00${index + 1}`,
      observedAt: dayIso(generatedAt, -1, 11, index * 10),
      startedWhen: 'manual redemption begins',
      endedWhen: 'manual balance is updated',
      durationMinutes,
      interrupted: false,
      errorOccurred: false,
      errorCostLabel: null,
    })),
    observedCloseRuns: [
      { offset: -3, durationMinutes: 40 },
      { offset: -2, durationMinutes: 45 },
      { offset: -1, durationMinutes: 50 },
    ].map(({ offset, durationMinutes }, index) => ({
      runId: `close-run-00${index + 1}`,
      observedAt: dayIso(generatedAt, offset, 18),
      startedWhen: 'manual close begins',
      endedWhen: 'manual close is reviewed',
      durationMinutes,
      interrupted: false,
      errorOccurred: false,
      errorCostLabel: null,
    })),
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
    totalObservedErrorCostLabel: 'one reviewed manual correction, no monetary claim',
    ownerConfirmedBaseline: true,
    operatorAgreesReviewEveryRun: true,
    proposedPilotStartDate: dateOnly(generatedAt, 2),
    reviewDate: dateOnly(generatedAt, 6),
    noSuperMegaDemoMeasured: true,
    noExternalEffects: true,
    ...overrides,
  }
}

test('builds one owner-safe completion bundle and sealed receipt from real-observation-shaped input', () => {
  const generatedAt = '2026-08-28T10:00:00.000Z'
  const bundle = buildShopPilotBaselineCompletionBundle(inputFor(generatedAt), { generatedAt })
  assert.equal(bundle.preflight.status, 'baseline_input_ready')
  assert.equal(bundle.packet.status, 'baseline_ready_for_private_pilot_handoff')
  assert.equal(bundle.receipt.contract, SHOP_PILOT_BASELINE_COMPLETION_RECEIPT_CONTRACT)
  assert.equal(bundle.receipt.status, 'baseline_completion_ready')
  assert.equal(bundle.receipt.syntheticEvidenceAccepted, false)
  assert.equal(bundle.receipt.outputPathsIncluded, false)
  assert.equal(bundle.receipt.rawIdentityIncluded, false)
  assert.equal(bundle.receipt.privateInputDigest, bundle.packet.privateInputDigest)
  assert.equal(validateShopPilotBaselineCompletionReceipt(bundle.receipt, bundle), bundle.receipt)
  assert.deepEqual(Object.keys(bundle.contents).sort(), Object.values(SHOP_PILOT_BASELINE_COMPLETION_FILES).sort())
  assert.doesNotMatch(JSON.stringify(bundle), /Private Test Business|Private Test Operator|Private Founder|Private shop floor/)
})

test('fails closed with safe codes for blocked or private-contact-shaped input', () => {
  const generatedAt = '2026-08-28T10:00:00.000Z'
  assert.throws(
    () => buildShopPilotBaselineCompletionBundle(inputFor(generatedAt, { noSuperMegaDemoMeasured: false }), { generatedAt }),
    (error) => error.code === 'shop_pilot_baseline_completion_blocked'
      && error.failures.includes('shop_pilot_baseline_no_demo_measured_required')
      && !JSON.stringify(error).includes('Private Test Business'),
  )
  assert.throws(
    () => buildShopPilotBaselineCompletionBundle(inputFor(generatedAt, { businessName: 'private-owner@example.invalid' }), { generatedAt }),
    (error) => error.code === 'shop_pilot_baseline_completion_blocked'
      && error.failures.some((failure) => failure.includes('contact_detail_rejected'))
      && !JSON.stringify(error).includes('private-owner@example.invalid'),
  )
})

test('atomically writes and re-verifies exactly four owner-safe artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shop-baseline-complete-'))
  try {
    const generatedAt = '2026-08-28T10:00:00.000Z'
    const inputPath = join(root, 'private-input.json')
    const outputDir = join(root, 'completed')
    await writeFile(inputPath, `${JSON.stringify(inputFor(generatedAt), null, 2)}\n`, 'utf8')
    const result = await writeShopPilotBaselineCompletion({ inputPath, outputDir, generatedAt })
    assert.equal(result.ok, true)
    assert.equal(result.status, 'baseline_completion_ready')
    assert.deepEqual((await readdir(outputDir)).sort(), Object.values(SHOP_PILOT_BASELINE_COMPLETION_FILES).sort())
    assert.deepEqual(await verifyShopPilotBaselineCompletionDirectory(outputDir), result)
    const combined = (await Promise.all((await readdir(outputDir)).map((name) => readFile(join(outputDir, name), 'utf8')))).join('\n')
    assert.doesNotMatch(combined, /Private Test Business|Private Test Operator|Private Founder|Private shop floor|shop-baseline-complete-/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('writes no directory or staging residue when validation fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shop-baseline-blocked-'))
  try {
    const generatedAt = '2026-08-28T10:00:00.000Z'
    const inputPath = join(root, 'private-input.json')
    const outputDir = join(root, 'must-not-exist')
    await writeFile(inputPath, `${JSON.stringify(inputFor(generatedAt, { claimedMedianMinutesPerOrder: 99 }), null, 2)}\n`, 'utf8')
    await assert.rejects(
      writeShopPilotBaselineCompletion({ inputPath, outputDir, generatedAt }),
      (error) => error.code === 'shop_pilot_baseline_completion_blocked'
        && error.failures.includes('claimed_order_median_mismatch'),
    )
    await assert.rejects(access(outputDir))
    assert.equal((await readdir(root)).some((name) => name.startsWith('.supermega-shop-baseline-')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('detects tampering and never overwrites an existing completion directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shop-baseline-tamper-'))
  try {
    const generatedAt = '2026-08-28T10:00:00.000Z'
    const inputPath = join(root, 'private-input.json')
    const outputDir = join(root, 'completed')
    await writeFile(inputPath, `${JSON.stringify(inputFor(generatedAt), null, 2)}\n`, 'utf8')
    await writeShopPilotBaselineCompletion({ inputPath, outputDir, generatedAt })
    await assert.rejects(
      writeShopPilotBaselineCompletion({ inputPath, outputDir, generatedAt }),
      /shop_pilot_baseline_completion_output_exists/,
    )
    const packetPath = join(outputDir, SHOP_PILOT_BASELINE_COMPLETION_FILES.packet)
    const packet = JSON.parse(await readFile(packetPath, 'utf8'))
    packet.metrics.weeklyOrders += 1
    await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8')
    await assert.rejects(verifyShopPilotBaselineCompletionDirectory(outputDir), /shop_pilot_baseline_packet_digest_mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('CLI completes and verifies without echoing private values or local paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shop-baseline-cli-'))
  try {
    const generatedAt = new Date().toISOString()
    const inputPath = join(root, 'private-input.json')
    const outputDir = join(root, 'completed')
    await writeFile(inputPath, `${JSON.stringify(inputFor(generatedAt), null, 2)}\n`, 'utf8')
    const run = spawnSync(process.execPath, [
      'tools/complete_shop_pilot_baseline.mjs',
      '--input', inputPath,
      '--output-dir', outputDir,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr || run.stdout)
    const summary = JSON.parse(run.stdout)
    assert.equal(summary.ok, true)
    assert.equal(summary.status, 'baseline_completion_ready')
    assert.doesNotMatch(run.stdout, /Private Test Business|Private Test Operator|shop-baseline-cli-|[A-Za-z]:\\/)

    const verify = spawnSync(process.execPath, [
      'tools/complete_shop_pilot_baseline.mjs',
      '--verify-dir', outputDir,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(verify.status, 0, verify.stderr || verify.stdout)
    assert.equal(JSON.parse(verify.stdout).receiptDigest, summary.receiptDigest)

    const blockedInputPath = join(root, 'private-blocked.json')
    const blockedOutputDir = join(root, 'blocked-must-not-exist')
    await writeFile(blockedInputPath, `${JSON.stringify(inputFor(generatedAt, { businessName: 'private-owner@example.invalid' }), null, 2)}\n`, 'utf8')
    const blocked = spawnSync(process.execPath, [
      'tools/complete_shop_pilot_baseline.mjs',
      '--input', blockedInputPath,
      '--output-dir', blockedOutputDir,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(blocked.status, 1)
    assert.match(blocked.stderr, /shop_pilot_baseline_completion_blocked/)
    assert.doesNotMatch(blocked.stderr, /private-owner@example\.invalid|Private Test Operator|shop-baseline-cli-|[A-Za-z]:\\/)
    await assert.rejects(access(blockedOutputDir))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
