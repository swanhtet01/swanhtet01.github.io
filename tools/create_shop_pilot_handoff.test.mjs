import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  buildShopPilotHandoff,
  renderShopPilotHandoff,
  renderShopPilotReplyDraft,
  shopPilotInputFromContactEvent,
} from './create_shop_pilot_handoff.mjs'

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

const shopContactEvent = {
  event: 'supermega.contact.created',
  record: {
    lead_id: 'LEAD-0123456789ABCDEF',
    workflow: 'commerce',
    company: 'Test Shop',
    name: 'Test Operator',
    email: 'private@example.com',
    goal: 'Reduce manual order re-entry and make close exceptions reviewable.',
    source_url: 'https://supermega.dev/contact/?private=1',
    raw: { private_note: 'must not leave the contact event' },
  },
}

const ownerInput = {
  operatorRole: readyInput.operatorRole,
  tenantLabel: readyInput.tenantLabel,
  startDate: readyInput.startDate,
  reviewDate: readyInput.reviewDate,
  baseline: readyInput.baseline,
  fixedPilotFeeUsd: readyInput.fixedPilotFeeUsd,
  isolatedNonProductionTenantApproved: true,
  namedOperatorAuthorized: true,
  pilotDataHandlingApproved: true,
  ownerReviewedCommercialDraft: true,
  contactIsNamedOperator: true,
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

test('converts a Shop contact event through a separate owner overlay without retaining contact data', () => {
  const input = shopPilotInputFromContactEvent(shopContactEvent, ownerInput)
  const handoff = buildShopPilotHandoff(input)
  const serialized = JSON.stringify(handoff)
  assert.equal(handoff.status, 'ready-for-private-pilot')
  assert.equal(handoff.source.contactEventBound, true)
  assert.match(handoff.source.leadDigest, /^[0-9a-f]{64}$/)
  assert.equal(handoff.source.contactEmailRetained, false)
  assert.equal(handoff.source.rawContactDataRetained, false)
  assert.doesNotMatch(serialized, /private@example\.com|private_note|source_url|LEAD-0123456789ABCDEF/)
})

test('continues to accept the legacy Shop workflow label', () => {
  const legacyEvent = {
    ...shopContactEvent,
    record: { ...shopContactEvent.record, workflow: 'shop' },
  }
  const handoff = buildShopPilotHandoff(shopPilotInputFromContactEvent(legacyEvent, ownerInput))
  assert.equal(handoff.status, 'ready-for-private-pilot')
  assert.equal(handoff.source.contactEventBound, true)
})

test('rejects non-Shop events and refuses to infer that a contact is the pilot operator', () => {
  assert.throws(() => shopPilotInputFromContactEvent({ ...shopContactEvent, record: { ...shopContactEvent.record, workflow: 'website' } }, ownerInput), /shop_contact_event_required/)
  assert.throws(() => shopPilotInputFromContactEvent(shopContactEvent, { ...ownerInput, contactIsNamedOperator: false }), /shop_contact_operator_confirmation_required/)
  assert.throws(() => shopPilotInputFromContactEvent({ ...shopContactEvent, record: { ...shopContactEvent.record, lead_id: '' } }, ownerInput), /contact_lead_id_required/)
})

test('CLI emits a contact owner template with every authority gate closed', () => {
  const result = spawnSync(process.execPath, [resolve('tools/create_shop_pilot_handoff.mjs'), '--owner-example'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const template = JSON.parse(result.stdout)
  assert.equal(template.contactIsNamedOperator, false)
  assert.equal(template.isolatedNonProductionTenantApproved, false)
  assert.equal(template.namedOperatorAuthorized, false)
  assert.equal(template.pilotDataHandlingApproved, false)
  assert.equal(template.ownerReviewedCommercialDraft, false)
  assert.equal('company' in template, false)
  assert.equal('operatorName' in template, false)
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

test('CLI creates and verifies a contact-bound handoff from separate event and owner files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-shop-contact-handoff-'))
  const eventPath = join(directory, 'contact-event.json')
  const ownerPath = join(directory, 'owner-input.json')
  const outputPath = join(directory, 'private-handoff.md')
  try {
    await writeFile(eventPath, JSON.stringify(shopContactEvent))
    await writeFile(ownerPath, JSON.stringify(ownerInput))
    const command = [
      resolve('tools/create_shop_pilot_handoff.mjs'),
      '--contact-event', eventPath,
      '--owner-input', ownerPath,
      '--output', outputPath,
    ]
    const created = spawnSync(process.execPath, command, { encoding: 'utf8' })
    assert.equal(created.status, 0, created.stderr)
    assert.equal(JSON.parse(created.stdout).status, 'ready-for-private-pilot')
    assert.doesNotMatch(created.stdout, /Test Shop|Test Operator|private@example\.com/)
    const artifact = await readFile(outputPath, 'utf8')
    assert.match(artifact, /Source lead digest: `[0-9a-f]{64}`/)
    assert.doesNotMatch(artifact, /private@example\.com|private_note|source_url|LEAD-0123456789ABCDEF/)

    const verified = spawnSync(process.execPath, [command[0], '--verify', ...command.slice(1)], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr)
    assert.equal(JSON.parse(verified.stdout).mode, 'verify')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('renders a handoff-bound private reply without sending or overclaiming', () => {
  const input = shopPilotInputFromContactEvent(shopContactEvent, ownerInput)
  const handoff = renderShopPilotHandoff(input)
  const draft = renderShopPilotReplyDraft(shopContactEvent, ownerInput, handoff)
  assert.match(draft, /^DRAFT — OWNER REVIEW REQUIRED — NOT SENT/)
  assert.match(draft, /To: private@example\.com/)
  assert.match(draft, /fixed pilot-fee draft is \$500/)
  assert.match(draft, /Verified handoff SHA-256: [0-9a-f]{64}/)
  assert.match(draft, /performs no external action/)
  assert.doesNotMatch(draft, /private_note|source_url|LEAD-0123456789ABCDEF|guaranteed improvement/i)
})

test('refuses reply drafting for closed gates, malformed email, or a changed handoff', () => {
  const input = shopPilotInputFromContactEvent(shopContactEvent, ownerInput)
  const handoff = renderShopPilotHandoff(input)
  assert.throws(
    () => renderShopPilotReplyDraft(shopContactEvent, { ...ownerInput, ownerReviewedCommercialDraft: false }, handoff),
    /shop_pilot_not_ready_for_outreach/,
  )
  assert.throws(
    () => renderShopPilotReplyDraft({ ...shopContactEvent, record: { ...shopContactEvent.record, email: 'invalid' } }, ownerInput, handoff),
    /contact_email_invalid/,
  )
  assert.throws(() => renderShopPilotReplyDraft(shopContactEvent, ownerInput, `${handoff}\nchanged`), /shop_pilot_handoff_stale_or_tampered/)
})

test('CLI creates and verifies one private reply draft with metadata-only stdout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-shop-reply-draft-'))
  const eventPath = join(directory, 'contact-event.json')
  const ownerPath = join(directory, 'owner-input.json')
  const handoffPath = join(directory, 'private-handoff.md')
  const replyPath = join(directory, 'private-reply.txt')
  try {
    await writeFile(eventPath, JSON.stringify(shopContactEvent))
    await writeFile(ownerPath, JSON.stringify(ownerInput))
    await writeFile(handoffPath, renderShopPilotHandoff(shopPilotInputFromContactEvent(shopContactEvent, ownerInput)))
    const command = [
      resolve('tools/create_shop_pilot_handoff.mjs'),
      '--draft-reply',
      '--contact-event', eventPath,
      '--owner-input', ownerPath,
      '--handoff', handoffPath,
      '--output', replyPath,
    ]
    const created = spawnSync(process.execPath, command, { encoding: 'utf8' })
    assert.equal(created.status, 0, created.stderr)
    const receipt = JSON.parse(created.stdout)
    assert.equal(receipt.contract, 'supermega.shop.pilot_reply_draft.v1')
    assert.equal(receipt.customerContactPerformed, false)
    assert.match(receipt.handoffSha256, /^[0-9a-f]{64}$/)
    assert.doesNotMatch(created.stdout, /Test Shop|Test Operator|private@example\.com/)
    assert.match(await readFile(replyPath, 'utf8'), /OWNER REVIEW REQUIRED — NOT SENT/)

    const verified = spawnSync(process.execPath, [command[0], '--verify', ...command.slice(1)], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr)
    assert.equal(JSON.parse(verified.stdout).mode, 'verify')

    await writeFile(replyPath, `${await readFile(replyPath, 'utf8')}\nchanged\n`)
    const tampered = spawnSync(process.execPath, [command[0], '--verify', ...command.slice(1)], { encoding: 'utf8' })
    assert.notEqual(tampered.status, 0)
    assert.match(tampered.stderr, /shop_pilot_reply_draft_stale_or_tampered/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
