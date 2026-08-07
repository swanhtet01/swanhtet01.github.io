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

export const SHOP_PILOT_SALES_WORKSPACE_CONTRACT = 'supermega.shop.pilot_sales_workspace.v1'
export const SHOP_PILOT_SALES_PREPARED_CONTRACT = 'supermega.shop.pilot_sales_prepared.v1'

const FILES = {
  manifest: 'workspace.json',
  contact: 'contact-event.json',
  owner: 'owner-input.json',
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
    isolatedNonProductionTenantApproved: false,
    namedOperatorAuthorized: false,
    pilotDataHandlingApproved: false,
    ownerReviewedCommercialDraft: false,
  }
}

function guide() {
  return `# PRIVATE - SuperMega Shop pilot sales workspace

Do not commit, publish, sync publicly, or send this folder. It contains one customer's contact details and owner-review artifacts.

## 1. Review the intake

Open \`contact-event.json\`, then complete \`owner-input.json\`. Every authority flag starts false. Confirm the named operator and captured baseline; choose an isolated non-production tenant, exact five-day dates, and the reviewed pilot fee.

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
    writeFile(target.manifest, json(manifest(contactText)), { encoding: 'utf8', flag: 'wx' }),
    writeFile(target.guide, guide(), { encoding: 'utf8', flag: 'wx' }),
  ])
  return {
    contract: SHOP_PILOT_SALES_WORKSPACE_CONTRACT,
    stage: 'owner-input-required',
    contactEventSha256: sha256(contactText),
    filesCreated: 4,
    externalWritesPerformed: false,
    customerContactPerformed: false,
  }
}

async function readWorkspaceFoundation(workspace) {
  const target = paths(workspace)
  const [storedContactText, storedContact, storedManifest] = await Promise.all([
    readFile(target.contact, 'utf8'),
    readJson(target.contact),
    readJson(target.manifest),
  ])
  const sanitizedText = json(sanitizeShopPilotContactEvent(storedContact))
  if (storedContactText !== sanitizedText) throw new Error('shop_pilot_workspace_contact_not_canonical')
  if (
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
