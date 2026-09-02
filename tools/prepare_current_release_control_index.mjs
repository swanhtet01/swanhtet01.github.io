#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateReleaseHandoffPacket } from './prepare_release_handoff.mjs'
import { validateGitHubMainProtectionSnapshot } from './collect_github_main_protection_snapshot.mjs'
import { validateApplyReport } from './apply_github_main_protection.mjs'
import { validateReviewBranchPushReport } from './apply_review_branch_push.mjs'
import { validatePullRequestReport } from './apply_release_pull_request.mjs'
import { validateCurrentOperatorBoard } from './prepare_current_operator_board.mjs'
import { validateProductReadinessMatrix } from './prepare_product_readiness_matrix.mjs'
import { validateSuperMegaStatusBrief } from './prepare_supermega_status_brief.mjs'
import { validateNextReleaseActionPreflight } from './prepare_next_release_action_preflight.mjs'
import { validateReleaseOwnerApprovalMarkdown } from './prepare_release_owner_approval_packet.mjs'
import { validateGitHubMainProtectionOwnerActionCard } from './prepare_github_main_protection_owner_action_card.mjs'
import { validateShopPilotDay0ReadinessPacket } from './prepare_shop_pilot_day0_readiness_packet.mjs'
import { validateShopPilotDay0OwnerBaselineActionCard } from './prepare_shop_pilot_day0_owner_baseline_action_card.mjs'

export const CURRENT_RELEASE_CONTROL_INDEX_CONTRACT = 'supermega.current-release-control-index.v1'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GITHUB_PROPOSAL_PATH = resolve(root, 'hq', 'readiness', 'github-main-protection-proposal.json')
const SUPABASE_PROPOSAL_PATH = resolve(root, 'hq', 'readiness', 'supabase-preview-rehearsal-proposal.json')
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const SHA_PATTERN = /^[a-f0-9]{40}$/
const FALSE_CONTROL_KEYS = [
  'externalWritesPerformed',
  'gitRemoteWritesPerformed',
  'githubWritesPerformed',
  'vercelDeploymentsPerformed',
  'supabaseMutationsPerformed',
  'credentialValuesInspected',
  'customerContactPerformed',
  'paymentOrStockActionPerformed',
  'managedActivationPerformed',
]
const SECRET_OR_PRIVATE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /(?<![A-Za-z0-9])(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}(?![A-Za-z0-9])/u,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(code) {
  throw new Error(code)
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function hasSecretOrPrivateShape(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  return SECRET_OR_PRIVATE_PATTERNS.some((pattern) => pattern.test(text))
}

function assertNoSecretOrPrivateShape(value, code = 'current_release_control_index_secret_shape') {
  if (hasSecretOrPrivateShape(value)) fail(code)
}

function assertDigest(value, code) {
  if (!DIGEST_PATTERN.test(String(value || ''))) fail(code)
  return value
}

function assertSha(value, code) {
  if (!SHA_PATTERN.test(String(value || ''))) fail(code)
  return value
}

function compactArtifact({ path, digest: artifactDigest, packetDigest = null, status = null, mode = null, currentGateId = null, currentAction = null }) {
  return {
    fileName: basename(path || ''),
    digest: assertDigest(artifactDigest, 'current_release_control_index_artifact_digest_invalid'),
    packetDigest,
    status,
    mode,
    currentGateId,
    currentAction,
  }
}

function controlsFalse(controls) {
  return isRecord(controls) && FALSE_CONTROL_KEYS.every((key) => controls[key] === false || controls[key] === undefined)
}

function assertCandidateMatch(label, actualCommit, expectedCommit) {
  if (actualCommit !== expectedCommit) fail(`current_release_control_index_${label}_candidate_mismatch`)
}

function preflightCandidateCommit(preflight) {
  return preflight?.candidateCommit || preflight?.candidate?.commit || null
}

function preflightCurrentGateId(preflight) {
  return preflight?.currentGateId || preflight?.currentAction?.gateId || preflight?.release?.currentGateId || null
}

const SUPPORTED_CURRENT_GATE_IDS = new Set(['github_main_protection', 'review_branch_push', 'pull_request_creation'])

function assertSupportedCurrentGateId(gateId) {
  if (!SUPPORTED_CURRENT_GATE_IDS.has(gateId)) fail('current_release_control_index_gate_invalid')
  return gateId
}

function artifactKeysForGate(currentGateId) {
  const required = [
    'handoff',
    'githubMainProtectionSnapshot',
    'githubMainProtectionApplyPlan',
    'reviewBranchPushPlan',
    'pullRequestCreatePlan',
    'operatorBoard',
    'productReadinessMatrix',
    'statusBrief',
    'nextReleaseActionPreflight',
    'releaseOwnerApproval',
    'shopPilotDay0Readiness',
    'shopPilotDay0OwnerBaselineActionCard',
  ]
  if (currentGateId === 'github_main_protection') required.push('githubMainProtectionOwnerActionCard')
  return required
}

function reviewBranchPushActionKind(input) {
  return String(input?.reviewBranchPushPlan?.possibleWrite?.kind || '')
}

function reviewBranchPushActionLabel(input) {
  return reviewBranchPushActionKind(input) === 'fast_forward_branch_push'
    ? 'fast-forward-only review-branch push'
    : 'initial review-branch push'
}

function currentOwnerActionLabel(currentGateId, input) {
  if (currentGateId === 'pull_request_creation') return 'Approve one review-only pull request creation only'
  if (currentGateId === 'review_branch_push') return `Approve exact ${reviewBranchPushActionLabel(input)} only`
  return 'Approve GitHub main protection only'
}

function currentOwnerActionSourcePath(input, currentGateId) {
  if (currentGateId === 'review_branch_push') return input.paths?.reviewBranchPushPlan
  if (currentGateId === 'pull_request_creation') return input.paths?.pullRequestCreatePlan
  return input.paths?.githubMainProtectionOwnerActionCard
}

function ownerApprovalPacketVersionFromPath(path) {
  const match = /release-owner-approval-packet\.(v[0-9]{1,3})\./i.exec(basename(path || ''))
  return match ? match[1].toLowerCase() : 'v1'
}

function artifactFamilyVersionFromPath(path) {
  const match = /\.((?:v)[0-9]{1,3})\./i.exec(basename(path || ''))
  return match ? match[1].toLowerCase() : null
}

function assertSingleArtifactFamilyVersion(paths = {}, currentGateId = 'github_main_protection') {
  const required = artifactKeysForGate(currentGateId)
  const versions = new Map()
  for (const key of required) {
    const version = artifactFamilyVersionFromPath(paths[key])
    if (!version) fail(`current_release_control_index_${key}_artifact_version_missing`)
    versions.set(key, version)
  }
  const uniqueVersions = [...new Set(versions.values())]
  if (uniqueVersions.length !== 1) fail('current_release_control_index_artifact_family_version_mismatch')
  return uniqueVersions[0]
}

export function buildCurrentReleaseControlIndex(input = {}) {
  const handoff = input.handoff
  const candidateCommit = assertSha(handoff?.candidate?.commit, 'current_release_control_index_candidate_invalid')
  const candidateBranch = String(handoff?.candidate?.branch || '')
  if (!candidateBranch || handoff?.candidate?.clean !== true) fail('current_release_control_index_candidate_invalid')
  const currentGateId = assertSupportedCurrentGateId(preflightCurrentGateId(input.nextReleaseActionPreflight))
  const artifactFamilyVersion = assertSingleArtifactFamilyVersion(input.paths || {}, currentGateId)

  assertCandidateMatch('github_apply_plan', input.githubMainProtectionApplyPlan?.candidate?.head, candidateCommit)
  assertCandidateMatch('branch_push_plan', input.reviewBranchPushPlan?.candidate?.head, candidateCommit)
  assertCandidateMatch('pull_request_plan', input.pullRequestCreatePlan?.candidate?.head, candidateCommit)
  assertCandidateMatch('operator_board', input.operatorBoard?.candidate?.commit, candidateCommit)
  assertCandidateMatch('preflight', preflightCandidateCommit(input.nextReleaseActionPreflight), candidateCommit)
  assertCandidateMatch('owner_approval', input.releaseOwnerApproval?.candidate?.commit, candidateCommit)
  if (currentGateId === 'github_main_protection') {
    assertCandidateMatch('github_owner_action_card', input.githubMainProtectionOwnerActionCard?.currentAction?.candidateCommit, candidateCommit)
  }
  if (input.shopPilotDay0Readiness?.candidate?.head) {
    assertCandidateMatch('shop_day0', input.shopPilotDay0Readiness.candidate.head, candidateCommit)
  }
  if (input.shopPilotDay0OwnerBaselineActionCard?.candidate?.head) {
    assertCandidateMatch('shop_day0_owner_baseline_card', input.shopPilotDay0OwnerBaselineActionCard.candidate.head, candidateCommit)
  }

  if (currentGateId === 'github_main_protection'
    && input.githubMainProtectionOwnerActionCard?.currentAction?.id !== currentGateId) fail('current_release_control_index_github_owner_card_gate_mismatch')
  if (input.operatorBoard?.currentAction?.gateId !== currentGateId) fail('current_release_control_index_operator_gate_mismatch')
  if (input.productReadinessMatrix?.release?.currentGateId !== currentGateId) fail('current_release_control_index_matrix_gate_mismatch')
  if (input.statusBrief?.release?.currentGateId !== currentGateId) fail('current_release_control_index_status_gate_mismatch')

  const controls = {
    externalWritesPerformed: false,
    gitRemoteWritesPerformed: false,
    githubWritesPerformed: false,
    vercelDeploymentsPerformed: false,
    supabaseMutationsPerformed: false,
    credentialValuesInspected: false,
    customerContactPerformed: false,
    paymentOrStockActionPerformed: false,
    managedActivationPerformed: false,
  }
  const controlSources = [
    ['handoff', handoff.authority],
    ['snapshot', input.githubMainProtectionSnapshot?.controls],
    ['github_apply_plan', input.githubMainProtectionApplyPlan?.controls],
    ['branch_push_plan', input.reviewBranchPushPlan?.controls],
    ['pull_request_plan', input.pullRequestCreatePlan?.controls],
    ['operator_board', input.operatorBoard?.controls],
    ['status_brief', input.statusBrief?.controls],
    ['preflight', input.nextReleaseActionPreflight],
    ['owner_approval', input.releaseOwnerApproval?.controls],
    ...(input.githubMainProtectionOwnerActionCard ? [['github_owner_action_card', input.githubMainProtectionOwnerActionCard.controls]] : []),
    ['shop_day0', input.shopPilotDay0Readiness?.controls],
    ['shop_day0_owner_baseline_card', input.shopPilotDay0OwnerBaselineActionCard?.controls],
  ]
  for (const [label, sourceControls] of controlSources) {
    if (sourceControls && !controlsFalse(sourceControls)) fail(`current_release_control_index_${label}_controls_invalid`)
  }

  const body = {
    contract: CURRENT_RELEASE_CONTROL_INDEX_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: input.generatedAt || new Date().toISOString(),
    mode: 'local_owner_control_no_external_effects',
    repository: handoff.repository,
    artifactFamily: {
      version: artifactFamilyVersion,
      rule: 'All authoritative generated artifacts for a current release-control index must share one v-number family.',
    },
    candidate: {
      branch: candidateBranch,
      commit: candidateCommit,
      clean: true,
      aheadOfMain: input.operatorBoard?.candidate?.aheadOfMain ?? null,
      aheadOfLive: input.operatorBoard?.candidate?.aheadOfLive ?? null,
    },
    live: {
      commit: handoff.live?.identity?.commit || null,
      canonicalPair: handoff.live?.canonicalPair || [],
    },
    authoritativeArtifacts: {
      releaseHandoff: compactArtifact({
        path: input.paths?.handoff,
        digest: input.handoffFileDigest || handoff.digest,
        packetDigest: handoff.digest,
        status: 'verified',
      }),
      githubMainProtectionSnapshot: compactArtifact({
        path: input.paths?.githubMainProtectionSnapshot,
        digest: input.githubMainProtectionSnapshot.digest,
        status: input.githubMainProtectionSnapshot.assessmentOk ? 'protected' : 'unprotected',
        currentAction: input.githubMainProtectionSnapshot.currentAction,
      }),
      githubMainProtectionApplyPlan: compactArtifact({
        path: input.paths?.githubMainProtectionApplyPlan,
        digest: input.githubMainProtectionApplyPlan.digest,
        mode: input.githubMainProtectionApplyPlan.mode,
      }),
      reviewBranchPushPlan: compactArtifact({
        path: input.paths?.reviewBranchPushPlan,
        digest: input.reviewBranchPushPlan.digest,
        mode: input.reviewBranchPushPlan.mode,
      }),
      pullRequestCreatePlan: compactArtifact({
        path: input.paths?.pullRequestCreatePlan,
        digest: input.pullRequestCreatePlan.digest,
        mode: input.pullRequestCreatePlan.mode,
      }),
      currentOperatorBoard: compactArtifact({
        path: input.paths?.operatorBoard,
        digest: input.operatorBoard.digest,
        currentGateId: input.operatorBoard.currentAction.gateId,
      }),
      productReadinessMatrix: compactArtifact({
        path: input.paths?.productReadinessMatrix,
        digest: input.productReadinessMatrix.digest,
        currentGateId: input.productReadinessMatrix.release.currentGateId,
      }),
      statusBrief: compactArtifact({
        path: input.paths?.statusBrief,
        digest: input.statusBrief.digest,
        currentGateId: input.statusBrief.release.currentGateId,
      }),
      nextReleaseActionPreflight: compactArtifact({
        path: input.paths?.nextReleaseActionPreflight,
        digest: input.nextReleaseActionPreflight.digest,
        currentGateId: input.nextReleaseActionPreflight.currentGateId,
      }),
      releaseOwnerApprovalPacket: compactArtifact({
        path: input.paths?.releaseOwnerApproval,
        digest: input.releaseOwnerApproval.digest,
        status: 'verified_current',
      }),
      ...(input.githubMainProtectionOwnerActionCard ? {
        githubMainProtectionOwnerActionCard: compactArtifact({
          path: input.paths?.githubMainProtectionOwnerActionCard,
          digest: input.githubMainProtectionOwnerActionCard.digest,
          status: input.githubMainProtectionOwnerActionCard.currentAction.status,
          currentAction: input.githubMainProtectionOwnerActionCard.currentAction.id,
        }),
      } : {}),
      shopPilotDay0Readiness: compactArtifact({
        path: input.paths?.shopPilotDay0Readiness,
        digest: input.shopPilotDay0Readiness.digest,
        status: input.shopPilotDay0Readiness.status,
      }),
      shopPilotDay0OwnerBaselineActionCard: compactArtifact({
        path: input.paths?.shopPilotDay0OwnerBaselineActionCard,
        digest: input.shopPilotDay0OwnerBaselineActionCard.digest,
        status: input.shopPilotDay0OwnerBaselineActionCard.status,
        currentAction: input.shopPilotDay0OwnerBaselineActionCard.action.id,
      }),
    },
    stalePacketPolicy: {
      rule: 'Only the artifacts listed in authoritativeArtifacts are current for this candidate; any owner approval packet that does not verify against this handoff and snapshot is stale.',
      staleOwnerApprovalPacketObserved: input.staleOwnerApprovalPacketObserved === true,
      staleOwnerApprovalPacketFileName: input.staleOwnerApprovalPacketFileName || null,
      staleOwnerApprovalRejection: input.staleOwnerApprovalRejection || null,
    },
    currentOwnerAction: {
      gateId: currentGateId,
      label: currentOwnerActionLabel(currentGateId, input),
      sourcePacketFileName: basename(input.paths?.releaseOwnerApproval || ''),
      sourceActionCardFileName: basename(currentOwnerActionSourcePath(input, currentGateId) || ''),
      exactCommit: candidateCommit,
      externalWriteRequiresOwnerApproval: true,
      branchPushAllowedNow: false,
      pullRequestAllowedNow: false,
      deployAllowedNow: false,
      supabaseWriteAllowedNow: false,
      customerContactAllowedNow: false,
      paymentOrStockAllowedNow: false,
      managedActivationAllowedNow: false,
    },
    shopPilot: {
      day0Status: input.shopPilotDay0Readiness.status,
      day0ReadyForOwnerPrivateHandoff: input.shopPilotDay0Readiness.day0ReadyForOwnerPrivateHandoff === true,
      currentPrivateGate: input.shopPilotDay0Readiness.ownerPrivateObservationBridge?.expectedCurrentGate || null,
      nextLocalAction: input.shopPilotDay0Readiness.ownerPrivateObservationBridge?.nextLocalAction || null,
      ownerBaselineActionCardFileName: basename(input.paths?.shopPilotDay0OwnerBaselineActionCard || ''),
      customerContactAllowed: false,
      managedActivationAllowed: false,
    },
    controls,
  }
  assertNoSecretOrPrivateShape(body)
  return { ...body, digest: digest(JSON.stringify(body)) }
}

export function validateCurrentReleaseControlIndex(packet) {
  assertNoSecretOrPrivateShape(packet)
  if (!isRecord(packet) || packet.contract !== CURRENT_RELEASE_CONTROL_INDEX_CONTRACT) fail('current_release_control_index_contract_invalid')
  const { digest: actualDigest, ...body } = packet
  if (!DIGEST_PATTERN.test(actualDigest || '') || actualDigest !== digest(JSON.stringify(body))) fail('current_release_control_index_digest_invalid')
  if (packet.mode !== 'local_owner_control_no_external_effects') fail('current_release_control_index_mode_invalid')
  assertSha(packet.candidate?.commit, 'current_release_control_index_candidate_invalid')
  if (packet.candidate.clean !== true) fail('current_release_control_index_candidate_invalid')
  const currentGateId = assertSupportedCurrentGateId(packet.currentOwnerAction?.gateId)
  if (packet.currentOwnerAction?.exactCommit !== packet.candidate.commit
    || packet.currentOwnerAction?.branchPushAllowedNow !== false
    || packet.currentOwnerAction?.pullRequestAllowedNow !== false
    || packet.currentOwnerAction?.deployAllowedNow !== false
    || packet.currentOwnerAction?.supabaseWriteAllowedNow !== false
    || packet.currentOwnerAction?.customerContactAllowedNow !== false
    || packet.currentOwnerAction?.paymentOrStockAllowedNow !== false
    || packet.currentOwnerAction?.managedActivationAllowedNow !== false) {
    fail('current_release_control_index_owner_action_invalid')
  }
  if (!controlsFalse(packet.controls)) fail('current_release_control_index_controls_invalid')
  const artifacts = packet.authoritativeArtifacts
  const required = [
    'releaseHandoff',
    'githubMainProtectionSnapshot',
    'githubMainProtectionApplyPlan',
    'reviewBranchPushPlan',
    'pullRequestCreatePlan',
    'currentOperatorBoard',
    'productReadinessMatrix',
    'statusBrief',
    'nextReleaseActionPreflight',
    'releaseOwnerApprovalPacket',
    ...(currentGateId === 'github_main_protection' ? ['githubMainProtectionOwnerActionCard'] : []),
    'shopPilotDay0Readiness',
    'shopPilotDay0OwnerBaselineActionCard',
  ]
  if (!isRecord(artifacts)) fail('current_release_control_index_artifacts_invalid')
  for (const key of required) {
    const artifact = artifacts[key]
    if (!isRecord(artifact)
      || typeof artifact.fileName !== 'string'
      || artifact.fileName.includes('\\')
      || artifact.fileName.includes('/')
      || !DIGEST_PATTERN.test(artifact.digest || '')) {
      fail(`current_release_control_index_${key}_artifact_invalid`)
    }
  }
  const artifactFamilyVersion = packet.artifactFamily?.version || null
  if (!/^v[0-9]{1,3}$/.test(artifactFamilyVersion || '')) fail('current_release_control_index_artifact_family_invalid')
  const artifactVersions = required.map((key) => artifactFamilyVersionFromPath(artifacts[key].fileName))
  if (artifactVersions.some((version) => version !== artifactFamilyVersion)) {
    fail('current_release_control_index_artifact_family_mismatch')
  }
  if (artifacts.releaseOwnerApprovalPacket.status !== 'verified_current') fail('current_release_control_index_owner_packet_invalid')
  if (currentGateId === 'github_main_protection' && (artifacts.githubMainProtectionOwnerActionCard.status !== 'owner_approval_or_token_required'
    || artifacts.githubMainProtectionOwnerActionCard.currentAction !== 'github_main_protection')) {
    fail('current_release_control_index_github_owner_action_card_invalid')
  }
  if (currentGateId === 'review_branch_push'
    && packet.currentOwnerAction.sourceActionCardFileName !== artifacts.reviewBranchPushPlan.fileName) {
    fail('current_release_control_index_review_branch_action_card_invalid')
  }
  if (currentGateId === 'pull_request_creation'
    && packet.currentOwnerAction.sourceActionCardFileName !== artifacts.pullRequestCreatePlan.fileName) {
    fail('current_release_control_index_pull_request_action_card_invalid')
  }
  if (artifacts.shopPilotDay0OwnerBaselineActionCard.status !== 'owner_observed_baseline_action_required'
    || artifacts.shopPilotDay0OwnerBaselineActionCard.currentAction !== 'capture-owner-observed-baseline') {
    fail('current_release_control_index_shop_day0_owner_baseline_card_invalid')
  }
  if (packet.shopPilot?.customerContactAllowed !== false || packet.shopPilot?.managedActivationAllowed !== false) {
    fail('current_release_control_index_shop_pilot_invalid')
  }
  return packet
}

export function renderCurrentReleaseControlIndexMarkdown(packet) {
  validateCurrentReleaseControlIndex(packet)
  const artifactLines = Object.entries(packet.authoritativeArtifacts)
    .map(([label, artifact]) => `- ${label}: \`${artifact.fileName}\` (${artifact.digest})`)
    .join('\n')
  const staleLine = packet.stalePacketPolicy.staleOwnerApprovalPacketObserved
    ? `Observed stale owner approval packet rejected: \`${packet.stalePacketPolicy.staleOwnerApprovalPacketFileName}\` (${packet.stalePacketPolicy.staleOwnerApprovalRejection}).`
    : 'No stale owner approval packet was supplied for this index.'
  const branchPushInstruction = packet.currentOwnerAction.label
    .replace(/^Approve exact /, '')
    .replace(/ only$/, '')
  const ownerInstruction = packet.currentOwnerAction.gateId === 'review_branch_push'
    ? `Use \`${packet.currentOwnerAction.sourceActionCardFileName}\` with \`${packet.currentOwnerAction.sourcePacketFileName}\` and approve section 2 only: ${branchPushInstruction} for \`${packet.currentOwnerAction.exactCommit}\`.`
    : packet.currentOwnerAction.gateId === 'pull_request_creation'
      ? `Use \`${packet.currentOwnerAction.sourceActionCardFileName}\` with \`${packet.currentOwnerAction.sourcePacketFileName}\` and approve section 3 only: review-only pull request creation for \`${packet.currentOwnerAction.exactCommit}\`.`
      : `Use \`${packet.currentOwnerAction.sourceActionCardFileName}\` with \`${packet.currentOwnerAction.sourcePacketFileName}\` and approve section 1 only: GitHub main protection for \`${packet.currentOwnerAction.exactCommit}\`.`
  return `# SuperMega Current Release Control Index

Contract: \`${packet.contract}\`
Digest: \`${packet.digest}\`
Candidate: \`${packet.candidate.branch} @ ${packet.candidate.commit}\`
Current gate: \`${packet.currentOwnerAction.gateId}\`
Artifact family: \`${packet.artifactFamily.version}\`

## Use these files for the current candidate

${artifactLines}

## Current owner action

${ownerInstruction}

- Branch push allowed now: false
- Pull request allowed now: false
- Deploy allowed now: false
- Supabase write allowed now: false
- Customer contact allowed now: false
- Payment or stock action allowed now: false
- Managed activation allowed now: false

## Shop pilot gate

- Day-0 status: \`${packet.shopPilot.day0Status}\`
- Private gate: \`${packet.shopPilot.currentPrivateGate || 'not active'}\`
- Next local action: \`${packet.shopPilot.nextLocalAction || 'none'}\`
- Owner baseline action card: \`${packet.shopPilot.ownerBaselineActionCardFileName || 'not generated'}\`
- Customer contact allowed: false
- Managed activation allowed: false

## Stale packet policy

${staleLine}

Only the artifacts listed above are current for this candidate. Older generated packets may be useful history, but they are not authority for owner approval or release execution.

## Boundary

This index performed no external writes and does not approve GitHub, Vercel, Supabase, credential, customer, payment, stock, or managed-activation actions.
`
}

async function readJson(path, code) {
  const text = await readFile(resolve(path || ''), 'utf8').catch(() => null)
  if (!text) fail(code)
  try {
    return JSON.parse(text)
  } catch {
    fail(`${code}_json_invalid`)
  }
}

async function readText(path, code) {
  const text = await readFile(resolve(path || ''), 'utf8').catch(() => null)
  if (!text) fail(code)
  return text
}

async function collectInputs(options) {
  const handoffPath = resolve(options.handoffPath || '')
  const snapshotPath = resolve(options.githubMainProtectionSnapshotPath || '')
  const handoff = validateReleaseHandoffPacket(await readJson(handoffPath, 'current_release_control_index_handoff_missing'))
  Object.defineProperty(handoff, '__sourcePath', { value: handoffPath, enumerable: false })
  const githubMainProtectionSnapshot = validateGitHubMainProtectionSnapshot(await readJson(snapshotPath, 'current_release_control_index_snapshot_missing'))
  const githubMainProtectionApplyPlan = validateApplyReport(await readJson(options.githubMainProtectionApplyPlanPath, 'current_release_control_index_github_apply_plan_missing'), { expectedMode: 'plan_only_no_github_write' })
  const reviewBranchPushPlan = validateReviewBranchPushReport(await readJson(options.reviewBranchPushPlanPath, 'current_release_control_index_branch_plan_missing'), { expectedMode: 'plan_only_no_git_remote_write' })
  const pullRequestCreatePlan = validatePullRequestReport(await readJson(options.pullRequestCreatePlanPath, 'current_release_control_index_pr_plan_missing'), { expectedMode: 'plan_only_no_github_write' })
  const operatorBoard = validateCurrentOperatorBoard(await readJson(options.operatorBoardPath, 'current_release_control_index_operator_board_missing'))
  const productReadinessMatrix = validateProductReadinessMatrix(await readJson(options.productReadinessMatrixPath, 'current_release_control_index_matrix_missing'))
  const statusBrief = validateSuperMegaStatusBrief(await readJson(options.statusBriefPath, 'current_release_control_index_status_brief_missing'))
  const nextReleaseActionPreflight = validateNextReleaseActionPreflight(await readJson(options.nextReleaseActionPreflightPath, 'current_release_control_index_preflight_missing'))
  const shopPilotDay0Readiness = validateShopPilotDay0ReadinessPacket(await readJson(options.shopPilotDay0ReadinessPath, 'current_release_control_index_shop_day0_missing'))
  const githubMainProtectionOwnerActionCard = options.githubMainProtectionOwnerActionCardPath
    ? validateGitHubMainProtectionOwnerActionCard(await readJson(options.githubMainProtectionOwnerActionCardPath, 'current_release_control_index_github_owner_action_card_missing'))
    : null
  const shopPilotDay0OwnerBaselineActionCard = validateShopPilotDay0OwnerBaselineActionCard(await readJson(options.shopPilotDay0OwnerBaselineActionCardPath, 'current_release_control_index_shop_day0_owner_baseline_card_missing'))
  const githubProposal = await readJson(GITHUB_PROPOSAL_PATH, 'current_release_control_index_github_proposal_missing')
  const supabaseProposal = await readJson(SUPABASE_PROPOSAL_PATH, 'current_release_control_index_supabase_proposal_missing')
  const releaseOwnerApprovalMarkdown = await readText(options.releaseOwnerApprovalPath, 'current_release_control_index_owner_approval_missing')
  const releaseOwnerApprovalVersion = ownerApprovalPacketVersionFromPath(options.releaseOwnerApprovalPath)
  const releaseOwnerApproval = validateReleaseOwnerApprovalMarkdown(releaseOwnerApprovalMarkdown, {
    handoff,
    githubProposal,
    githubProtectionSnapshot: githubMainProtectionSnapshot,
    githubProtectionSnapshotPath: snapshotPath,
    supabaseProposal,
    version: releaseOwnerApprovalVersion,
  })
  let staleOwnerApprovalPacketObserved = false
  let staleOwnerApprovalPacketFileName = null
  let staleOwnerApprovalRejection = null
  if (options.staleOwnerApprovalPath) {
    staleOwnerApprovalPacketFileName = basename(options.staleOwnerApprovalPath)
    try {
      const staleMarkdown = await readText(options.staleOwnerApprovalPath, 'current_release_control_index_stale_owner_approval_missing')
      const staleOwnerApprovalVersion = ownerApprovalPacketVersionFromPath(options.staleOwnerApprovalPath)
      validateReleaseOwnerApprovalMarkdown(staleMarkdown, {
        handoff,
        githubProposal,
        githubProtectionSnapshot: githubMainProtectionSnapshot,
        githubProtectionSnapshotPath: snapshotPath,
        supabaseProposal,
        version: staleOwnerApprovalVersion,
      })
      fail('current_release_control_index_stale_owner_approval_unexpectedly_current')
    } catch (error) {
      staleOwnerApprovalPacketObserved = true
      staleOwnerApprovalRejection = String(error?.message || 'stale_owner_approval_rejected').slice(0, 120)
    }
  }
  return {
    handoff,
    handoffFileDigest: digest(await readText(handoffPath, 'current_release_control_index_handoff_missing')),
    githubMainProtectionSnapshot,
    githubMainProtectionApplyPlan,
    reviewBranchPushPlan,
    pullRequestCreatePlan,
    operatorBoard,
    productReadinessMatrix,
    statusBrief,
    nextReleaseActionPreflight,
    releaseOwnerApproval,
    githubMainProtectionOwnerActionCard,
    shopPilotDay0Readiness,
    shopPilotDay0OwnerBaselineActionCard,
    staleOwnerApprovalPacketObserved,
    staleOwnerApprovalPacketFileName,
    staleOwnerApprovalRejection,
    paths: {
      handoff: handoffPath,
      githubMainProtectionSnapshot: snapshotPath,
      githubMainProtectionApplyPlan: options.githubMainProtectionApplyPlanPath,
      reviewBranchPushPlan: options.reviewBranchPushPlanPath,
      pullRequestCreatePlan: options.pullRequestCreatePlanPath,
      operatorBoard: options.operatorBoardPath,
      productReadinessMatrix: options.productReadinessMatrixPath,
      statusBrief: options.statusBriefPath,
      nextReleaseActionPreflight: options.nextReleaseActionPreflightPath,
      releaseOwnerApproval: options.releaseOwnerApprovalPath,
      ...(options.githubMainProtectionOwnerActionCardPath ? { githubMainProtectionOwnerActionCard: options.githubMainProtectionOwnerActionCardPath } : {}),
      shopPilotDay0Readiness: options.shopPilotDay0ReadinessPath,
      shopPilotDay0OwnerBaselineActionCard: options.shopPilotDay0OwnerBaselineActionCardPath,
    },
  }
}

export function sampleCurrentReleaseControlIndexInput(overrides = {}) {
  const commit = 'a'.repeat(40)
  const digestA = `sha256:${'1'.repeat(64)}`
  const digestB = `sha256:${'2'.repeat(64)}`
  const digestC = `sha256:${'3'.repeat(64)}`
  const controls = Object.fromEntries(FALSE_CONTROL_KEYS.map((key) => [key, false]))
  return {
    generatedAt: '2026-08-26T00:00:00.000Z',
    handoffFileDigest: digestA,
    handoff: {
      repository: 'swanhtet01/swanhtet01.github.io',
      candidate: { branch: 'codex/release-stack-integration-rehearsal-20260825', commit, clean: true },
      live: { identity: { commit: 'b'.repeat(40) }, canonicalPair: ['https://supermega.dev', 'https://app.supermega.dev'] },
      digest: digestB,
      authority: controls,
    },
    githubMainProtectionSnapshot: { digest: digestA, assessmentOk: false, currentAction: 'apply_github_main_protection_after_owner_approval', controls },
    githubMainProtectionApplyPlan: { digest: digestB, mode: 'plan_only_no_github_write', candidate: { head: commit }, controls },
    reviewBranchPushPlan: { digest: digestC, mode: 'plan_only_no_git_remote_write', candidate: { head: commit }, controls },
    pullRequestCreatePlan: { digest: digestA, mode: 'plan_only_no_github_write', candidate: { head: commit }, controls },
    operatorBoard: { digest: digestB, candidate: { commit, aheadOfMain: 1, aheadOfLive: 2 }, currentAction: { gateId: 'github_main_protection' }, controls },
    productReadinessMatrix: { digest: digestC, release: { currentGateId: 'github_main_protection' } },
    statusBrief: { digest: digestA, release: { currentGateId: 'github_main_protection' }, controls },
    nextReleaseActionPreflight: { digest: digestB, candidateCommit: commit, currentGateId: 'github_main_protection', controls },
    releaseOwnerApproval: { digest: digestC, candidate: { commit }, controls },
    githubMainProtectionOwnerActionCard: {
      digest: digestA,
      currentAction: {
        id: 'github_main_protection',
        status: 'owner_approval_or_token_required',
        candidateCommit: commit,
      },
      controls,
    },
    shopPilotDay0Readiness: {
      digest: digestA,
      status: 'blocked_owner_observed_baseline_required',
      day0ReadyForOwnerPrivateHandoff: false,
      candidate: { head: commit },
      ownerPrivateObservationBridge: {
        expectedCurrentGate: 'private_observation_incomplete',
        nextLocalAction: 'perform_real_observation_and_fill_private_evidence_anchor',
      },
      controls,
    },
    shopPilotDay0OwnerBaselineActionCard: {
      digest: digestB,
      status: 'owner_observed_baseline_action_required',
      candidate: { head: commit },
      action: { id: 'capture-owner-observed-baseline' },
      controls,
    },
    paths: {
      handoff: 'supermega.release-handoff.v99.generated-20260826.json',
      githubMainProtectionSnapshot: 'supermega.github-main-protection-snapshot.v99.generated-20260826.json',
      githubMainProtectionApplyPlan: 'supermega.github-main-protection-apply-plan.v99.generated-20260826.json',
      reviewBranchPushPlan: 'supermega.review-branch-push-plan.v99.generated-20260826.json',
      pullRequestCreatePlan: 'supermega.pull-request-create-plan.v99.generated-20260826.json',
      operatorBoard: 'supermega.current-operator-board.v99.generated-20260826.json',
      productReadinessMatrix: 'supermega.product-readiness-matrix.v99.generated-20260826.json',
      statusBrief: 'supermega.status-brief.v99.generated-20260826.json',
      nextReleaseActionPreflight: 'supermega.next-release-action-preflight.v99.generated-20260826.json',
      releaseOwnerApproval: 'supermega.release-owner-approval-packet.v99.generated-20260826.md',
      githubMainProtectionOwnerActionCard: 'supermega.github-main-protection-owner-action-card.v99.generated-20260826.json',
      shopPilotDay0Readiness: 'supermega.shop-pilot-day0-readiness.v99.generated-20260826.json',
      shopPilotDay0OwnerBaselineActionCard: 'supermega.shop-pilot-day0-owner-baseline-action-card.v99.generated-20260826.json',
    },
    ...overrides,
  }
}

export function runSelfTest() {
  const packet = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput())
  const markdown = renderCurrentReleaseControlIndexMarkdown(packet)
  const stalePacket = buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    staleOwnerApprovalPacketObserved: true,
    staleOwnerApprovalPacketFileName: 'supermega.release-owner-approval-packet.v100.generated-20260826.md',
    staleOwnerApprovalRejection: 'release_owner_approval_packet_stale',
  }))
  const mismatched = sampleCurrentReleaseControlIndexInput({
    releaseOwnerApproval: {
      ...sampleCurrentReleaseControlIndexInput().releaseOwnerApproval,
      candidate: { commit: 'c'.repeat(40) },
    },
  })
  const checks = {
    validates_current_index: validateCurrentReleaseControlIndex(packet) === packet,
    markdown_names_current_owner_packet: markdown.includes('supermega.release-owner-approval-packet.v99.generated-20260826.md'),
    markdown_names_current_owner_action_card: markdown.includes('supermega.github-main-protection-owner-action-card.v99.generated-20260826.json'),
    markdown_names_current_shop_day0_owner_card: markdown.includes('supermega.shop-pilot-day0-owner-baseline-action-card.v99.generated-20260826.json'),
    stale_owner_packet_recorded_without_authority: validateCurrentReleaseControlIndex(stalePacket) === stalePacket
      && stalePacket.stalePacketPolicy.staleOwnerApprovalPacketObserved === true
      && stalePacket.currentOwnerAction.sourcePacketFileName !== stalePacket.stalePacketPolicy.staleOwnerApprovalPacketFileName,
    mismatched_owner_packet_rejected: (() => {
      try {
        buildCurrentReleaseControlIndex(mismatched)
        return false
      } catch (error) {
        return String(error?.message || '').includes('owner_approval_candidate_mismatch')
      }
    })(),
    no_external_effects: Object.values(packet.controls).every((value) => value === false),
    no_secret_or_contact_shape: !hasSecretOrPrivateShape(packet) && !hasSecretOrPrivateShape(markdown),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ok: failedChecks.length === 0,
    contract: `${CURRENT_RELEASE_CONTROL_INDEX_CONTRACT}.self-test`,
    checks,
    failedChecks,
    externalWritesPerformed: false,
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
    githubMainProtectionSnapshotPath: null,
    githubMainProtectionApplyPlanPath: null,
    reviewBranchPushPlanPath: null,
    pullRequestCreatePlanPath: null,
    operatorBoardPath: null,
    productReadinessMatrixPath: null,
    statusBriefPath: null,
    nextReleaseActionPreflightPath: null,
    releaseOwnerApprovalPath: null,
    githubMainProtectionOwnerActionCardPath: null,
    shopPilotDay0ReadinessPath: null,
    shopPilotDay0OwnerBaselineActionCardPath: null,
    staleOwnerApprovalPath: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--verify') options.verifyPath = argv[++index] || null
    else if (arg === '--output') options.outputPath = argv[++index] || null
    else if (arg === '--markdown-output') options.markdownOutputPath = argv[++index] || null
    else if (arg === '--handoff') options.handoffPath = argv[++index] || null
    else if (arg === '--github-protection-snapshot') options.githubMainProtectionSnapshotPath = argv[++index] || null
    else if (arg === '--github-protection-apply-plan') options.githubMainProtectionApplyPlanPath = argv[++index] || null
    else if (arg === '--branch-push-plan') options.reviewBranchPushPlanPath = argv[++index] || null
    else if (arg === '--pull-request-plan') options.pullRequestCreatePlanPath = argv[++index] || null
    else if (arg === '--operator-board') options.operatorBoardPath = argv[++index] || null
    else if (arg === '--product-readiness-matrix') options.productReadinessMatrixPath = argv[++index] || null
    else if (arg === '--status-brief') options.statusBriefPath = argv[++index] || null
    else if (arg === '--next-release-action-preflight') options.nextReleaseActionPreflightPath = argv[++index] || null
    else if (arg === '--release-owner-approval') options.releaseOwnerApprovalPath = argv[++index] || null
    else if (arg === '--github-owner-action-card') options.githubMainProtectionOwnerActionCardPath = argv[++index] || null
    else if (arg === '--shop-day0-readiness') options.shopPilotDay0ReadinessPath = argv[++index] || null
    else if (arg === '--shop-day0-owner-baseline-card') options.shopPilotDay0OwnerBaselineActionCardPath = argv[++index] || null
    else if (arg === '--stale-owner-approval') options.staleOwnerApprovalPath = argv[++index] || null
    else fail(`current_release_control_index_usage_invalid:${arg}`)
  }
  return options
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
    const packet = validateCurrentReleaseControlIndex(await readJson(options.verifyPath, 'current_release_control_index_verify_file_missing'))
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      candidateCommit: packet.candidate.commit,
      currentGateId: packet.currentOwnerAction.gateId,
      ownerApprovalFileName: packet.currentOwnerAction.sourcePacketFileName,
      staleOwnerApprovalPacketObserved: packet.stalePacketPolicy.staleOwnerApprovalPacketObserved,
      digest: packet.digest,
      externalWritesPerformed: false,
    }, null, 2))
    return
  }
  const input = await collectInputs(options)
  const packet = validateCurrentReleaseControlIndex(buildCurrentReleaseControlIndex(input))
  const outputs = {}
  if (options.outputPath) outputs.output = await writeExclusive(options.outputPath, `${JSON.stringify(packet, null, 2)}\n`)
  if (options.markdownOutputPath) outputs.markdownOutput = await writeExclusive(options.markdownOutputPath, `${renderCurrentReleaseControlIndexMarkdown(packet)}\n`)
  console.log(JSON.stringify({
    ok: true,
    contract: packet.contract,
    candidateCommit: packet.candidate.commit,
    currentGateId: packet.currentOwnerAction.gateId,
    ownerApprovalFileName: packet.currentOwnerAction.sourcePacketFileName,
    staleOwnerApprovalPacketObserved: packet.stalePacketPolicy.staleOwnerApprovalPacketObserved,
    digest: packet.digest,
    ...outputs,
    externalWritesPerformed: false,
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: CURRENT_RELEASE_CONTROL_INDEX_CONTRACT,
      error: String(error?.message || 'current_release_control_index_failed').slice(0, 240),
      externalWritesPerformed: false,
    }))
    process.exitCode = 1
  })
}
