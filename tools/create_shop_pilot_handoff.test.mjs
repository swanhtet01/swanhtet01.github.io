import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  buildShopPilotOwnerDecision,
  buildShopPilotHandoff,
  renderShopPilotHandoff,
  renderShopPilotOwnerDecision,
  renderShopPilotReplyDraft,
  shopPilotInputFromContactEvent,
} from './create_shop_pilot_handoff.mjs'

import {
  decideShopPilotSalesWorkspace,
  initShopPilotSalesWorkspace,
  prepareShopPilotSalesWorkspace,
  verifyShopPilotSalesWorkspace,
} from './manage_shop_pilot_workspace.mjs'

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
    raw: {
      private_note: 'must not leave the contact event',
      shop: {
        operator_role: 'Shop manager',
        weekly_orders: 120,
        median_minutes_per_order: 8,
        weekly_exception_count: 12,
        close_minutes_per_day: 45,
        contact_is_operator: true,
      },
    },
  },
}

const ownerInput = {
  tenantLabel: readyInput.tenantLabel,
  startDate: readyInput.startDate,
  reviewDate: readyInput.reviewDate,
  fixedPilotFeeUsd: readyInput.fixedPilotFeeUsd,
  isolatedNonProductionTenantApproved: true,
  namedOperatorAuthorized: true,
  pilotDataHandlingApproved: true,
  ownerReviewedCommercialDraft: true,
  contactIsNamedOperator: true,
  contactBaselineReviewed: true,
}

function readyDecisionArtifacts() {
  const handoff = renderShopPilotHandoff(shopPilotInputFromContactEvent(shopContactEvent, ownerInput))
  const reply = renderShopPilotReplyDraft(shopContactEvent, ownerInput, handoff)
  return { handoff, reply }
}

function ownerDecisionInput(handoff, reply, decision = 'approve-manual-send') {
  return {
    decision,
    actorKind: 'human',
    actorRole: 'owner',
    decidedBy: 'SuperMega Owner',
    decidedAt: '2026-08-01T15:30:00.000Z',
    note: decision === 'approve-manual-send' ? 'Reviewed recipient, dates, scope, fee, and boundaries.' : 'Owner review note.',
    reviewedHandoffSha256: createHash('sha256').update(handoff).digest('hex'),
    reviewedReplySha256: createHash('sha256').update(reply).digest('hex'),
  }
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
  assert.throws(() => buildShopPilotHandoff({ ...readyInput, sourceLeadDigest: 'a'.repeat(64) }), /shop_contact_source_binding_incomplete/)
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
  assert.match(handoff.source.qualificationDigest, /^[0-9a-f]{64}$/)
  assert.equal(handoff.operator.role, 'Shop manager')
  assert.deepEqual(handoff.baseline, readyInput.baseline)
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
  assert.throws(() => shopPilotInputFromContactEvent(shopContactEvent, { ...ownerInput, contactBaselineReviewed: false }), /shop_contact_baseline_review_required/)
  assert.throws(() => shopPilotInputFromContactEvent({ ...shopContactEvent, record: { ...shopContactEvent.record, raw: {} } }, ownerInput), /shop_contact_qualification_required/)
  assert.throws(() => shopPilotInputFromContactEvent(shopContactEvent, { ...ownerInput, baseline: { ...readyInput.baseline, weeklyOrders: 121 } }), /shop_contact_baseline_mismatch/)
  assert.throws(() => shopPilotInputFromContactEvent({ ...shopContactEvent, record: { ...shopContactEvent.record, lead_id: '' } }, ownerInput), /contact_lead_id_required/)
})

test('CLI emits a contact owner template with every authority gate closed', () => {
  const result = spawnSync(process.execPath, [resolve('tools/create_shop_pilot_handoff.mjs'), '--owner-example'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const template = JSON.parse(result.stdout)
  assert.equal(template.contactIsNamedOperator, false)
  assert.equal(template.contactBaselineReviewed, false)
  assert.equal(template.isolatedNonProductionTenantApproved, false)
  assert.equal(template.namedOperatorAuthorized, false)
  assert.equal(template.pilotDataHandlingApproved, false)
  assert.equal(template.ownerReviewedCommercialDraft, false)
  assert.equal('company' in template, false)
  assert.equal('operatorName' in template, false)
  assert.equal('operatorRole' in template, false)
  assert.equal('baseline' in template, false)
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
    assert.equal(receipt.contract, 'supermega.shop.pilot_handoff.v2')
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
    assert.match(artifact, /Reviewed qualification digest: `[0-9a-f]{64}`/)
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

test('records an exact owner decision without performing the selected next action', () => {
  const { handoff, reply } = readyDecisionArtifacts()
  const approved = buildShopPilotOwnerDecision(ownerDecisionInput(handoff, reply), handoff, reply)
  assert.equal(approved.contract, 'supermega.shop.pilot_owner_decision.v1')
  assert.equal(approved.status, 'approved-for-owner-manual-send')
  assert.equal(approved.authority.ownerManualSendApproved, true)
  assert.equal(approved.authority.automaticSendAllowed, false)
  assert.equal(approved.authority.hostedApprovalRecorded, false)
  assert.equal(approved.controls.customerContactPerformed, false)
  assert.match(approved.bindings.handoffSha256, /^[0-9a-f]{64}$/)
  assert.match(approved.bindings.replySha256, /^[0-9a-f]{64}$/)

  const revise = buildShopPilotOwnerDecision(ownerDecisionInput(handoff, reply, 'revise'), handoff, reply)
  assert.equal(revise.status, 'revision-required')
  assert.equal(revise.authority.ownerManualSendApproved, false)
  const decline = buildShopPilotOwnerDecision(ownerDecisionInput(handoff, reply, 'decline'), handoff, reply)
  assert.equal(decline.status, 'closed-no-outreach')
  assert.equal(decline.authority.ownerManualSendApproved, false)
})

test('rejects implicit authority, stale bindings, invalid time, and changed reviewed artifacts', () => {
  const { handoff, reply } = readyDecisionArtifacts()
  const input = ownerDecisionInput(handoff, reply)
  assert.throws(() => buildShopPilotOwnerDecision({ ...input, decision: 'approve' }, handoff, reply), /decision_invalid/)
  assert.throws(() => buildShopPilotOwnerDecision({ ...input, actorKind: 'agent' }, handoff, reply), /shop_pilot_owner_human_required/)
  assert.throws(() => buildShopPilotOwnerDecision({ ...input, actorRole: 'sales-agent' }, handoff, reply), /shop_pilot_owner_human_required/)
  assert.throws(() => buildShopPilotOwnerDecision({ ...input, decidedAt: '2026-08-01' }, handoff, reply), /decided_at_invalid/)
  assert.throws(() => buildShopPilotOwnerDecision({ ...input, reviewedReplySha256: '0'.repeat(64) }, handoff, reply), /shop_pilot_owner_review_binding_mismatch/)
  assert.throws(() => buildShopPilotOwnerDecision(input, `${handoff}\nchanged`, reply), /shop_pilot_reply_not_bound_to_handoff/)
  assert.throws(() => buildShopPilotOwnerDecision(input, handoff, `${reply}\nchanged`), /shop_pilot_owner_review_binding_mismatch/)
  assert.throws(
    () => buildShopPilotOwnerDecision(input, renderShopPilotHandoff({ ...readyInput, namedOperatorAuthorized: false }), reply),
    /shop_pilot_handoff_not_ready_for_decision/,
  )
})

test('CLI creates a digest-bound private owner decision and verifies it exactly', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-shop-owner-decision-'))
  const handoffPath = join(directory, 'private-handoff.md')
  const replyPath = join(directory, 'private-reply.txt')
  const inputPath = join(directory, 'decision-input.json')
  const outputPath = join(directory, 'private-decision.json')
  try {
    const { handoff, reply } = readyDecisionArtifacts()
    await writeFile(handoffPath, handoff)
    await writeFile(replyPath, reply)

    const template = spawnSync(process.execPath, [
      resolve('tools/create_shop_pilot_handoff.mjs'),
      '--decision-template', '--handoff', handoffPath, '--reply', replyPath,
    ], { encoding: 'utf8' })
    assert.equal(template.status, 0, template.stderr)
    const templateInput = JSON.parse(template.stdout)
    assert.equal(templateInput.decision, 'revise')
    assert.equal(templateInput.actorKind, 'human')
    assert.equal(templateInput.actorRole, 'owner')
    assert.equal(templateInput.decidedBy, '')
    assert.match(templateInput.reviewedHandoffSha256, /^[0-9a-f]{64}$/)
    assert.doesNotMatch(template.stdout, /Test Shop|Test Operator|private@example\.com/)

    await writeFile(inputPath, JSON.stringify(ownerDecisionInput(handoff, reply)))
    const command = [
      resolve('tools/create_shop_pilot_handoff.mjs'),
      '--owner-decision',
      '--decision-input', inputPath,
      '--handoff', handoffPath,
      '--reply', replyPath,
      '--output', outputPath,
    ]
    const created = spawnSync(process.execPath, command, { encoding: 'utf8' })
    assert.equal(created.status, 0, created.stderr)
    const receipt = JSON.parse(created.stdout)
    assert.equal(receipt.contract, 'supermega.shop.pilot_owner_decision.v1')
    assert.equal(receipt.status, 'approved-for-owner-manual-send')
    assert.equal(receipt.ownerManualSendApproved, true)
    assert.equal(receipt.externalWritesPerformed, false)
    assert.equal(receipt.customerContactPerformed, false)
    assert.doesNotMatch(created.stdout, /SuperMega Owner|Reviewed recipient|private@example\.com/)
    assert.equal(await readFile(outputPath, 'utf8'), renderShopPilotOwnerDecision(ownerDecisionInput(handoff, reply), handoff, reply))

    const verified = spawnSync(process.execPath, [command[0], '--verify', ...command.slice(1)], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr)
    assert.equal(JSON.parse(verified.stdout).mode, 'verify')

    await writeFile(outputPath, `${await readFile(outputPath, 'utf8')}changed\n`)
    const tampered = spawnSync(process.execPath, [command[0], '--verify', ...command.slice(1)], { encoding: 'utf8' })
    assert.notEqual(tampered.status, 0)
    assert.match(tampered.stderr, /shop_pilot_owner_decision_stale_or_tampered/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

const contactEvent = {
  event: 'supermega.contact.created',
  record: {
    lead_id: 'LEAD-WORKSPACE-0123456789',
    workflow: 'commerce',
    company: 'Workspace Test Shop',
    name: 'Workspace Operator',
    email: 'workspace-private@example.com',
    goal: 'Reduce order entry time and make close exceptions reviewable.',
    source_url: 'https://supermega.dev/contact/?private-source=1',
    referrer: 'https://private.example.invalid/',
    raw: {
      private_note: 'must be removed from the workspace event',
      shop: {
        operator_role: 'Shop manager',
        weekly_orders: 120,
        median_minutes_per_order: 8,
        weekly_exception_count: 12,
        close_minutes_per_day: 45,
        contact_is_operator: true,
      },
    },
  },
}

const readyOwnerInput = {
  tenantLabel: 'workspace-test-isolated-pilot',
  startDate: '2026-08-03',
  reviewDate: '2026-08-07',
  fixedPilotFeeUsd: 500,
  contactIsNamedOperator: true,
  contactBaselineReviewed: true,
  isolatedNonProductionTenantApproved: true,
  namedOperatorAuthorized: true,
  pilotDataHandlingApproved: true,
  ownerReviewedCommercialDraft: true,
}

test('runs the complete private workspace lifecycle without external action', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-sales-workspace-'))
  const workspace = join(parent, 'private-workspace')
  try {
    const initialized = await initShopPilotSalesWorkspace(contactEvent, workspace)
    assert.equal(initialized.stage, 'owner-input-required')
    assert.equal(initialized.filesCreated, 4)
    assert.equal(initialized.externalWritesPerformed, false)
    assert.deepEqual((await readdir(workspace)).sort(), ['README.md', 'contact-event.json', 'owner-input.json', 'workspace.json'])

    const sanitizedContact = await readFile(join(workspace, 'contact-event.json'), 'utf8')
    assert.match(sanitizedContact, /workspace-private@example\.com/)
    assert.doesNotMatch(sanitizedContact, /private_note|private-source|private\.example\.invalid/)
    assert.match(await readFile(join(workspace, 'README.md'), 'utf8'), /Nothing here sends a message, accepts payment, deploys, activates production, or writes hosted data/)
    assert.equal((await verifyShopPilotSalesWorkspace(workspace)).stage, 'owner-input-required')

    await assert.rejects(() => prepareShopPilotSalesWorkspace(workspace), /shop_contact_operator_confirmation_required/)
    await writeFile(join(workspace, 'owner-input.json'), `${JSON.stringify(readyOwnerInput, null, 2)}\n`)
    const prepared = await prepareShopPilotSalesWorkspace(workspace)
    assert.equal(prepared.stage, 'owner-decision-required')
    assert.equal(prepared.filesCreated, 4)
    assert.equal(prepared.customerContactPerformed, false)
    assert.equal((await verifyShopPilotSalesWorkspace(workspace)).stage, 'owner-decision-required')
    await assert.rejects(() => prepareShopPilotSalesWorkspace(workspace), /shop_pilot_workspace_prepared_outputs_exist/)

    const decisionInputPath = join(workspace, 'decision-input.json')
    const decisionInput = JSON.parse(await readFile(decisionInputPath, 'utf8'))
    assert.equal(decisionInput.decision, 'revise')
    assert.equal(decisionInput.decidedBy, '')
    assert.match(decisionInput.reviewedHandoffSha256, /^[0-9a-f]{64}$/)
    await writeFile(decisionInputPath, `${JSON.stringify({ ...decisionInput, reviewedReplySha256: '0'.repeat(64) }, null, 2)}\n`)
    await assert.rejects(() => verifyShopPilotSalesWorkspace(workspace), /shop_pilot_workspace_decision_input_invalid/)
    await writeFile(decisionInputPath, `${JSON.stringify(decisionInput, null, 2)}\n`)
    await assert.rejects(() => decideShopPilotSalesWorkspace(workspace), /decided_by_required/)
    await writeFile(decisionInputPath, `${JSON.stringify({
      ...decisionInput,
      decision: 'approve-manual-send',
      decidedBy: 'SuperMega Owner',
      decidedAt: '2026-08-01T16:00:00.000Z',
      note: 'Reviewed the recipient, exact reply, scope, dates, fee, and boundaries.',
    }, null, 2)}\n`)
    const decided = await decideShopPilotSalesWorkspace(workspace)
    assert.equal(decided.stage, 'approved-for-owner-manual-send')
    assert.equal(decided.ownerManualSendApproved, true)
    assert.equal(decided.customerContactPerformed, false)
    const verified = await verifyShopPilotSalesWorkspace(workspace)
    assert.equal(verified.stage, 'approved-for-owner-manual-send')
    assert.equal(verified.ownerManualSendApproved, true)
    await assert.rejects(() => decideShopPilotSalesWorkspace(workspace), /shop_pilot_workspace_decision_exists/)

    await writeFile(join(workspace, 'private-reply.txt'), `${await readFile(join(workspace, 'private-reply.txt'), 'utf8')}changed\n`)
    await assert.rejects(() => verifyShopPilotSalesWorkspace(workspace), /shop_pilot_workspace_prepared_artifact_stale_or_tampered/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('rejects unsafe initialization and incomplete workspace stages', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-sales-invalid-'))
  const workspace = join(parent, 'private-workspace')
  try {
    await assert.rejects(
      () => initShopPilotSalesWorkspace({ ...contactEvent, record: { ...contactEvent.record, workflow: 'website' } }, workspace),
      /shop_contact_event_required/,
    )
    await initShopPilotSalesWorkspace(contactEvent, workspace)
    await writeFile(join(workspace, 'private-handoff.md'), 'partial')
    await assert.rejects(() => verifyShopPilotSalesWorkspace(workspace), /shop_pilot_workspace_stage_incomplete/)
    await assert.rejects(() => initShopPilotSalesWorkspace(contactEvent, workspace), /EEXIST/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('CLI initializes and verifies a metadata-only private workspace', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-shop-sales-cli-'))
  const eventPath = join(parent, 'event.json')
  const workspace = join(parent, 'private-workspace')
  const tool = resolve('tools/manage_shop_pilot_workspace.mjs')
  try {
    await writeFile(eventPath, JSON.stringify(contactEvent))
    const initialized = spawnSync(process.execPath, [tool, '--init', '--contact-event', eventPath, '--workspace', workspace], { encoding: 'utf8' })
    assert.equal(initialized.status, 0, initialized.stderr)
    const receipt = JSON.parse(initialized.stdout)
    assert.equal(receipt.contract, 'supermega.shop.pilot_sales_workspace.v1')
    assert.equal(receipt.stage, 'owner-input-required')
    assert.equal(receipt.customerContactPerformed, false)
    assert.doesNotMatch(initialized.stdout, /Workspace Test Shop|Workspace Operator|workspace-private@example\.com/)

    const verified = spawnSync(process.execPath, [tool, '--verify', '--workspace', workspace], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr)
    assert.equal(JSON.parse(verified.stdout).verified, true)

    const duplicate = spawnSync(process.execPath, [tool, '--init', '--contact-event', eventPath, '--workspace', workspace], { encoding: 'utf8' })
    assert.notEqual(duplicate.status, 0)
    assert.match(duplicate.stderr, /EEXIST/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
