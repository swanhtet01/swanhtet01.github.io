import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SHOP_PILOT_HANDOFF_CONTRACT,
  SHOP_PILOT_OWNER_DECISION_CONTRACT,
  SHOP_PILOT_REPLY_DRAFT_CONTRACT,
  renderShopPilotHandoff,
  renderShopPilotOwnerDecision,
  renderShopPilotReplyDraft,
  sanitizeShopPilotContactEvent,
  shopPilotInputFromContactEvent,
} from './create_shop_pilot_handoff.mjs'

export const SHOP_PILOT_SALES_WORKSPACE_CONTRACT = 'supermega.shop.pilot_sales_workspace.v2'
export const SHOP_PILOT_SALES_PREPARED_CONTRACT = 'supermega.shop.pilot_sales_prepared.v2'

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

function paths(workspace) {
  const root = resolve(workspace)
  return Object.fromEntries(Object.entries(FILES).map(([key, name]) => [key, resolve(root, name)]))
}

function ownerTemplate() {
  return {
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

export function renderShopPilotOwnerInputForm() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'">
  <title>SuperMega Spa owner intake</title>
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
    <h1>Spa pilot owner intake</h1>
    <p>Complete this privately with the Spa owner. Nothing is uploaded or sent. The button downloads one local <strong>owner-input.json</strong> file.</p>
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
    <h2>2. Measure the current Spa workflow</h2>
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
      <label class="check"><input id="contactBaselineReviewed" type="checkbox"><span>The owner reviewed the captured Shop baseline and Spa measurements.</span></label>
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

Open \`owner-input-form.html\` in a browser and complete it privately with the Spa owner. It works offline, sends nothing, and downloads \`owner-input.json\`. Move that downloaded file into this folder, replacing only the blank template. Every authority flag starts false.

## 2. Prepare the private handoff and reply

From the SuperMega platform repository, run:

\`npm.cmd run client:pilot:workspace -- --prepare --workspace "<this-folder>"\`

This creates \`private-handoff.md\`, \`private-reply.txt\`, and a digest-bound \`decision-input.json\`. It sends nothing.

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

export async function initShopPilotSalesWorkspace(contactEvent, workspace) {
  const target = paths(workspace)
  const sanitized = sanitizeShopPilotContactEvent(contactEvent)
  const contactText = json(sanitized)
  await mkdir(resolve(workspace), { recursive: false })
  await Promise.all([
    writeFile(target.contact, contactText, { encoding: 'utf8', flag: 'wx' }),
    writeFile(target.owner, json(ownerTemplate()), { encoding: 'utf8', flag: 'wx' }),
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

async function main() {
  const args = process.argv.slice(2)
  const workspaceIndex = args.indexOf('--workspace')
  const contactIndex = args.indexOf('--contact-event')
  const init = args.includes('--init')
  const prepare = args.includes('--prepare')
  const decide = args.includes('--decide')
  const verify = args.includes('--verify')
  if ([init, prepare, decide, verify].filter(Boolean).length !== 1 || workspaceIndex < 0 || !args[workspaceIndex + 1]) {
    throw new Error('usage: node tools/manage_shop_pilot_workspace.mjs (--init --contact-event event.json | --prepare | --decide | --verify) --workspace private-directory')
  }
  let result
  if (init) {
    if (args.length !== 5 || contactIndex < 0 || !args[contactIndex + 1]) throw new Error('shop_pilot_workspace_contact_event_required')
    result = await initShopPilotSalesWorkspace(await readJson(resolve(args[contactIndex + 1])), args[workspaceIndex + 1])
  } else {
    if (args.length !== 3 || contactIndex >= 0) throw new Error('shop_pilot_workspace_arguments_invalid')
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
