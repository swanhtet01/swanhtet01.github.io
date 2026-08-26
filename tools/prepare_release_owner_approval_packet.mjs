#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildGitHubMainProtectionPacket,
  validateGitHubMainProtectionPacket,
} from './prepare_github_main_protection_packet.mjs'
import {
  buildGitHubMainProtectionSnapshot,
  validateGitHubMainProtectionSnapshot,
} from './collect_github_main_protection_snapshot.mjs'
import {
  buildReleaseHandoff,
  validateReleaseHandoffPacket,
} from './prepare_release_handoff.mjs'

export const RELEASE_OWNER_APPROVAL_PACKET_CONTRACT = 'supermega.release-handoff-owner-approval.v1'

const root = resolve(import.meta.dirname, '..')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const MAX_FILE_BYTES = 1_000_000
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const PACKET_VERSION_PATTERN = /^v[0-9]{1,3}$/
const GITHUB_PROPOSAL_PATH = resolve(root, 'hq', 'readiness', 'github-main-protection-proposal.json')
const SUPABASE_PROPOSAL_PATH = resolve(root, 'hq', 'readiness', 'supabase-preview-rehearsal-proposal.json')

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /sbp_[A-Za-z0-9_]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]

function fail(code) {
  throw new Error(code)
}

function normalize(value) {
  return String(value || '').replace(/\r\n?/g, '\n')
}

function sha256(value) {
  return createHash('sha256').update(normalize(value)).digest('hex')
}

function digest(value) {
  return `sha256:${sha256(value)}`
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasSecretShape(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  return SECRET_PATTERNS.some((pattern) => pattern.test(text))
}

function exactSha(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) fail(code)
  return normalized
}

function packetVersion(value) {
  const normalized = String(value || 'v1').trim().toLowerCase()
  if (!PACKET_VERSION_PATTERN.test(normalized)) fail('release_owner_approval_packet_version_invalid')
  return normalized
}

function inferPacketVersionFromPath(path) {
  const match = /release-(?:handoff|owner-approval-packet)\.(v[0-9]{1,3})\./i.exec(String(path || ''))
  return match ? packetVersion(match[1]) : null
}

function inferPacketVersionFromMarkdown(markdown) {
  const match = /^# SuperMega Release Handoff Owner Approval Packet (v[0-9]{1,3})$/im.exec(normalize(markdown))
  return match ? packetVersion(match[1]) : null
}

function inferHandoffVersion({ handoff, handoffVersion } = {}) {
  if (handoffVersion) return packetVersion(handoffVersion)
  return inferPacketVersionFromPath(handoff?.__sourcePath)
}

function resolvePacketVersion({ explicitVersion = null, path = null, markdown = null, handoff = null } = {}) {
  return explicitVersion
    ? packetVersion(explicitVersion)
    : inferPacketVersionFromPath(path)
      || inferPacketVersionFromMarkdown(markdown)
      || inferHandoffVersion({ handoff })
      || packetVersion('v1')
}

function falseOnly(record, keys, prefix) {
  if (!isRecord(record)) fail(`${prefix}_controls_invalid`)
  for (const key of keys) {
    if (record[key] !== false) fail(`${prefix}_controls_invalid:${key}`)
  }
  return true
}

function validateReleaseHandoffForApproval(packet) {
  const sourcePath = packet?.__sourcePath
  const handoff = validateReleaseHandoffPacket(packet)
  if (sourcePath) {
    Object.defineProperty(handoff, '__sourcePath', {
      value: sourcePath,
      enumerable: false,
    })
  }
  const commit = exactSha(handoff.candidate?.commit, 'release_owner_approval_handoff_commit_invalid')
  const branch = String(handoff.candidate?.branch || '')
  if (handoff.contract !== 'supermega.release-handoff.v2') fail('release_owner_approval_handoff_contract_invalid')
  if (handoff.repository !== REPOSITORY || handoff.mode !== 'owner_review_only') fail('release_owner_approval_handoff_repository_invalid')
  if (handoff.candidate?.clean !== true) fail('release_owner_approval_handoff_candidate_dirty')
  if (handoff.nextAction?.branch !== branch || handoff.nextAction?.exactCommit !== commit) fail('release_owner_approval_next_action_invalid')
  if (handoff.nextAction?.forcePushAllowed !== false
    || handoff.nextAction?.mergeIncluded !== false
    || handoff.nextAction?.deploymentIncluded !== false) {
    fail('release_owner_approval_next_action_controls_invalid')
  }
  const branchPushAction = handoff.actions?.reviewBranchPush
  if (!branchPushAction
    || branchPushAction.branch !== branch
    || branchPushAction.exactCommit !== commit
    || branchPushAction.forcePushAllowed !== false
    || branchPushAction.mergeIncluded !== false
    || branchPushAction.deploymentIncluded !== false
    || !String(branchPushAction.approvalTemplate || '').includes(`push of ${commit} to origin/${branch} for review only`)) {
    fail('release_owner_approval_branch_template_invalid')
  }
  falseOnly(handoff.authority, [
    'pushApproved',
    'mergeApproved',
    'workflowDispatchApproved',
    'deploymentApproved',
    'domainChangeApproved',
    'providerMutationApproved',
    'remoteWritesPerformed',
    'providerWritesPerformed',
    'credentialValuesInspected',
  ], 'release_owner_approval_handoff')
  return handoff
}

function validateSupabasePreviewProposalForApproval(packet) {
  if (!isRecord(packet)) fail('release_owner_approval_supabase_packet_invalid')
  if (packet.contract !== 'supermega.supabase-preview-rehearsal-proposal.v1') fail('release_owner_approval_supabase_contract_invalid')
  if (packet.repository !== REPOSITORY || packet.mode !== 'owner_approval_required' || packet.state !== 'prepared-not-executed') {
    fail('release_owner_approval_supabase_state_invalid')
  }
  if (packet.previewBranch?.kind !== 'clean_empty_ephemeral_preview'
    || packet.previewBranch?.maximumLifetimeHours !== 24
    || packet.previewBranch?.startsWithProductionData !== false
    || packet.previewBranch?.productionRefsAllowed !== false
    || packet.previewBranch?.privilegedRuntimeCredentialsAllowed !== false
    || packet.previewBranch?.deleteAfterEvidence !== true) {
    fail('release_owner_approval_supabase_preview_invalid')
  }
  const chainDigest = String(packet.migrationPlan?.chainDigest || '')
  if (!DIGEST_PATTERN.test(chainDigest) || packet.migrationPlan?.productionApplyAllowed !== false) {
    fail('release_owner_approval_supabase_migration_invalid')
  }
  falseOnly(packet.controls, [
    'supabaseBranchCreationApproved',
    'supabaseBranchCreated',
    'supabaseBranchDeleted',
    'providerMutationsPerformed',
    'productionProjectMutated',
    'productionDataCopied',
    'productionRowsRead',
    'privilegedRuntimeCredentialsIncluded',
    'managedActivationAllowed',
    'vercelDeploymentAllowed',
    'githubWritesAllowed',
    'customerContactAllowed',
    'paymentOrStockActionAllowed',
  ], 'release_owner_approval_supabase')
  const approvalTemplate = String(packet.ownerApprovalTemplate || '')
  if (!approvalTemplate.includes('I approve one Supabase preview rehearsal setup')
    || !approvalTemplate.includes(chainDigest)
    || !approvalTemplate.includes('I do not approve production refs, production data, production writes')) {
    fail('release_owner_approval_supabase_template_invalid')
  }
  if (hasSecretShape(packet)) fail('release_owner_approval_supabase_secret_shape_detected')
  return packet
}

function pullRequestApprovalTemplate(handoff) {
  return `I approve one GitHub pull request creation from ${handoff.candidate.branch} at ${handoff.candidate.commit} into main for SuperMega review only. I do not approve merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`
}

function approvalDigestSet({ handoff, githubProposal, supabaseProposal }) {
  return {
    githubMainProtection: {
      env: 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL',
      digest: digest(githubProposal.ownerApprovalTemplate),
    },
    reviewBranchPush: {
      env: 'SUPERMEGA_REVIEW_BRANCH_PUSH_APPROVAL',
      digest: digest(handoff.actions.reviewBranchPush.approvalTemplate),
    },
    pullRequestCreation: {
      env: 'SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL',
      digest: digest(pullRequestApprovalTemplate(handoff)),
    },
    supabasePreviewRehearsal: {
      env: null,
      digest: digest(supabaseProposal.ownerApprovalTemplate),
    },
  }
}

function validatedSnapshotReference(snapshotPath = null, snapshot = null) {
  if (!snapshotPath) return '<github-main-protection-snapshot.json>'
  const packet = validateGitHubMainProtectionSnapshot(snapshot)
  if (packet.repository !== REPOSITORY) fail('release_owner_approval_snapshot_repository_invalid')
  if (packet.controls?.githubWritesPerformed !== false
    || packet.controls?.repositorySettingsMutated !== false
    || packet.controls?.credentialValueExposed !== false) {
    fail('release_owner_approval_snapshot_controls_invalid')
  }
  const resolvedPath = resolve(snapshotPath)
  if (hasSecretShape(resolvedPath)) fail('release_owner_approval_snapshot_path_secret_shape_detected')
  return ownerSafePathReference(resolvedPath, 'github-main-protection-snapshot.json')
}

function validatedGitHubProposalReference(proposalPath = GITHUB_PROPOSAL_PATH, proposal = null) {
  const packet = validateGitHubMainProtectionPacket(proposal)
  if (packet.repository !== REPOSITORY) fail('release_owner_approval_github_proposal_repository_invalid')
  const resolvedPath = resolve(proposalPath || GITHUB_PROPOSAL_PATH)
  if (hasSecretShape(resolvedPath)) fail('release_owner_approval_github_proposal_path_secret_shape_detected')
  return ownerSafePathReference(resolvedPath, 'github-main-protection-proposal.json')
}

function ownerSafePathReference(path, fallbackName) {
  const resolvedPath = resolve(path || fallbackName || '')
  const relativePath = relative(root, resolvedPath)
  if (relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath)) {
    return relativePath.replace(/\\/g, '/')
  }
  return `<owner-artifact-dir>\\${basename(resolvedPath) || fallbackName}`
}

function handoffReference(handoff) {
  return handoff?.__sourcePath
    ? ownerSafePathReference(handoff.__sourcePath, 'release-handoff.json')
    : '<owner-artifact-dir>\\release-handoff.json'
}

function branchPushActionLabel(handoff) {
  return handoff?.actions?.reviewBranchPush?.kind === 'owner_review_fast_forward_branch_push'
    ? 'fast-forward-only review-branch push'
    : 'initial review-branch push'
}

function currentSafestNextStep({ handoff, githubProtectionSnapshot, commitLabel }) {
  const mainProtectionVerified = githubProtectionSnapshot?.assessmentOk === true
    || githubProtectionSnapshot?.assessment?.ok === true
  if (mainProtectionVerified && handoff?.remote?.candidateBranchState === 'exact') {
    return `GitHub main protection and the review branch are verified. Next approve one review-only pull request creation only. Only after that PR exists, required checks pass, conversations are resolved, and the owner separately approves merge should merge be considered.`
  }
  if (mainProtectionVerified) {
    return `GitHub main protection is verified. Next approve the exact ${branchPushActionLabel(handoff)} only. Only after the remote branch equals the exact ${commitLabel} should PR creation be considered.`
  }
  return `First approve and apply the GitHub main protection ruleset. Then approve the exact initial branch push. Only after the remote branch equals the exact ${commitLabel} should PR creation be considered.`
}

export function buildReleaseOwnerApprovalMarkdown({
  handoff,
  githubProposal,
  githubProposalPath = GITHUB_PROPOSAL_PATH,
  supabaseProposal,
  githubProtectionSnapshot = null,
  githubProtectionSnapshotPath = null,
  version = 'v1',
  handoffVersion = null,
} = {}) {
  const handoffPacket = validateReleaseHandoffForApproval(handoff)
  const githubPacket = validateGitHubMainProtectionPacket(githubProposal)
  const supabasePacket = validateSupabasePreviewProposalForApproval(supabaseProposal)
  const githubProposalReference = validatedGitHubProposalReference(githubProposalPath, githubPacket)
  const snapshotReference = validatedSnapshotReference(githubProtectionSnapshotPath, githubProtectionSnapshot)
  const handoffPathReference = handoffReference(handoffPacket)
  const normalizedVersion = packetVersion(version)
  const commitLabel = inferHandoffVersion({ handoff: handoffPacket, handoffVersion })
    ? `${inferHandoffVersion({ handoff: handoffPacket, handoffVersion })} commit`
    : 'candidate commit'
  const branchApproval = handoffPacket.actions.reviewBranchPush.approvalTemplate
  const prApproval = pullRequestApprovalTemplate(handoffPacket)
  const branchPushHeading = branchPushActionLabel(handoffPacket)
  const lines = [
    `# SuperMega Release Handoff Owner Approval Packet ${normalizedVersion}`,
    '',
    `Use these approvals one at a time only if you want the next external action to happen. This packet is current for candidate commit \`${handoffPacket.candidate.commit}\`.`,
    '',
    'No approval below grants merge, production release, deployment, Supabase production mutation, credential rotation, payment, customer contact, stock movement, domain changes, hosted writes, or managed activation unless that exact action is named.',
    '',
    'Run commands from the repository root. Replace `<owner-artifact-dir>` with the local folder that contains the named generated packet files; this packet intentionally avoids raw local paths.',
    '',
    '## 1. GitHub main protection ruleset',
    '',
    'Required env: `SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL`',
    '',
    'Exact approval text:',
    '',
    '```text',
    githubPacket.ownerApprovalTemplate,
    '```',
    '',
    'Review command, no-write:',
    '',
    '```powershell',
    `npm.cmd run github:main-protection:apply:plan -- --proposal "${githubProposalReference}" --expected-head "${handoffPacket.candidate.commit}"`,
    '```',
    '',
    'Execute command, only after approval and token are available:',
    '',
    '```powershell',
    `node tools/apply_github_main_protection.mjs --execute --proposal "${githubProposalReference}" --expected-head "${handoffPacket.candidate.commit}"`,
    '```',
    '',
    `## 2. ${branchPushHeading[0].toUpperCase()}${branchPushHeading.slice(1)}`,
    '',
    'Required env: `SUPERMEGA_REVIEW_BRANCH_PUSH_APPROVAL`',
    '',
    'Exact approval text:',
    '',
    '```text',
    branchApproval,
    '```',
    '',
    'Review command, no-write:',
    '',
    '```powershell',
    `npm.cmd run release:branch-push:apply -- --plan --handoff "${handoffPathReference}" --github-protection-snapshot "${snapshotReference}"`,
    '```',
    '',
    'Execute command, only after approval:',
    '',
    '```powershell',
    `npm.cmd run release:branch-push:apply -- --execute --handoff "${handoffPathReference}" --github-protection-snapshot "${snapshotReference}"`,
    '```',
    '',
    '## 3. Pull request creation',
    '',
    'Required env: `SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL`',
    '',
    'Safety behavior: execute rechecks open pull requests first. If an exact open PR already exists for this branch and commit, it returns a no-write existing-PR report instead of creating a duplicate. Mismatched or ambiguous open PRs fail closed.',
    '',
    'Exact approval text:',
    '',
    '```text',
    prApproval,
    '```',
    '',
    'Review command, no-write:',
    '',
    '```powershell',
    `npm.cmd run release:pull-request:create -- --plan --handoff "${handoffPathReference}" --github-protection-snapshot "${snapshotReference}"`,
    '```',
    '',
    'Execute command, only after branch push, approval, and token are available:',
    '',
    '```powershell',
    `npm.cmd run release:pull-request:create -- --execute --handoff "${handoffPathReference}" --github-protection-snapshot "${snapshotReference}"`,
    '```',
    '',
    '## 4. Supabase preview rehearsal',
    '',
    'This remains separate from GitHub release setup. It must use a clean, empty, non-production preview branch with maximum 24-hour lifetime and deletion after evidence.',
    '',
    'Current preview rehearsal approval text:',
    '',
    '```text',
    supabasePacket.ownerApprovalTemplate,
    '```',
    '',
    '## Current safest next step',
    '',
    currentSafestNextStep({ handoff: handoffPacket, githubProtectionSnapshot, commitLabel }),
  ]
  const markdown = `${lines.join('\n')}\n`
  if (hasSecretShape(markdown)) fail('release_owner_approval_packet_secret_shape_detected')
  return markdown
}

export function buildReleaseOwnerApprovalPacket(input = {}) {
  const markdown = buildReleaseOwnerApprovalMarkdown(input)
  const handoff = validateReleaseHandoffForApproval(input.handoff)
  const githubProposal = validateGitHubMainProtectionPacket(input.githubProposal)
  const supabaseProposal = validateSupabasePreviewProposalForApproval(input.supabaseProposal)
  return {
    contract: RELEASE_OWNER_APPROVAL_PACKET_CONTRACT,
    version: packetVersion(input.version),
    candidate: {
      branch: handoff.candidate.branch,
      commit: handoff.candidate.commit,
      clean: true,
    },
    approvals: approvalDigestSet({ handoff, githubProposal, supabaseProposal }),
    markdown,
    digest: digest(markdown),
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
    },
  }
}

export function validateReleaseOwnerApprovalMarkdown(actualMarkdown, input = {}) {
  const expected = buildReleaseOwnerApprovalPacket(input)
  const actual = normalize(actualMarkdown)
  if (actual !== normalize(expected.markdown)) fail('release_owner_approval_packet_stale')
  return {
    ok: true,
    contract: RELEASE_OWNER_APPROVAL_PACKET_CONTRACT,
    version: expected.version,
    candidate: expected.candidate,
    approvals: expected.approvals,
    digest: expected.digest,
    controls: expected.controls,
  }
}

async function readJson(path, code) {
  const absolute = resolve(path)
  const metadata = await lstat(absolute).catch(() => null)
  if (!metadata || !metadata.isFile() || metadata.size < 1 || metadata.size > MAX_FILE_BYTES) fail(code)
  const text = await readFile(absolute, 'utf8')
  if (hasSecretShape(text)) fail(`${code}_secret_shape_detected`)
  try {
    return JSON.parse(text)
  } catch {
    fail(`${code}_json_invalid`)
  }
}

async function readInputs({ handoffPath, githubProtectionSnapshotPath = null }) {
  const absoluteHandoffPath = resolve(handoffPath || '')
  const handoff = await readJson(absoluteHandoffPath, 'release_owner_approval_handoff_file_invalid')
  Object.defineProperty(handoff, '__sourcePath', {
    value: absoluteHandoffPath,
    enumerable: false,
  })
  const absoluteGitHubProtectionSnapshotPath = githubProtectionSnapshotPath
    ? resolve(githubProtectionSnapshotPath)
    : null
  return {
    handoff,
    githubProposal: await readJson(GITHUB_PROPOSAL_PATH, 'release_owner_approval_github_file_invalid'),
    githubProtectionSnapshot: absoluteGitHubProtectionSnapshotPath
      ? await readJson(absoluteGitHubProtectionSnapshotPath, 'release_owner_approval_snapshot_file_invalid')
      : null,
    githubProtectionSnapshotPath: absoluteGitHubProtectionSnapshotPath,
    supabaseProposal: await readJson(SUPABASE_PROPOSAL_PATH, 'release_owner_approval_supabase_file_invalid'),
  }
}

async function writePacket({ handoffPath, githubProtectionSnapshotPath, outputPath, version }) {
  const inputs = await readInputs({ handoffPath, githubProtectionSnapshotPath })
  const resolvedVersion = resolvePacketVersion({ explicitVersion: version, path: outputPath, handoff: inputs.handoff })
  const packet = buildReleaseOwnerApprovalPacket({ ...inputs, version: resolvedVersion })
  const absoluteOutput = resolve(outputPath || '')
  const existing = await readFile(absoluteOutput, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return null
    throw error
  })
  const payload = packet.markdown
  if (existing !== null) {
    if (normalize(existing) !== normalize(payload)) fail('release_owner_approval_packet_output_exists_different')
    return {
      ok: true,
      contract: RELEASE_OWNER_APPROVAL_PACKET_CONTRACT,
      mode: 'unchanged_existing',
      path: absoluteOutput,
      bytes: Buffer.byteLength(existing, 'utf8'),
      digest: digest(existing),
      candidate: packet.candidate,
      approvals: packet.approvals,
      controls: packet.controls,
    }
  }
  await mkdir(dirname(absoluteOutput), { recursive: true })
  const staged = resolve(dirname(absoluteOutput), `.release-owner-approval.${process.pid}.${Date.now()}.tmp`)
  await writeFile(staged, payload, { encoding: 'utf8', flag: 'wx' })
  await rename(staged, absoluteOutput)
  return {
    ok: true,
    contract: RELEASE_OWNER_APPROVAL_PACKET_CONTRACT,
    mode: 'written',
    path: absoluteOutput,
    bytes: Buffer.byteLength(payload, 'utf8'),
    digest: packet.digest,
    candidate: packet.candidate,
    approvals: packet.approvals,
    controls: packet.controls,
  }
}

async function verifyPacket({ handoffPath, githubProtectionSnapshotPath, verifyPath, version }) {
  const inputs = await readInputs({ handoffPath, githubProtectionSnapshotPath })
  const actual = await readFile(resolve(verifyPath || ''), 'utf8')
  const resolvedVersion = resolvePacketVersion({ explicitVersion: version, path: verifyPath, markdown: actual, handoff: inputs.handoff })
  const verified = validateReleaseOwnerApprovalMarkdown(actual, { ...inputs, version: resolvedVersion })
  return {
    ...verified,
    mode: 'verified',
    path: resolve(verifyPath || ''),
    bytes: Buffer.byteLength(actual, 'utf8'),
  }
}

function sampleWorkflowAuthority() {
  return {
    workflow: '.github/workflows/supermega-public-release.yml',
    productionEnvironment: 'production',
    sourceBranch: 'main',
    trigger: 'manual_exact_commit',
    ownerActor: 'swanhtet01',
    confirmation: 'DEPLOY SUPERMEGA PAIRED PRODUCTION',
    automaticPushDeployment: false,
    concurrency: 'supermega-coordinated-production',
    appProjectId: 'prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG',
    publicProjectId: 'prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR',
    rollbackRequired: true,
    workflowDigest: `sha256:${'1'.repeat(64)}`,
  }
}

function sampleHandoff() {
  const commit = 'a'.repeat(40)
  const remoteMain = 'b'.repeat(40)
  const liveCommit = 'c'.repeat(40)
  const packet = buildReleaseHandoff({
    generatedAt: '2026-08-25T00:00:00.000Z',
    repository: REPOSITORY,
    candidate: {
      branch: 'codex/release-stack-integration-rehearsal-20260825',
      commit,
      clean: true,
    },
    remote: {
      origin: `https://github.com/${REPOSITORY}.git`,
      mainCommit: remoteMain,
      candidateCommit: null,
    },
    live: {
      app: {
        commit: liveCommit,
        brandVersion: 'brand',
        contextVersion: 'context',
        catalogVersion: 'catalog',
      },
      public: {
        commit: liveCommit,
        brandVersion: 'brand',
        contextVersion: 'context',
        catalogVersion: 'catalog',
      },
    },
    relations: {
      mainIsAncestor: true,
      liveIsAncestor: true,
      candidateAheadOfMain: 3,
      candidateAheadOfLive: 5,
    },
    legacyReleaseBranch: {
      commit: null,
      legacyOnlyCommits: 0,
      candidateOnlyCommits: 0,
    },
    verification: {
      passed: true,
      verifiedCommit: commit,
      workflowAuthority: sampleWorkflowAuthority(),
    },
    githubMainProtection: buildGitHubMainProtectionSnapshot({
      generatedAt: '2026-08-25T00:00:00.000Z',
      branch: {
        name: 'main',
        protected: false,
        commit: { sha: remoteMain },
        protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
      },
      rulesets: [],
    }),
  })
  Object.defineProperty(packet, '__sourcePath', {
    value: 'C:\\Users\\thesw\\OneDrive - BDA\\supermega.release-handoff.sample.json',
    enumerable: false,
  })
  return packet
}

function sampleSupabaseProposal() {
  const chainDigest = `sha256:${'d'.repeat(64)}`
  return {
    contract: 'supermega.supabase-preview-rehearsal-proposal.v1',
    repository: REPOSITORY,
    mode: 'owner_approval_required',
    state: 'prepared-not-executed',
    previewBranch: {
      kind: 'clean_empty_ephemeral_preview',
      maximumLifetimeHours: 24,
      startsWithProductionData: false,
      productionRefsAllowed: false,
      privilegedRuntimeCredentialsAllowed: false,
      deleteAfterEvidence: true,
    },
    migrationPlan: {
      chainDigest,
      productionApplyAllowed: false,
    },
    controls: {
      supabaseBranchCreationApproved: false,
      supabaseBranchCreated: false,
      supabaseBranchDeleted: false,
      providerMutationsPerformed: false,
      productionProjectMutated: false,
      productionDataCopied: false,
      productionRowsRead: false,
      privilegedRuntimeCredentialsIncluded: false,
      managedActivationAllowed: false,
      vercelDeploymentAllowed: false,
      githubWritesAllowed: false,
      customerContactAllowed: false,
      paymentOrStockActionAllowed: false,
    },
    ownerApprovalTemplate: `I approve one Supabase preview rehearsal setup for ${REPOSITORY} using migration chain ${chainDigest} on a clean empty maximum-24-hour non-production preview branch only, with deletion after evidence. I do not approve production refs, production data, production writes, managed activation, credential change, Vercel deploy, GitHub push or PR or merge, customer contact, payment, stock, domain, hosted-write, or scheduler activation.`,
  }
}

export function selfTestInput() {
  const remoteMain = 'b'.repeat(40)
  return {
    handoff: sampleHandoff(),
    githubProposal: buildGitHubMainProtectionPacket({
      sourceReceipts: [
        'package.json',
        'tools/verify_github_main_protection.mjs',
        'tools/prepare_github_main_protection_packet.mjs',
        'tools/apply_github_main_protection.mjs',
      ].map((path) => ({ path, digest: `sha256:${'0'.repeat(64)}` })),
    }),
    githubProtectionSnapshot: buildGitHubMainProtectionSnapshot({
      generatedAt: '2026-08-25T00:00:00.000Z',
      branch: {
        name: 'main',
        protected: false,
        commit: { sha: remoteMain },
        protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
      },
      rulesets: [],
    }),
    supabaseProposal: sampleSupabaseProposal(),
    version: 'v0',
  }
}

function runSelfTest() {
  const input = selfTestInput()
  const packet = buildReleaseOwnerApprovalPacket(input)
  const verified = validateReleaseOwnerApprovalMarkdown(packet.markdown, input)
  const tamperedCommit = packet.markdown.replace(input.handoff.candidate.commit, 'e'.repeat(40))
  const checks = {
    packet_contract_valid: packet.contract === RELEASE_OWNER_APPROVAL_PACKET_CONTRACT,
    exact_commit_bound: packet.markdown.includes(input.handoff.candidate.commit),
    github_owner_env_present: packet.markdown.includes('SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL'),
    branch_owner_env_present: packet.markdown.includes('SUPERMEGA_REVIEW_BRANCH_PUSH_APPROVAL'),
    pr_owner_env_present: packet.markdown.includes('SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL'),
    verifier_accepts_exact_markdown: verified.ok === true && verified.digest === packet.digest,
    stale_markdown_rejected: (() => {
      try {
        validateReleaseOwnerApprovalMarkdown(tamperedCommit, input)
        return false
      } catch (error) {
        return String(error?.message || '') === 'release_owner_approval_packet_stale'
      }
    })(),
    no_secret_shape: hasSecretShape(packet.markdown) === false,
    no_external_effects: Object.values(packet.controls).every((value) => value === false),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ok: failedChecks.length === 0,
    contract: `${RELEASE_OWNER_APPROVAL_PACKET_CONTRACT}.self-test`,
    checks,
    failedChecks,
  }
}

function parseArgs(argv) {
  const options = {
    mode: 'prepare',
    handoffPath: null,
    outputPath: null,
    verifyPath: null,
    version: null,
  }
  const args = [...argv]
  while (args.length) {
    const arg = args.shift()
    if (arg === '--self-test') {
      options.mode = 'self-test'
    } else if (arg === '--handoff' && args[0]) {
      options.handoffPath = args.shift()
    } else if ((arg === '--github-protection-snapshot' || arg === '--main-protection-snapshot') && args[0]) {
      options.githubProtectionSnapshotPath = args.shift()
    } else if (arg === '--output' && args[0]) {
      options.outputPath = args.shift()
      options.mode = 'prepare'
    } else if (arg === '--verify' && args[0]) {
      options.verifyPath = args.shift()
      options.mode = 'verify'
    } else if (arg === '--packet-version' && args[0]) {
      options.version = args.shift()
    } else {
      fail('release_owner_approval_packet_usage_invalid')
    }
  }
  if (options.mode === 'self-test') return options
  if (!options.handoffPath) fail('release_owner_approval_handoff_required')
  if (options.mode === 'prepare' && !options.outputPath) fail('release_owner_approval_output_required')
  if (options.mode === 'verify' && !options.verifyPath) fail('release_owner_approval_verify_path_required')
  options.version = options.version ? packetVersion(options.version) : null
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = options.mode === 'self-test'
    ? runSelfTest()
    : options.mode === 'verify'
      ? await verifyPacket(options)
      : await writePacket(options)
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: RELEASE_OWNER_APPROVAL_PACKET_CONTRACT,
      error: String(error?.message || 'release_owner_approval_packet_failed').slice(0, 260),
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
      },
    }, null, 2))
    process.exitCode = 1
  })
}
