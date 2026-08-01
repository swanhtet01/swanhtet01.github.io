import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHOP_PILOT_HANDOFF_CONTRACT = 'supermega.shop.pilot_handoff.v1'

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

function optionalLeadDigest(value) {
  if (value === undefined) return null
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('source_lead_digest_invalid')
  return value
}

export function shopPilotInputFromContactEvent(event, ownerInput) {
  if (!event || event.event !== 'supermega.contact.created' || !event.record || event.record.workflow !== 'shop') {
    throw new Error('shop_contact_event_required')
  }
  if (!ownerInput || typeof ownerInput !== 'object' || Array.isArray(ownerInput)) throw new Error('shop_owner_input_required')
  if (ownerInput.contactIsNamedOperator !== true) throw new Error('shop_contact_operator_confirmation_required')
  const leadId = boundedText(event.record.lead_id, 'contact_lead_id', 80)

  return {
    ...ownerInput,
    company: boundedText(event.record.company, 'company'),
    operatorName: boundedText(event.record.name, 'operator_name'),
    operationalProblem: boundedText(event.record.goal, 'operational_problem', 500),
    sourceLeadDigest: sha256(leadId),
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
      contactEventBound: input.sourceLeadDigest !== undefined,
      leadDigest: optionalLeadDigest(input.sourceLeadDigest),
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
${handoff.source.contactEventBound ? `- Source lead digest: \`${handoff.source.leadDigest}\` (email and raw contact data excluded)` : '- Source: direct private owner intake'}

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

async function main() {
  const args = process.argv.slice(2)
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
