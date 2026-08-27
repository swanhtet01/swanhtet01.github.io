#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateManagedPilotReadiness } from '../kernel/managed-pilot-readiness.mjs'
import { buildApplyPlan } from './apply_github_main_protection.mjs'
import { buildPullRequestPlan, readReleaseHandoffReceipt } from './apply_release_pull_request.mjs'
import { buildReviewBranchPushPlan } from './apply_review_branch_push.mjs'
import { validateGitHubMainProtectionSnapshot } from './collect_github_main_protection_snapshot.mjs'
import { validateGitHubMainProtectionPacket } from './prepare_github_main_protection_packet.mjs'
import { validateSupabasePreviewRehearsalProposal } from './prepare_supabase_preview_rehearsal_proposal.mjs'
import { validateTechnicalEstate } from './manage_technical_estate.mjs'

export const CURRENT_OPERATOR_BOARD_CONTRACT = 'supermega.current-operator-board.v1'

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const DEFAULT_GITHUB_PROPOSAL = resolve(root, 'hq', 'readiness', 'github-main-protection-proposal.json')
const DEFAULT_SUPABASE_PROPOSAL = resolve(root, 'hq', 'readiness', 'supabase-preview-rehearsal-proposal.json')
const DEFAULT_READINESS = resolve(root, 'hq', 'readiness', 'managed-pilot-readiness.json')
const DEFAULT_TECHNICAL_ESTATE = resolve(root, 'hq', 'technical-estate.json')
const DEFAULT_PACKAGE = resolve(root, 'package.json')
const MAX_FILE_BYTES = 1_000_000
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const REQUIRED_PRODUCTS = ['shop', 'plant', 'website', 'ecommerce']
const ORDERED_GATE_IDS = [
  'github_main_protection',
  'review_branch_push',
  'pull_request_creation',
  'pull_request_review_merge',
  'supabase_preview_rehearsal',
  'paired_vercel_preview_release',
  'shop_pilot_evidence',
  'managed_activation',
]
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

function assertNoSecretShape(value, code = 'current_operator_board_secret_shape') {
  const text = JSON.stringify(value || {})
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) fail(code)
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
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
}

function git(args, { optional = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 1_000_000,
    timeout: 30_000,
    windowsHide: true,
  })
  if (!optional && (result.error || result.signal || result.status !== 0)) fail('current_operator_board_git_failed')
  return String(result.stdout || '').trim()
}

function currentGitState() {
  return {
    branch: git(['symbolic-ref', '--short', 'HEAD']),
    head: git(['rev-parse', 'HEAD']),
    clean: git(['status', '--porcelain=v1'], { optional: true }).length === 0,
    origin: git(['remote', 'get-url', 'origin']),
  }
}

async function readJsonReceipt(path, validate, code) {
  const absolute = resolve(path || '')
  const text = await readFile(absolute, 'utf8')
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes < 1 || bytes > MAX_FILE_BYTES) fail(`${code}_file_invalid`)
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    fail(`${code}_json_invalid`)
  }
  const packet = validate ? await validate(parsed) : parsed
  return {
    path: absolute,
    digest: digest(text),
    bytes,
    packet,
  }
}

function planStatus(plan) {
  if (!isRecord(plan)) return 'invalid'
  if (plan.possibleWrite?.kind === 'already_published_no_push') return 'satisfied'
  if (plan.readiness?.executeReady === true) return 'ready_if_execute_requested'
  if (Array.isArray(plan.readiness?.blockers) && plan.readiness.blockers.length) return 'blocked'
  if (plan.approval?.approved === true && plan.token?.present === true) return 'ready_if_execute_requested'
  return 'owner_gate_pending'
}

function buildGateSummary({
  id,
  label,
  status,
  nextAction,
  requiredApprovalEnv = null,
  approvalDigest = null,
  blockers = [],
  evidence = [],
  writeKind = null,
}) {
  return {
    id,
    label,
    status,
    nextAction,
    requiredApprovalEnv,
    approvalDigest,
    blockers,
    evidence,
    writeKind,
  }
}

function selectCurrentAction(gates) {
  for (const id of ORDERED_GATE_IDS) {
    const gate = gates.find((candidate) => candidate.id === id)
    if (gate && gate.status !== 'satisfied') {
      return {
        gateId: gate.id,
        label: gate.label,
        nextAction: gate.nextAction,
        requiredApprovalEnv: gate.requiredApprovalEnv,
        blockers: gate.blockers,
      }
    }
  }
  return {
    gateId: 'none',
    label: 'No local next action',
    nextAction: 'Re-audit current provider state before claiming readiness.',
    requiredApprovalEnv: null,
    blockers: [],
  }
}

export function buildCurrentOperatorBoard({
  generatedAt,
  handoffReceipt,
  technicalEstate,
  readiness,
  githubProposalReceipt,
  githubProtectionSnapshot = null,
  supabaseProposalReceipt,
  githubApplyPlan,
  branchPushPlan,
  pullRequestPlan,
  gitState,
  appGate = null,
} = {}) {
  if (!isRecord(handoffReceipt?.packet)) fail('current_operator_board_handoff_required')
  if (!isRecord(technicalEstate)) fail('current_operator_board_estate_required')
  if (!isRecord(readiness)) fail('current_operator_board_readiness_required')
  if (!isRecord(githubProposalReceipt?.packet)) fail('current_operator_board_github_proposal_required')
  if (!isRecord(supabaseProposalReceipt?.packet)) fail('current_operator_board_supabase_proposal_required')
  if (!isRecord(gitState)) fail('current_operator_board_git_state_required')

  const handoff = handoffReceipt.packet
  const products = (technicalEstate.products || []).map((product) => product.productId)
  const releaseCommit = exactSha(handoff.candidate?.commit, 'current_operator_board_commit_invalid')
  const branch = String(handoff.candidate?.branch || '')
  const liveCommit = exactSha(handoff.live?.identity?.commit, 'current_operator_board_live_commit_invalid')
  const handoffDigest = exactDigest(handoffReceipt.digest, 'current_operator_board_handoff_digest_invalid')
  const packetDigest = exactDigest(handoff.digest, 'current_operator_board_handoff_packet_digest_invalid')
  const generated = String(generatedAt || handoff.generatedAt || '')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generated)) fail('current_operator_board_time_invalid')
  if (handoff.repository !== REPOSITORY) fail('current_operator_board_repository_invalid')
  if (gitState.branch !== branch || gitState.head !== releaseCommit) fail('current_operator_board_local_state_mismatch')
  if (gitState.clean !== true) fail('current_operator_board_worktree_dirty')
  if (!sameArray(products, REQUIRED_PRODUCTS)) fail('current_operator_board_products_invalid')
  if ((technicalEstate.sharedCapabilities || []).some((capability) => capability?.id === 'ai' || capability?.classification === 'product')) {
    fail('current_operator_board_ai_boundary_invalid')
  }
  if (readiness.contract !== 'supermega.managed-pilot-readiness.v5'
    || readiness.pilotMode !== 'owner_named'
    || readiness.overall?.hostedActivationReady !== false) {
    fail('current_operator_board_readiness_invalid')
  }
  if (githubApplyPlan?.controls?.githubWritesPerformed !== false
    || branchPushPlan?.controls?.gitRemoteWritesPerformed !== false
    || pullRequestPlan?.controls?.githubWritesPerformed !== false
    || supabaseProposalReceipt.packet?.controls?.providerMutationsPerformed !== false) {
    fail('current_operator_board_controls_invalid')
  }
  if (githubApplyPlan.candidate?.head !== releaseCommit
    || githubApplyPlan.candidate?.expectedHead !== releaseCommit
    || githubApplyPlan.candidate?.expectedHeadMatched !== true
    || githubApplyPlan.candidate?.expectedHeadRequiredForExecute !== true) {
    fail('current_operator_board_github_apply_expected_head_invalid')
  }
  const githubProtectionSatisfied = githubProtectionSnapshot
    ? validateGitHubMainProtectionSnapshot(githubProtectionSnapshot).assessment.ok === true
    : false
  const githubProtectionFailures = githubProtectionSnapshot
    ? githubProtectionSnapshot.assessment.failures
    : []
  const branchAlreadyPublished = branchPushPlan.possibleWrite?.kind === 'already_published_no_push'
    || branchPushPlan.remoteBefore?.candidateBranchState === 'exact'

  const gates = [
    buildGateSummary({
      id: 'github_main_protection',
      label: 'GitHub main protection',
      status: githubProtectionSatisfied ? 'satisfied' : 'verification_or_owner_apply_required',
      nextAction: githubProtectionSatisfied
        ? 'Main protection is verified; continue to the exact review branch push gate.'
        : 'Verify or apply the main ruleset before allowing branch/PR/release work to count as reviewable.',
      requiredApprovalEnv: githubApplyPlan.approval?.env || null,
      approvalDigest: githubApplyPlan.approval?.expectedDigest || null,
      blockers: githubProtectionSatisfied
        ? []
        : [
            ...githubProtectionFailures,
            ...(githubApplyPlan.approval?.approved === true ? [] : ['owner_approval_missing']),
            ...(githubApplyPlan.token?.present === true ? [] : ['github_token_missing']),
            ...(githubApplyPlan.candidate?.clean === true ? [] : ['local_worktree_dirty']),
          ],
      evidence: [
        githubProposalReceipt.digest,
        githubProposalReceipt.packet?.digest,
        githubApplyPlan.contract,
        githubProtectionSnapshot?.digest || null,
      ],
      writeKind: 'repository_ruleset_create_or_update',
    }),
    buildGateSummary({
      id: 'review_branch_push',
      label: 'Exact review branch push',
      status: planStatus(branchPushPlan),
      nextAction: branchPushPlan.possibleWrite?.kind === 'already_published_no_push'
        ? 'Remote review branch already matches the handoff commit; continue to PR creation.'
        : 'Owner may approve exactly one normal review-branch push for the handoff commit.',
      requiredApprovalEnv: branchPushPlan.approval?.env || null,
      approvalDigest: branchPushPlan.approval?.expectedDigest || null,
      blockers: branchAlreadyPublished
        ? []
        : [
            ...(branchPushPlan.candidate?.clean === true ? [] : ['local_worktree_dirty']),
            ...(branchPushPlan.approval?.approved === true ? [] : ['owner_approval_missing']),
          ],
      evidence: [
        handoffDigest,
        packetDigest,
        branchPushPlan.contract,
      ],
      writeKind: branchPushPlan.possibleWrite?.kind || null,
    }),
    buildGateSummary({
      id: 'pull_request_creation',
      label: 'Review-only pull request creation',
      status: planStatus(pullRequestPlan),
      nextAction: 'Create one review-only PR only after the remote branch equals the exact handoff commit.',
      requiredApprovalEnv: pullRequestPlan.approval?.env || null,
      approvalDigest: pullRequestPlan.approval?.expectedDigest || null,
      blockers: Array.isArray(pullRequestPlan.readiness?.blockers) ? pullRequestPlan.readiness.blockers : [],
      evidence: [
        handoffDigest,
        packetDigest,
        pullRequestPlan.contract,
        pullRequestPlan.possibleWrite?.payloadDigest || null,
      ].filter(Boolean),
      writeKind: 'github_pull_request_create',
    }),
    buildGateSummary({
      id: 'pull_request_review_merge',
      label: 'PR review and owner merge decision',
      status: 'blocked_until_pr_checks_and_owner_merge_decision',
      nextAction: 'Wait for required checks, resolved conversations, and manual owner merge decision.',
      blockers: ['pull_request_not_open_or_not_reviewed'],
      evidence: [],
      writeKind: 'merge_decision',
    }),
    buildGateSummary({
      id: 'supabase_preview_rehearsal',
      label: 'Clean Supabase preview rehearsal',
      status: supabaseProposalReceipt.packet?.state === 'prepared-not-executed' ? 'owner_approval_required' : 'invalid',
      nextAction: 'Run only a clean empty non-production preview rehearsal; never retry against production on failure.',
      blockers: ['owner_approval_missing', 'preview_branch_not_created', 'proof_not_complete'],
      evidence: [
        supabaseProposalReceipt.digest,
        supabaseProposalReceipt.packet?.digest,
        supabaseProposalReceipt.packet?.migrationPlan?.chainDigest,
      ].filter(Boolean),
      writeKind: 'supabase_ephemeral_preview_branch',
    }),
    buildGateSummary({
      id: 'paired_vercel_preview_release',
      label: 'Paired Vercel preview and owner release',
      status: 'blocked_until_pr_merge_and_preview_rehearsal',
      nextAction: 'Build paired immutable Vercel previews from one reviewed SHA, then wait for owner production dispatch.',
      blockers: ['reviewed_sha_missing', 'paired_previews_missing', 'owner_release_approval_missing'],
      evidence: [handoff.verification?.workflowAuthority?.workflowDigest].filter(Boolean),
      writeKind: 'vercel_preview_or_promotion',
    }),
    buildGateSummary({
      id: 'shop_pilot_evidence',
      label: 'Private Shop pilot evidence',
      status: readiness.pilotEvidence?.proofComplete === true ? 'satisfied' : 'private_observation_required',
      nextAction: 'Collect owner-private observed Shop evidence; synthetic fixtures do not count as promotion proof.',
      blockers: [
        ...(readiness.pilotEvidence?.acceptedConsecutiveRuns >= readiness.pilotEvidence?.requiredAcceptedConsecutiveRuns ? [] : ['accepted_runs_below_20']),
        ...(readiness.pilotEvidence?.pilotSequenceCoverageMet === true ? [] : ['pilot_sequence_days_missing']),
        ...(readiness.pilotEvidence?.pilotCalendarCoverageMet === true ? [] : ['pilot_calendar_dates_missing']),
        ...(readiness.pilotEvidence?.proofComplete === true ? [] : ['real_observation_missing']),
      ],
      evidence: [],
      writeKind: 'none_private_local_evidence_only',
    }),
    buildGateSummary({
      id: 'managed_activation',
      label: 'Managed production activation',
      status: readiness.overall?.hostedActivationReady === true ? 'owner_activation_decision_required' : 'blocked',
      nextAction: 'Do not enable managed persistence until every hosted proof and separate owner activation approval exists.',
      blockers: Array.isArray(readiness.overall?.blockingGateIds) ? readiness.overall.blockingGateIds : [],
      evidence: [],
      writeKind: 'managed_activation',
    }),
  ]

  const body = {
    contract: CURRENT_OPERATOR_BOARD_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: generated,
    repository: REPOSITORY,
    mode: 'local_no_write_operator_board',
    candidate: {
      branch,
      commit: releaseCommit,
      clean: true,
      aheadOfMain: handoff.relations?.candidateAheadOfMain ?? null,
      aheadOfLive: handoff.relations?.candidateAheadOfLive ?? null,
    },
    live: {
      canonicalPair: handoff.live?.canonicalPair || [],
      commit: liveCommit,
      operatingMode: readiness.liveProduction?.operatingMode || null,
      managedWritesEnabled: readiness.liveProduction?.managedWritesEnabled === true,
    },
    remote: {
      mainCommit: exactSha(handoff.remote?.mainCommit, 'current_operator_board_main_commit_invalid'),
      candidateBranchState: handoff.remote?.candidateBranchState || null,
      candidateCommit: handoff.remote?.candidateCommit || null,
    },
    products: {
      customerProducts: products,
      firstPilotProduct: 'shop',
      nextProductSequence: technicalEstate.lifecycle?.nextProductSequence || [],
      sharedCapabilities: (technicalEstate.sharedCapabilities || []).map((capability) => capability.id),
      aiIsSharedCapability: true,
    },
    currentAction: selectCurrentAction(gates),
    orderedGateIds: [...ORDERED_GATE_IDS],
    gates,
    plans: {
      githubMainProtection: {
        contract: githubApplyPlan.contract,
        mode: githubApplyPlan.mode,
        possibleWrite: githubApplyPlan.possibleWrite,
        controls: githubApplyPlan.controls,
      },
      reviewBranchPush: {
        contract: branchPushPlan.contract,
        mode: branchPushPlan.mode,
        possibleWrite: branchPushPlan.possibleWrite,
        controls: branchPushPlan.controls,
      },
      pullRequestCreation: {
        contract: pullRequestPlan.contract,
        mode: pullRequestPlan.mode,
        readiness: pullRequestPlan.readiness,
        possibleWrite: pullRequestPlan.possibleWrite,
        controls: pullRequestPlan.controls,
      },
      supabasePreviewRehearsal: {
        contract: supabaseProposalReceipt.packet?.contract,
        mode: supabaseProposalReceipt.packet?.mode,
        state: supabaseProposalReceipt.packet?.state,
        maximumLifetimeHours: supabaseProposalReceipt.packet?.previewBranch?.maximumLifetimeHours,
        productionApplyAllowed: supabaseProposalReceipt.packet?.migrationPlan?.productionApplyAllowed,
        controls: supabaseProposalReceipt.packet?.controls,
      },
    },
    sourceReceipts: [
      { label: 'release-handoff', path: handoffReceipt.path || null, digest: handoffDigest, packetDigest },
      { label: 'technical-estate', path: DEFAULT_TECHNICAL_ESTATE, digest: null, packetDigest: technicalEstate.digest || null },
      { label: 'managed-pilot-readiness', path: DEFAULT_READINESS, digest: null, packetDigest: readiness.digest || null },
      {
        label: 'github-main-protection-proposal',
        path: githubProposalReceipt.path || null,
        digest: githubProposalReceipt.digest,
        packetDigest: githubProposalReceipt.packet?.digest || null,
      },
      ...(githubProtectionSnapshot
        ? [{
            label: 'github-main-protection-live-snapshot',
            path: null,
            digest: githubProtectionSnapshot.digest,
            assessmentOk: githubProtectionSnapshot.assessment.ok,
          }]
        : []),
      {
        label: 'supabase-preview-rehearsal-proposal',
        path: supabaseProposalReceipt.path || null,
        digest: supabaseProposalReceipt.digest,
        packetDigest: supabaseProposalReceipt.packet?.digest || null,
      },
      ...(appGate ? [{ label: 'app-gate', ...appGate }] : []),
    ],
    controls: {
      externalWritesPerformed: false,
      gitRemoteWritesPerformed: false,
      githubWritesPerformed: false,
      vercelDeploymentsPerformed: false,
      supabaseMutationsPerformed: false,
      credentialValuesInspected: false,
      customerContactPerformed: false,
      paymentOrStockActionPerformed: false,
      managedActivationPerformed: false,
      localSubagentsStarted: false,
      privateIdentityExposed: false,
    },
  }
  const board = { ...body, digest: digest(JSON.stringify(body)) }
  validateCurrentOperatorBoard(board)
  return board
}

export function validateCurrentOperatorBoard(board) {
  if (!isRecord(board)) fail('current_operator_board_invalid')
  if (board.contract !== CURRENT_OPERATOR_BOARD_CONTRACT) fail('current_operator_board_contract_invalid')
  if (board.digestScope !== 'utf8_compact_json_without_digest') fail('current_operator_board_digest_scope_invalid')
  if (board.repository !== REPOSITORY) fail('current_operator_board_repository_invalid')
  if (board.mode !== 'local_no_write_operator_board') fail('current_operator_board_mode_invalid')
  if (!sameArray(board.products?.customerProducts, REQUIRED_PRODUCTS)) fail('current_operator_board_products_invalid')
  if (board.products?.firstPilotProduct !== 'shop') fail('current_operator_board_first_product_invalid')
  if (board.products?.aiIsSharedCapability !== true
    || !Array.isArray(board.products?.sharedCapabilities)
    || !board.products.sharedCapabilities.includes('ai-assistance')
    || board.products.customerProducts.includes('ai')) {
    fail('current_operator_board_ai_boundary_invalid')
  }
  if (!sameArray(board.orderedGateIds, ORDERED_GATE_IDS)) fail('current_operator_board_gate_order_invalid')
  if (!isRecord(board.currentAction) || !ORDERED_GATE_IDS.includes(board.currentAction.gateId)) {
    fail('current_operator_board_current_action_invalid')
  }
  const gateIds = (Array.isArray(board.gates) ? board.gates : []).map((gate) => gate?.id)
  if (!sameArray(gateIds, ORDERED_GATE_IDS)) fail('current_operator_board_gates_invalid')
  if (!isRecord(board.controls)) fail('current_operator_board_controls_invalid')
  for (const [key, value] of Object.entries(board.controls)) {
    if (value !== false) fail(`current_operator_board_control_not_false:${key}`)
  }
  if (board.live?.managedWritesEnabled !== false) fail('current_operator_board_managed_writes_invalid')
  exactSha(board.candidate?.commit, 'current_operator_board_commit_invalid')
  exactSha(board.live?.commit, 'current_operator_board_live_commit_invalid')
  exactSha(board.remote?.mainCommit, 'current_operator_board_main_commit_invalid')
  exactDigest(board.digest, 'current_operator_board_digest_invalid')
  for (const receipt of board.sourceReceipts || []) {
    if (receipt.digest != null) exactDigest(receipt.digest, 'current_operator_board_source_digest_invalid')
    if (receipt.packetDigest != null) exactDigest(receipt.packetDigest, 'current_operator_board_source_digest_invalid')
  }
  const expected = digest(JSON.stringify(cloneWithoutDigest(board)))
  if (board.digest !== expected) fail('current_operator_board_digest_mismatch')
  assertNoSecretShape(board)
  return board
}

export function renderOperatorBoardMarkdown(board) {
  validateCurrentOperatorBoard(board)
  const blockers = Array.isArray(board.currentAction.blockers) && board.currentAction.blockers.length
    ? board.currentAction.blockers.map((blocker) => `  - ${blocker}`).join('\n')
    : '  - none'
  const gates = board.gates.map((gate, index) => `${index + 1}. ${gate.label}: ${gate.status}`).join('\n')
  return [
    '# SuperMega Current Operator Board',
    '',
    `Contract: \`${board.contract}\``,
    `Digest: \`${board.digest}\``,
    `Candidate: \`${board.candidate.branch}\` at \`${board.candidate.commit}\``,
    `Live commit: \`${board.live.commit}\``,
    `Remote main: \`${board.remote.mainCommit}\``,
    `Mode: \`${board.mode}\``,
    '',
    '## Current action',
    '',
    `Gate: ${board.currentAction.label}`,
    `Next: ${board.currentAction.nextAction}`,
    `Approval env: ${board.currentAction.requiredApprovalEnv || 'none'}`,
    '',
    'Blockers:',
    blockers,
    '',
    '## Ordered gate sequence',
    '',
    gates,
    '',
    '## Products',
    '',
    `Customer products: ${board.products.customerProducts.join(', ')}`,
    `Shared capabilities: ${board.products.sharedCapabilities.join(', ')}`,
    'AI remains a shared capability, not a fifth product.',
    '',
    '## Safety controls',
    '',
    'All provider writes, pushes, PR creation, merges, deployments, Supabase mutations, customer contact, payment/stock actions, credential changes, and managed activation remain false in this board.',
  ].join('\n')
}

export async function prepareCurrentOperatorBoard({
  handoffPath,
  githubProtectionSnapshotPath = null,
  outputPath = null,
  markdownOutputPath = null,
  env = process.env,
} = {}) {
  const handoffReceipt = await readReleaseHandoffReceipt(handoffPath)
  const technicalEstateReceipt = await readJsonReceipt(DEFAULT_TECHNICAL_ESTATE, validateTechnicalEstate, 'current_operator_board_estate')
  const readinessReceipt = await readJsonReceipt(DEFAULT_READINESS, validateManagedPilotReadiness, 'current_operator_board_readiness')
  const githubProposalReceipt = await readJsonReceipt(DEFAULT_GITHUB_PROPOSAL, validateGitHubMainProtectionPacket, 'current_operator_board_github_proposal')
  const githubProtectionSnapshotReceipt = githubProtectionSnapshotPath
    ? await readJsonReceipt(githubProtectionSnapshotPath, validateGitHubMainProtectionSnapshot, 'current_operator_board_github_snapshot')
    : null
  const supabaseProposalReceipt = await readJsonReceipt(DEFAULT_SUPABASE_PROPOSAL, validateSupabasePreviewRehearsalProposal, 'current_operator_board_supabase_proposal')
  const packageReceipt = await readJsonReceipt(DEFAULT_PACKAGE, null, 'current_operator_board_package')
  const gitState = currentGitState()
  const githubApplyPlan = buildApplyPlan({
    proposalReceipt: githubProposalReceipt,
    gitState,
    env,
    expectedHead: handoffReceipt.packet?.candidate?.commit,
  })
  const branchPushPlan = buildReviewBranchPushPlan({
    handoffReceipt,
    mainProtectionSnapshotReceipt: githubProtectionSnapshotReceipt,
    gitState,
    env,
  })
  const pullRequestPlan = buildPullRequestPlan({
    handoffReceipt,
    mainProtectionSnapshotReceipt: githubProtectionSnapshotReceipt,
    gitState,
    env,
    useGitHubCliAuth: true,
  })
  const board = buildCurrentOperatorBoard({
    handoffReceipt,
    technicalEstate: technicalEstateReceipt.packet,
    readiness: readinessReceipt.packet,
    githubProposalReceipt,
    githubProtectionSnapshot: githubProtectionSnapshotReceipt?.packet || null,
    supabaseProposalReceipt,
    githubApplyPlan,
    branchPushPlan,
    pullRequestPlan,
    gitState,
    appGate: {
      digest: packageReceipt.digest,
      command: packageReceipt.packet?.scripts?.['app:verify:local'] || packageReceipt.packet?.scripts?.['app:verify'] || null,
    },
  })
  const json = `${JSON.stringify(board, null, 2)}\n`
  if (outputPath) {
    const absolute = resolve(outputPath)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, json, { encoding: 'utf8' })
  }
  if (markdownOutputPath) {
    const absolute = resolve(markdownOutputPath)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, `${renderOperatorBoardMarkdown(board)}\n`, { encoding: 'utf8' })
  }
  return board
}

async function readAndValidateBoard(path) {
  const text = await readFile(resolve(path || ''), 'utf8')
  return validateCurrentOperatorBoard(JSON.parse(text))
}

function parseArgs(argv) {
  const args = {
    handoffPath: null,
    outputPath: null,
    markdownOutputPath: null,
    verifyPath: null,
    githubProtectionSnapshotPath: null,
    selfTest: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--handoff') args.handoffPath = argv[++index]
    else if (arg === '--github-protection-snapshot') args.githubProtectionSnapshotPath = argv[++index]
    else if (arg === '--output') args.outputPath = argv[++index]
    else if (arg === '--markdown-output') args.markdownOutputPath = argv[++index]
    else if (arg === '--verify') args.verifyPath = argv[++index] || null
    else if (arg === '--self-test') args.selfTest = true
    else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      fail(`current_operator_board_unknown_arg:${arg}`)
    }
  }
  return args
}

function selfTestBoard() {
  const commit = 'a'.repeat(40)
  const main = 'b'.repeat(40)
  const live = 'c'.repeat(40)
  const handoffPacket = {
    generatedAt: '2026-08-25T00:00:00.000Z',
    repository: REPOSITORY,
    candidate: { branch: 'codex/release-stack-integration-rehearsal-20260825', commit, clean: true },
    remote: { mainCommit: main, candidateBranchState: 'unpublished', candidateCommit: null },
    live: { canonicalPair: ['https://supermega.dev', 'https://app.supermega.dev'], identity: { commit: live } },
    relations: { candidateAheadOfMain: 59, candidateAheadOfLive: 61 },
    verification: { workflowAuthority: { workflowDigest: `sha256:${'d'.repeat(64)}` } },
    digest: `sha256:${'e'.repeat(64)}`,
  }
  const technicalEstate = {
    products: REQUIRED_PRODUCTS.map((productId) => ({ productId })),
    lifecycle: { nextProductSequence: [...REQUIRED_PRODUCTS] },
    sharedCapabilities: [{ id: 'ai-assistance', classification: 'shared-capability-not-product' }],
  }
  const readiness = {
    contract: 'supermega.managed-pilot-readiness.v5',
    pilotMode: 'owner_named',
    overall: { hostedActivationReady: false, blockingGateIds: ['preview_rehearsal', 'pilot_evidence', 'production_activation'] },
    liveProduction: { operatingMode: 'isolated_demo', managedWritesEnabled: false },
    pilotEvidence: {
      proofComplete: false,
      acceptedConsecutiveRuns: 0,
      requiredAcceptedConsecutiveRuns: 20,
        requiredPilotDayIndexes: [1, 2, 3, 4, 5],
        acceptedConsecutivePilotDayIndexes: [],
        pilotSequenceCoverageMet: false,
        requiredPilotCalendarDates: 5,
        acceptedConsecutiveObservedDateCount: 0,
        acceptedConsecutiveObservedDates: [],
        pilotCalendarCoverageMet: false,
      },
  }
  const githubProposalReceipt = { path: 'github.json', digest: `sha256:${'1'.repeat(64)}`, packet: { digest: `sha256:${'2'.repeat(64)}` } }
  const supabaseProposalReceipt = {
    path: 'supabase.json',
    digest: `sha256:${'3'.repeat(64)}`,
    packet: {
      contract: 'supermega.supabase-preview-rehearsal-proposal.v1',
      mode: 'owner_approval_required',
      state: 'prepared-not-executed',
      digest: `sha256:${'4'.repeat(64)}`,
      previewBranch: { maximumLifetimeHours: 24 },
      migrationPlan: { productionApplyAllowed: false, chainDigest: `sha256:${'5'.repeat(64)}` },
      controls: { providerMutationsPerformed: false },
    },
  }
  const githubApplyPlan = {
    contract: 'supermega.github-main-protection-apply.v1',
    mode: 'plan_only_no_github_write',
    candidate: {
      branch: handoffPacket.candidate.branch,
      head: commit,
      clean: true,
      expectedHead: commit,
      expectedHeadMatched: true,
      expectedHeadRequiredForExecute: true,
    },
    approval: { env: 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL', approved: false, expectedDigest: `sha256:${'6'.repeat(64)}` },
    token: { present: false },
    possibleWrite: { create: `POST /repos/${REPOSITORY}/rulesets` },
    controls: { githubWritesPerformed: false },
  }
  const branchPushPlan = {
    contract: 'supermega.review-branch-push-apply.v1',
    mode: 'plan_only_no_git_remote_write',
    candidate: { clean: true },
    approval: { env: 'SUPERMEGA_REVIEW_BRANCH_PUSH_APPROVAL', approved: false, expectedDigest: `sha256:${'7'.repeat(64)}` },
    possibleWrite: { kind: 'initial_branch_push' },
    controls: { gitRemoteWritesPerformed: false },
  }
  const pullRequestPlan = {
    contract: 'supermega.release-pull-request-apply.v1',
    mode: 'plan_only_no_github_write',
    approval: { env: 'SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL', approved: false, expectedDigest: `sha256:${'8'.repeat(64)}` },
    readiness: { executeReady: false, blockers: ['remote_review_branch_not_exact', 'owner_approval_missing', 'github_token_missing'] },
    possibleWrite: { payloadDigest: `sha256:${'9'.repeat(64)}` },
    controls: { githubWritesPerformed: false },
  }
  return buildCurrentOperatorBoard({
    handoffReceipt: { path: 'handoff.json', digest: `sha256:${'0'.repeat(64)}`, packet: handoffPacket },
    technicalEstate,
    readiness,
    githubProposalReceipt,
    supabaseProposalReceipt,
    githubApplyPlan,
    branchPushPlan,
    pullRequestPlan,
    gitState: { branch: handoffPacket.candidate.branch, head: commit, clean: true },
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Usage: node tools/prepare_current_operator_board.mjs --handoff <release-handoff.json> [--output <board.json>] [--markdown-output <board.md>]')
    console.log('       node tools/prepare_current_operator_board.mjs --verify <board.json>')
    console.log('       node tools/prepare_current_operator_board.mjs --self-test')
    return
  }
  if (args.selfTest) {
    const board = selfTestBoard()
    const markdown = renderOperatorBoardMarkdown(board)
    if (!markdown.includes('GitHub main protection') || markdown.includes('ghp_')) fail('current_operator_board_self_test_failed')
    console.log(JSON.stringify({
      ok: true,
      contract: CURRENT_OPERATOR_BOARD_CONTRACT,
      currentAction: board.currentAction.gateId,
      controls: board.controls,
    }, null, 2))
    return
  }
  if (args.verifyPath) {
    const board = await readAndValidateBoard(args.verifyPath)
    console.log(JSON.stringify({
      ok: true,
      contract: board.contract,
      path: resolve(args.verifyPath),
      digest: board.digest,
      currentAction: board.currentAction.gateId,
      candidate: board.candidate,
      controls: board.controls,
    }, null, 2))
    return
  }
  if (!args.handoffPath) fail('current_operator_board_handoff_required')
  const board = await prepareCurrentOperatorBoard(args)
  if (!args.outputPath && !args.markdownOutputPath) console.log(JSON.stringify(board, null, 2))
  else {
    console.log(JSON.stringify({
      ok: true,
      contract: board.contract,
      output: args.outputPath ? resolve(args.outputPath) : null,
      markdownOutput: args.markdownOutputPath ? resolve(args.markdownOutputPath) : null,
      digest: board.digest,
      currentAction: board.currentAction.gateId,
      controls: board.controls,
    }, null, 2))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.message || error)
    process.exit(1)
  })
}
