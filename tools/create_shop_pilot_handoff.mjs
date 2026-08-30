import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHOP_PILOT_HANDOFF_CONTRACT = 'supermega.shop.pilot_handoff.v3'
export const SHOP_PILOT_REPLY_DRAFT_CONTRACT = 'supermega.shop.pilot_reply_draft.v1'
export const SHOP_PILOT_OWNER_DECISION_CONTRACT = 'supermega.shop.pilot_owner_decision.v1'
export const SHOP_PILOT_PRODUCT = 'shop'
export const SHOP_PILOT_MODE = 'owner_named'
export const SHOP_PILOT_VERTICAL_PACK = 'spa-services'
export const SHOP_SPA_PILOT_PROFILE = 'spa-prepaid-membership-v1'
export const SHOP_SPA_WORK_ORDER_ID = 'shop-spa-owner-pilot'

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

function normalizeShopPilotMetadata(value, { defaultMissing = false } = {}) {
  const product = value.product === undefined && defaultMissing ? SHOP_PILOT_PRODUCT : boundedText(value.product, 'product', 40)
  const pilotMode = value.pilotMode === undefined && defaultMissing ? SHOP_PILOT_MODE : boundedText(value.pilotMode, 'pilot_mode', 40)
  const verticalPack = value.verticalPack === undefined && defaultMissing ? SHOP_PILOT_VERTICAL_PACK : boundedText(value.verticalPack, 'vertical_pack', 80)
  if (product !== SHOP_PILOT_PRODUCT) throw new Error('product_invalid')
  if (pilotMode !== SHOP_PILOT_MODE) throw new Error('pilot_mode_invalid')
  if (verticalPack !== SHOP_PILOT_VERTICAL_PACK) throw new Error('vertical_pack_unsupported')
  return { product, pilotMode, verticalPack }
}

function normalizeSpaServicesBaseline(value) {
  const source = value.verticalBaseline?.spaServices ?? value.spaBaseline ?? value.baseline
  return {
    clientImportRowCount: boundedNumber(source?.clientImportRowCount, 'baseline_client_import_row_count', { min: 1, max: 100_000, integer: true }),
    weeklyPackageSales: boundedNumber(source?.weeklyPackageSales, 'baseline_weekly_package_sales', { min: 1, max: 100_000, integer: true }),
    weeklyTreatmentRedemptions: boundedNumber(source?.weeklyTreatmentRedemptions, 'baseline_weekly_treatment_redemptions', { min: 1, max: 100_000, integer: true }),
    medianMinutesPerRedemption: boundedNumber(source?.medianMinutesPerRedemption, 'baseline_median_minutes_per_redemption', { min: 0.1, max: 1_440 }),
    weeklyPackageCorrectionCount: boundedNumber(source?.weeklyPackageCorrectionCount, 'baseline_weekly_package_correction_count', { min: 0, max: 100_000, integer: true }),
  }
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
  if (sanitizedEvent.record.raw.shop.contact_is_operator !== true) throw new Error('shop_contact_operator_status_required')
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
  const metadata = normalizeShopPilotMetadata(ownerInput, { defaultMissing: true })
  const { operatorRole: _legacyOperatorRole, baseline: _legacyBaseline, spaBaseline: _spaBaseline, verticalBaseline: _verticalBaseline, product: _product, pilotMode: _pilotMode, verticalPack: _verticalPack, ...reviewedOwnerInput } = ownerInput

  return {
    ...reviewedOwnerInput,
    ...metadata,
    company: sanitizedEvent.record.company,
    operatorName: sanitizedEvent.record.name,
    operatorRole: qualification.operatorRole,
    baseline: qualification.baseline,
    verticalBaseline: {
      spaServices: normalizeSpaServicesBaseline(ownerInput),
    },
    operationalProblem: sanitizedEvent.record.goal,
    sourceLeadDigest: sha256(leadId),
    sourceQualificationDigest: sha256(JSON.stringify(qualification)),
  }
}

export function buildShopPilotHandoff(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('shop_pilot_input_required')
  const metadata = normalizeShopPilotMetadata(input, { defaultMissing: true })
  const pilotProfile = input.pilotProfile === undefined
    ? SHOP_SPA_PILOT_PROFILE
    : boundedText(input.pilotProfile, 'pilot_profile', 80)
  if (pilotProfile !== SHOP_SPA_PILOT_PROFILE) throw new Error('pilot_profile_unsupported')

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
    workOrderId: SHOP_SPA_WORK_ORDER_ID,
    ...metadata,
    status: blockers.length === 0 ? 'ready-for-private-pilot' : 'blocked-owner-review',
    company: boundedText(input.company, 'company'),
    operator: {
      name: boundedText(input.operatorName, 'operator_name'),
      role: boundedText(input.operatorRole, 'operator_role'),
    },
    pilot: {
      product: metadata.product,
      pilotMode: metadata.pilotMode,
      verticalPack: metadata.verticalPack,
      profile: pilotProfile,
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
    verticalBaseline: {
      spaServices: normalizeSpaServicesBaseline(input),
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
      namedHumanConfirmsSpaServicesVerticalPack: true,
      observationAndApprovedPilotWritesOnly: true,
      customerMessagesAllowed: false,
      providerPaymentsAllowed: false,
      accountingPostingAllowed: false,
      productionActivationAllowed: false,
      deploymentAllowed: false,
    },
    evidencePlan: [
      { day: 1, focus: 'Shop baseline and Spa services vertical pack client import review', proof: 'Record the Shop baseline, then review the Spa services vertical pack client import and resolve every row before applying sample data.' },
      { day: 2, focus: 'Spa services vertical pack package sale', proof: 'Create and human-confirm a package sale for the reviewed client; reconcile payment and record completion time and corrections.' },
      { day: 3, focus: 'Spa services vertical pack treatment redemption', proof: 'Complete the matching treatment, record one immutable redemption, and prove mismatched or ineligible redemptions are refused.' },
      { day: 4, focus: 'Daily close and recovery', proof: 'Run a reviewed close, reload the workspace, and prove safe retry without duplicate sale, treatment, or redemption events.' },
      { day: 5, focus: 'Replay, export, and owner acceptance', proof: 'Verify retained package balance and evidence, compare measurements, create a backup, and record the owner decision.' },
    ],
    acceptance: {
      requiredMeasurements: [
        'median_minutes_per_order',
        'weekly_exception_rate',
        'close_minutes_per_day',
        'operator_corrections',
        'reload_and_retry_result',
        'client_import_minutes',
        'package_sale_minutes',
        'treatment_redemption_minutes',
        'package_balance_result',
      ],
      requiredJourney: [
        'reviewed_client_import',
        'reconciled_package_sale',
        'matching_completed_treatment',
        'immutable_package_redemption',
        'reviewed_daily_close',
        'workspace_backup_and_recovery',
      ],
      sampleEvidenceCanCloseGate: false,
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
  const spaBaseline = handoff.verticalBaseline.spaServices

  return `# PRIVATE - SuperMega Shop five-day pilot handoff

Status: **${handoff.status.toUpperCase()}**

This private artifact contains operator and company information. Do not commit, publish, or send it without owner review.

## Pilot identity

- Company: ${markdownText(handoff.company)}
- Named operator: ${markdownText(handoff.operator.name)} (${markdownText(handoff.operator.role)})
- Product: ${handoff.product}
- Pilot mode: ${handoff.pilotMode}
- Vertical pack: ${handoff.verticalPack}
- Isolated tenant label: ${markdownText(handoff.pilot.tenantLabel)}
- Pilot profile: ${handoff.pilot.profile}
- Work order: ${handoff.workOrderId}
- Operational problem: ${markdownText(handoff.pilot.operationalProblem)}
- Pilot window: ${handoff.pilot.startDate} through ${handoff.pilot.reviewDate}
${handoff.source.contactEventBound ? `- Source lead digest: \`${handoff.source.leadDigest}\` (email and raw contact data excluded)\n- Reviewed qualification digest: \`${handoff.source.qualificationDigest}\`` : '- Source: direct private owner intake'}

## Recorded Shop baseline

- Weekly orders: ${handoff.baseline.weeklyOrders}
- Median minutes per order: ${handoff.baseline.medianMinutesPerOrder}
- Weekly exceptions: ${handoff.baseline.weeklyExceptionCount}
- Daily close minutes: ${handoff.baseline.closeMinutesPerDay}

## Spa services vertical pack baseline

- Client rows prepared for reviewed client import: ${spaBaseline.clientImportRowCount}
- Weekly prepaid package sales: ${spaBaseline.weeklyPackageSales}
- Weekly treatment redemptions: ${spaBaseline.weeklyTreatmentRedemptions}
- Median minutes per treatment redemption: ${spaBaseline.medianMinutesPerRedemption}
- Weekly package corrections: ${spaBaseline.weeklyPackageCorrectionCount}

## Five-day evidence plan

${dayLines}

## Acceptance review

- Compare import time, package-sale time, treatment-redemption time, package balance, close time, operator corrections, and reload/retry evidence with the recorded baseline.
- Record failures and operator interventions; do not convert missing evidence into a success claim.
- A named human confirms client import, package sale, treatment, redemption, and close. Sample data cannot close the real-client gate. Customer messaging, provider payment, accounting posting, deployment, and production activation remain outside this pilot.
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
- the generic Shop order, exception, reload/retry, and daily close workflow;
- Spa services vertical pack: reviewed client import and correction;
- Spa services vertical pack: one reconciled package sale;
- Spa services vertical pack: one matching completed treatment redemption; and
- a final package-balance review, backup, and owner acceptance decision.

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
      product: SHOP_PILOT_PRODUCT,
      pilotMode: SHOP_PILOT_MODE,
      verticalPack: SHOP_PILOT_VERTICAL_PACK,
      tenantLabel: 'example-shop-isolated-pilot',
      startDate: '2026-08-03',
      reviewDate: '2026-08-07',
      fixedPilotFeeUsd: 500,
      spaBaseline: {
        clientImportRowCount: '',
        weeklyPackageSales: '',
        weeklyTreatmentRedemptions: '',
        medianMinutesPerRedemption: '',
        weeklyPackageCorrectionCount: '',
      },
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
      product: SHOP_PILOT_PRODUCT,
      pilotMode: SHOP_PILOT_MODE,
      verticalPack: SHOP_PILOT_VERTICAL_PACK,
      company: 'Example Shop',
      operatorName: 'Example Operator',
      operatorRole: 'Shop manager',
      tenantLabel: 'example-shop-isolated-pilot',
      operationalProblem: 'Reduce manual order re-entry and make daily close exceptions reviewable.',
      startDate: '2026-08-03',
      reviewDate: '2026-08-07',
      baseline: {
        weeklyOrders: 120,
        medianMinutesPerOrder: 8,
        weeklyExceptionCount: 12,
        closeMinutesPerDay: 45,
      },
      verticalBaseline: {
        spaServices: {
          clientImportRowCount: 40,
          weeklyPackageSales: 12,
          weeklyTreatmentRedemptions: 24,
          medianMinutesPerRedemption: 3,
          weeklyPackageCorrectionCount: 2,
        },
      },
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
