import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

import { normalizeObservedRunInput, recordObservedShopPilotRun, verifyObservedShopPilotEvidence } from './record_shop_pilot_observed_run.mjs'

const execFileAsync = promisify(execFile)
const PRIVATE_TEXT = 'Client Example Owner, client@example.test, +95 900000000, Example Spa Yangon'

async function withTempDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), 'supermega-shop-observed-input-'))
  try {
    return await callback(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function baseArgs(dir, overrides = {}) {
  const values = {
    evidenceFile: join(dir, 'private-evidence.txt'),
    anchorFile: join(dir, 'private-anchor.txt'),
    output: join(dir, 'run-input.private.json'),
    runId: 'shop-run-001',
    observedAt: '2026-08-23T09:30:00.000Z',
    dayIndex: '1',
    accepted: 'true',
    durationMinutesPerOrder: '12.5',
    exceptionCount: '0',
    closeMinutes: '18',
    operatorCorrectionCount: '1',
    reloadRetryOutcome: 'passed',
    ...overrides,
  }
  return [
    '--evidence-file', values.evidenceFile,
    '--anchor-file', values.anchorFile,
    '--run-id', values.runId,
    '--observed-at', values.observedAt,
    '--day-index', values.dayIndex,
    '--accepted', values.accepted,
    '--duration-minutes-per-order', values.durationMinutesPerOrder,
    '--exception-count', values.exceptionCount,
    '--close-minutes', values.closeMinutes,
    '--operator-correction-count', values.operatorCorrectionCount,
    '--reload-retry-outcome', values.reloadRetryOutcome,
    '--output', values.output,
  ]
}

async function runHelper(args, options = {}) {
  return execFileAsync(process.execPath, ['tools/prepare_shop_pilot_observed_run_input.mjs', ...args], {
    cwd: process.cwd(),
    ...options,
  })
}

function assertNoPrivateLeak(text, dir) {
  assert.equal(text.includes(PRIVATE_TEXT), false)
  assert.equal(text.includes('client@example.test'), false)
  assert.equal(text.includes('+95 900000000'), false)
  assert.equal(text.includes('Example Spa Yangon'), false)
  assert.equal(text.includes(dir), false)
  assert.equal(text.includes('private-evidence.txt'), false)
  assert.equal(text.includes('private-anchor.txt'), false)
  assert.equal(text.includes('run-input.private.json'), false)
}

function assertNoRunIdentityEcho(text) {
  assert.equal(text.includes('shop-run-001'), false)
  assert.equal(text.includes('2026-08-23T09:30:00.000Z'), false)
}

test('creates normalizer-compatible private run input without leaking raw evidence or paths', async () => {
  await withTempDir(async (dir) => {
    const evidenceFile = join(dir, 'private-evidence.txt')
    const anchorFile = join(dir, 'private-anchor.txt')
    const output = join(dir, 'run-input.private.json')
    await writeFile(evidenceFile, `evidence ${PRIVATE_TEXT}\n`, 'utf8')
    await writeFile(anchorFile, `anchor ${PRIVATE_TEXT}\n`, 'utf8')

    const { stdout, stderr } = await runHelper(baseArgs(dir, { evidenceFile, anchorFile, output }))
    assert.equal(stderr, '')
    assertNoPrivateLeak(stdout, dir)
    assertNoRunIdentityEcho(stdout)
    const metadata = JSON.parse(stdout)
    assert.equal(metadata.ok, true)
    assert.equal('runId' in metadata, false)
    assert.equal('observedAt' in metadata, false)
    assert.match(metadata.evidenceReferenceDigest, /^sha256:[0-9a-f]{64}$/)
    assert.match(metadata.independentAnchorDigest, /^sha256:[0-9a-f]{64}$/)
    assert.notEqual(metadata.evidenceReferenceDigest, metadata.independentAnchorDigest)

    const generatedText = await readFile(output, 'utf8')
    assertNoPrivateLeak(generatedText, dir)
    const runInput = normalizeObservedRunInput(JSON.parse(generatedText))
    assert.equal(runInput.product, 'shop')
    assert.equal(runInput.pilotMode, 'owner_named')
    assert.equal(runInput.verticalPack, 'spa-services')
    assert.equal(runInput.operatorReviewed, true)
    assert.equal(runInput.targetCorrect, true)
    assert.equal(runInput.noRealMessageSent, true)
    assert.equal(runInput.noPaymentAccepted, true)
    assert.equal(runInput.noStockMovement, true)
    assert.equal(runInput.noServerWrite, true)
    assert.equal(runInput.noHostedWrite, true)
  })
})

test('generated JSON can be recorded and verified by the existing recorder', async () => {
  await withTempDir(async (dir) => {
    const evidenceFile = join(dir, 'private-evidence.txt')
    const anchorFile = join(dir, 'private-anchor.txt')
    const output = join(dir, 'run-input.private.json')
    const workspace = join(dir, 'observed-workspace')
    await writeFile(evidenceFile, `evidence ${PRIVATE_TEXT}\n`, 'utf8')
    await writeFile(anchorFile, `anchor ${PRIVATE_TEXT}\n`, 'utf8')
    await runHelper(baseArgs(dir, { evidenceFile, anchorFile, output }))

    const runInput = JSON.parse(await readFile(output, 'utf8'))
    const summary = await recordObservedShopPilotRun({ workspace, runInput })
    assert.equal(summary.runCount, 1)
    assert.equal(summary.acceptedRunCount, 1)
    assert.equal(summary.acceptedConsecutiveRuns, 1)
    assert.equal(summary.promotionEvidenceMet, false)
    const verified = await verifyObservedShopPilotEvidence(workspace)
    assert.deepEqual(verified, summary)
  })
})

test('missing files fail closed without leaking path or private content', async () => {
  await withTempDir(async (dir) => {
    const anchorFile = join(dir, 'private-anchor.txt')
    await writeFile(anchorFile, PRIVATE_TEXT, 'utf8')
    await assert.rejects(
      runHelper(baseArgs(dir, { evidenceFile: join(dir, 'missing-evidence.txt'), anchorFile })),
      (error) => {
        assert.match(error.stderr, /source_file_unreadable/)
        assertNoPrivateLeak(error.stdout, dir)
        assertNoPrivateLeak(error.stderr, dir)
        assert.equal(error.stderr.includes('missing-evidence.txt'), false)
        return true
      },
    )
  })
})

test('invalid dates and reload outcomes fail closed', async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, 'private-evidence.txt'), PRIVATE_TEXT, 'utf8')
    await writeFile(join(dir, 'private-anchor.txt'), PRIVATE_TEXT, 'utf8')
    await assert.rejects(runHelper(baseArgs(dir, { observedAt: '2026-08-23' })), /observed_at_invalid/)
    await assert.rejects(runHelper(baseArgs(dir, { reloadRetryOutcome: 'maybe' })), /reload_retry_outcome_invalid/)
  })
})

test('unsafe or private CLI fields fail closed', async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, 'private-evidence.txt'), PRIVATE_TEXT, 'utf8')
    await writeFile(join(dir, 'private-anchor.txt'), PRIVATE_TEXT, 'utf8')
    await assert.rejects(runHelper([...baseArgs(dir), '--participant-name', 'Private Person']), /private_field_rejected/)
    await assert.rejects(runHelper([...baseArgs(dir), '--unexpected', 'value']), /unknown_field_rejected/)
    await assert.rejects(runHelper(baseArgs(dir, { output: join(dir, 'private-evidence.txt') })), /output_overwrites_private_source/)
  })
})
