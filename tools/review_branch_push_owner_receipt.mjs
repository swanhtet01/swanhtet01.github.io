#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { access, copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REVIEW_BRANCH_PUSH_OWNER_RECEIPT_CONTRACT = 'supermega.review-branch-push-owner-receipt.v2'
export const REVIEW_BRANCH_PUSH_OWNER_RECEIPT_TTL_MS = 10 * 60 * 1000

const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const NONCE_PATTERN = /^[0-9a-f]{64}$/
const EXECUTION_CHALLENGE_PATTERN = /^[0-9a-f]{64}$/
const EXECUTION_SEAL_PATTERN = /^hmac-sha256:[0-9a-f]{64}$/
const MAX_FILE_BYTES = 128_000
const OWNER_AUTHORITY_FALSE_KEYS = [
  'pullRequestCreationApproved',
  'mergeApproved',
  'forcePushApproved',
  'branchDeletionApproved',
  'workflowDispatchApproved',
  'deploymentApproved',
  'domainChangeApproved',
  'environmentChangeApproved',
  'databaseMutationApproved',
  'credentialChangeApproved',
  'customerContactApproved',
  'paymentApproved',
  'stockMovementApproved',
  'managedActivationApproved',
]

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function reviewBranchPushOwnerReceiptDigest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function signed(body) {
  return { ...body, digest: reviewBranchPushOwnerReceiptDigest(JSON.stringify(body)) }
}

function exactExecutionChallenge(value) {
  const challenge = String(value || '')
  if (!EXECUTION_CHALLENGE_PATTERN.test(challenge)) {
    fail('review_branch_push_owner_receipt_execution_challenge_required')
  }
  return challenge
}

function executionSeal(body, executionChallenge) {
  const challenge = exactExecutionChallenge(executionChallenge)
  return `hmac-sha256:${createHmac('sha256', Buffer.from(challenge, 'hex')).update(JSON.stringify(body)).digest('hex')}`
}

function sameSeal(actual, expected) {
  if (!EXECUTION_SEAL_PATTERN.test(String(actual || '')) || !EXECUTION_SEAL_PATTERN.test(String(expected || ''))) return false
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

function exactIso(value, code) {
  const text = String(value || '')
  const timestamp = Date.parse(text)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== text) fail(code)
  return { text, timestamp }
}

function exactContext({ gate, handoffReceipt } = {}) {
  if (!isRecord(gate) || !isRecord(handoffReceipt) || !isRecord(handoffReceipt.packet)) {
    fail('review_branch_push_owner_receipt_context_required')
  }
  const repository = String(handoffReceipt.packet.repository || '')
  const origin = String(handoffReceipt.packet.remote?.origin || '')
  const branch = String(gate.branch || '')
  const commit = String(gate.commit || '').toLowerCase()
  const remoteCommit = gate.remoteCommit == null ? null : String(gate.remoteCommit).toLowerCase()
  const pushKind = String(gate.pushKind || '')
  const approvalTemplate = String(gate.approvalTemplate || '')
  const handoffFileDigest = String(handoffReceipt.digest || '')
  const handoffPacketDigest = String(handoffReceipt.packet.digest || '')

  if (repository !== 'swanhtet01/swanhtet01.github.io'
    || origin !== `https://github.com/${repository}.git`
    || !/^codex\/[a-z0-9][a-z0-9._/-]{0,119}$/.test(branch)
    || !SHA_PATTERN.test(commit)
    || (remoteCommit !== null && !SHA_PATTERN.test(remoteCommit))
    || !['initial_branch_push', 'fast_forward_branch_push'].includes(pushKind)
    || !approvalTemplate.includes(`push of ${commit} to origin/${branch} for review only`)
    || !DIGEST_PATTERN.test(handoffFileDigest)
    || !DIGEST_PATTERN.test(handoffPacketDigest)) {
    fail('review_branch_push_owner_receipt_context_invalid')
  }

  return {
    repository,
    origin,
    branch,
    commit,
    remoteCommit,
    pushKind,
    handoffFileDigest,
    handoffPacketDigest,
    approvalTemplateDigest: reviewBranchPushOwnerReceiptDigest(approvalTemplate),
  }
}

export function renderReviewBranchPushOwnerConfirmation({ gate, handoffReceipt } = {}) {
  const context = exactContext({ gate, handoffReceipt })
  const remoteLine = context.remoteCommit
    ? context.remoteCommit
    : '(branch is currently unpublished)'
  const pushLabel = context.pushKind === 'initial_branch_push'
    ? 'one normal initial review-branch push'
    : 'one normal fast-forward-only review-branch push'
  return [
    'SuperMega owner gate',
    '',
    `Approve ${pushLabel}?`,
    '',
    `Repository: ${context.repository}`,
    `Branch: ${context.branch}`,
    `Exact commit: ${context.commit}`,
    `Expected remote head: ${remoteLine}`,
    '',
    'This can push only that exact commit to that review branch.',
    'It cannot merge, force-push, delete, dispatch a workflow, deploy, change a domain or environment, mutate a database, change credentials, contact a customer, take payment, or move stock.',
    '',
    'Your approval expires in 10 minutes and is consumed before the push attempt.',
    'No is the default. Choose Yes only if you want this exact review-only push now.',
  ].join('\n')
}

export function buildReviewBranchPushOwnerReceipt({
  gate,
  handoffReceipt,
  executionChallenge,
  confirmedAt = new Date(),
  nonce = randomBytes(32).toString('hex'),
} = {}) {
  const context = exactContext({ gate, handoffReceipt })
  const confirmedAtDate = confirmedAt instanceof Date ? confirmedAt : new Date(confirmedAt)
  if (!Number.isFinite(confirmedAtDate.getTime()) || !NONCE_PATTERN.test(String(nonce || ''))) {
    fail('review_branch_push_owner_receipt_confirmation_invalid')
  }
  const confirmedAtIso = confirmedAtDate.toISOString()
  const expiresAt = new Date(confirmedAtDate.getTime() + REVIEW_BRANCH_PUSH_OWNER_RECEIPT_TTL_MS).toISOString()
  const body = {
    ok: true,
    contract: REVIEW_BRANCH_PUSH_OWNER_RECEIPT_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    decision: 'approved',
    action: {
      id: 'review_branch_push',
      repository: context.repository,
      origin: context.origin,
      branch: context.branch,
      commit: context.commit,
      pushKind: context.pushKind,
      remoteCommitBefore: context.remoteCommit,
      forcePushAllowed: false,
      deleteAllowed: false,
      mergeIncluded: false,
      workflowDispatchIncluded: false,
      deploymentIncluded: false,
    },
    binding: {
      releaseHandoffFileDigest: context.handoffFileDigest,
      releaseHandoffPacketDigest: context.handoffPacketDigest,
      approvalTemplateDigest: context.approvalTemplateDigest,
    },
    confirmation: {
      method: 'windows_local_owner_click',
      defaultDecision: 'decline',
      confirmedAt: confirmedAtIso,
      expiresAt,
      ttlSeconds: REVIEW_BRANCH_PUSH_OWNER_RECEIPT_TTL_MS / 1000,
      nonce,
    },
    authority: {
      pullRequestCreationApproved: false,
      mergeApproved: false,
      forcePushApproved: false,
      branchDeletionApproved: false,
      workflowDispatchApproved: false,
      deploymentApproved: false,
      domainChangeApproved: false,
      environmentChangeApproved: false,
      databaseMutationApproved: false,
      credentialChangeApproved: false,
      customerContactApproved: false,
      paymentApproved: false,
      stockMovementApproved: false,
      managedActivationApproved: false,
    },
    controls: {
      interactiveOwnerClickRequired: true,
      externalWritePerformed: false,
      reusable: false,
      identityRecorded: false,
    },
  }
  return signed({
    ...body,
    executionSeal: executionSeal(body, executionChallenge),
  })
}

export function validateReviewBranchPushOwnerReceipt(packet, {
  gate,
  handoffReceipt,
  executionChallenge,
  now = new Date(),
} = {}) {
  if (!isRecord(packet)) fail('review_branch_push_owner_receipt_invalid')
  const { digest: actualDigest, ...sealedBody } = packet
  if (actualDigest !== reviewBranchPushOwnerReceiptDigest(JSON.stringify(sealedBody))) {
    fail('review_branch_push_owner_receipt_digest_invalid')
  }
  const { executionSeal: actualExecutionSeal, ...body } = sealedBody
  if (!sameSeal(actualExecutionSeal, executionSeal(body, executionChallenge))) {
    fail('review_branch_push_owner_receipt_execution_seal_invalid')
  }
  const context = exactContext({ gate, handoffReceipt })
  if (packet.ok !== true
    || packet.contract !== REVIEW_BRANCH_PUSH_OWNER_RECEIPT_CONTRACT
    || packet.digestScope !== 'utf8_compact_json_without_digest'
    || packet.decision !== 'approved'
    || packet.action?.id !== 'review_branch_push'
    || packet.action?.repository !== context.repository
    || packet.action?.origin !== context.origin
    || packet.action?.branch !== context.branch
    || packet.action?.commit !== context.commit
    || packet.action?.pushKind !== context.pushKind
    || packet.action?.remoteCommitBefore !== context.remoteCommit
    || packet.action?.forcePushAllowed !== false
    || packet.action?.deleteAllowed !== false
    || packet.action?.mergeIncluded !== false
    || packet.action?.workflowDispatchIncluded !== false
    || packet.action?.deploymentIncluded !== false) {
    fail('review_branch_push_owner_receipt_action_mismatch')
  }
  if (packet.binding?.releaseHandoffFileDigest !== context.handoffFileDigest
    || packet.binding?.releaseHandoffPacketDigest !== context.handoffPacketDigest
    || packet.binding?.approvalTemplateDigest !== context.approvalTemplateDigest) {
    fail('review_branch_push_owner_receipt_binding_mismatch')
  }
  if (packet.confirmation?.method !== 'windows_local_owner_click'
    || packet.confirmation?.defaultDecision !== 'decline'
    || packet.confirmation?.ttlSeconds !== REVIEW_BRANCH_PUSH_OWNER_RECEIPT_TTL_MS / 1000
    || !NONCE_PATTERN.test(String(packet.confirmation?.nonce || ''))) {
    fail('review_branch_push_owner_receipt_confirmation_invalid')
  }
  const confirmed = exactIso(packet.confirmation.confirmedAt, 'review_branch_push_owner_receipt_confirmation_invalid')
  const expires = exactIso(packet.confirmation.expiresAt, 'review_branch_push_owner_receipt_confirmation_invalid')
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(current)
    || expires.timestamp - confirmed.timestamp !== REVIEW_BRANCH_PUSH_OWNER_RECEIPT_TTL_MS
    || current < confirmed.timestamp
    || current >= expires.timestamp) {
    fail('review_branch_push_owner_receipt_expired_or_not_current')
  }
  if (!isRecord(packet.authority)
    || OWNER_AUTHORITY_FALSE_KEYS.some((key) => packet.authority[key] !== false)
    || Object.keys(packet.authority).some((key) => !OWNER_AUTHORITY_FALSE_KEYS.includes(key))
    || packet.controls?.interactiveOwnerClickRequired !== true
    || packet.controls?.externalWritePerformed !== false
    || packet.controls?.reusable !== false
    || packet.controls?.identityRecorded !== false) {
    fail('review_branch_push_owner_receipt_authority_invalid')
  }
  return packet
}

function consumedReceiptPath(path, packetDigest) {
  if (!DIGEST_PATTERN.test(String(packetDigest || ''))) fail('review_branch_push_owner_receipt_digest_invalid')
  return `${resolve(path)}.used-${packetDigest.slice('sha256:'.length)}.json`
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export async function readReviewBranchPushOwnerReceipt(path) {
  const absolute = resolve(path || '')
  const payload = await readFile(absolute, 'utf8')
  const bytes = Buffer.byteLength(payload, 'utf8')
  if (bytes < 1 || bytes > MAX_FILE_BYTES) fail('review_branch_push_owner_receipt_file_invalid')
  let packet
  try {
    packet = JSON.parse(payload)
  } catch {
    fail('review_branch_push_owner_receipt_file_invalid')
  }
  const consumedPath = consumedReceiptPath(absolute, packet?.digest)
  if (await pathExists(consumedPath)) fail('review_branch_push_owner_receipt_already_consumed')
  return {
    path: absolute,
    payload,
    fileDigest: reviewBranchPushOwnerReceiptDigest(payload),
    consumedPath,
    packet,
  }
}

export async function consumeReviewBranchPushOwnerReceipt(receipt) {
  if (!isRecord(receipt)
    || !receipt.path
    || !receipt.payload
    || !DIGEST_PATTERN.test(String(receipt.fileDigest || ''))
    || !isRecord(receipt.packet)) {
    fail('review_branch_push_owner_receipt_read_required')
  }
  const consumedPath = receipt.consumedPath || consumedReceiptPath(receipt.path, receipt.packet.digest)
  try {
    await copyFile(receipt.path, consumedPath, fsConstants.COPYFILE_EXCL)
  } catch (error) {
    if (error?.code === 'EEXIST') fail('review_branch_push_owner_receipt_already_consumed')
    throw error
  }
  const copiedPayload = await readFile(consumedPath, 'utf8')
  if (reviewBranchPushOwnerReceiptDigest(copiedPayload) !== receipt.fileDigest
    || copiedPayload !== receipt.payload) {
    fail('review_branch_push_owner_receipt_consume_verify_failed')
  }
  try {
    await unlink(receipt.path)
  } catch (error) {
    if (error?.code !== 'ENOENT') fail('review_branch_push_owner_receipt_consume_cleanup_failed')
  }
  return {
    ok: true,
    packetDigest: receipt.packet.digest,
    fileDigest: receipt.fileDigest,
    consumedPath,
  }
}

export function confirmReviewBranchPushOwnerClick(message, {
  platform = process.platform,
  spawn = spawnSync,
} = {}) {
  if (platform !== 'win32') fail('review_branch_push_owner_receipt_windows_required')
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  const tempDir = process.env.TEMP || process.env.TMP || tmpdir()
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$result = [System.Windows.Forms.MessageBox]::Show($env:SUPERMEGA_OWNER_GATE_MESSAGE, $env:SUPERMEGA_OWNER_GATE_TITLE, [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Warning, [System.Windows.Forms.MessageBoxDefaultButton]::Button2)',
    'if ($result -eq [System.Windows.Forms.DialogResult]::Yes) { Write-Output "APPROVED" } else { Write-Output "DECLINED" }',
  ].join('; ')
  const result = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-Sta', '-Command', script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH || `${windowsRoot}\\System32;${windowsRoot}`,
      SystemRoot: windowsRoot,
      WINDIR: windowsRoot,
      TEMP: tempDir,
      TMP: tempDir,
      SUPERMEGA_OWNER_GATE_TITLE: 'SuperMega exact review-branch push',
      SUPERMEGA_OWNER_GATE_MESSAGE: String(message || ''),
    },
    timeout: 55_000,
    windowsHide: false,
  })
  if (result?.error?.code === 'ETIMEDOUT') fail('review_branch_push_owner_receipt_confirmation_timed_out')
  if (result?.error || result?.signal || result?.status !== 0) {
    fail('review_branch_push_owner_receipt_confirmation_failed')
  }
  return String(result.stdout || '').trim() === 'APPROVED'
}

export async function requestReviewBranchPushOwnerReceipt({
  gate,
  handoffReceipt,
  executionChallenge,
  output,
  confirmer = confirmReviewBranchPushOwnerClick,
  now = () => new Date(),
  nonce = () => randomBytes(32).toString('hex'),
} = {}) {
  exactExecutionChallenge(executionChallenge)
  const message = renderReviewBranchPushOwnerConfirmation({ gate, handoffReceipt })
  const approved = await confirmer(message)
  if (approved !== true) fail('review_branch_push_owner_receipt_declined')
  const packet = buildReviewBranchPushOwnerReceipt({
    gate,
    handoffReceipt,
    executionChallenge,
    confirmedAt: now(),
    nonce: nonce(),
  })
  const absolute = resolve(output || '')
  await mkdir(dirname(absolute), { recursive: true })
  const payload = `${JSON.stringify(packet, null, 2)}\n`
  await writeFile(absolute, payload, { encoding: 'utf8', flag: 'wx' })
  return readReviewBranchPushOwnerReceipt(absolute)
}

async function runSelfTest() {
  const commit = 'a'.repeat(40)
  const branch = 'codex/release-stack-integration-rehearsal-20260825'
  const gate = {
    branch,
    commit,
    remoteCommit: 'b'.repeat(40),
    pushKind: 'fast_forward_branch_push',
    approvalTemplate: `I approve one normal fast-forward-only push of ${commit} to origin/${branch} for review only.`,
  }
  const handoffReceipt = {
    digest: `sha256:${'1'.repeat(64)}`,
    packet: {
      digest: `sha256:${'2'.repeat(64)}`,
      repository: 'swanhtet01/swanhtet01.github.io',
      remote: { origin: 'https://github.com/swanhtet01/swanhtet01.github.io.git' },
    },
  }
  const now = new Date('2026-08-28T00:00:00.000Z')
  const executionChallenge = '4'.repeat(64)
  const packet = buildReviewBranchPushOwnerReceipt({
    gate,
    handoffReceipt,
    executionChallenge,
    confirmedAt: now,
    nonce: '3'.repeat(64),
  })
  return {
    ok: validateReviewBranchPushOwnerReceipt(packet, { gate, handoffReceipt, executionChallenge, now }) === packet,
    contract: `${REVIEW_BRANCH_PUSH_OWNER_RECEIPT_CONTRACT}.self-test`,
    exactActionBound: packet.action.commit === commit && packet.action.branch === branch,
    shortLived: Date.parse(packet.confirmation.expiresAt) - Date.parse(packet.confirmation.confirmedAt) === REVIEW_BRANCH_PUSH_OWNER_RECEIPT_TTL_MS,
    defaultDecision: packet.confirmation.defaultDecision,
    externalWritePerformed: false,
  }
}

async function main() {
  if (process.argv.slice(2).join(' ') !== '--self-test') fail('review_branch_push_owner_receipt_usage_invalid')
  const result = await runSelfTest()
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: REVIEW_BRANCH_PUSH_OWNER_RECEIPT_CONTRACT,
      error: String(error?.message || 'review_branch_push_owner_receipt_failed').slice(0, 240),
      externalWritePerformed: false,
    }, null, 2))
    process.exitCode = 1
  })
}
