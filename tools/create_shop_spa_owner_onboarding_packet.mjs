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
  proofPlan: 'five-day-proof-plan.md',
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

1. Import or review services and package products.
2. Import a small reviewed client list.
3. Create one package sale.
4. Complete one treatment redemption.
5. Run daily close.
6. Reload and verify nothing duplicated.
7. Export the proof packet for owner review.

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
- Do not accept payment in this packet.

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
    [FILES.proofPlan]: proofPlan(),
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
