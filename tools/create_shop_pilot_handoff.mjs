import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHOP_PILOT_HANDOFF_CONTRACT = 'supermega.shop.pilot_handoff.v2'
export const SHOP_PILOT_REPLY_DRAFT_CONTRACT = 'supermega.shop.pilot_reply_draft.v1'
export const SHOP_PILOT_OWNER_DECISION_CONTRACT = 'supermega.shop.pilot_owner_decision.v1'

const MAX_TEXT = 180
const DAY_MS = 24 * 60 * 60 * 1000

function boundedText(value, field, max = MAX_TEXT) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}_required`)
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`${field}_invalid`)
  return normalized
}

function boundedNumber(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${field}_invalid`)
  }
  return parsed
}

function dateOnly(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field}_invalid`)
  const instant = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== value) throw new Error(`${field}_invalid`)
  return { value, instant }
}

function usd(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function markdownText(value) {
  return value.replace(/[\\`*_[\]{}()#+.!|>-]/g, '\\$&')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function optionalDigest(value, field) {
  if (value === undefined) return null
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`${field}_invalid`)
  return value
}

function shopQualificationFromContactEvent(event) {
  const shop = event.record.raw?.shop
  if (!shop || typeof shop !== 'object' || Array.isArray(shop)) throw new Error('shop_contact_qualification_required')
  return {
    operatorRole: boundedText(shop.operator_role, 'contact_operator_role'),
    baseline: {
      weeklyOrders: boundedNumber(shop.weekly_orders, 'contact_weekly_orders', { min: 1, max: 100_000, integer: true }),
      medianMinutesPerOrder: boundedNumber(shop.median_minutes_per_order, 'contact_median_minutes_per_order', { min: 0.1, max: 1_440 }),
      weeklyExceptionCount: boundedNumber(shop.weekly_exception_count, 'contact_weekly_exception_count', { min: 0, max: 100_000, integer: true }),
      closeMinutesPerDay: boundedNumber(shop.close_minutes_per_day, 'contact_close_minutes_per_day', { min: 0, max: 1_440 }),
    },
  }
}

function privateEmail(value) {
  const email = boundedText(value, 'contact_email', 180)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('contact_email_invalid')
  return email
}

function exactIsoInstant(value, field) {
  const normalized = boundedText(value, field, 40)
  const instant = Date.parse(normalized)
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== normalized) throw new Error(`${field}_invalid`)
  return normalized
}

function reviewedShopPilotArtifacts(verifiedHandoff, verifiedReplyDraft) {
  if (typeof verifiedHandoff !== 'string' || Buffer.byteLength(verifiedHandoff, 'utf8') > 200_000) throw new Error('shop_pilot_handoff_invalid')
  if (typeof verifiedReplyDraft !== 'string' || Buffer.byteLength(verifiedReplyDraft, 'utf8') > 100_000) throw new Error('shop_pilot_reply_draft_invalid')
  const handoffSha256 = sha256(verifiedHandoff)
  if (!verifiedHandoff.includes('Status: **READY-FOR-PRIVATE-PILOT**') || !verifiedHandoff.includes(`Contract: \`${SHOP_PILOT_HANDOFF_CONTRACT}\``)) {
    throw new Error('shop_pilot_handoff_not_ready_for_decision')
  }
  if (
    !/^DRAFT .* OWNER REVIEW REQUIRED .* NOT SENT\r?\n/.test(verifiedReplyDraft)
    || !verifiedReplyDraft.includes(`Verified handoff SHA-256: ${handoffSha256}`)
    || !verifiedReplyDraft.includes('This file is a local draft. It has not been sent and performs no external action.')
  ) {
    throw new Error('shop_pilot_reply_not_bound_to_handoff')
  }
  return { handoffSha256, replySha256: sha256(verifiedReplyDraft) }
}

export function buildShopPilotOwnerDecision(input, verifiedHandoff, verifiedReplyDraft) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('shop_pilot_owner_decision_input_required')
  const bindings = reviewedShopPilotArtifacts(verifiedHandoff, verifiedReplyDraft)
  const decision = boundedText(input.decision, 'decision', 40)
  if (!['approve-manual-send', 'revise', 'decline'].includes(decision)) throw new Error('decision_invalid')
  if (input.actorKind !== 'human' || input.actorRole !== 'owner') throw new Error('shop_pilot_owner_human_required')
  if (input.reviewedHandoffSha256 !== bindings.handoffSha256 || input.reviewedReplySha256 !== bindings.replySha256) {
    throw new Error('shop_pilot_owner_review_binding_mismatch')
  }
  const statusByDecision = {
    'approve-manual-send': 'approved-for-owner-manual-send',
    revise: 'revision-required',
    decline: 'closed-no-outreach',
  }
  const nextActionByDecision = {
    'approve-manual-send': 'Owner may manually send the exact reviewed reply after independently verifying the recipient and terms.',
    revise: 'Revise the private handoff or reply, then create a new digest-bound owner decision.',
    decline: 'Close the local lead workflow without outreach.',
  }
  return {
    contract: SHOP_PILOT_OWNER_DECISION_CONTRACT,
    status: statusByDecision[decision],
    decision,
    actor: {
      name: boundedText(input.decidedBy, 'decided_by'),
      kind: 'human',
      role: 'owner',
      identityVerification: 'owner-asserted-local',
    },
    decidedAt: exactIsoInstant(input.decidedAt, 'decided_at'),
    note: boundedText(input.note, 'decision_note', 500),
    bindings: {
      handoffContract: SHOP_PILOT_HANDOFF_CONTRACT,
      replyContract: SHOP_PILOT_REPLY_DRAFT_CONTRACT,
      handoffSha256: bindings.handoffSha256,
      replySha256: bindings.replySha256,
    },
    nextAction: nextActionByDecision[decision],
    authority: {
      ownerManualSendApproved: decision === 'approve-manual-send',
      automaticSendAllowed: false,
      customerDataWriteAllowed: false,
      paymentAllowed: false,
      deploymentAllowed: false,
      productionActivationAllowed: false,
      hostedApprovalRecorded: false,
    },
    controls: {
      privateArtifact: true,
      externalWritesPerformed: false,
      customerContactPerformed: false,
      paymentPerformed: false,
      deploymentPerformed: false,
    },
  }
}

export function renderShopPilotOwnerDecision(input, verifiedHandoff, verifiedReplyDraft) {
  return `${JSON.stringify(buildShopPilotOwnerDecision(input, verifiedHandoff, verifiedReplyDraft), null, 2)}\n`
}

export function sanitizeShopPilotContactEvent(event) {
  if (!event || event.event !== 'supermega.contact.created' || !event.record || !['commerce', 'shop'].includes(event.record.workflow)) {
    throw new Error('shop_contact_event_required')
  }
  const leadId = boundedText(event.record.lead_id, 'contact_lead_id', 80)
  const qualification = shopQualificationFromContactEvent(event)
  return {
    event: 'supermega.contact.created',
    record: {
      lead_id: leadId,
      workflow: 'commerce',
      company: boundedText(event.record.company, 'company'),
      name: boundedText(event.record.name, 'operator_name'),
      email: privateEmail(event.record.email),
      goal: boundedText(event.record.goal, 'operational_problem', 500),
      raw: {
        shop: {
          operator_role: qualification.operatorRole,
          weekly_orders: qualification.baseline.weeklyOrders,
          median_minutes_per_order: qualification.baseline.medianMinutesPerOrder,
          weekly_exception_count: qualification.baseline.weeklyExceptionCount,
          close_minutes_per_day: qualification.baseline.closeMinutesPerDay,
          contact_is_operator: event.record.raw.shop.contact_is_operator === true,
        },
      },
    },
  }
}

export function shopPilotInputFromContactEvent(event, ownerInput) {
  const sanitizedEvent = sanitizeShopPilotContactEvent(event)
  if (!ownerInput || typeof ownerInput !== 'object' || Array.isArray(ownerInput)) throw new Error('shop_owner_input_required')
  if (ownerInput.contactIsNamedOperator !== true) throw new Error('shop_contact_operator_confirmation_required')
  if (ownerInput.contactBaselineReviewed !== true) throw new Error('shop_contact_baseline_review_required')
  const leadId = sanitizedEvent.record.lead_id
  const qualification = shopQualificationFromContactEvent(sanitizedEvent)
  if (ownerInput.operatorRole !== undefined && boundedText(ownerInput.operatorRole, 'operator_role') !== qualification.operatorRole) {
    throw new Error('shop_contact_baseline_mismatch')
  }
  if (ownerInput.baseline !== undefined) {
    const legacyBaseline = {
      weeklyOrders: boundedNumber(ownerInput.baseline?.weeklyOrders, 'baseline_weekly_orders', { min: 1, max: 100_000, integer: true }),
      medianMinutesPerOrder: boundedNumber(ownerInput.baseline?.medianMinutesPerOrder, 'baseline_median_minutes_per_order', { min: 0.1, max: 1_440 }),
      weeklyExceptionCount: boundedNumber(ownerInput.baseline?.weeklyExceptionCount, 'baseline_weekly_exception_count', { min: 0, max: 100_000, integer: true }),
      closeMinutesPerDay: boundedNumber(ownerInput.baseline?.closeMinutesPerDay, 'baseline_close_minutes_per_day', { min: 0, max: 1_440 }),
    }
    if (JSON.stringify(legacyBaseline) !== JSON.stringify(qualification.baseline)) throw new Error('shop_contact_baseline_mismatch')
  }
  const { operatorRole: _legacyOperatorRole, baseline: _legacyBaseline, ...reviewedOwnerInput } = ownerInput

  return {
    ...reviewedOwnerInput,
    company: sanitizedEvent.record.company,
    operatorName: sanitizedEvent.record.name,
    operatorRole: qualification.operatorRole,
    baseline: qualification.baseline,
    operationalProblem: sanitizedEvent.record.goal,
    sourceLeadDigest: sha256(leadId),
    sourceQualificationDigest: sha256(JSON.stringify(qualification)),
  }
}

export function buildShopPilotHandoff(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('shop_pilot_input_required')

  const start = dateOnly(input.startDate, 'start_date')
  const review = dateOnly(input.reviewDate, 'review_date')
  const expectedReview = start.instant + (4 * DAY_MS)
  if (review.instant !== expectedReview) throw new Error('review_date_must_close_five_day_plan')

  const gates = {
    isolatedNonProductionTenantApproved: input.isolatedNonProductionTenantApproved === true,
    namedOperatorAuthorized: input.namedOperatorAuthorized === true,
    pilotDataHandlingApproved: input.pilotDataHandlingApproved === true,
    ownerReviewedCommercialDraft: input.ownerReviewedCommercialDraft === true,
  }
  const blockers = Object.entries(gates).filter(([, passed]) => !passed).map(([id]) => id)
  const sourceLeadDigest = optionalDigest(input.sourceLeadDigest, 'source_lead_digest')
  const sourceQualificationDigest = optionalDigest(input.sourceQualificationDigest, 'source_qualification_digest')
  if ((sourceLeadDigest === null) !== (sourceQualificationDigest === null)) throw new Error('shop_contact_source_binding_incomplete')

  return {
    contract: SHOP_PILOT_HANDOFF_CONTRACT,
    status: blockers.length === 0 ? 'ready-for-private-pilot' : 'blocked-owner-review',
    company: boundedText(input.company, 'company'),
    operator: {
      name: boundedText(input.operatorName, 'operator_name'),
      role: boundedText(input.operatorRole, 'operator_role'),
    },
    pilot: {
      tenantLabel: boundedText(input.tenantLabel, 'tenant_label'),
      operationalProblem: boundedText(input.operationalProblem, 'operational_problem', 500),
      startDate: start.value,
      reviewDate: review.value,
      durationDays: 5,
    },
    baseline: {
      weeklyOrders: boundedNumber(input.baseline?.weeklyOrders, 'baseline_weekly_orders', { min: 1, max: 100_000, integer: true }),
      medianMinutesPerOrder: boundedNumber(input.baseline?.medianMinutesPerOrder, 'baseline_median_minutes_per_order', { min: 0.1, max: 1_440 }),
      weeklyExceptionCount: boundedNumber(input.baseline?.weeklyExceptionCount, 'baseline_weekly_exception_count', { min: 0, max: 100_000, integer: true }),
      closeMinutesPerDay: boundedNumber(input.baseline?.closeMinutesPerDay, 'baseline_close_minutes_per_day', { min: 0, max: 1_440 }),
    },
    commercialDraft: {
      fixedPilotFeeUsd: boundedNumber(input.fixedPilotFeeUsd, 'fixed_pilot_fee_usd', { min: 1, max: 100_000, integer: true }),
      paymentAccepted: false,
      taxAndPaymentTermsApproved: false,
    },
    source: {
      contactEventBound: sourceLeadDigest !== null,
      leadDigest: sourceLeadDigest,
      qualificationDigest: sourceQualificationDigest,
      contactEmailRetained: false,
      rawContactDataRetained: false,
    },
    gates,
    blockers,
    authority: {
      namedHumanConfirmsOrdersAndClose: true,
      observationAndApprovedPilotWritesOnly: true,
      customerMessagesAllowed: false,
      providerPaymentsAllowed: false,
      accountingPostingAllowed: false,
      productionActivationAllowed: false,
      deploymentAllowed: false,
    },
    evidencePlan: [
      { day: 1, focus: 'Baseline and operator walkthrough', proof: 'Record the baseline metrics and complete one observation-only walkthrough.' },
      { day: 2, focus: 'Order entry and review', proof: 'Create and human-confirm test orders; record completion time and corrections.' },
      { day: 3, focus: 'Daily close and exception', proof: 'Run a reviewed close and one controlled exception without external posting.' },
      { day: 4, focus: 'Return and recovery', proof: 'Rehearse one return exception plus reload and safe retry evidence.' },
      { day: 5, focus: 'Replay, export, and acceptance', proof: 'Verify retained evidence, compare measurements, and record the operator decision.' },
    ],
    acceptance: {
      requiredMeasurements: [
        'median_minutes_per_order',
        'weekly_exception_rate',
        'close_minutes_per_day',
        'operator_corrections',
        'reload_and_retry_result',
      ],
      improvementClaimAllowedBeforeReview: false,
      activationDecision: 'owner-review-required',
    },
    controls: {
      privateArtifact: true,
      externalWritesPerformed: false,
      customerContactPerformed: false,
      paymentPerformed: false,
      deploymentPerformed: false,
      hostedActivationProven: false,
    },
  }
}

export function renderShopPilotHandoff(input) {
  const handoff = buildShopPilotHandoff(input)
  const gateLines = Object.entries(handoff.gates)
    .map(([gate, passed]) => `- ${passed ? 'PASS' : 'BLOCKED'}: ${gate}`)
    .join('\n')
  const dayLines = handoff.evidencePlan
    .map(({ day, focus, proof }) => `- Day ${day} - **${focus}:** ${proof}`)
    .join('\n')

  return `# PRIVATE - SuperMega Shop five-day pilot handoff

Status: **${handoff.status.toUpperCase()}**

This private artifact contains operator and company information. Do not commit, publish, or send it without owner review.

## Pilot identity

- Company: ${markdownText(handoff.company)}
- Named operator: ${markdownText(handoff.operator.name)} (${markdownText(handoff.operator.role)})
- Isolated tenant label: ${markdownText(handoff.pilot.tenantLabel)}
- Operational problem: ${markdownText(handoff.pilot.operationalProblem)}
- Pilot window: ${handoff.pilot.startDate} through ${handoff.pilot.reviewDate}
${handoff.source.contactEventBound ? `- Source lead digest: \`${handoff.source.leadDigest}\` (email and raw contact data excluded)\n- Reviewed qualification digest: \`${handoff.source.qualificationDigest}\`` : '- Source: direct private owner intake'}

## Recorded baseline

- Weekly orders: ${handoff.baseline.weeklyOrders}
- Median minutes per order: ${handoff.baseline.medianMinutesPerOrder}
- Weekly exceptions: ${handoff.baseline.weeklyExceptionCount}
- Daily close minutes: ${handoff.baseline.closeMinutesPerDay}

## Five-day evidence plan

${dayLines}

## Acceptance review

- Compare median order time, exception rate, close time, operator corrections, and reload/retry evidence with the recorded baseline.
- Record failures and operator interventions; do not convert missing evidence into a success claim.
- A named human confirms orders and close. Customer messaging, provider payment, accounting posting, deployment, and production activation remain outside this pilot.
- Review date: **${handoff.pilot.reviewDate}**.

## Start gates

${gateLines}

## Commercial draft

- Fixed five-day pilot fee: **${usd(handoff.commercialDraft.fixedPilotFeeUsd)}**.
- Payment and tax terms remain unapproved until the owner reviews them separately.
- This artifact does not contact the customer, accept payment, deploy software, or prove hosted activation.

Contract: \`${handoff.contract}\`
`
}

export function renderShopPilotReplyDraft(event, ownerInput, verifiedHandoff) {
  const input = shopPilotInputFromContactEvent(event, ownerInput)
  const handoff = buildShopPilotHandoff(input)
  if (handoff.status !== 'ready-for-private-pilot') throw new Error('shop_pilot_not_ready_for_outreach')
  const expectedHandoff = renderShopPilotHandoff(input)
  if (verifiedHandoff !== expectedHandoff) throw new Error('shop_pilot_handoff_stale_or_tampered')
  const email = privateEmail(event.record.email)
  const handoffDigest = sha256(verifiedHandoff)

  return `DRAFT — OWNER REVIEW REQUIRED — NOT SENT
To: ${email}
Subject: SuperMega Shop five-day pilot for ${handoff.company}

Hi ${handoff.operator.name},

Thanks for describing the workflow at ${handoff.company}. We have prepared a private five-day Shop pilot draft for ${handoff.pilot.startDate} through ${handoff.pilot.reviewDate}.

The proposed pilot covers:
- reviewed Shop order entry and confirmation;
- one daily close and controlled exception;
- one return, reload, and safe-retry rehearsal; and
- a final evidence export and operator acceptance review.

The fixed pilot-fee draft is ${usd(handoff.commercialDraft.fixedPilotFeeUsd)}. Payment and tax terms still require separate confirmation before any payment is accepted.

This pilot does not include automatic customer messages, provider payment, accounting posting, deployment, or production activation. Results will be compared with the recorded baseline; no improvement is guaranteed before the final review.

If this scope matches the workflow you want to test, please confirm the pilot dates, named operator role, and isolated non-production workspace with SuperMega's owner.

Regards,
SuperMega

Private evidence binding:
- Source lead digest: ${handoff.source.leadDigest}
- Verified handoff SHA-256: ${handoffDigest}

This file is a local draft. It has not been sent and performs no external action.
`
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--decision-template')) {
    const handoffIndex = args.indexOf('--handoff')
    const replyIndex = args.indexOf('--reply')
    if (args.length !== 5 || handoffIndex < 0 || replyIndex < 0 || !args[handoffIndex + 1] || !args[replyIndex + 1]) {
      throw new Error('usage: node tools/create_shop_pilot_handoff.mjs --decision-template --handoff private-handoff.md --reply private-reply.txt')
    }
    const reviewed = reviewedShopPilotArtifacts(
      await readFile(resolve(args[handoffIndex + 1]), 'utf8'),
      await readFile(resolve(args[replyIndex + 1]), 'utf8'),
    )
    process.stdout.write(`${JSON.stringify({
      decision: 'revise',
      actorKind: 'human',
      actorRole: 'owner',
      decidedBy: '',
      decidedAt: '',
      note: '',
      reviewedHandoffSha256: reviewed.handoffSha256,
      reviewedReplySha256: reviewed.replySha256,
    }, null, 2)}\n`)
    return
  }
  if (args.includes('--owner-decision')) {
    const decisionInputIndex = args.indexOf('--decision-input')
    const handoffIndex = args.indexOf('--handoff')
    const replyIndex = args.indexOf('--reply')
    const outputIndex = args.indexOf('--output')
    const verifyOnly = args.includes('--verify')
    const expectedLength = verifyOnly ? 10 : 9
    if (
      args.length !== expectedLength || decisionInputIndex < 0 || handoffIndex < 0 || replyIndex < 0 || outputIndex < 0
      || !args[decisionInputIndex + 1] || !args[handoffIndex + 1] || !args[replyIndex + 1] || !args[outputIndex + 1]
    ) {
      throw new Error('usage: node tools/create_shop_pilot_handoff.mjs --owner-decision [--verify] --decision-input decision.json --handoff private-handoff.md --reply private-reply.txt --output private-decision.json')
    }
    const handoff = await readFile(resolve(args[handoffIndex + 1]), 'utf8')
    const reply = await readFile(resolve(args[replyIndex + 1]), 'utf8')
    const decision = renderShopPilotOwnerDecision(
      JSON.parse(await readFile(resolve(args[decisionInputIndex + 1]), 'utf8')),
      handoff,
      reply,
    )
    const outputPath = resolve(args[outputIndex + 1])
    if (verifyOnly) {
      if (await readFile(outputPath, 'utf8') !== decision) throw new Error('shop_pilot_owner_decision_stale_or_tampered')
    } else {
      await writeFile(outputPath, decision, { encoding: 'utf8', flag: 'wx' })
    }
    const parsed = JSON.parse(decision)
    process.stdout.write(`${JSON.stringify({
      ok: true,
      contract: SHOP_PILOT_OWNER_DECISION_CONTRACT,
      mode: verifyOnly ? 'verify' : 'create',
      status: parsed.status,
      decision: parsed.decision,
      artifactSha256: sha256(decision),
      ownerManualSendApproved: parsed.authority.ownerManualSendApproved,
      externalWritesPerformed: false,
      customerContactPerformed: false,
    })}\n`)
    return
  }
  if (args.length === 1 && args[0] === '--owner-example') {
    process.stdout.write(`${JSON.stringify({
      tenantLabel: 'example-shop-isolated-pilot',
      startDate: '2026-08-03',
      reviewDate: '2026-08-07',
      fixedPilotFeeUsd: 500,
      contactIsNamedOperator: false,
      contactBaselineReviewed: false,
      isolatedNonProductionTenantApproved: false,
      namedOperatorAuthorized: false,
      pilotDataHandlingApproved: false,
      ownerReviewedCommercialDraft: false,
    }, null, 2)}\n`)
    return
  }
  if (args.length === 1 && args[0] === '--example') {
    process.stdout.write(`${JSON.stringify({
      company: 'Example Shop',
      operatorName: 'Example Operator',
      operatorRole: 'Shop manager',
      tenantLabel: 'example-shop-isolated-pilot',
      operationalProblem: 'Reduce manual order re-entry and make daily close exceptions reviewable.',
      startDate: '2026-08-03',
      reviewDate: '2026-08-07',
      baseline: { weeklyOrders: 120, medianMinutesPerOrder: 8, weeklyExceptionCount: 12, closeMinutesPerDay: 45 },
      fixedPilotFeeUsd: 500,
      isolatedNonProductionTenantApproved: false,
      namedOperatorAuthorized: false,
      pilotDataHandlingApproved: false,
      ownerReviewedCommercialDraft: false,
    }, null, 2)}\n`)
    return
  }

  if (args.includes('--draft-reply')) {
    const contactEventIndex = args.indexOf('--contact-event')
    const ownerInputIndex = args.indexOf('--owner-input')
    const handoffIndex = args.indexOf('--handoff')
    const outputIndex = args.indexOf('--output')
    const verifyOnly = args.includes('--verify')
    const expectedLength = verifyOnly ? 10 : 9
    if (
      args.length !== expectedLength || contactEventIndex < 0 || ownerInputIndex < 0 || handoffIndex < 0 || outputIndex < 0
      || !args[contactEventIndex + 1] || !args[ownerInputIndex + 1] || !args[handoffIndex + 1] || !args[outputIndex + 1]
    ) {
      throw new Error('usage: node tools/create_shop_pilot_handoff.mjs --draft-reply [--verify] --contact-event event.json --owner-input owner.json --handoff private-handoff.md --output private-reply.txt')
    }
    const event = JSON.parse(await readFile(resolve(args[contactEventIndex + 1]), 'utf8'))
    const ownerInput = JSON.parse(await readFile(resolve(args[ownerInputIndex + 1]), 'utf8'))
    const verifiedHandoff = await readFile(resolve(args[handoffIndex + 1]), 'utf8')
    const outputPath = resolve(args[outputIndex + 1])
    const draft = renderShopPilotReplyDraft(event, ownerInput, verifiedHandoff)
    if (verifyOnly) {
      if (await readFile(outputPath, 'utf8') !== draft) throw new Error('shop_pilot_reply_draft_stale_or_tampered')
    } else {
      await writeFile(outputPath, draft, { encoding: 'utf8', flag: 'wx' })
    }
    process.stdout.write(`${JSON.stringify({
      ok: true,
      contract: SHOP_PILOT_REPLY_DRAFT_CONTRACT,
      mode: verifyOnly ? 'verify' : 'create',
      artifactSha256: sha256(draft),
      handoffSha256: sha256(verifiedHandoff),
      externalWritesPerformed: false,
      customerContactPerformed: false,
    })}\n`)
    return
  }

  const inputIndex = args.indexOf('--input')
  const contactEventIndex = args.indexOf('--contact-event')
  const ownerInputIndex = args.indexOf('--owner-input')
  const outputIndex = args.indexOf('--output')
  const verifyOnly = args.includes('--verify')
  const directMode = inputIndex >= 0 && contactEventIndex < 0 && ownerInputIndex < 0
  const contactMode = inputIndex < 0 && contactEventIndex >= 0 && ownerInputIndex >= 0
  const expectedLength = (verifyOnly ? 1 : 0) + (directMode ? 4 : 6)
  if (
    (!directMode && !contactMode) || args.length !== expectedLength || outputIndex < 0 || !args[outputIndex + 1]
    || (directMode && !args[inputIndex + 1])
    || (contactMode && (!args[contactEventIndex + 1] || !args[ownerInputIndex + 1]))
  ) {
    throw new Error('usage: node tools/create_shop_pilot_handoff.mjs [--verify] (--input private-pilot.json | --contact-event event.json --owner-input owner.json) --output private-handoff.md')
  }
  const outputPath = resolve(args[outputIndex + 1])
  const input = directMode
    ? JSON.parse(await readFile(resolve(args[inputIndex + 1]), 'utf8'))
    : shopPilotInputFromContactEvent(
        JSON.parse(await readFile(resolve(args[contactEventIndex + 1]), 'utf8')),
        JSON.parse(await readFile(resolve(args[ownerInputIndex + 1]), 'utf8')),
      )
  const handoff = buildShopPilotHandoff(input)
  const rendered = renderShopPilotHandoff(input)
  if (verifyOnly) {
    if (await readFile(outputPath, 'utf8') !== rendered) throw new Error('shop_pilot_handoff_stale_or_tampered')
  } else {
    await writeFile(outputPath, rendered, { encoding: 'utf8', flag: 'wx' })
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    contract: SHOP_PILOT_HANDOFF_CONTRACT,
    mode: verifyOnly ? 'verify' : 'create',
    status: handoff.status,
    blockerCount: handoff.blockers.length,
    artifactSha256: sha256(rendered),
    externalWritesPerformed: false,
  })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, externalWritesPerformed: false })}\n`)
    process.exitCode = 1
  })
}
