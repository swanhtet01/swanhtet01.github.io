#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateApplyReport } from './apply_github_main_protection.mjs'
import { validateReviewBranchPushReport } from './apply_review_branch_push.mjs'
import { validatePullRequestReport } from './apply_release_pull_request.mjs'
import { validateGitHubMainProtectionSnapshot } from './collect_github_main_protection_snapshot.mjs'
import { validateCurrentOperatorBoard } from './prepare_current_operator_board.mjs'
import { validateProductReadinessMatrix } from './prepare_product_readiness_matrix.mjs'

export const NEXT_RELEASE_ACTION_PREFLIGHT_CONTRACT = 'supermega.next-release-action-preflight.v1'

const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const PRODUCT_ORDER = Object.freeze(['shop', 'plant', 'website', 'ecommerce'])
const MAX_FILE_BYTES = 1_000_000
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const ALLOWED_CURRENT_ACTIONS = Object.freeze([
  'github_main_protection',
  'review_branch_push',
  'pull_request_creation',
  'pull_request_review_merge',
  'supabase_preview_rehearsal',
  'paired_vercel_preview_release',
  'shop_pilot_evidence',
  'managed_activation',
])
const FALSE_CONTROL_FIELDS = Object.freeze([
  'externalWritesPerformed',
  'gitRemoteWritesPerformed',
  'githubWritesPerformed',
  'vercelDeploymentsPerformed',
  'supabaseMutationsPerformed',
  'credentialValuesInspected',
  'customerContactPerformed',
  'automaticMessagesSent',
  'paymentOrStockActionPerformed',
  'hostedWritesPerformed',
  'managedActivationPerformed',
  'localSubagentsStarted',
  'privateIdentityExposed',
])
const SECRET_PATTERN = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|vercel_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu
const PHONE_PATTERN = /(?<![A-Za-z0-9])(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}(?![A-Za-z0-9])/u
const PRIVATE_PATH_PATTERN = /(?:[A-Z]:\\\\Users\\\\|\/Users\/|\/home\/|OneDrive - )/iu

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function sha256(value) {
  return createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')
}

function digest(value) {
  return `sha256:${sha256(value)}`
}

function cloneWithoutDigest(value) {
  const copy = { ...value }
  delete copy.digest
  return copy
}

function assertPublicSafe(value, code = 'next_release_action_preflight_private_or_secret_shape') {
  const text = JSON.stringify(value || {})
  if (SECRET_PATTERN.test(text)
    || EMAIL_PATTERN.test(text)
    || PHONE_PATTERN.test(text)
    || PRIVATE_PATH_PATTERN.test(text)
    || /https?:\/\/[^/\s:@]+:[^/\s@]+@/i.test(text)
    || /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/.test(text)) {
    fail(code)
  }
}

function exactTimestamp(value, code) {
  const normalized = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized)
    || new Date(normalized).toISOString() !== normalized) fail(code)
  return normalized
}

function exactSha(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) fail(code)
  return normalized
}

function exactDigest(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!DIGEST_PATTERN.test(normalized)) fail(code)
  return normalized
}

function sameArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

function strings(value, field, max = 50) {
  if (!Array.isArray(value) || value.length > max) fail(`${field}_invalid`)
  const normalized = value.map((item) => {
    const normalized = String(item || '').trim().replace(/\s+/g, ' ')
    if (!normalized || normalized.length > 220) fail(`${field}_invalid`)
    assertPublicSafe(normalized, `${field}_private_or_secret_shape`)
    return normalized
  })
  return [...new Set(normalized)]
}

function text(value, field, max = 240) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) fail(`${field}_invalid`)
  assertPublicSafe(normalized, `${field}_private_or_secret_shape`)
  return normalized
}

function falseControls() {
  return Object.fromEntries(FALSE_CONTROL_FIELDS.map((field) => [field, false]))
}

function minimalReleaseHandoff(handoff) {
  if (!isRecord(handoff)) fail('next_release_action_preflight_handoff_required')
  if (handoff.repository !== REPOSITORY) fail('next_release_action_preflight_repository_invalid')
  const commit = exactSha(handoff.candidate?.commit, 'next_release_action_preflight_commit_invalid')
  const branch = text(handoff.candidate?.branch, 'next_release_action_preflight_branch_invalid', 140)
  if (handoff.candidate?.clean !== true) fail('next_release_action_preflight_candidate_dirty')
  if (handoff.verification?.passed !== true || handoff.verification?.verifiedCommit !== commit) {
    fail('next_release_action_preflight_handoff_verification_invalid')
  }
  return {
    branch,
    commit,
    clean: true,
    liveCommit: exactSha(handoff.live?.identity?.commit, 'next_release_action_preflight_live_commit_invalid'),
    remoteMainCommit: exactSha(handoff.remote?.mainCommit, 'next_release_action_preflight_main_commit_invalid'),
    candidateBranchState: text(handoff.remote?.candidateBranchState || 'unknown', 'next_release_action_preflight_remote_state_invalid', 40),
    candidateAheadOfMain: Number.isSafeInteger(handoff.relations?.candidateAheadOfMain) ? handoff.relations.candidateAheadOfMain : null,
    candidateAheadOfLive: Number.isSafeInteger(handoff.relations?.candidateAheadOfLive) ? handoff.relations.candidateAheadOfLive : null,
  }
}

function receiptSummary(receipt, fallbackName, code) {
  const sourceDigest = receipt?.digest || receipt?.packet?.digest
  return {
    name: text(receipt?.name || fallbackName, `${code}_name`, 160),
    digest: exactDigest(sourceDigest, `${code}_digest_invalid`),
    packetDigest: receipt?.packet?.digest ? exactDigest(receipt.packet.digest, `${code}_packet_digest_invalid`) : null,
  }
}

function gateStatus({ id, label, status, executeReady = false, blockers = [], approvalEnv = null, digest: gateDigest = null }) {
  return {
    id,
    label,
    status,
    executeReady: executeReady === true,
    approvalEnv,
    digest: gateDigest,
    blockers: strings(blockers, `next_release_action_preflight_${id}_blockers`, 80),
  }
}

function firstOpenGate(gates) {
  const open = gates.find((gate) => gate.status !== 'satisfied')
  return open || gates[gates.length - 1]
}

function reviewBranchAlreadyPublished(branchPlan) {
  return branchPlan?.possibleWrite?.kind === 'already_published_no_push'
    || branchPlan?.remoteBefore?.candidateBranchState === 'exact'
}

function approvalBlockers(approval, token = null) {
  const blockers = []
  if (approval?.approved !== true) blockers.push('owner_approval_missing')
  if (token && token.present !== true) blockers.push('github_token_missing')
  return blockers
}

export function buildNextReleaseActionPreflight({
  generatedAt = new Date().toISOString(),
  handoff,
  handoffReceipt = null,
  githubProtectionSnapshot,
  githubProtectionSnapshotReceipt = null,
  githubApplyPlan,
  githubApplyPlanReceipt = null,
  branchPushPlan,
  branchPushPlanReceipt = null,
  pullRequestPlan,
  pullRequestPlanReceipt = null,
  operatorBoard,
  operatorBoardReceipt = null,
  productReadinessMatrix,
  productReadinessMatrixReceipt = null,
} = {}) {
  const release = minimalReleaseHandoff(handoff)
  const snapshot = validateGitHubMainProtectionSnapshot(githubProtectionSnapshot)
  const applyPlan = validateApplyReport(githubApplyPlan, { expectedMode: 'plan_only_no_github_write' })
  const branchPlan = validateReviewBranchPushReport(branchPushPlan, { expectedMode: 'plan_only_no_git_remote_write' })
  const prPlan = validatePullRequestReport(pullRequestPlan, { expectedMode: 'plan_only_no_github_write' })
  const board = validateCurrentOperatorBoard(operatorBoard)
  const matrix = validateProductReadinessMatrix(productReadinessMatrix)

  if (board.candidate?.commit !== release.commit
    || board.candidate?.branch !== release.branch
    || matrix.release?.candidateCommit !== release.commit
    || branchPlan.candidate?.head !== release.commit
    || branchPlan.candidate?.branch !== release.branch
    || prPlan.candidate?.head !== release.commit
    || prPlan.candidate?.branch !== release.branch
    || applyPlan.candidate?.head !== release.commit) {
    fail('next_release_action_preflight_candidate_mismatch')
  }
  if (applyPlan.candidate?.expectedHead !== release.commit
    || applyPlan.candidate?.expectedHeadMatched !== true
    || applyPlan.candidate?.expectedHeadRequiredForExecute !== true) {
    fail('next_release_action_preflight_github_apply_expected_head_invalid')
  }
  if (!sameArray(matrix.productOrder, PRODUCT_ORDER) || !sameArray(board.products?.customerProducts, PRODUCT_ORDER)) {
    fail('next_release_action_preflight_product_order_invalid')
  }
  if (matrix.release.currentGateId !== board.currentAction.gateId) fail('next_release_action_preflight_gate_mismatch')

  const githubSatisfied = snapshot.assessment.ok === true
  const githubApplyBlockers = githubSatisfied
    ? []
    : [
        ...strings(snapshot.assessment.failures || [], 'next_release_action_preflight_github_failures', 80),
        ...approvalBlockers(applyPlan.approval, applyPlan.token),
      ]
  const branchBlockers = strings(branchPlan.readiness?.blockers || [], 'next_release_action_preflight_branch_readiness', 80)
  const prBlockers = strings(prPlan.readiness?.blockers || [], 'next_release_action_preflight_pr_readiness', 80)
  const branchPublished = reviewBranchAlreadyPublished(branchPlan)
  const prDependencyBlockers = branchPublished ? [] : ['review_branch_push_not_satisfied']
  const prExecuteReady = branchPublished && prPlan.readiness?.executeReady === true
  if (!branchPublished && prPlan.readiness?.executeReady === true) {
    fail('next_release_action_preflight_pr_ready_without_review_branch')
  }
  const shop = matrix.products.find((product) => product.productId === 'shop')
  if (!shop) fail('next_release_action_preflight_shop_missing')

  const gates = [
    gateStatus({
      id: 'github_main_protection',
      label: 'GitHub main protection',
      status: githubSatisfied ? 'satisfied' : 'owner_approval_or_token_required',
      executeReady: !githubSatisfied && applyPlan.approval?.approved === true && applyPlan.token?.present === true && applyPlan.candidate?.clean === true,
      blockers: githubApplyBlockers,
      approvalEnv: applyPlan.approval?.env || null,
      digest: applyPlan.digest,
    }),
    gateStatus({
      id: 'review_branch_push',
      label: 'Review branch push',
      status: branchPublished
        ? 'satisfied'
        : branchPlan.readiness?.executeReady === true
          ? 'ready_for_exact_owner_execution'
          : 'blocked',
      executeReady: !branchPublished && branchPlan.readiness?.executeReady === true,
      blockers: branchPublished
        ? []
        : githubSatisfied
          ? branchBlockers
          : ['github_main_protection_unverified', ...branchBlockers],
      approvalEnv: branchPlan.approval?.env || null,
      digest: branchPlan.digest,
    }),
    gateStatus({
      id: 'pull_request_creation',
      label: 'Pull request creation',
      status: prExecuteReady ? 'ready_for_exact_owner_execution' : 'blocked',
      executeReady: prExecuteReady,
      blockers: githubSatisfied ? [...prDependencyBlockers, ...prBlockers] : ['github_main_protection_unverified', ...prDependencyBlockers, ...prBlockers],
      approvalEnv: prPlan.approval?.env || null,
      digest: prPlan.digest,
    }),
    gateStatus({
      id: 'supabase_preview_rehearsal',
      label: 'Supabase preview rehearsal',
      status: 'blocked',
      blockers: ['merged_reviewed_source_required', 'separate_supabase_preview_rehearsal_approval_required', 'clean_empty_non_production_branch_required'],
    }),
    gateStatus({
      id: 'paired_vercel_preview_release',
      label: 'Paired Vercel preview release',
      status: 'blocked',
      blockers: ['reviewed_pr_merge_required', 'supabase_preview_rehearsal_required', 'separate_owner_release_approval_required'],
    }),
    gateStatus({
      id: 'shop_pilot_evidence',
      label: 'Shop pilot evidence',
      status: 'blocked',
      blockers: shop.currentBlockers,
    }),
    gateStatus({
      id: 'managed_activation',
      label: 'Managed activation',
      status: 'blocked',
      blockers: ['preview_rehearsal_missing', 'real_pilot_evidence_missing', 'separate_owner_activation_approval_required'],
    }),
  ]
  const current = firstOpenGate(gates)
  const externalExecuteReadyCount = gates.filter((gate) => gate.executeReady).length
  const body = {
    contract: NEXT_RELEASE_ACTION_PREFLIGHT_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: exactTimestamp(generatedAt, 'next_release_action_preflight_generated_at_invalid'),
    mode: 'local_no_external_effects',
    repository: REPOSITORY,
    candidate: {
      branch: release.branch,
      commit: release.commit,
      clean: true,
      localVerificationPassed: true,
      remoteMainCommit: release.remoteMainCommit,
      liveCommit: release.liveCommit,
      candidateBranchState: release.candidateBranchState,
      candidateAheadOfMain: release.candidateAheadOfMain,
      candidateAheadOfLive: release.candidateAheadOfLive,
    },
    products: {
      customerProducts: [...PRODUCT_ORDER],
      firstPilotProduct: 'shop',
      aiIsSharedCapabilityOnly: true,
    },
    currentAction: {
      gateId: current.id,
      label: current.label,
      status: current.status,
      executeReady: current.executeReady,
      approvalEnv: current.approvalEnv,
      blockers: current.blockers,
    },
    gates,
    allowedNow: {
      localVerification: [
        'npm.cmd run hq:verify',
        'npm.cmd run app:verify',
        'regenerate owner-safe handoff packets for the exact current commit',
      ],
      externalActions: [],
      reason: externalExecuteReadyCount === 0
        ? 'No external action is executable from this local preflight without its separate owner approval and live re-verification.'
        : 'A gate reports executeReady, but this packet still performs no external action; run only the exact owner-approved executor after live re-verification.',
    },
    claims: {
      productionLive: false,
      commercialProofReady: false,
      revenueProven: false,
      managedActivationReady: false,
      erpReplacementClaimAllowed: false,
      customerMessageAutomationReady: false,
      paymentOrStockAutomationReady: false,
    },
    sourceArtifacts: {
      releaseHandoff: receiptSummary(handoffReceipt || { packet: handoff }, 'release-handoff', 'next_release_action_preflight_handoff_receipt'),
      githubProtectionSnapshot: receiptSummary(githubProtectionSnapshotReceipt || { packet: snapshot }, 'github-main-protection-snapshot', 'next_release_action_preflight_snapshot_receipt'),
      githubApplyPlan: receiptSummary(githubApplyPlanReceipt || { packet: applyPlan }, 'github-main-protection-apply-plan', 'next_release_action_preflight_apply_receipt'),
      branchPushPlan: receiptSummary(branchPushPlanReceipt || { packet: branchPlan }, 'release-branch-push-plan', 'next_release_action_preflight_branch_receipt'),
      pullRequestPlan: receiptSummary(pullRequestPlanReceipt || { packet: prPlan }, 'release-pull-request-plan', 'next_release_action_preflight_pr_receipt'),
      operatorBoard: receiptSummary(operatorBoardReceipt || { packet: board }, 'current-operator-board', 'next_release_action_preflight_operator_receipt'),
      productReadinessMatrix: receiptSummary(productReadinessMatrixReceipt || { packet: matrix }, 'product-readiness-matrix', 'next_release_action_preflight_matrix_receipt'),
    },
    controls: falseControls(),
  }
  const packet = { ...body, digest: digest(JSON.stringify(body)) }
  validateNextReleaseActionPreflight(packet)
  return packet
}

export function validateNextReleaseActionPreflight(packet) {
  assertPublicSafe(packet)
  if (!isRecord(packet) || packet.contract !== NEXT_RELEASE_ACTION_PREFLIGHT_CONTRACT) fail('next_release_action_preflight_contract_invalid')
  if (packet.digestScope !== 'utf8_compact_json_without_digest') fail('next_release_action_preflight_digest_scope_invalid')
  exactTimestamp(packet.generatedAt, 'next_release_action_preflight_generated_at_invalid')
  if (packet.mode !== 'local_no_external_effects' || packet.repository !== REPOSITORY) fail('next_release_action_preflight_mode_invalid')
  if (!isRecord(packet.candidate)
    || !SHA_PATTERN.test(packet.candidate.commit || '')
    || !SHA_PATTERN.test(packet.candidate.liveCommit || '')
    || !SHA_PATTERN.test(packet.candidate.remoteMainCommit || '')
    || packet.candidate.clean !== true
    || packet.candidate.localVerificationPassed !== true) fail('next_release_action_preflight_candidate_invalid')
  if (!sameArray(packet.products?.customerProducts, PRODUCT_ORDER)
    || packet.products.firstPilotProduct !== 'shop'
    || packet.products.aiIsSharedCapabilityOnly !== true) fail('next_release_action_preflight_products_invalid')
  if (!isRecord(packet.currentAction)
    || !ALLOWED_CURRENT_ACTIONS.includes(packet.currentAction.gateId)
    || typeof packet.currentAction.executeReady !== 'boolean'
    || !Array.isArray(packet.currentAction.blockers)) fail('next_release_action_preflight_current_action_invalid')
  if (!Array.isArray(packet.gates) || packet.gates.length !== 7) fail('next_release_action_preflight_gates_invalid')
  if (packet.gates.some((gate) => !isRecord(gate)
    || !ALLOWED_CURRENT_ACTIONS.includes(gate.id)
    || typeof gate.executeReady !== 'boolean'
    || !Array.isArray(gate.blockers))) fail('next_release_action_preflight_gates_invalid')
  const gateIds = packet.gates.map((gate) => gate.id)
  if (!sameArray(gateIds, [
    'github_main_protection',
    'review_branch_push',
    'pull_request_creation',
    'supabase_preview_rehearsal',
    'paired_vercel_preview_release',
    'shop_pilot_evidence',
    'managed_activation',
  ])) fail('next_release_action_preflight_gates_invalid')
  if (packet.gates[0].status !== 'satisfied' && packet.currentAction.gateId !== 'github_main_protection') {
    fail('next_release_action_preflight_current_action_invalid')
  }
  const executeReadyGates = packet.gates.filter((gate) => gate.executeReady === true)
  if (executeReadyGates.length > 1
    || (executeReadyGates.length === 1 && executeReadyGates[0].id !== packet.currentAction.gateId)) {
    fail('next_release_action_preflight_execute_ready_ambiguous')
  }
  const githubMainGate = packet.gates.find((gate) => gate.id === 'github_main_protection')
  const reviewBranchGate = packet.gates.find((gate) => gate.id === 'review_branch_push')
  const pullRequestGate = packet.gates.find((gate) => gate.id === 'pull_request_creation')
  if (githubMainGate?.status === 'satisfied' && reviewBranchGate?.status !== 'satisfied') {
    if (pullRequestGate?.status !== 'blocked'
      || pullRequestGate?.executeReady !== false
      || !pullRequestGate?.blockers?.includes('review_branch_push_not_satisfied')
      || packet.currentAction.gateId === 'pull_request_creation') {
      fail('next_release_action_preflight_pr_requires_review_branch')
    }
  }
  if (!isRecord(packet.allowedNow)
    || !Array.isArray(packet.allowedNow.localVerification)
    || !Array.isArray(packet.allowedNow.externalActions)
    || packet.allowedNow.externalActions.length !== 0) fail('next_release_action_preflight_allowed_now_invalid')
  if (!isRecord(packet.claims)
    || packet.claims.productionLive !== false
    || packet.claims.commercialProofReady !== false
    || packet.claims.revenueProven !== false
    || packet.claims.managedActivationReady !== false
    || packet.claims.erpReplacementClaimAllowed !== false
    || packet.claims.customerMessageAutomationReady !== false
    || packet.claims.paymentOrStockAutomationReady !== false) fail('next_release_action_preflight_claims_invalid')
  if (!isRecord(packet.sourceArtifacts)) fail('next_release_action_preflight_sources_invalid')
  for (const artifact of Object.values(packet.sourceArtifacts)) {
    if (!isRecord(artifact)
      || typeof artifact.name !== 'string'
      || !DIGEST_PATTERN.test(artifact.digest || '')
      || artifact.packetDigest != null && !DIGEST_PATTERN.test(artifact.packetDigest || '')) fail('next_release_action_preflight_sources_invalid')
  }
  if (!isRecord(packet.controls) || FALSE_CONTROL_FIELDS.some((field) => packet.controls[field] !== false)) {
    fail('next_release_action_preflight_controls_invalid')
  }
  exactDigest(packet.digest, 'next_release_action_preflight_digest_invalid')
  if (packet.digest !== digest(JSON.stringify(cloneWithoutDigest(packet)))) fail('next_release_action_preflight_digest_mismatch')
  return packet
}

export function renderNextReleaseActionPreflightMarkdown(packet) {
  const preflight = validateNextReleaseActionPreflight(packet)
  const blockers = preflight.currentAction.blockers.length
    ? preflight.currentAction.blockers.map((blocker) => `- ${blocker}`).join('\n')
    : '- none'
  const gateRows = preflight.gates.map((gate) => `| ${gate.label} | ${gate.status} | ${gate.executeReady ? 'yes' : 'no'} | ${gate.blockers.slice(0, 3).join(', ') || 'none'} |`).join('\n')
  return `# SuperMega next release action preflight

Contract: \`${preflight.contract}\`
Digest: \`${preflight.digest}\`
Candidate: \`${preflight.candidate.branch}\` at \`${preflight.candidate.commit}\`
Mode: \`${preflight.mode}\`

## Current action

Gate: ${preflight.currentAction.label}
Status: ${preflight.currentAction.status}
Execute ready from this packet: ${preflight.currentAction.executeReady ? 'yes' : 'no'}
Approval env: ${preflight.currentAction.approvalEnv || 'none'}

Blockers:
${blockers}

## Gate table

| Gate | Status | Execute ready | First blockers |
| --- | --- | --- | --- |
${gateRows}

## Safe now

- Local verification and packet regeneration only.
- No external action is allowed by this packet.
- Shop remains the first pilot product; Plant, Website, and Ecommerce wait behind Shop decision evidence.
- AI remains a shared capability, not a fifth product.

## Claims not allowed

- production live
- commercial proof ready
- revenue proven
- managed activation ready
- ERP replacement claim
- customer message automation
- payment or stock automation
`
}

async function readJsonReceipt(path, validator, code) {
  const absolute = resolve(path || '')
  const textValue = await readFile(absolute, 'utf8')
  const bytes = Buffer.byteLength(textValue, 'utf8')
  if (bytes < 1 || bytes > MAX_FILE_BYTES) fail(`${code}_file_invalid`)
  let parsed
  try {
    parsed = JSON.parse(textValue)
  } catch {
    fail(`${code}_json_invalid`)
  }
  const packet = validator ? validator(parsed) : parsed
  return {
    name: basename(absolute),
    path: absolute,
    bytes,
    digest: digest(textValue),
    packet,
  }
}

async function writeExclusive(path, content) {
  const absolute = resolve(path || '')
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
}

function parseArgs(argv) {
  const options = {
    selfTest: false,
    verifyPath: null,
    outputPath: null,
    markdownOutputPath: null,
    handoffPath: null,
    snapshotPath: null,
    applyPlanPath: null,
    branchPlanPath: null,
    prPlanPath: null,
    operatorBoardPath: null,
    matrixPath: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--verify') options.verifyPath = argv[++index] || null
    else if (arg === '--output') options.outputPath = argv[++index] || null
    else if (arg === '--markdown-output') options.markdownOutputPath = argv[++index] || null
    else if (arg === '--handoff') options.handoffPath = argv[++index] || null
    else if (arg === '--github-protection-snapshot') options.snapshotPath = argv[++index] || null
    else if (arg === '--github-protection-apply-plan') options.applyPlanPath = argv[++index] || null
    else if (arg === '--branch-push-plan') options.branchPlanPath = argv[++index] || null
    else if (arg === '--pull-request-plan') options.prPlanPath = argv[++index] || null
    else if (arg === '--operator-board') options.operatorBoardPath = argv[++index] || null
    else if (arg === '--product-readiness-matrix') options.matrixPath = argv[++index] || null
    else fail(`next_release_action_preflight_usage_invalid:${arg}`)
  }
  return options
}

function selfTestPacket() {
  const commit = 'a'.repeat(40)
  const main = 'b'.repeat(40)
  const live = 'c'.repeat(40)
  const fakeDigest = (char) => `sha256:${char.repeat(64)}`
  const packet = {
    contract: NEXT_RELEASE_ACTION_PREFLIGHT_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: '2026-08-25T00:00:00.000Z',
    mode: 'local_no_external_effects',
    repository: REPOSITORY,
    candidate: {
      branch: 'codex/release-stack-integration-rehearsal-20260825',
      commit,
      clean: true,
      localVerificationPassed: true,
      remoteMainCommit: main,
      liveCommit: live,
      candidateBranchState: 'unpublished',
      candidateAheadOfMain: 100,
      candidateAheadOfLive: 102,
    },
    products: {
      customerProducts: [...PRODUCT_ORDER],
      firstPilotProduct: 'shop',
      aiIsSharedCapabilityOnly: true,
    },
    currentAction: {
      gateId: 'github_main_protection',
      label: 'GitHub main protection',
      status: 'owner_approval_or_token_required',
      executeReady: false,
      approvalEnv: 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL',
      blockers: ['main_unprotected', 'owner_approval_missing', 'github_token_missing'],
    },
    gates: [
      gateStatus({ id: 'github_main_protection', label: 'GitHub main protection', status: 'owner_approval_or_token_required', blockers: ['main_unprotected'], approvalEnv: 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL', digest: fakeDigest('1') }),
      gateStatus({ id: 'review_branch_push', label: 'Review branch push', status: 'blocked', blockers: ['github_main_protection_unverified'], approvalEnv: null, digest: fakeDigest('2') }),
      gateStatus({ id: 'pull_request_creation', label: 'Pull request creation', status: 'blocked', blockers: ['remote_review_branch_not_exact'], approvalEnv: 'SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL', digest: fakeDigest('3') }),
      gateStatus({ id: 'supabase_preview_rehearsal', label: 'Supabase preview rehearsal', status: 'blocked', blockers: ['separate_supabase_preview_rehearsal_approval_required'] }),
      gateStatus({ id: 'paired_vercel_preview_release', label: 'Paired Vercel preview release', status: 'blocked', blockers: ['separate_owner_release_approval_required'] }),
      gateStatus({ id: 'shop_pilot_evidence', label: 'Shop pilot evidence', status: 'blocked', blockers: ['owner_private_baseline', 'real_shop_pilot_evidence'] }),
      gateStatus({ id: 'managed_activation', label: 'Managed activation', status: 'blocked', blockers: ['separate_owner_activation_approval_required'] }),
    ],
    allowedNow: {
      localVerification: ['npm.cmd run hq:verify'],
      externalActions: [],
      reason: 'No external action is executable from this local preflight without its separate owner approval and live re-verification.',
    },
    claims: {
      productionLive: false,
      commercialProofReady: false,
      revenueProven: false,
      managedActivationReady: false,
      erpReplacementClaimAllowed: false,
      customerMessageAutomationReady: false,
      paymentOrStockAutomationReady: false,
    },
    sourceArtifacts: {
      releaseHandoff: { name: 'release-handoff.json', digest: fakeDigest('4'), packetDigest: fakeDigest('5') },
      githubProtectionSnapshot: { name: 'github-snapshot.json', digest: fakeDigest('6'), packetDigest: fakeDigest('7') },
      githubApplyPlan: { name: 'apply-plan.json', digest: fakeDigest('8'), packetDigest: fakeDigest('9') },
      branchPushPlan: { name: 'branch-plan.json', digest: fakeDigest('a'), packetDigest: fakeDigest('b') },
      pullRequestPlan: { name: 'pr-plan.json', digest: fakeDigest('c'), packetDigest: fakeDigest('d') },
      operatorBoard: { name: 'operator-board.json', digest: fakeDigest('e'), packetDigest: fakeDigest('f') },
      productReadinessMatrix: { name: 'matrix.json', digest: fakeDigest('1'), packetDigest: fakeDigest('2') },
    },
    controls: falseControls(),
  }
  return { ...packet, digest: digest(JSON.stringify(packet)) }
}

export function runSelfTest() {
  const packet = validateNextReleaseActionPreflight(selfTestPacket())
  const markdown = renderNextReleaseActionPreflightMarkdown(packet)
  const checks = {
    packet_validates: packet.contract === NEXT_RELEASE_ACTION_PREFLIGHT_CONTRACT,
    current_gate_is_github: packet.currentAction.gateId === 'github_main_protection',
    no_external_actions_allowed: packet.allowedNow.externalActions.length === 0 && Object.values(packet.controls).every((value) => value === false),
    claims_stay_false: Object.values(packet.claims).every((value) => value === false),
    markdown_public_safe: markdown.includes('No external action is allowed') && !SECRET_PATTERN.test(markdown),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key)
  return {
    ok: failedChecks.length === 0,
    contract: `${NEXT_RELEASE_ACTION_PREFLIGHT_CONTRACT}.self-test`,
    checks,
    failedChecks,
    externalWritesPerformed: false,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.selfTest) {
    const result = runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (options.verifyPath) {
    const packet = validateNextReleaseActionPreflight(JSON.parse(await readFile(resolve(options.verifyPath), 'utf8')))
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      currentGateId: packet.currentAction.gateId,
      candidateCommit: packet.candidate.commit,
      digest: packet.digest,
      externalWritesPerformed: false,
    }, null, 2))
    return
  }
  const required = [
    ['handoffPath', 'next_release_action_preflight_handoff_required'],
    ['snapshotPath', 'next_release_action_preflight_snapshot_required'],
    ['applyPlanPath', 'next_release_action_preflight_apply_plan_required'],
    ['branchPlanPath', 'next_release_action_preflight_branch_plan_required'],
    ['prPlanPath', 'next_release_action_preflight_pr_plan_required'],
    ['operatorBoardPath', 'next_release_action_preflight_operator_board_required'],
    ['matrixPath', 'next_release_action_preflight_matrix_required'],
    ['outputPath', 'next_release_action_preflight_output_required'],
  ]
  for (const [field, code] of required) if (!options[field]) fail(code)
  const handoffReceipt = await readJsonReceipt(options.handoffPath, null, 'next_release_action_preflight_handoff')
  const githubProtectionSnapshotReceipt = await readJsonReceipt(options.snapshotPath, validateGitHubMainProtectionSnapshot, 'next_release_action_preflight_snapshot')
  const githubApplyPlanReceipt = await readJsonReceipt(options.applyPlanPath, (packet) => validateApplyReport(packet, { expectedMode: 'plan_only_no_github_write' }), 'next_release_action_preflight_apply')
  const branchPushPlanReceipt = await readJsonReceipt(options.branchPlanPath, (packet) => validateReviewBranchPushReport(packet, { expectedMode: 'plan_only_no_git_remote_write' }), 'next_release_action_preflight_branch')
  const pullRequestPlanReceipt = await readJsonReceipt(options.prPlanPath, (packet) => validatePullRequestReport(packet, { expectedMode: 'plan_only_no_github_write' }), 'next_release_action_preflight_pr')
  const operatorBoardReceipt = await readJsonReceipt(options.operatorBoardPath, validateCurrentOperatorBoard, 'next_release_action_preflight_operator')
  const productReadinessMatrixReceipt = await readJsonReceipt(options.matrixPath, validateProductReadinessMatrix, 'next_release_action_preflight_matrix')
  const packet = buildNextReleaseActionPreflight({
    generatedAt: new Date().toISOString(),
    handoff: handoffReceipt.packet,
    handoffReceipt,
    githubProtectionSnapshot: githubProtectionSnapshotReceipt.packet,
    githubProtectionSnapshotReceipt,
    githubApplyPlan: githubApplyPlanReceipt.packet,
    githubApplyPlanReceipt,
    branchPushPlan: branchPushPlanReceipt.packet,
    branchPushPlanReceipt,
    pullRequestPlan: pullRequestPlanReceipt.packet,
    pullRequestPlanReceipt,
    operatorBoard: operatorBoardReceipt.packet,
    operatorBoardReceipt,
    productReadinessMatrix: productReadinessMatrixReceipt.packet,
    productReadinessMatrixReceipt,
  })
  const output = await writeExclusive(options.outputPath, `${JSON.stringify(packet, null, 2)}\n`)
  const markdownOutput = options.markdownOutputPath
    ? await writeExclusive(options.markdownOutputPath, `${renderNextReleaseActionPreflightMarkdown(packet)}\n`)
    : null
  console.log(JSON.stringify({
    ok: true,
    contract: packet.contract,
    output,
    markdownOutput,
    currentGateId: packet.currentAction.gateId,
    candidateCommit: packet.candidate.commit,
    digest: packet.digest,
    externalWritesPerformed: false,
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: NEXT_RELEASE_ACTION_PREFLIGHT_CONTRACT,
      error: String(error?.message || 'next_release_action_preflight_failed').slice(0, 260),
      externalWritesPerformed: false,
    }, null, 2))
    process.exitCode = 1
  })
}
