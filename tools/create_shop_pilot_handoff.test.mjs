import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import { buildShopPilotHandoff, renderShopPilotHandoff } from './create_shop_pilot_handoff.mjs'

const readyInput = {
  company: 'Test Shop',
  operatorName: 'Test Operator',
  operatorRole: 'Shop manager',
  tenantLabel: 'test-shop-isolated-pilot',
  operationalProblem: 'Reduce manual order re-entry and make close exceptions reviewable.',
  startDate: '2026-08-03',
  reviewDate: '2026-08-07',
  baseline: { weeklyOrders: 120, medianMinutesPerOrder: 8, weeklyExceptionCount: 12, closeMinutesPerDay: 45 },
  fixedPilotFeeUsd: 500,
  isolatedNonProductionTenantApproved: true,
  namedOperatorAuthorized: true,
  pilotDataHandlingApproved: true,
  ownerReviewedCommercialDraft: true,
}

test('builds the exact five-day named-operator handoff required by PILOT-001', () => {
  const handoff = buildShopPilotHandoff(readyInput)
  assert.equal(handoff.status, 'ready-for-private-pilot')
  assert.equal(handoff.pilot.durationDays, 5)
  assert.equal(handoff.evidencePlan.length, 5)
  assert.deepEqual(handoff.blockers, [])
  assert.equal(handoff.acceptance.improvementClaimAllowedBeforeReview, false)
  assert.equal(handoff.authority.productionActivationAllowed, false)
  assert.equal(handoff.controls.externalWritesPerformed, false)
})

test('keeps the handoff blocked until every owner gate is explicit', () => {
  const handoff = buildShopPilotHandoff({
    ...readyInput,
    isolatedNonProductionTenantApproved: false,
    namedOperatorAuthorized: false,
    pilotDataHandlingApproved: false,
    ownerReviewedCommercialDraft: false,
  })
  assert.equal(handoff.status, 'blocked-owner-review')
  assert.deepEqual(handoff.blockers, [
    'isolatedNonProductionTenantApproved',
    'namedOperatorAuthorized',
    'pilotDataHandlingApproved',
    'ownerReviewedCommercialDraft',
  ])
  assert.match(renderShopPilotHandoff({ ...readyInput, namedOperatorAuthorized: false }), /BLOCKED: namedOperatorAuthorized/)
})

test('rejects weak baselines, invalid dates, and oversized identity data', () => {
  assert.throws(() => buildShopPilotHandoff({ ...readyInput, reviewDate: '2026-08-08' }), /review_date_must_close_five_day_plan/)
  assert.throws(() => buildShopPilotHandoff({ ...readyInput, baseline: { ...readyInput.baseline, weeklyOrders: 0 } }), /baseline_weekly_orders_invalid/)
  assert.throws(() => buildShopPilotHandoff({ ...readyInput, operatorName: 'x'.repeat(181) }), /operator_name_invalid/)
  assert.throws(() => buildShopPilotHandoff({ ...readyInput, fixedPilotFeeUsd: -1 }), /fixed_pilot_fee_usd_invalid/)
})

test('renders a commercial draft without claiming payment, deployment, or improvement', () => {
  const markdown = renderShopPilotHandoff(readyInput)
  assert.match(markdown, /Fixed five-day pilot fee: \*\*\$500\*\*/)
  assert.match(markdown, /does not contact the customer, accept payment, deploy software, or prove hosted activation/)
  assert.doesNotMatch(markdown, /guaranteed|production ready|payment accepted/i)
})

test('CLI writes and verifies one private artifact exclusively while reporting metadata only', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-shop-handoff-'))
  const inputPath = join(directory, 'private-input.json')
  const outputPath = join(directory, 'private-handoff.md')
  try {
    await writeFile(inputPath, JSON.stringify(readyInput))
    const command = [resolve('tools/create_shop_pilot_handoff.mjs'), '--input', inputPath, '--output', outputPath]
    const first = spawnSync(process.execPath, command, { encoding: 'utf8' })
    assert.equal(first.status, 0, first.stderr)
    const receipt = JSON.parse(first.stdout)
    assert.equal(receipt.contract, 'supermega.shop.pilot_handoff.v1')
    assert.equal(receipt.mode, 'create')
    assert.equal(receipt.status, 'ready-for-private-pilot')
    assert.equal(receipt.externalWritesPerformed, false)
    assert.match(receipt.artifactSha256, /^[0-9a-f]{64}$/)
    assert.doesNotMatch(first.stdout, /Test Shop|Test Operator/)
    assert.match(await readFile(outputPath, 'utf8'), /Test Operator \(Shop manager\)/)

    const verification = spawnSync(process.execPath, [command[0], '--verify', ...command.slice(1)], { encoding: 'utf8' })
    assert.equal(verification.status, 0, verification.stderr)
    assert.equal(JSON.parse(verification.stdout).mode, 'verify')

    const second = spawnSync(process.execPath, command, { encoding: 'utf8' })
    assert.notEqual(second.status, 0)
    assert.match(second.stderr, /EEXIST/)

    await writeFile(outputPath, `${await readFile(outputPath, 'utf8')}\nTAMPERED\n`)
    const tampered = spawnSync(process.execPath, [command[0], '--verify', ...command.slice(1)], { encoding: 'utf8' })
    assert.notEqual(tampered.status, 0)
    assert.match(tampered.stderr, /shop_pilot_handoff_stale_or_tampered/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('escapes Markdown control text from private input', () => {
  const markdown = renderShopPilotHandoff({ ...readyInput, company: '[Fake](https://example.invalid)' })
  assert.match(markdown, /\\\[Fake\\\]\\\(https:\/\/example\\\.invalid\\\)/)
  assert.doesNotMatch(markdown, /\[Fake\]\(https:\/\/example\.invalid\)/)
})
