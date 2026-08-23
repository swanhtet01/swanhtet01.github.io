import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { access, lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SHOP_PILOT_HANDOFF_CONTRACT,
  SHOP_PILOT_MODE,
  SHOP_PILOT_OWNER_DECISION_CONTRACT,
  SHOP_PILOT_PRODUCT,
  SHOP_PILOT_REPLY_DRAFT_CONTRACT,
  SHOP_PILOT_VERTICAL_PACK,
  renderShopPilotHandoff,
  renderShopPilotOwnerDecision,
  renderShopPilotReplyDraft,
  sanitizeShopPilotContactEvent,
  shopPilotInputFromContactEvent,
} from './create_shop_pilot_handoff.mjs'
import {
  initializeClientWorkspaceFromShopPilot,
  prepareClientDemo,
  verifyContactClientWorkspace,
  writeClientDemoPreparation,
} from './prepare_client_demo.mjs'
import { renderClientLaunchDashboard, verifyClientLaunchDashboard, writeClientLaunchDashboard } from './render_client_launch_dashboard.mjs'
import { validateReleaseHandoffPacket } from './prepare_release_handoff.mjs'

export const SHOP_PILOT_SALES_WORKSPACE_CONTRACT = 'supermega.shop.pilot_sales_workspace.v2'
export const SHOP_PILOT_SALES_PREPARED_CONTRACT = 'supermega.shop.pilot_sales_prepared.v2'
export const SHOP_PILOT_INTAKE_STARTER_CONTRACT = 'supermega.shop.pilot_intake_starter.v1'
export const SHOP_PILOT_INTAKE_BUNDLE_CONTRACT = 'supermega.shop.pilot_intake_bundle.v1'
export const SHOP_PILOT_CLIENT_LAUNCH_CONTRACT = 'supermega.shop.pilot_client_launch.v1'
export const SHOP_CLIENT_LAUNCH_STATUS_CONTRACT = 'supermega.shop.client_launch_status.v1'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CLIENT_PREPARATION_FILE = 'client-preparation.private.json'
const CLIENT_LAUNCH_BOARD_FILE = 'client-launch-board.private.json'
const CLIENT_LAUNCH_DASHBOARD_FILE = 'START-HERE.html'

const FILES = {
  manifest: 'workspace.json',
  contact: 'contact-event.json',
  owner: 'owner-input.json',
  ownerForm: 'owner-input-form.html',
  guide: 'README.md',
  handoff: 'private-handoff.md',
  reply: 'private-reply.txt',
  decisionInput: 'decision-input.json',
  prepared: 'prepared.json',
  decision: 'owner-decision.json',
}

const STARTER_FILES = {
  form: 'START-HERE.html',
  guide: 'README.md',
  manifest: 'starter.json',
}

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

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function readBoundedJson(path, code, maximumBytes = 1024 * 1024) {
  const metadata = await lstat(path).catch(() => { throw new Error(code) })
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 2 || metadata.size > maximumBytes) throw new Error(code)
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { throw new Error(code) }
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  throw new Error('shop_client_launch_status_value_invalid')
}

function verifyManagedActivationReceipt(receipt) {
  const expectedKeys = [
    'activationId', 'activatedAt', 'adminCaSha256', 'authority', 'contract', 'externalActionsPerformed',
    'localProjectionTrusted', 'ownerActorId', 'planDigest', 'projectRef', 'projectionDigest', 'releaseCommit',
    'replayed', 'secretValuesExposed', 'status', 'version', 'workspaceId',
  ]
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
    || JSON.stringify(Object.keys(receipt).sort()) !== JSON.stringify(expectedKeys.sort())
    || receipt.contract !== 'supermega.managed_workspace_activation_receipt.v2'
    || receipt.version !== 2
    || receipt.status !== 'active'
    || typeof receipt.replayed !== 'boolean'
    || receipt.localProjectionTrusted !== false
    || receipt.secretValuesExposed !== false
    || JSON.stringify(Object.keys(receipt.authority ?? {}).sort()) !== JSON.stringify(['commandId', 'system', 'table', 'verification'])
    || receipt.authority?.system !== 'postgresql'
    || receipt.authority?.table !== 'app_private.workspace_events'
    || receipt.authority?.verification !== 'requery_required'
    || !Array.isArray(receipt.externalActionsPerformed)
    || JSON.stringify(receipt.externalActionsPerformed) !== JSON.stringify([
      'workspace_access_control_insert',
      'workspace_membership_insert',
      'immutable_activation_event_insert',
    ])) throw new Error('shop_client_launch_status_activation_receipt_invalid')
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  if (!uuid.test(receipt.activationId ?? '')
    || !uuid.test(receipt.ownerActorId ?? '')
    || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(receipt.workspaceId ?? '')
    || !/^[a-z0-9]{20}$/.test(receipt.projectRef ?? '')) throw new Error('shop_client_launch_status_activation_receipt_invalid')
  for (const field of ['planDigest', 'adminCaSha256', 'projectionDigest']) {
    if (!/^sha256:[0-9a-f]{64}$/.test(receipt[field] ?? '')) throw new Error('shop_client_launch_status_activation_receipt_invalid')
  }
  if (!/^[0-9a-f]{40}$/.test(receipt.releaseCommit ?? '')
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.activatedAt ?? '')
    || typeof receipt.authority.commandId !== 'string'
    || receipt.authority.commandId !== receipt.activationId) throw new Error('shop_client_launch_status_activation_receipt_invalid')
  const projection = structuredClone(receipt)
  delete projection.projectionDigest
  const expectedDigest = `sha256:${createHash('sha256').update(canonicalJson(projection)).digest('hex')}`
  if (receipt.projectionDigest !== expectedDigest) throw new Error('shop_client_launch_status_activation_receipt_invalid')
  return receipt
}

function paths(workspace) {
  const root = resolve(workspace)
  return Object.fromEntries(Object.entries(FILES).map(([key, name]) => [key, resolve(root, name)]))
}

function ownerTemplate() {
  return {
    product: SHOP_PILOT_PRODUCT,
    pilotMode: SHOP_PILOT_MODE,
    verticalPack: SHOP_PILOT_VERTICAL_PACK,
    tenantLabel: '',
    startDate: '',
    reviewDate: '',
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

function exactBoolean(value, field) {
  if (typeof value !== 'boolean') throw new Error(`${field}_invalid`)
  return value
}

function exactNumber(value, field, { min, max, integer = false }) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${field}_invalid`)
  }
  return value
}

function exactText(value, field, max = 180) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}_required`)
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`${field}_invalid`)
  return normalized
}

function normalizeOwnerInputDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shop_owner_input_required')
  if ((value.product === undefined ? SHOP_PILOT_PRODUCT : exactText(value.product, 'product', 40)) !== SHOP_PILOT_PRODUCT) throw new Error('product_invalid')
  if ((value.pilotMode === undefined ? SHOP_PILOT_MODE : exactText(value.pilotMode, 'pilot_mode', 40)) !== SHOP_PILOT_MODE) throw new Error('pilot_mode_invalid')
  if ((value.verticalPack === undefined ? SHOP_PILOT_VERTICAL_PACK : exactText(value.verticalPack, 'vertical_pack', 80)) !== SHOP_PILOT_VERTICAL_PACK) throw new Error('vertical_pack_unsupported')
  const tenantLabel = exactText(value.tenantLabel, 'tenant_label', 80)
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,79}$/.test(tenantLabel)) throw new Error('tenant_label_invalid')
  const date = (input, field) => {
    const normalized = exactText(input, field, 10)
    const instant = Date.parse(`${normalized}T00:00:00.000Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || !Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== normalized) {
      throw new Error(`${field}_invalid`)
    }
    return normalized
  }
  return {
    product: SHOP_PILOT_PRODUCT,
    pilotMode: SHOP_PILOT_MODE,
    verticalPack: SHOP_PILOT_VERTICAL_PACK,
    tenantLabel,
    startDate: date(value.startDate, 'start_date'),
    reviewDate: date(value.reviewDate, 'review_date'),
    fixedPilotFeeUsd: exactNumber(value.fixedPilotFeeUsd, 'fixed_pilot_fee_usd', { min: 1, max: 100_000, integer: true }),
    contactIsNamedOperator: exactBoolean(value.contactIsNamedOperator, 'contact_is_named_operator'),
    contactBaselineReviewed: exactBoolean(value.contactBaselineReviewed, 'contact_baseline_reviewed'),
    spaBaseline: {
      clientImportRowCount: exactNumber(value.spaBaseline?.clientImportRowCount, 'baseline_client_import_row_count', { min: 1, max: 100_000, integer: true }),
      weeklyPackageSales: exactNumber(value.spaBaseline?.weeklyPackageSales, 'baseline_weekly_package_sales', { min: 1, max: 100_000, integer: true }),
      weeklyTreatmentRedemptions: exactNumber(value.spaBaseline?.weeklyTreatmentRedemptions, 'baseline_weekly_treatment_redemptions', { min: 1, max: 100_000, integer: true }),
      medianMinutesPerRedemption: exactNumber(value.spaBaseline?.medianMinutesPerRedemption, 'baseline_median_minutes_per_redemption', { min: 0.1, max: 1_440 }),
      weeklyPackageCorrectionCount: exactNumber(value.spaBaseline?.weeklyPackageCorrectionCount, 'baseline_weekly_package_correction_count', { min: 0, max: 100_000, integer: true }),
    },
    isolatedNonProductionTenantApproved: exactBoolean(value.isolatedNonProductionTenantApproved, 'isolated_non_production_tenant_approved'),
    namedOperatorAuthorized: exactBoolean(value.namedOperatorAuthorized, 'named_operator_authorized'),
    pilotDataHandlingApproved: exactBoolean(value.pilotDataHandlingApproved, 'pilot_data_handling_approved'),
    ownerReviewedCommercialDraft: exactBoolean(value.ownerReviewedCommercialDraft, 'owner_reviewed_commercial_draft'),
  }
}

function normalizeIntakeBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle) || bundle.contract !== SHOP_PILOT_INTAKE_BUNDLE_CONTRACT) {
    throw new Error('shop_pilot_intake_bundle_invalid')
  }
  return {
    contactEvent: sanitizeShopPilotContactEvent(bundle.contactEvent),
    ownerInput: normalizeOwnerInputDraft(bundle.ownerInput),
  }
}

function starterManifest() {
  return {
    contract: SHOP_PILOT_INTAKE_STARTER_CONTRACT,
    product: SHOP_PILOT_PRODUCT,
    pilotMode: SHOP_PILOT_MODE,
    verticalPack: SHOP_PILOT_VERTICAL_PACK,
    stage: 'private-owner-intake-required',
    outputContract: SHOP_PILOT_INTAKE_BUNDLE_CONTRACT,
    authority: {
      automaticSendAllowed: false,
      paymentAllowed: false,
      deploymentAllowed: false,
      productionActivationAllowed: false,
      hostedWritesAllowed: false,
    },
    controls: {
      privateWorkspace: true,
      networkAccessAllowed: false,
      externalWritesPerformed: false,
      customerContactPerformed: false,
    },
  }
}

function starterGuide() {
  return `# PRIVATE - Start the first SuperMega Shop pilot

This folder contains no client data yet. Keep the completed download private and never commit or publish it.

1. Open \`START-HERE.html\` in a browser.
2. Complete it privately with the Shop owner. Every approval starts unchecked.
3. Select **Download private intake bundle**. The page works offline and sends nothing.
4. Move \`shop-pilot-intake.json\` from Downloads into this folder.
5. From the SuperMega repository, initialize the protected pilot workspace:

\`npm.cmd run client:pilot:workspace -- --init --intake-bundle "<this-folder>\\shop-pilot-intake.json" --workspace "<new-private-client-workspace>"\`

The command creates local preparation artifacts only. It does not send a message, accept payment, deploy, activate production, or write hosted data.
`
}

export function renderShopPilotStarterForm() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'">
  <title>Start a SuperMega Shop pilot</title>
  <style>
    :root { color-scheme: light; font: 16px/1.45 system-ui, sans-serif; color: #17211d; background: #edf2ee; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(760px, 100%); margin: 0 auto; padding: 24px 16px 64px; }
    header, section { background: #fff; border: 1px solid #d5ddd7; border-radius: 18px; padding: 20px; margin-bottom: 14px; box-shadow: 0 8px 28px rgba(23, 33, 29, .05); }
    h1 { font-size: clamp(1.65rem, 5vw, 2.35rem); line-height: 1.08; margin: 0 0 10px; }
    h2 { font-size: 1.08rem; margin: 0 0 14px; }
    p { margin: 8px 0; color: #4a5750; }
    .step { color: #176946; font-size: .78rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    label { display: grid; gap: 6px; font-weight: 650; }
    label span { color: #4a5750; font-size: .84rem; font-weight: 500; }
    input, textarea { min-height: 46px; width: 100%; border: 1px solid #aeb9b1; border-radius: 11px; padding: 10px 12px; font: inherit; }
    textarea { min-height: 92px; resize: vertical; }
    input:focus, textarea:focus { outline: 3px solid #b9e4ce; border-color: #176946; }
    .checks { display: grid; gap: 10px; }
    .check { grid-template-columns: 24px 1fr; align-items: start; font-weight: 550; }
    .check input { width: 20px; min-height: 20px; margin-top: 2px; }
    .boundary { border-left: 4px solid #d49a31; padding-left: 12px; }
    button { width: 100%; min-height: 52px; border: 0; border-radius: 13px; background: #176946; color: white; font: 750 1rem system-ui, sans-serif; cursor: pointer; }
    button:hover { background: #0e5236; }
    #status { min-height: 24px; font-weight: 650; }
    @media (max-width: 620px) { .grid { grid-template-columns: 1fr; } main { padding: 10px 8px 40px; } header, section { border-radius: 14px; padding: 16px; } }
  </style>
</head>
<body>
<main>
  <header><div class="step">Private setup · about 8 minutes</div><h1>Start your Shop pilot</h1><p>Complete this with the Shop owner or daily operator. Nothing is uploaded or sent. One private file is downloaded to this computer.</p></header>
  <section><div class="step">1 · Business</div><h2>Who will use it?</h2><div class="grid">
    <label>Shop business name<input id="company" required maxlength="180" autocomplete="organization"></label>
    <label>Daily operator name<input id="operatorName" required maxlength="180" autocomplete="name"></label>
    <label>Operator email<input id="email" required type="email" maxlength="180" autocomplete="email"></label>
    <label>Daily operator role<input id="operatorRole" required maxlength="180" placeholder="Shop manager"></label>
  </div><label>What should SuperMega improve first?<textarea id="goal" required maxlength="500" placeholder="Orders, exceptions, reload/retry, or daily close"></textarea></label></section>
  <section><div class="step">2 · Current workflow</div><h2>Measure today’s process</h2><div class="grid">
    <label>Weekly orders<input id="weeklyOrders" type="number" min="1" max="100000" step="1" required></label>
    <label>Median minutes per order<input id="medianMinutesPerOrder" type="number" min="0.1" max="1440" step="0.1" required></label>
    <label>Weekly exception count<input id="weeklyExceptionCount" type="number" min="0" max="100000" step="1" required></label>
    <label>Minutes for daily close<input id="closeMinutesPerDay" type="number" min="0" max="1440" step="0.1" required></label>
  </div></section>
  <section><div class="step">Spa services vertical pack</div><h2>Package sale, treatment redemption, and client import</h2><div class="grid">
    <label>Client import rows<input id="clientImportRowCount" type="number" min="1" max="100000" step="1" required></label>
    <label>Weekly package sales<input id="weeklyPackageSales" type="number" min="1" max="100000" step="1" required></label>
    <label>Weekly treatment redemptions<input id="weeklyTreatmentRedemptions" type="number" min="1" max="100000" step="1" required></label>
    <label>Minutes per treatment redemption<input id="medianMinutesPerRedemption" type="number" min="0.1" max="1440" step="0.1" required></label>
    <label>Weekly package corrections<input id="weeklyPackageCorrectionCount" type="number" min="0" max="100000" step="1" required></label>
  </div></section>
  <section><div class="step">3 · Five-day pilot</div><h2>Choose the local rehearsal</h2><div class="grid">
    <label>Private workspace label<span>Letters, numbers and hyphens</span><input id="tenantLabel" required pattern="[A-Za-z0-9][A-Za-z0-9-]{2,79}" autocomplete="off"></label>
    <label>Draft pilot fee (USD)<span>No payment is taken here</span><input id="fixedPilotFeeUsd" type="number" min="1" max="100000" step="1" required></label>
    <label>Start date<input id="startDate" type="date" required></label>
    <label>Review date<span>Automatically start date + 4 days</span><input id="reviewDate" type="date" required readonly></label>
  </div></section>
  <section><div class="step">4 · Owner review</div><h2>Confirm only what is true</h2><p class="boundary">Approvals are never inferred. Every box starts unchecked.</p><div class="checks">
    <label class="check"><input id="contactIsOperator" type="checkbox"><span>The contact is the real daily operator.</span></label>
    <label class="check"><input id="contactIsNamedOperator" type="checkbox"><span>The owner confirms this person as the named pilot operator.</span></label>
    <label class="check"><input id="contactBaselineReviewed" type="checkbox"><span>The owner reviewed the measurements above.</span></label>
    <label class="check"><input id="isolatedNonProductionTenantApproved" type="checkbox"><span>The owner approves an isolated non-production rehearsal workspace.</span></label>
    <label class="check"><input id="namedOperatorAuthorized" type="checkbox"><span>The named operator is authorized for the five-day rehearsal.</span></label>
    <label class="check"><input id="pilotDataHandlingApproved" type="checkbox"><span>The owner reviewed private data handling and backup boundaries.</span></label>
    <label class="check"><input id="ownerReviewedCommercialDraft" type="checkbox"><span>The owner reviewed the draft fee and understands no payment is accepted.</span></label>
  </div></section>
  <section><button id="download" type="button">Download private intake bundle</button><p id="status" role="status" aria-live="polite"></p><p>Move <strong>shop-pilot-intake.json</strong> from Downloads into this private folder. Do not email or publish it.</p></section>
</main>
<script>
  'use strict';
  const field = (id) => document.getElementById(id);
  const integer = (id) => Number.parseInt(field(id).value, 10);
  const number = (id) => Number(field(id).value);
  field('startDate').addEventListener('change', () => {
    const value = field('startDate').value;
    if (!value) { field('reviewDate').value = ''; return; }
    const date = new Date(value + 'T00:00:00.000Z'); date.setUTCDate(date.getUTCDate() + 4); field('reviewDate').value = date.toISOString().slice(0, 10);
  });
  field('download').addEventListener('click', () => {
    const required = [...document.querySelectorAll('input[required], textarea[required]')];
    if (!required.every((input) => input.reportValidity())) { field('status').textContent = 'Complete every required field before downloading.'; return; }
    const leadId = 'SHOP-' + new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + '-' + crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, '0');
    const payload = {
      contract: '${SHOP_PILOT_INTAKE_BUNDLE_CONTRACT}',
      contactEvent: { event: 'supermega.contact.created', record: {
        lead_id: leadId, workflow: 'commerce', company: field('company').value.trim(), name: field('operatorName').value.trim(), email: field('email').value.trim(), goal: field('goal').value.trim(),
        raw: { shop: { operator_role: field('operatorRole').value.trim(), weekly_orders: integer('weeklyOrders'), median_minutes_per_order: number('medianMinutesPerOrder'), weekly_exception_count: integer('weeklyExceptionCount'), close_minutes_per_day: number('closeMinutesPerDay'), contact_is_operator: field('contactIsOperator').checked } }
      } },
      ownerInput: {
        product: '${SHOP_PILOT_PRODUCT}', pilotMode: '${SHOP_PILOT_MODE}', verticalPack: '${SHOP_PILOT_VERTICAL_PACK}',
        tenantLabel: field('tenantLabel').value.trim(), startDate: field('startDate').value, reviewDate: field('reviewDate').value, fixedPilotFeeUsd: integer('fixedPilotFeeUsd'),
        contactIsNamedOperator: field('contactIsNamedOperator').checked, contactBaselineReviewed: field('contactBaselineReviewed').checked,
        spaBaseline: { clientImportRowCount: integer('clientImportRowCount'), weeklyPackageSales: integer('weeklyPackageSales'), weeklyTreatmentRedemptions: integer('weeklyTreatmentRedemptions'), medianMinutesPerRedemption: number('medianMinutesPerRedemption'), weeklyPackageCorrectionCount: integer('weeklyPackageCorrectionCount') },
        isolatedNonProductionTenantApproved: field('isolatedNonProductionTenantApproved').checked, namedOperatorAuthorized: field('namedOperatorAuthorized').checked, pilotDataHandlingApproved: field('pilotDataHandlingApproved').checked, ownerReviewedCommercialDraft: field('ownerReviewedCommercialDraft').checked
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2) + '\\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'shop-pilot-intake.json'; link.click(); URL.revokeObjectURL(url);
    field('status').textContent = 'Downloaded locally. No information was sent.';
  });
</script>
</body>
</html>
`
}

export async function initShopPilotIntakeStarter(workspace) {
  const root = resolve(workspace)
  await mkdir(root, { recursive: false })
  await Promise.all([
    writeFile(resolve(root, STARTER_FILES.form), renderShopPilotStarterForm(), { encoding: 'utf8', flag: 'wx' }),
    writeFile(resolve(root, STARTER_FILES.guide), starterGuide(), { encoding: 'utf8', flag: 'wx' }),
    writeFile(resolve(root, STARTER_FILES.manifest), json(starterManifest()), { encoding: 'utf8', flag: 'wx' }),
  ])
  return { contract: SHOP_PILOT_INTAKE_STARTER_CONTRACT, stage: 'private-owner-intake-required', filesCreated: 3, externalWritesPerformed: false, customerContactPerformed: false }
}

export async function verifyShopPilotIntakeStarter(workspace) {
  const root = resolve(workspace)
  const [form, guide, manifest] = await Promise.all([
    readFile(resolve(root, STARTER_FILES.form), 'utf8'),
    readFile(resolve(root, STARTER_FILES.guide), 'utf8'),
    readJson(resolve(root, STARTER_FILES.manifest)),
  ])
  if (form !== renderShopPilotStarterForm() || guide !== starterGuide() || JSON.stringify(manifest) !== JSON.stringify(starterManifest())) {
    throw new Error('shop_pilot_intake_starter_invalid')
  }
  return { contract: SHOP_PILOT_INTAKE_STARTER_CONTRACT, stage: 'private-owner-intake-required', verified: true, externalWritesPerformed: false, customerContactPerformed: false }
}

export function renderShopPilotOwnerInputForm() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'">
  <title>SuperMega Shop owner intake</title>
  <style>
    :root { color-scheme: light; font: 16px/1.45 system-ui, sans-serif; color: #17211d; background: #f3f5f1; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(720px, 100%); margin: 0 auto; padding: 24px 16px 64px; }
    header, section { background: #fff; border: 1px solid #d8ded8; border-radius: 18px; padding: 20px; margin-bottom: 14px; }
    h1 { font-size: clamp(1.6rem, 5vw, 2.25rem); line-height: 1.1; margin: 0 0 10px; }
    h2 { font-size: 1.05rem; margin: 0 0 14px; }
    p { margin: 8px 0; color: #4a5750; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    label { display: grid; gap: 6px; font-weight: 650; }
    label span { color: #4a5750; font-size: .86rem; font-weight: 500; }
    input { min-height: 46px; width: 100%; border: 1px solid #adb8b0; border-radius: 11px; padding: 10px 12px; font: inherit; }
    input:focus { outline: 3px solid #b9e4ce; border-color: #176946; }
    .checks { display: grid; gap: 10px; }
    .check { grid-template-columns: 24px 1fr; align-items: start; font-weight: 550; }
    .check input { width: 20px; min-height: 20px; margin-top: 2px; }
    button { width: 100%; min-height: 50px; border: 0; border-radius: 13px; background: #176946; color: white; font: 700 1rem system-ui, sans-serif; cursor: pointer; }
    button:hover { background: #0e5236; }
    #status { min-height: 24px; font-weight: 650; }
    .boundary { border-left: 4px solid #d49a31; padding-left: 12px; }
    @media (max-width: 620px) { .grid { grid-template-columns: 1fr; } main { padding: 12px 10px 40px; } header, section { border-radius: 14px; padding: 16px; } }
  </style>
</head>
<body>
<main>
  <header>
    <h1>Shop pilot owner intake</h1>
    <p>Complete this privately with the Shop owner. Nothing is uploaded or sent. The button downloads one local <strong>owner-input.json</strong> file.</p>
  </header>
  <section>
    <h2>1. Pilot setup</h2>
    <div class="grid">
      <label>Isolated workspace label <span>Letters, numbers, and hyphens</span><input id="tenantLabel" required pattern="[A-Za-z0-9][A-Za-z0-9-]{2,79}" autocomplete="off"></label>
      <label>Draft pilot fee (USD) <span>Review only; no payment is accepted</span><input id="fixedPilotFeeUsd" type="number" min="1" max="100000" step="1" required></label>
      <label>Start date <input id="startDate" type="date" required></label>
      <label>Review date <span>Automatically start date + 4 days</span><input id="reviewDate" type="date" required readonly></label>
    </div>
  </section>
  <section>
    <h2>2. Spa services vertical pack</h2>
    <p>These fields are only for the Spa services vertical pack: client import, package sale, and treatment redemption.</p>
    <div class="grid">
      <label>Reviewed client rows <input id="clientImportRowCount" type="number" min="1" max="100000" step="1" required></label>
      <label>Weekly package sales <input id="weeklyPackageSales" type="number" min="1" max="100000" step="1" required></label>
      <label>Weekly treatment redemptions <input id="weeklyTreatmentRedemptions" type="number" min="1" max="100000" step="1" required></label>
      <label>Median minutes per redemption <input id="medianMinutesPerRedemption" type="number" min="0.1" max="1440" step="0.1" required></label>
      <label>Weekly package corrections <input id="weeklyPackageCorrectionCount" type="number" min="0" max="100000" step="1" required></label>
    </div>
  </section>
  <section>
    <h2>3. Explicit owner gates</h2>
    <p class="boundary">Every gate starts off. Check only what the owner has actually reviewed and approved.</p>
    <div class="checks">
      <label class="check"><input id="contactIsNamedOperator" type="checkbox"><span>The contact is the named daily operator.</span></label>
      <label class="check"><input id="contactBaselineReviewed" type="checkbox"><span>The owner reviewed the captured Shop baseline and Spa services vertical pack measurements.</span></label>
      <label class="check"><input id="isolatedNonProductionTenantApproved" type="checkbox"><span>The owner approved this isolated non-production workspace label.</span></label>
      <label class="check"><input id="namedOperatorAuthorized" type="checkbox"><span>The named operator is authorized for the five-day rehearsal.</span></label>
      <label class="check"><input id="pilotDataHandlingApproved" type="checkbox"><span>The owner reviewed private data handling and backup boundaries.</span></label>
      <label class="check"><input id="ownerReviewedCommercialDraft" type="checkbox"><span>The owner reviewed the draft fee and understands no payment is accepted.</span></label>
    </div>
  </section>
  <section>
    <button id="download" type="button">Download private owner input</button>
    <p id="status" role="status" aria-live="polite"></p>
    <p>Move the downloaded file into this private workspace as <strong>owner-input.json</strong>, replacing only the blank template. Then follow README.md.</p>
  </section>
</main>
<script>
  'use strict';
  const field = (id) => document.getElementById(id);
  const integer = (id) => Number.parseInt(field(id).value, 10);
  const number = (id) => Number(field(id).value);
  field('startDate').addEventListener('change', () => {
    const value = field('startDate').value;
    if (!value) { field('reviewDate').value = ''; return; }
    const date = new Date(value + 'T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + 4);
    field('reviewDate').value = date.toISOString().slice(0, 10);
  });
  field('download').addEventListener('click', () => {
    const required = [...document.querySelectorAll('input[required]')];
    if (!required.every((input) => input.reportValidity())) {
      field('status').textContent = 'Complete every required field before downloading.';
      return;
    }
    const payload = {
      product: '${SHOP_PILOT_PRODUCT}',
      pilotMode: '${SHOP_PILOT_MODE}',
      verticalPack: '${SHOP_PILOT_VERTICAL_PACK}',
      tenantLabel: field('tenantLabel').value.trim(),
      startDate: field('startDate').value,
      reviewDate: field('reviewDate').value,
      fixedPilotFeeUsd: integer('fixedPilotFeeUsd'),
      contactIsNamedOperator: field('contactIsNamedOperator').checked,
      contactBaselineReviewed: field('contactBaselineReviewed').checked,
      spaBaseline: {
        clientImportRowCount: integer('clientImportRowCount'),
        weeklyPackageSales: integer('weeklyPackageSales'),
        weeklyTreatmentRedemptions: integer('weeklyTreatmentRedemptions'),
        medianMinutesPerRedemption: number('medianMinutesPerRedemption'),
        weeklyPackageCorrectionCount: integer('weeklyPackageCorrectionCount')
      },
      isolatedNonProductionTenantApproved: field('isolatedNonProductionTenantApproved').checked,
      namedOperatorAuthorized: field('namedOperatorAuthorized').checked,
      pilotDataHandlingApproved: field('pilotDataHandlingApproved').checked,
      ownerReviewedCommercialDraft: field('ownerReviewedCommercialDraft').checked
    };
    const blob = new Blob([JSON.stringify(payload, null, 2) + '\\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'owner-input.json';
    link.click();
    URL.revokeObjectURL(url);
    field('status').textContent = 'Downloaded locally. No information was sent.';
  });
</script>
</body>
</html>
`
}

function guide() {
  return `# PRIVATE - SuperMega Shop pilot sales workspace

Do not commit, publish, sync publicly, or send this folder. It contains one customer's contact details and owner-review artifacts.

## 1. Review the intake

Open \`owner-input-form.html\` in a browser and complete it privately with the Shop owner. It works offline, sends nothing, and downloads \`owner-input.json\`. Move that downloaded file into this folder, replacing only the blank template. Every authority flag starts false.

## 2. Prepare the private handoff and reply

From the SuperMega platform repository, run:

\`npm.cmd run client:pilot:workspace -- --prepare --workspace "<this-folder>"\`

This creates \`private-handoff.md\`, \`private-reply.txt\`, and a digest-bound \`decision-input.json\`. It sends nothing.

## 2b. Create the protected Shop portal workspace

After preparation succeeds, create the client's isolated Shop workspace with the Spa services vertical pack using one command:

\`npm.cmd run client:pilot:workspace -- --create-client-workspace --workspace "<this-folder>" --client-workspace "<new-private-client-portal-folder>" --implementation-owner "<responsible SuperMega operator>"\`

This retains only reviewed workspace context and source digests, creates the Spa services CSV starter locally, and performs no hosted write or activation.

## 3. Record the owner decision

Review the exact handoff and reply. Edit \`decision-input.json\` with one decision: \`approve-manual-send\`, \`revise\`, or \`decline\`. Add the owner name, exact UTC timestamp, and review note without changing either digest. Then run:

\`npm.cmd run client:pilot:workspace -- --decide --workspace "<this-folder>"\`

Approval permits only the owner to manually send the exact reviewed reply after independently checking the recipient and terms. Nothing here sends a message, accepts payment, deploys, activates production, or writes hosted data.

## 4. Verify at any time

\`npm.cmd run client:pilot:workspace -- --verify --workspace "<this-folder>"\`
`
}

function manifest(contactText) {
  return {
    contract: SHOP_PILOT_SALES_WORKSPACE_CONTRACT,
    product: SHOP_PILOT_PRODUCT,
    pilotMode: SHOP_PILOT_MODE,
    verticalPack: SHOP_PILOT_VERTICAL_PACK,
    source: {
      contactEventSha256: sha256(contactText),
      sanitized: true,
    },
    workflow: ['review-intake', 'prepare-private-artifacts', 'record-owner-decision', 'manual-owner-action'],
    authority: {
      automaticSendAllowed: false,
      paymentAllowed: false,
      deploymentAllowed: false,
      productionActivationAllowed: false,
      hostedWritesAllowed: false,
    },
    controls: {
      privateWorkspace: true,
      externalWritesPerformed: false,
      customerContactPerformed: false,
    },
  }
}

async function writeShopPilotSalesWorkspace(contactEvent, workspace, ownerInput) {
  const target = paths(workspace)
  const sanitized = sanitizeShopPilotContactEvent(contactEvent)
  const contactText = json(sanitized)
  await mkdir(resolve(workspace), { recursive: false })
  await Promise.all([
    writeFile(target.contact, contactText, { encoding: 'utf8', flag: 'wx' }),
    writeFile(target.owner, json(ownerInput), { encoding: 'utf8', flag: 'wx' }),
    writeFile(target.ownerForm, renderShopPilotOwnerInputForm(), { encoding: 'utf8', flag: 'wx' }),
    writeFile(target.manifest, json(manifest(contactText)), { encoding: 'utf8', flag: 'wx' }),
    writeFile(target.guide, guide(), { encoding: 'utf8', flag: 'wx' }),
  ])
  return {
    contract: SHOP_PILOT_SALES_WORKSPACE_CONTRACT,
    stage: 'owner-input-required',
    contactEventSha256: sha256(contactText),
    filesCreated: 5,
    externalWritesPerformed: false,
    customerContactPerformed: false,
  }
}

export async function initShopPilotSalesWorkspace(contactEvent, workspace) {
  return writeShopPilotSalesWorkspace(contactEvent, workspace, ownerTemplate())
}

export async function initShopPilotSalesWorkspaceFromBundle(bundle, workspace) {
  const normalized = normalizeIntakeBundle(bundle)
  return writeShopPilotSalesWorkspace(normalized.contactEvent, workspace, normalized.ownerInput)
}

async function readWorkspaceFoundation(workspace) {
  const target = paths(workspace)
  const [storedContactText, storedContact, storedManifest, storedOwnerForm] = await Promise.all([
    readFile(target.contact, 'utf8'),
    readJson(target.contact),
    readJson(target.manifest),
    readFile(target.ownerForm, 'utf8'),
  ])
  const sanitizedText = json(sanitizeShopPilotContactEvent(storedContact))
  if (storedContactText !== sanitizedText) throw new Error('shop_pilot_workspace_contact_not_canonical')
  if (
    storedOwnerForm !== renderShopPilotOwnerInputForm()
    ||
    storedManifest.contract !== SHOP_PILOT_SALES_WORKSPACE_CONTRACT
    || storedManifest.product !== SHOP_PILOT_PRODUCT
    || storedManifest.pilotMode !== SHOP_PILOT_MODE
    || storedManifest.verticalPack !== SHOP_PILOT_VERTICAL_PACK
    || storedManifest.source?.sanitized !== true
    || storedManifest.source?.contactEventSha256 !== sha256(storedContactText)
    || storedManifest.authority?.automaticSendAllowed !== false
    || storedManifest.authority?.paymentAllowed !== false
    || storedManifest.authority?.deploymentAllowed !== false
    || storedManifest.authority?.productionActivationAllowed !== false
    || storedManifest.authority?.hostedWritesAllowed !== false
    || storedManifest.controls?.externalWritesPerformed !== false
    || storedManifest.controls?.customerContactPerformed !== false
  ) throw new Error('shop_pilot_workspace_manifest_invalid')
  return { target, contact: storedContact, contactText: storedContactText, manifest: storedManifest }
}

function decisionTemplate(handoff, reply) {
  return {
    decision: 'revise',
    actorKind: 'human',
    actorRole: 'owner',
    decidedBy: '',
    decidedAt: '',
    note: '',
    reviewedHandoffSha256: sha256(handoff),
    reviewedReplySha256: sha256(reply),
  }
}

export async function prepareShopPilotSalesWorkspace(workspace) {
  const { target, contact } = await readWorkspaceFoundation(workspace)
  const owner = await readJson(target.owner)
  const input = shopPilotInputFromContactEvent(contact, owner)
  const handoff = renderShopPilotHandoff(input)
  const reply = renderShopPilotReplyDraft(contact, owner, handoff)
  const prepared = {
    contract: SHOP_PILOT_SALES_PREPARED_CONTRACT,
    handoffContract: SHOP_PILOT_HANDOFF_CONTRACT,
    replyContract: SHOP_PILOT_REPLY_DRAFT_CONTRACT,
    handoffSha256: sha256(handoff),
    replySha256: sha256(reply),
    externalWritesPerformed: false,
    customerContactPerformed: false,
  }
  const outputs = [target.handoff, target.reply, target.decisionInput, target.prepared]
  if ((await Promise.all(outputs.map(exists))).some(Boolean)) throw new Error('shop_pilot_workspace_prepared_outputs_exist')
  await Promise.all([
    writeFile(target.handoff, handoff, { encoding: 'utf8', flag: 'wx' }),
    writeFile(target.reply, reply, { encoding: 'utf8', flag: 'wx' }),
    writeFile(target.decisionInput, json(decisionTemplate(handoff, reply)), { encoding: 'utf8', flag: 'wx' }),
    writeFile(target.prepared, json(prepared), { encoding: 'utf8', flag: 'wx' }),
  ])
  return { ...prepared, stage: 'owner-decision-required', filesCreated: 4 }
}

export async function decideShopPilotSalesWorkspace(workspace) {
  const { target } = await readWorkspaceFoundation(workspace)
  const [input, handoff, reply] = await Promise.all([
    readJson(target.decisionInput),
    readFile(target.handoff, 'utf8'),
    readFile(target.reply, 'utf8'),
  ])
  const decision = renderShopPilotOwnerDecision(input, handoff, reply)
  if (await exists(target.decision)) throw new Error('shop_pilot_workspace_decision_exists')
  await writeFile(target.decision, decision, { encoding: 'utf8', flag: 'wx' })
  const parsed = JSON.parse(decision)
  return {
    contract: SHOP_PILOT_OWNER_DECISION_CONTRACT,
    stage: parsed.status,
    decision: parsed.decision,
    artifactSha256: sha256(decision),
    ownerManualSendApproved: parsed.authority.ownerManualSendApproved,
    filesCreated: 1,
    externalWritesPerformed: false,
    customerContactPerformed: false,
  }
}

export async function verifyShopPilotSalesWorkspace(workspace) {
  const { target, contact } = await readWorkspaceFoundation(workspace)
  const preparedPresence = await Promise.all([target.handoff, target.reply, target.decisionInput, target.prepared].map(exists))
  if (preparedPresence.some(Boolean) && !preparedPresence.every(Boolean)) throw new Error('shop_pilot_workspace_stage_incomplete')
  if (!preparedPresence.some(Boolean)) {
    if (await exists(target.decision)) throw new Error('shop_pilot_workspace_stage_incomplete')
    return { contract: SHOP_PILOT_SALES_WORKSPACE_CONTRACT, stage: 'owner-input-required', verified: true, externalWritesPerformed: false }
  }
  const [owner, handoff, reply, decisionInput, prepared] = await Promise.all([
    readJson(target.owner),
    readFile(target.handoff, 'utf8'),
    readFile(target.reply, 'utf8'),
    readJson(target.decisionInput),
    readJson(target.prepared),
  ])
  const expectedInput = shopPilotInputFromContactEvent(contact, owner)
  const expectedHandoff = renderShopPilotHandoff(expectedInput)
  const expectedReply = renderShopPilotReplyDraft(contact, owner, expectedHandoff)
  if (handoff !== expectedHandoff || reply !== expectedReply) throw new Error('shop_pilot_workspace_prepared_artifact_stale_or_tampered')
  if (
    prepared.contract !== SHOP_PILOT_SALES_PREPARED_CONTRACT
    || prepared.handoffContract !== SHOP_PILOT_HANDOFF_CONTRACT
    || prepared.replyContract !== SHOP_PILOT_REPLY_DRAFT_CONTRACT
    || prepared.handoffSha256 !== sha256(handoff)
    || prepared.replySha256 !== sha256(reply)
    || prepared.externalWritesPerformed !== false
    || prepared.customerContactPerformed !== false
  ) throw new Error('shop_pilot_workspace_prepared_receipt_invalid')
  if (
    !['approve-manual-send', 'revise', 'decline'].includes(decisionInput.decision)
    || decisionInput.actorKind !== 'human'
    || decisionInput.actorRole !== 'owner'
    || decisionInput.reviewedHandoffSha256 !== sha256(handoff)
    || decisionInput.reviewedReplySha256 !== sha256(reply)
  ) throw new Error('shop_pilot_workspace_decision_input_invalid')
  if (!(await exists(target.decision))) {
    return { contract: SHOP_PILOT_SALES_WORKSPACE_CONTRACT, stage: 'owner-decision-required', verified: true, externalWritesPerformed: false }
  }
  const decision = await readFile(target.decision, 'utf8')
  const expectedDecision = renderShopPilotOwnerDecision(decisionInput, handoff, reply)
  if (decision !== expectedDecision) throw new Error('shop_pilot_workspace_decision_stale_or_tampered')
  const parsed = JSON.parse(decision)
  return {
    contract: SHOP_PILOT_SALES_WORKSPACE_CONTRACT,
    stage: parsed.status,
    decision: parsed.decision,
    verified: true,
    ownerManualSendApproved: parsed.authority.ownerManualSendApproved,
    externalWritesPerformed: false,
  }
}

export async function createShopPilotClientWorkspace(workspace, clientWorkspace, implementationOwner, reviewedAt = new Date().toISOString()) {
  const verified = await verifyShopPilotSalesWorkspace(workspace)
  if (!['owner-decision-required', 'approved-for-owner-manual-send'].includes(verified.stage)) {
    throw new Error('shop_pilot_client_workspace_preparation_required')
  }
  const { target, contact } = await readWorkspaceFoundation(workspace)
  const ownerInput = await readJson(target.owner)
  const initialized = await initializeClientWorkspaceFromShopPilot({
    directory: clientWorkspace,
    event: contact,
    ownerInput,
    implementationOwner,
    reviewedAt,
  })
  return {
    contract: initialized.contract,
    stage: 'protected-shop-workspace-created',
    productCount: initialized.productCount,
    templateCount: initialized.templateCount,
    containsClientData: initialized.containsClientData,
    activationStatus: initialized.activationStatus,
    externalWritesPerformed: false,
    modelCallsPerformed: false,
  }
}

function pythonExecutable() {
  if (process.env.SUPERMEGA_PYTHON?.trim()) return process.env.SUPERMEGA_PYTHON.trim()
  const local = process.platform === 'win32'
    ? resolve(ROOT, '.venv', 'Scripts', 'python.exe')
    : resolve(ROOT, '.venv', 'bin', 'python')
  if (existsSync(local)) return local
  return process.platform === 'win32' ? 'python' : 'python3'
}

function runClientLaunchBoard(command, preparationPath, boardPath) {
  const artifactOption = command === 'prepare' ? '--output' : '--board'
  const result = spawnSync(
    pythonExecutable(),
    [
      '-s',
      resolve(ROOT, 'tools', 'prepare_client_launch_board.py'),
      command,
      '--preparation', preparationPath,
      artifactOption, boardPath,
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  )
  if (result.error || result.status !== 0 || result.signal || !result.stdout?.trim()) {
    throw new Error(`shop_pilot_client_launch_board_${command}_failed`)
  }
  let parsed
  try { parsed = JSON.parse(result.stdout) } catch { throw new Error(`shop_pilot_client_launch_board_${command}_invalid`) }
  if (
    parsed.ok !== true
    || parsed.contract !== 'supermega.client_launch_board.v1'
    || parsed.tenantWritesPerformed !== false
    || parsed.productionActivationPerformed !== false
  ) throw new Error(`shop_pilot_client_launch_board_${command}_invalid`)
  return parsed
}

export async function prepareShopPilotClientLaunch(workspace, clientWorkspace, implementationOwner, reviewedAt = new Date().toISOString()) {
  const portal = await createShopPilotClientWorkspace(workspace, clientWorkspace, implementationOwner, reviewedAt)
  const preparationPath = resolve(clientWorkspace, CLIENT_PREPARATION_FILE)
  const boardPath = resolve(clientWorkspace, CLIENT_LAUNCH_BOARD_FILE)
  const preparation = await prepareClientDemo({ dataDirectory: clientWorkspace, preparedAt: reviewedAt })
  await writeClientDemoPreparation(preparation, preparationPath)
  const preparedBoard = runClientLaunchBoard('prepare', preparationPath, boardPath)
  const verifiedBoard = runClientLaunchBoard('verify', preparationPath, boardPath)
  if (preparedBoard.boardDigest !== verifiedBoard.boardDigest) throw new Error('shop_pilot_client_launch_board_binding_invalid')
  const board = await readJson(boardPath)
  const dashboardPath = resolve(clientWorkspace, CLIENT_LAUNCH_DASHBOARD_FILE)
  const dashboard = renderClientLaunchDashboard(board)
  const writtenDashboard = await writeClientLaunchDashboard(dashboard, dashboardPath)
  verifyClientLaunchDashboard(await readFile(dashboardPath, 'utf8'), board)
  return {
    contract: SHOP_PILOT_CLIENT_LAUNCH_CONTRACT,
    stage: 'private-client-launch-dashboard-ready',
    productCount: portal.productCount,
    connectionCount: verifiedBoard.connectionCount,
    blockingGateCount: verifiedBoard.blockingGateCount,
    preparationDigest: preparation.bundleDigest,
    launchBoardDigest: verifiedBoard.boardDigest,
    launchDashboardDigest: writtenDashboard.digest,
    containsClientData: portal.containsClientData,
    privateArtifactsCreated: 3,
    humanReviewRequired: preparation.controls.humanReviewRequired,
    activationStatus: portal.activationStatus,
    externalWritesPerformed: false,
    modelCallsPerformed: false,
    tenantWritesPerformed: false,
    productionActivationPerformed: false,
  }
}

export async function inspectShopClientLaunchStatus(workspace, { releasePacket = null, activationReceipt = null } = {}) {
  const root = resolve(workspace)
  const marker = {
    starter: await exists(resolve(root, STARTER_FILES.manifest)),
    pilot: await exists(resolve(root, FILES.manifest)),
    contact: await exists(resolve(root, 'CONTACT-INTAKE.json')),
    profile: await exists(resolve(root, 'client.json')),
    preparation: await exists(resolve(root, CLIENT_PREPARATION_FILE)),
    board: await exists(resolve(root, CLIENT_LAUNCH_BOARD_FILE)),
    dashboard: await exists(resolve(root, CLIENT_LAUNCH_DASHBOARD_FILE)),
  }
  const launchPresence = [marker.preparation, marker.board, marker.dashboard]
  const launchCandidate = marker.preparation || marker.board
  if (launchCandidate && !launchPresence.every(Boolean)) throw new Error('shop_client_launch_status_stage_incomplete')
  if (marker.starter && (marker.pilot || marker.contact || marker.profile || launchCandidate)) throw new Error('shop_client_launch_status_workspace_ambiguous')
  if (marker.pilot && (marker.contact || marker.profile || launchCandidate)) throw new Error('shop_client_launch_status_workspace_ambiguous')
  if (marker.contact !== marker.profile) throw new Error('shop_client_launch_status_stage_incomplete')

  let client
  let clientWorkspaceBinding = null
  if (launchCandidate) {
    if (!marker.contact || !marker.profile) throw new Error('shop_client_launch_status_stage_incomplete')
    const portal = await verifyContactClientWorkspace(root)
    const preparationPath = resolve(root, CLIENT_PREPARATION_FILE)
    const boardPath = resolve(root, CLIENT_LAUNCH_BOARD_FILE)
    const verifiedBoard = runClientLaunchBoard('verify', preparationPath, boardPath)
    const board = await readJson(boardPath)
    verifyClientLaunchDashboard(await readFile(resolve(root, CLIENT_LAUNCH_DASHBOARD_FILE), 'utf8'), board)
    if (verifiedBoard.boardDigest !== board.boardDigest) throw new Error('shop_client_launch_status_board_binding_invalid')
    clientWorkspaceBinding = board.client?.workspace
    if (typeof clientWorkspaceBinding !== 'string' || !clientWorkspaceBinding.trim()) throw new Error('shop_client_launch_status_board_binding_invalid')
    client = {
      workspaceKind: 'private-client-launch',
      stage: 'private-client-launch-dashboard-ready',
      nextAction: 'prepare_owner_review_release_packet',
      entryFile: CLIENT_LAUNCH_DASHBOARD_FILE,
      productCount: portal.productCount,
      blockingGateCount: verifiedBoard.blockingGateCount,
    }
  } else if (marker.contact && marker.profile) {
    const portal = await verifyContactClientWorkspace(root)
    client = {
      workspaceKind: 'protected-client-workspace',
      stage: 'protected-shop-workspace-created',
      nextAction: 'add_reviewed_product_data_and_prepare_launch',
      entryFile: 'START-HERE.md',
      productCount: portal.productCount,
      blockingGateCount: null,
    }
  } else if (marker.pilot) {
    const pilot = await verifyShopPilotSalesWorkspace(root)
    const stageAction = {
      'owner-input-required': ['complete_private_owner_input', 'owner-input-form.html'],
      'owner-decision-required': ['review_handoff_and_record_owner_decision', 'private-handoff.md'],
      'approved-for-owner-manual-send': ['prepare_private_client_launch', 'README.md'],
      'revision-required': ['revise_private_handoff', 'private-handoff.md'],
      'closed-no-outreach': ['close_or_requalify_pilot', 'owner-decision.json'],
    }[pilot.stage]
    if (!stageAction) throw new Error('shop_client_launch_status_pilot_stage_invalid')
    client = {
      workspaceKind: 'private-pilot-sales-workspace',
      stage: pilot.stage,
      nextAction: stageAction[0],
      entryFile: stageAction[1],
      productCount: 1,
      blockingGateCount: null,
    }
  } else if (marker.starter) {
    await verifyShopPilotIntakeStarter(root)
    client = {
      workspaceKind: 'private-pilot-intake-starter',
      stage: 'private-owner-intake-required',
      nextAction: 'complete_private_intake_and_download_owner_input',
      entryFile: STARTER_FILES.form,
      productCount: 1,
      blockingGateCount: null,
    }
  } else {
    throw new Error('shop_client_launch_status_workspace_unrecognized')
  }

  const release = releasePacket
    ? validateReleaseHandoffPacket(await readBoundedJson(resolve(releasePacket), 'shop_client_launch_status_release_packet_invalid'))
    : null
  const activation = activationReceipt
    ? verifyManagedActivationReceipt(await readBoundedJson(resolve(activationReceipt), 'shop_client_launch_status_activation_receipt_invalid'))
    : null
  if (activation && (client.stage !== 'private-client-launch-dashboard-ready'
    || activation.workspaceId !== clientWorkspaceBinding
    || (release && activation.releaseCommit !== release.candidate.commit))) {
    throw new Error('shop_client_launch_status_activation_binding_invalid')
  }
  const overallStage = activation
    ? 'hosted-activation-requery-required'
    : release && client.stage === 'private-client-launch-dashboard-ready'
      ? 'owner-release-review-required'
      : client.stage
  const nextAction = activation
    ? 'requery_hosted_activation_and_verify_client_portal'
    : release && client.stage === 'private-client-launch-dashboard-ready'
      ? release.nextAction.kind
      : client.nextAction

  return {
    contract: SHOP_CLIENT_LAUNCH_STATUS_CONTRACT,
    overallStage,
    client,
    release: release ? {
      status: 'owner-review-packet-locally-verified',
      exactCommit: release.candidate.commit,
      remoteCandidateState: release.remote.candidateBranchState,
      currentRemoteStateVerified: false,
    } : { status: 'not-supplied', currentRemoteStateVerified: false },
    activation: activation ? {
      status: 'receipt-projection-locally-verified',
      databaseRequeryRequired: true,
      hostedActivationProven: false,
    } : { status: 'not-supplied', databaseRequeryRequired: true, hostedActivationProven: false },
    nextAction,
    controls: {
      privateValuesReturned: false,
      externalWritesPerformed: false,
      customerContactPerformed: false,
      providerCallsPerformed: false,
      hostedReadsPerformed: false,
      deploymentPerformed: false,
      productionActivationPerformed: false,
    },
  }
}

async function main() {
  const args = process.argv.slice(2)
  const workspaceIndex = args.indexOf('--workspace')
  const contactIndex = args.indexOf('--contact-event')
  const bundleIndex = args.indexOf('--intake-bundle')
  const start = args.includes('--start')
  const verifyStarter = args.includes('--verify-starter')
  const init = args.includes('--init')
  const prepare = args.includes('--prepare')
  const decide = args.includes('--decide')
  const verify = args.includes('--verify')
  const status = args.includes('--status')
  const createClientWorkspace = args.includes('--create-client-workspace')
  const prepareClientLaunch = args.includes('--prepare-client-launch')
  const clientWorkspaceIndex = args.indexOf('--client-workspace')
  const implementationOwnerIndex = args.indexOf('--implementation-owner')
  const releasePacketIndex = args.indexOf('--release-packet')
  const activationReceiptIndex = args.indexOf('--activation-receipt')
  if ([start, verifyStarter, init, prepare, decide, verify, status, createClientWorkspace, prepareClientLaunch].filter(Boolean).length !== 1 || workspaceIndex < 0 || !args[workspaceIndex + 1]) {
    throw new Error('usage: node tools/manage_shop_pilot_workspace.mjs (--start | --verify-starter | --init (--contact-event event.json | --intake-bundle bundle.json) | --prepare | --decide | --verify | --status [--release-packet packet.json] [--activation-receipt receipt.json] | --create-client-workspace | --prepare-client-launch --client-workspace new-private-directory --implementation-owner name) --workspace private-directory')
  }
  let result
  if (status) {
    const releasePacket = releasePacketIndex >= 0 ? args[releasePacketIndex + 1] : null
    const activationReceipt = activationReceiptIndex >= 0 ? args[activationReceiptIndex + 1] : null
    const expectedLength = 3 + (releasePacket ? 2 : 0) + (activationReceipt ? 2 : 0)
    if (args.length !== expectedLength
      || args.filter((value) => value === '--workspace').length !== 1
      || args.filter((value) => value === '--release-packet').length > 1
      || args.filter((value) => value === '--activation-receipt').length > 1
      || (releasePacketIndex >= 0 && !releasePacket)
      || (activationReceiptIndex >= 0 && !activationReceipt)) throw new Error('shop_client_launch_status_arguments_invalid')
    result = await inspectShopClientLaunchStatus(args[workspaceIndex + 1], { releasePacket, activationReceipt })
  } else if (start || verifyStarter) {
    if (args.length !== 3 || contactIndex >= 0 || bundleIndex >= 0) throw new Error('shop_pilot_intake_starter_arguments_invalid')
    result = start
      ? await initShopPilotIntakeStarter(args[workspaceIndex + 1])
      : await verifyShopPilotIntakeStarter(args[workspaceIndex + 1])
  } else if (init) {
    const hasContact = contactIndex >= 0 && Boolean(args[contactIndex + 1])
    const hasBundle = bundleIndex >= 0 && Boolean(args[bundleIndex + 1])
    if (args.length !== 5 || hasContact === hasBundle) throw new Error('shop_pilot_workspace_intake_source_required')
    result = hasContact
      ? await initShopPilotSalesWorkspace(await readJson(resolve(args[contactIndex + 1])), args[workspaceIndex + 1])
      : await initShopPilotSalesWorkspaceFromBundle(await readJson(resolve(args[bundleIndex + 1])), args[workspaceIndex + 1])
  } else if (createClientWorkspace || prepareClientLaunch) {
    if (args.length !== 7 || clientWorkspaceIndex < 0 || !args[clientWorkspaceIndex + 1] || implementationOwnerIndex < 0 || !args[implementationOwnerIndex + 1]) {
      throw new Error('shop_pilot_client_workspace_arguments_invalid')
    }
    result = prepareClientLaunch
      ? await prepareShopPilotClientLaunch(args[workspaceIndex + 1], args[clientWorkspaceIndex + 1], args[implementationOwnerIndex + 1])
      : await createShopPilotClientWorkspace(args[workspaceIndex + 1], args[clientWorkspaceIndex + 1], args[implementationOwnerIndex + 1])
  } else {
    if (args.length !== 3 || contactIndex >= 0 || bundleIndex >= 0) throw new Error('shop_pilot_workspace_arguments_invalid')
    if (prepare) result = await prepareShopPilotSalesWorkspace(args[workspaceIndex + 1])
    if (decide) result = await decideShopPilotSalesWorkspace(args[workspaceIndex + 1])
    if (verify) result = await verifyShopPilotSalesWorkspace(args[workspaceIndex + 1])
  }
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, externalWritesPerformed: false })}\n`)
    process.exitCode = 1
  })
}
