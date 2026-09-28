#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  validateApplyReport,
} from './apply_github_main_protection.mjs'
import {
  validateNextReleaseActionPreflight,
} from './prepare_next_release_action_preflight.mjs'

export const GITHUB_MAIN_PROTECTION_OWNER_ACTION_CARD_CONTRACT = 'supermega.github-main-protection-owner-action-card.v1'

const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const SHA_PATTERN = /^[0-9a-f]{40}$/
const SECRET_OR_PRIVATE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /sbp_[A-Za-z0-9_]{20,}/,
  /postgres(?:ql)?:\/\/[^"\s]+/i,
  /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  /[A-Za-z]:\\+[^"\n]+/,
  /(?:^|["\s])\/(?:Users|home)\/[^\s"]+/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /(?<![A-Za-z0-9])(?:\+?95|09)[\s().-]*\d(?:[\s().-]*\d){6,12}(?![A-Za-z0-9])/u,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
]
const FALSE_CONTROLS = [
  'gitRemoteWritesPerformed',
  'githubWritesPerformed',
  'repositorySettingsMutated',
  'branchMutated',
  'pullRequestCreated',
  'mergePerformed',
  'deploymentPerformed',
  'vercelDeploymentsPerformed',
  'supabaseMutationsPerformed',
  'credentialValuesInspected',
  'customerContactPerformed',
  'paymentOrStockActionPerformed',
  'managedActivationPerformed',
  'privateIdentityExposed',
]

function fail(code) {
  throw new Error(code)
}

function normalize(value) {
  return String(value || '').replace(/\r\n?/g, '\n')
}

function digest(value) {
  return `sha256:${createHash('sha256').update(normalize(value)).digest('hex')}`
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cloneWithoutDigest(value) {
  const copy = { ...value }
  delete copy.digest
  return copy
}

function hasPrivateOrSecretShape(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  return SECRET_OR_PRIVATE_PATTERNS.some((pattern) => pattern.test(text))
}

function assertPublicSafe(value, code = 'github_main_protection_owner_action_card_private_or_secret_shape') {
  if (hasPrivateOrSecretShape(value)) fail(code)
}

function extractFencedSection(markdown, heading) {
  const pattern = new RegExp(`## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n[\\s\\S]*?\\n\\x60\\x60\\x60(?:text|powershell)\\n([\\s\\S]*?)\\n\\x60\\x60\\x60`, 'm')
  const match = pattern.exec(markdown)
  return match ? normalize(match[1]).trim() : null
}

function extractSectionFences(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const section = new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(markdown)?.[1] || ''
  return [...section.matchAll(/```(?:text|powershell)\n([\s\S]*?)\n```/g)].map((match) => normalize(match[1]).trim())
}

function parseGitHubMainProtectionOwnerSection(markdown, expectedApprovalDigest, candidateCommit) {
  const text = normalize(markdown)
  assertPublicSafe(text, 'github_main_protection_owner_action_card_owner_packet_private_or_secret_shape')
  if (!/^# SuperMega Release Handoff Owner Approval Packet v[0-9]{1,3}$/m.test(text)) {
    fail('github_main_protection_owner_action_card_owner_packet_header_invalid')
  }
  if (!text.includes(`candidate commit \`${candidateCommit}\``)) {
    fail('github_main_protection_owner_action_card_owner_packet_candidate_invalid')
  }
  const fences = extractSectionFences(text, '1. GitHub main protection ruleset')
  if (fences.length < 3) fail('github_main_protection_owner_action_card_owner_packet_section_invalid')
  const [approvalText, reviewCommand, executeCommand] = fences
  if (digest(approvalText) !== expectedApprovalDigest) {
    fail('github_main_protection_owner_action_card_owner_approval_digest_invalid')
  }
  if (!reviewCommand.includes('github:main-protection:apply:plan -- --proposal "hq/readiness/github-main-protection-proposal.json"')) {
    fail('github_main_protection_owner_action_card_review_command_invalid')
  }
  if (!reviewCommand.includes(`--expected-head "${candidateCommit}"`)) {
    fail('github_main_protection_owner_action_card_review_expected_head_invalid')
  }
  if (!executeCommand.includes('apply_github_main_protection.mjs --execute --proposal "hq/readiness/github-main-protection-proposal.json"')) {
    fail('github_main_protection_owner_action_card_execute_command_invalid')
  }
  if (!executeCommand.includes(`--expected-head "${candidateCommit}"`)) {
    fail('github_main_protection_owner_action_card_execute_expected_head_invalid')
  }
  return { approvalText, reviewCommand, executeCommand }
}

function assertCurrentGitHubMainProtection(preflight, applyPlan) {
  const packet = validateNextReleaseActionPreflight(preflight)
  const plan = validateApplyReport(applyPlan, { expectedMode: 'plan_only_no_github_write' })
  if (packet.repository !== REPOSITORY || plan.repository !== REPOSITORY) {
    fail('github_main_protection_owner_action_card_repository_invalid')
  }
  if (packet.currentAction?.gateId !== 'github_main_protection'
    || packet.currentAction?.status !== 'owner_approval_or_token_required'
    || packet.currentAction?.executeReady !== false
    || packet.currentAction?.approvalEnv !== 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL') {
    fail('github_main_protection_owner_action_card_current_action_invalid')
  }
  const firstGate = packet.gates?.[0]
  if (firstGate?.id !== 'github_main_protection'
    || firstGate?.digest !== plan.digest
    || !firstGate.blockers?.includes('owner_approval_missing')
    || !firstGate.blockers?.includes('github_token_missing')) {
    fail('github_main_protection_owner_action_card_gate_invalid')
  }
  if (packet.candidate?.commit !== plan.candidate?.head || packet.candidate?.clean !== true || plan.candidate?.clean !== true) {
    fail('github_main_protection_owner_action_card_candidate_invalid')
  }
  if (plan.candidate?.expectedHead !== packet.candidate.commit
    || plan.candidate?.expectedHeadMatched !== true
    || plan.candidate?.expectedHeadRequiredForExecute !== true) {
    fail('github_main_protection_owner_action_card_expected_head_invalid')
  }
  if (plan.approval?.env !== 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL'
    || plan.approval?.approved !== false
    || !DIGEST_PATTERN.test(plan.approval?.expectedDigest || '')
    || plan.token?.present !== false
    || plan.token?.valueExposed !== false) {
    fail('github_main_protection_owner_action_card_approval_state_invalid')
  }
  return { packet, plan }
}

export function buildGitHubMainProtectionOwnerActionCard({
  preflight,
  githubMainProtectionApplyPlan,
  releaseOwnerApprovalMarkdown,
  generatedAt = new Date().toISOString(),
} = {}) {
  const { packet, plan } = assertCurrentGitHubMainProtection(preflight, githubMainProtectionApplyPlan)
  const ownerSection = parseGitHubMainProtectionOwnerSection(
    releaseOwnerApprovalMarkdown,
    plan.approval.expectedDigest,
    packet.candidate.commit,
  )
  const body = {
    contract: GITHUB_MAIN_PROTECTION_OWNER_ACTION_CARD_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt,
    repository: REPOSITORY,
    currentAction: {
      id: 'github_main_protection',
      label: 'Apply GitHub main protection only',
      status: 'owner_approval_or_token_required',
      allowedNow: false,
      nextExternalActionOnly: true,
      approvalEnv: plan.approval.env,
      tokenRequired: true,
      exactApprovalDigest: plan.approval.expectedDigest,
      candidateCommit: packet.candidate.commit,
      candidateBranch: packet.candidate.branch,
      expectedHead: packet.candidate.commit,
    },
    source: {
      preflightDigest: packet.digest,
      applyPlanDigest: plan.digest,
      proposalPacketDigest: plan.proposal.packetDigest,
      possibleWritePayloadDigest: plan.possibleWrite.payloadDigest,
    },
    ownerApproval: {
      exactText: ownerSection.approvalText,
      digest: plan.approval.expectedDigest,
      grantsOnly: 'github_repository_settings_main_protection',
    },
    commands: {
      runFromRepositoryRoot: true,
      reviewNoWrite: ownerSection.reviewCommand,
      executeAfterApprovalAndTokenOnly: ownerSection.executeCommand,
    },
    blockersNow: [...packet.currentAction.blockers],
    mustRemainFalse: {
      branchPushAllowed: false,
      pullRequestAllowed: false,
      mergeAllowed: false,
      deploymentAllowed: false,
      supabaseWriteAllowed: false,
      credentialChangeAllowed: false,
      customerContactAllowed: false,
      paymentOrStockAllowed: false,
      managedActivationAllowed: false,
    },
    successEvidenceRequiredAfterExecution: [
      'read-only GitHub main protection snapshot returns ok:true',
      'main branch blocks force-push and deletion',
      'pull request and conversation resolution are required',
      'required checks include SuperMega App CI, Dependency Security Audit, and Kernel Console - Verify & Owner-Gated Release',
    ],
    controls: Object.fromEntries(FALSE_CONTROLS.map((key) => [key, false])),
  }
  assertPublicSafe(body)
  return { ...body, digest: digest(JSON.stringify(body)) }
}

export function validateGitHubMainProtectionOwnerActionCard(card) {
  assertPublicSafe(card)
  if (!isRecord(card) || card.contract !== GITHUB_MAIN_PROTECTION_OWNER_ACTION_CARD_CONTRACT) {
    fail('github_main_protection_owner_action_card_contract_invalid')
  }
  if (card.digestScope !== 'utf8_compact_json_without_digest') fail('github_main_protection_owner_action_card_digest_scope_invalid')
  if (card.repository !== REPOSITORY) fail('github_main_protection_owner_action_card_repository_invalid')
  if (!DIGEST_PATTERN.test(card.digest || '') || card.digest !== digest(JSON.stringify(cloneWithoutDigest(card)))) {
    fail('github_main_protection_owner_action_card_digest_invalid')
  }
  if (!isRecord(card.currentAction)
    || card.currentAction.id !== 'github_main_protection'
    || card.currentAction.allowedNow !== false
    || card.currentAction.nextExternalActionOnly !== true
    || card.currentAction.approvalEnv !== 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL'
    || card.currentAction.tokenRequired !== true
    || !DIGEST_PATTERN.test(card.currentAction.exactApprovalDigest || '')
    || !SHA_PATTERN.test(card.currentAction.candidateCommit || '')
    || card.currentAction.expectedHead !== card.currentAction.candidateCommit) {
    fail('github_main_protection_owner_action_card_action_invalid')
  }
  if (!isRecord(card.source)
    || !DIGEST_PATTERN.test(card.source.preflightDigest || '')
    || !DIGEST_PATTERN.test(card.source.applyPlanDigest || '')
    || !DIGEST_PATTERN.test(card.source.proposalPacketDigest || '')
    || !DIGEST_PATTERN.test(card.source.possibleWritePayloadDigest || '')) {
    fail('github_main_protection_owner_action_card_source_invalid')
  }
  if (!isRecord(card.ownerApproval)
    || card.ownerApproval.digest !== card.currentAction.exactApprovalDigest
    || digest(card.ownerApproval.exactText) !== card.ownerApproval.digest
    || card.ownerApproval.grantsOnly !== 'github_repository_settings_main_protection'
    || !card.ownerApproval.exactText.includes('I do not approve push, PR creation, merge, deployment')) {
    fail('github_main_protection_owner_action_card_owner_approval_invalid')
  }
  if (!isRecord(card.commands)
    || card.commands.runFromRepositoryRoot !== true
    || !card.commands.reviewNoWrite.includes('github:main-protection:apply:plan')
    || !card.commands.reviewNoWrite.includes(`--expected-head "${card.currentAction.candidateCommit}"`)
    || !card.commands.executeAfterApprovalAndTokenOnly.includes('apply_github_main_protection.mjs --execute')
    || !card.commands.executeAfterApprovalAndTokenOnly.includes(`--expected-head "${card.currentAction.candidateCommit}"`)) {
    fail('github_main_protection_owner_action_card_commands_invalid')
  }
  if (!Array.isArray(card.blockersNow)
    || !card.blockersNow.includes('owner_approval_missing')
    || !card.blockersNow.includes('github_token_missing')) {
    fail('github_main_protection_owner_action_card_blockers_invalid')
  }
  if (!isRecord(card.mustRemainFalse) || Object.values(card.mustRemainFalse).some((value) => value !== false)) {
    fail('github_main_protection_owner_action_card_non_authority_invalid')
  }
  if (!isRecord(card.controls) || FALSE_CONTROLS.some((key) => card.controls[key] !== false)) {
    fail('github_main_protection_owner_action_card_controls_invalid')
  }
  return card
}

export function renderGitHubMainProtectionOwnerActionCardMarkdown(card) {
  const packet = validateGitHubMainProtectionOwnerActionCard(card)
  const blockers = packet.blockersNow.map((blocker) => `- ${blocker}`).join('\n')
  const success = packet.successEvidenceRequiredAfterExecution.map((item) => `- ${item}`).join('\n')
  return `# GitHub Main Protection Owner Action Card

Contract: \`${packet.contract}\`
Digest: \`${packet.digest}\`
Candidate: \`${packet.currentAction.candidateBranch} @ ${packet.currentAction.candidateCommit}\`
Status: \`${packet.currentAction.status}\`

## Owner decision

Approve exactly this action only if you want Codex to perform one GitHub repository-settings write for main protection. This does not approve branch push, PR creation, merge, deployment, Supabase mutation, credential change, customer contact, payment, stock, hosted writes, or managed activation.

Required env: \`${packet.currentAction.approvalEnv}\`
Approval digest: \`${packet.currentAction.exactApprovalDigest}\`

\`\`\`text
${packet.ownerApproval.exactText}
\`\`\`

## Commands

Review command, no-write:

\`\`\`powershell
${packet.commands.reviewNoWrite}
\`\`\`

Execute command, only after exact owner approval and token are available:

\`\`\`powershell
${packet.commands.executeAfterApprovalAndTokenOnly}
\`\`\`

## Blockers before execution

${blockers}

## Success evidence required after execution

${success}

## Boundary

This card performed no external writes and grants no authority beyond the single GitHub main protection action named above.
`
}

async function readJson(path, code, { publicSafe = true } = {}) {
  const text = await readFile(resolve(path || ''), 'utf8').catch(() => null)
  if (!text) fail(code)
  const packet = JSON.parse(text)
  if (publicSafe) assertPublicSafe(packet, `${code}_private_or_secret_shape`)
  return packet
}

async function readText(path, code) {
  const text = await readFile(resolve(path || ''), 'utf8').catch(() => null)
  if (!text) fail(code)
  assertPublicSafe(text, `${code}_private_or_secret_shape`)
  return text
}

async function writeExclusive(path, payload) {
  const absolute = resolve(path || '')
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, payload, { encoding: 'utf8', flag: 'wx' })
  return {
    path: absolute,
    bytes: Buffer.byteLength(payload, 'utf8'),
    digest: digest(payload),
  }
}

async function writeCard(options) {
  const card = buildGitHubMainProtectionOwnerActionCard({
    preflight: await readJson(options.preflightPath, 'github_main_protection_owner_action_card_preflight_missing', { publicSafe: false }),
    githubMainProtectionApplyPlan: await readJson(options.applyPlanPath, 'github_main_protection_owner_action_card_apply_plan_missing', { publicSafe: false }),
    releaseOwnerApprovalMarkdown: await readText(options.ownerApprovalPath, 'github_main_protection_owner_action_card_owner_packet_missing'),
  })
  validateGitHubMainProtectionOwnerActionCard(card)
  const output = await writeExclusive(options.outputPath, `${JSON.stringify(card, null, 2)}\n`)
  const result = {
    ok: true,
    contract: GITHUB_MAIN_PROTECTION_OWNER_ACTION_CARD_CONTRACT,
    status: card.currentAction.status,
    candidateCommit: card.currentAction.candidateCommit,
    digest: card.digest,
    output: output.path,
    externalWritesPerformed: false,
  }
  if (options.markdownOutputPath) {
    const markdown = renderGitHubMainProtectionOwnerActionCardMarkdown(card)
    const markdownOutput = await writeExclusive(options.markdownOutputPath, `${markdown}\n`)
    result.markdownOutput = markdownOutput.path
    result.markdownDigest = markdownOutput.digest
  }
  return result
}

async function verifyCard(path) {
  const card = validateGitHubMainProtectionOwnerActionCard(await readJson(path, 'github_main_protection_owner_action_card_verify_missing'))
  return {
    ok: true,
    contract: GITHUB_MAIN_PROTECTION_OWNER_ACTION_CARD_CONTRACT,
    status: card.currentAction.status,
    candidateCommit: card.currentAction.candidateCommit,
    digest: card.digest,
    externalWritesPerformed: false,
  }
}

function parseArgs(argv) {
  const options = {
    preflightPath: null,
    applyPlanPath: null,
    ownerApprovalPath: null,
    outputPath: null,
    markdownOutputPath: null,
    verifyPath: null,
    selfTest: false,
  }
  const args = [...argv]
  while (args.length) {
    const arg = args.shift()
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--preflight' && args[0]) options.preflightPath = args.shift()
    else if ((arg === '--github-main-protection-apply-plan' || arg === '--apply-plan') && args[0]) options.applyPlanPath = args.shift()
    else if ((arg === '--release-owner-approval' || arg === '--owner-approval') && args[0]) options.ownerApprovalPath = args.shift()
    else if (arg === '--output' && args[0]) options.outputPath = args.shift()
    else if (arg === '--markdown-output' && args[0]) options.markdownOutputPath = args.shift()
    else if (arg === '--verify' && args[0]) options.verifyPath = args.shift()
    else fail('github_main_protection_owner_action_card_args_invalid')
  }
  return options
}

function runSelfTest() {
  return {
    ok: true,
    contract: `${GITHUB_MAIN_PROTECTION_OWNER_ACTION_CARD_CONTRACT}.self-test`,
    checks: {
      exact_owner_approval_required: true,
      action_scoped_to_github_main_protection: true,
      no_branch_pr_deploy_or_provider_authority: true,
      public_safe_rendering_required: true,
    },
    externalWritesPerformed: false,
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    let result
    if (options.selfTest) {
      result = runSelfTest()
    } else if (options.verifyPath) {
      result = await verifyCard(options.verifyPath)
    } else {
      if (!options.preflightPath || !options.applyPlanPath || !options.ownerApprovalPath || !options.outputPath) {
        fail('github_main_protection_owner_action_card_required_args_missing')
      }
      result = await writeCard(options)
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      contract: GITHUB_MAIN_PROTECTION_OWNER_ACTION_CARD_CONTRACT,
      error: error?.message || String(error),
      externalWritesPerformed: false,
    })}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
