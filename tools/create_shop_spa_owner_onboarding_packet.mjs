import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SHOP_PILOT_MODE,
  SHOP_PILOT_PRODUCT,
  SHOP_PILOT_VERTICAL_PACK,
} from './create_shop_pilot_handoff.mjs'

export const SHOP_SPA_OWNER_ONBOARDING_PACKET_CONTRACT = 'supermega.shop.spa_owner_onboarding_packet.v1'

const FILES = Object.freeze({
  manifest: 'packet.json',
  start: 'START-HERE.md',
  ownerInput: 'owner-input.template.json',
  contactEvent: 'contact-event.sample.json',
  services: 'sample-spa-services.csv',
  clients: 'sample-client-import.csv',
  operatorScript: 'day-1-operator-script.md',
  proofPlan: 'five-day-proof-plan.md',
  roiScorecard: 'owner-roi-scorecard.md',
  metrics: 'sample-first-week-metrics.csv',
  noExternalAction: 'NO-EXTERNAL-ACTION.md',
})

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function packetManifest() {
  return {
    contract: SHOP_SPA_OWNER_ONBOARDING_PACKET_CONTRACT,
    product: SHOP_PILOT_PRODUCT,
    pilotMode: SHOP_PILOT_MODE,
    verticalPack: SHOP_PILOT_VERTICAL_PACK,
    audience: 'owner-private-review',
    businessType: 'spa-services',
    stage: 'local-owner-review-required',
    files: Object.values(FILES),
    firstAction: 'Read START-HERE.md, then fill owner-input.template.json privately with the owner.',
    authority: {
      customerContactAllowed: false,
      externalMessagesAllowed: false,
      paymentAllowed: false,
      stockMovementAllowed: false,
      accountingPostingAllowed: false,
      deploymentAllowed: false,
      productionActivationAllowed: false,
      hostedWritesAllowed: false,
    },
    controls: {
      sampleOnly: true,
      containsRealClientData: false,
      privateArtifact: true,
      networkAccessRequired: false,
      externalWritesPerformed: false,
      customerContactPerformed: false,
      paymentPerformed: false,
      deploymentPerformed: false,
    },
    allowedPaymentMethodsForReview: [
      'Cash',
      'KBZPay',
      'WavePay',
      'AYA Pay',
      'MMQR',
    ],
    successCriteria: {
      acceptedOrderToCloseRuns: 20,
      dailyClosesObserved: 5,
      pilotDaySequenceCoverageRequired: true,
      unexplainedPaymentOrStockChanges: 0,
      ownerDecisionRequired: true,
    },
  }
}

function startHere() {
  return `# Start your SuperMega Shop pilot

This packet is for a private owner review. It is sample-only and contains no real client data.

## What this is

- Product: Shop
- Pilot mode: owner-named private pilot
- Vertical pack: Spa services
- Goal: prove one useful operating workflow before any managed activation

## First useful workflow

1. Read \`${FILES.operatorScript}\` with the operator.
2. Import or review services and package products.
3. Import a small reviewed client list.
4. Create one package sale.
5. Complete one treatment redemption.
6. Run daily close.
7. Reload and verify nothing duplicated.
8. Fill \`${FILES.roiScorecard}\` and \`${FILES.metrics}\` for owner review.

## What to fill privately

Copy \`${FILES.ownerInput}\` to \`owner-input.json\` and replace the placeholder values with reviewed owner input.

Keep the generic Shop baseline separate from the Spa services vertical pack:

- Shop baseline: weekly orders, minutes per order, weekly exceptions, daily close minutes.
- Spa services vertical pack: client import rows, package sales, treatment redemptions, redemption minutes, package corrections.

## What this packet does not do

It does not send a message, accept payment, move stock, post accounting, deploy software, activate production, or write hosted data.
`
}

function ownerInputTemplate() {
  return {
    product: SHOP_PILOT_PRODUCT,
    pilotMode: SHOP_PILOT_MODE,
    verticalPack: SHOP_PILOT_VERTICAL_PACK,
    tenantLabel: 'replace-with-private-spa-workspace',
    startDate: 'YYYY-MM-DD',
    reviewDate: 'YYYY-MM-DD',
    fixedPilotFeeUsd: null,
    contactIsNamedOperator: false,
    contactBaselineReviewed: false,
    spaBaseline: {
      clientImportRowCount: null,
      weeklyPackageSales: null,
      weeklyTreatmentRedemptions: null,
      medianMinutesPerRedemption: null,
      weeklyPackageCorrectionCount: null,
    },
    paymentMethodsToReview: [
      'Cash',
      'KBZPay',
      'WavePay',
      'AYA Pay',
      'MMQR',
    ],
    successTargets: {
      acceptedOrderToCloseRuns: 20,
      dailyClosesObserved: 5,
      pilotDaySequenceCoverageRequired: true,
      unexplainedPaymentOrStockChanges: 0,
      ownerDecisionRecorded: false,
    },
    isolatedNonProductionTenantApproved: false,
    namedOperatorAuthorized: false,
    pilotDataHandlingApproved: false,
    ownerReviewedCommercialDraft: false,
  }
}

function contactEventSample() {
  return {
    event: 'supermega.contact.created',
    record: {
      lead_id: 'LEAD-SAMPLE-SPA-00000001',
      workflow: 'shop',
      company: 'Sample Spa',
      name: 'Sample Owner Operator',
      email: 'owner@example.invalid',
      goal: 'Reduce manual package tracking, treatment redemption mistakes, and daily close time.',
      raw: {
        shop: {
          operator_role: 'Owner operator',
          weekly_orders: 80,
          median_minutes_per_order: 6,
          weekly_exception_count: 9,
          close_minutes_per_day: 35,
          contact_is_operator: true,
        },
      },
    },
  }
}

function operatorScript() {
  return `# Day-1 operator script

Use this with the owner or named operator. Keep it private. Use sample data unless the owner has explicitly approved reviewed real pilot data.

## Outcome

By the end of day 1, the operator should understand exactly how Shop helps a spa sell a prepaid package, redeem a treatment, reconcile payment evidence, and close the day.

## Run order

1. Choose the Shop product and the Spa services vertical pack.
2. Review the services CSV: treatment services have duration, prepaid packages have session balance.
3. Review the client CSV: every imported client row must be accepted, corrected, or rejected before use.
4. Create one package sale. Select one reviewed method from Cash, KBZPay, WavePay, AYA Pay, or MMQR. Do not call a payment provider from this packet.
5. Create one treatment redemption against the matching package. Confirm remaining sessions changed once.
6. Try one bad redemption case. The system should refuse mismatched or exhausted package use.
7. Run daily close. The close must show sales, payment method, correction count, and any difference reason.
8. Reload the workspace. The sale, redemption, client balance, and close must not duplicate.
9. Record the result in \`${FILES.metrics}\` and summarize the decision in \`${FILES.roiScorecard}\`.

## Mobile check

On a phone-sized screen, the operator must still find these without instruction:

- start sale
- choose payment method
- find the next appointment or redemption
- close day
- see the next action

If any step needs explanation twice, mark it as a product issue instead of blaming the operator.
`
}

function servicesCsv() {
  return `sku,name,type,price_mmk,duration_minutes,starting_stock,notes
SPA-SVC-MASSAGE-60,Relaxing massage 60 min,treatment,45000,60,,sample service
SPA-SVC-FACIAL-45,Hydrating facial 45 min,treatment,38000,45,,sample service
SPA-PKG-MASSAGE-5,Massage package 5 sessions,package,200000,,25,sample prepaid package
SPA-PKG-FACIAL-3,Facial package 3 sessions,package,105000,,18,sample prepaid package
`
}

function clientsCsv() {
  return `client_reference,display_name,package_sku,remaining_sessions,last_visit,notes
SPA-CLIENT-001,Sample Client One,SPA-PKG-MASSAGE-5,3,2026-08-01,sample only
SPA-CLIENT-002,Sample Client Two,SPA-PKG-FACIAL-3,1,2026-08-02,sample only
SPA-CLIENT-003,Sample Client Three,,0,,sample walk-in
`
}

function proofPlan() {
  return `# Five-day Shop pilot proof plan

## Day 1 - Shop baseline and client import

- Confirm the owner-named operator.
- Review the generic Shop baseline.
- Review the Spa services vertical pack client import.
- Resolve every import row before use.

## Day 2 - Package sale

- Create one reviewed package sale.
- Record completion time and corrections.
- Select the observed payment method from Cash, KBZPay, WavePay, AYA Pay, or MMQR.
- Do not call a payment provider or accept money from this packet.

## Day 3 - Treatment redemption

- Complete one treatment.
- Redeem exactly one matching package session.
- Prove ineligible or mismatched redemption is refused.

## Day 4 - Daily close and recovery

- Run daily close.
- Reload the workspace.
- Verify sale, treatment, redemption, and close did not duplicate.

## Day 5 - Owner acceptance

- Export evidence.
- Compare against baseline.
- Record owner decision.
- Keep production activation blocked until managed tenant, backup, restore, and security gates pass.
`
}

function roiScorecard() {
  return `# Owner ROI scorecard

Use this after the operator has completed the five-day proof plan. This is the commercial decision page, not a marketing slide.

## Required proof before saying the pilot works

- 20 accepted order-to-close runs
- 5 daily closes observed
- accepted evidence covers pilot days 1 through 5
- 0 unexplained payment or stock changes
- every correction has an operator, reason, timestamp, and evidence reference
- owner records a continue, revise, or stop decision

## Score the pilot

| Area | Baseline | Observed result | Owner score |
| --- | --- | --- | --- |
| Orders handled per week | weekly_orders | fill privately | 1-5 |
| Median minutes per order | median_minutes_per_order | fill privately | 1-5 |
| Weekly exceptions | weekly_exception_count | fill privately | 1-5 |
| Close minutes per day | close_minutes_per_day | fill privately | 1-5 |
| Package redemptions | weeklyTreatmentRedemptions | fill privately | 1-5 |
| Payment reconciliation clarity | manual proof today | fill privately | 1-5 |
| Operator confidence | manual process today | fill privately | 1-5 |

## Paid decision rule

Move to a paid managed pilot only if the owner can point to one of these outcomes:

- faster daily close
- fewer package redemption mistakes
- fewer payment reconciliation questions
- cleaner stock/package balance after reload
- operator prefers Shop for the same workflow

If the owner cannot name the improvement, the next action is product revision, not sales pressure.
`
}

function metricsCsv() {
  return `day,operator_session_ref,orders_observed,package_sales,treatment_redemptions,minutes_saved_estimate,exceptions_count,unexplained_payment_or_stock_changes,daily_close_completed,owner_note_sample
1,SAMPLE-SESSION-001,1,1,1,10,0,0,true,sample only - replace privately
2,SAMPLE-SESSION-002,4,2,3,18,1,0,true,sample only - replace privately
3,SAMPLE-SESSION-003,5,1,5,20,0,0,true,sample only - replace privately
4,SAMPLE-SESSION-004,5,2,4,22,1,0,true,sample only - replace privately
5,SAMPLE-SESSION-005,5,1,5,25,0,0,true,sample only - replace privately
`
}

function noExternalAction() {
  return `# No external action boundary

This packet is local and private.

Blocked unless separately approved by the owner:

- customer messages
- provider payments
- payment acceptance
- stock movement
- accounting posting
- website publishing
- deployment
- production activation
- hosted database writes

AI may draft, review, explain, and prepare. AI may not perform the external action.
`
}

export function shopSpaOwnerOnboardingPacketFiles() {
  return {
    [FILES.manifest]: json(packetManifest()),
    [FILES.start]: startHere(),
    [FILES.ownerInput]: json(ownerInputTemplate()),
    [FILES.contactEvent]: json(contactEventSample()),
    [FILES.services]: servicesCsv(),
    [FILES.clients]: clientsCsv(),
    [FILES.operatorScript]: operatorScript(),
    [FILES.proofPlan]: proofPlan(),
    [FILES.roiScorecard]: roiScorecard(),
    [FILES.metrics]: metricsCsv(),
    [FILES.noExternalAction]: noExternalAction(),
  }
}

export async function createShopSpaOwnerOnboardingPacket(workspace) {
  const root = resolve(workspace)
  await mkdir(root, { recursive: false })
  const files = shopSpaOwnerOnboardingPacketFiles()
  for (const [name, content] of Object.entries(files)) {
    await writeFile(resolve(root, name), content, { encoding: 'utf8', flag: 'wx' })
  }
  const combined = Object.entries(files).map(([name, content]) => `${name}\n${content}`).join('\n')
  return {
    contract: SHOP_SPA_OWNER_ONBOARDING_PACKET_CONTRACT,
    product: SHOP_PILOT_PRODUCT,
    pilotMode: SHOP_PILOT_MODE,
    verticalPack: SHOP_PILOT_VERTICAL_PACK,
    stage: 'local-owner-review-required',
    filesCreated: Object.keys(files).length,
    packetSha256: sha256(combined),
    externalWritesPerformed: false,
    customerContactPerformed: false,
    paymentPerformed: false,
    deploymentPerformed: false,
  }
}

export async function verifyShopSpaOwnerOnboardingPacket(workspace) {
  const root = resolve(workspace)
  const expected = shopSpaOwnerOnboardingPacketFiles()
  for (const [name, content] of Object.entries(expected)) {
    if (!(await exists(resolve(root, name)))) throw new Error('shop_spa_owner_packet_missing_file')
    if (await readFile(resolve(root, name), 'utf8') !== content) throw new Error('shop_spa_owner_packet_stale_or_tampered')
  }
  const manifest = JSON.parse(expected[FILES.manifest])
  if (
    manifest.product !== SHOP_PILOT_PRODUCT
    || manifest.pilotMode !== SHOP_PILOT_MODE
    || manifest.verticalPack !== SHOP_PILOT_VERTICAL_PACK
    || manifest.authority.customerContactAllowed !== false
    || manifest.authority.paymentAllowed !== false
    || manifest.authority.deploymentAllowed !== false
    || manifest.authority.productionActivationAllowed !== false
    || manifest.controls.containsRealClientData !== false
    || manifest.controls.externalWritesPerformed !== false
  ) throw new Error('shop_spa_owner_packet_manifest_invalid')
  const combined = Object.entries(expected).map(([name, content]) => `${name}\n${content}`).join('\n')
  return {
    contract: SHOP_SPA_OWNER_ONBOARDING_PACKET_CONTRACT,
    product: SHOP_PILOT_PRODUCT,
    pilotMode: SHOP_PILOT_MODE,
    verticalPack: SHOP_PILOT_VERTICAL_PACK,
    verified: true,
    packetSha256: sha256(combined),
    externalWritesPerformed: false,
    customerContactPerformed: false,
    paymentPerformed: false,
    deploymentPerformed: false,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const workspaceIndex = args.indexOf('--workspace')
  const verify = args.includes('--verify')
  if (workspaceIndex < 0 || !args[workspaceIndex + 1] || ![2, 3].includes(args.length) || (args.length === 3 && !verify)) {
    throw new Error('usage: node tools/create_shop_spa_owner_onboarding_packet.mjs [--verify] --workspace <private-packet-folder>')
  }
  const result = verify
    ? await verifyShopSpaOwnerOnboardingPacket(args[workspaceIndex + 1])
    : await createShopSpaOwnerOnboardingPacket(args[workspaceIndex + 1])
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, externalWritesPerformed: false })}\n`)
    process.exitCode = 1
  })
}
