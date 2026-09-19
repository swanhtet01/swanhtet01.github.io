#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildCurrentReleaseControlIndex,
  sampleCurrentReleaseControlIndexInput,
  validateCurrentReleaseControlIndex,
} from './prepare_current_release_control_index.mjs'

export const ADMIN_TECHNICAL_COORDINATION_PACKET_CONTRACT = 'supermega.admin-technical-coordination-packet.v1'

const SHA_PATTERN = /^[a-f0-9]{40}$/
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const SECRET_OR_PRIVATE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
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
const REQUIRED_FALSE_CONTROLS = [
  'externalWritesPerformed',
  'gitRemoteWritesPerformed',
  'githubWritesPerformed',
  'workflowDispatchPerformed',
  'vercelDeploymentPerformed',
  'domainOrEnvironmentMutationPerformed',
  'supabaseMutationPerformed',
  'credentialChangePerformed',
  'customerContactPerformed',
  'paymentOrStockActionPerformed',
  'hostedWritePerformed',
  'managedActivationPerformed',
]

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function sha(value, code, { optional = false } = {}) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized && optional) return null
  if (!SHA_PATTERN.test(normalized)) fail(code)
  return normalized
}

function hasPrivateOrSecretShape(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {})
  return SECRET_OR_PRIVATE_PATTERNS.some((pattern) => pattern.test(text))
}

function safeString(value, code) {
  const normalized = String(value || '').trim()
  if (!normalized || hasPrivateOrSecretShape(normalized)) fail(code)
  return normalized
}

function safeFileName(value) {
  if (!value) return null
  const name = basename(String(value))
  if (!name || name.includes('\\') || name.includes('/') || hasPrivateOrSecretShape(name)) {
    fail('admin_technical_coordination_source_file_name_invalid')
  }
  return name
}

function assertNoPrivateOrSecretShape(value, code = 'admin_technical_coordination_private_or_secret_shape') {
  if (hasPrivateOrSecretShape(value)) fail(code)
}

function assertFalseControls(controls, code = 'admin_technical_coordination_controls_invalid') {
  if (!isRecord(controls)) fail(code)
  for (const key of REQUIRED_FALSE_CONTROLS) {
    if (controls[key] !== false) fail(`${code}:${key}`)
  }
  return true
}

function currentReviewActionKind(controlIndex) {
  const gateId = controlIndex.currentOwnerAction?.gateId
  if (gateId === 'review_branch_push') return 'review_branch_push'
  if (gateId === 'pull_request_creation') return 'pull_request_creation'
  if (gateId === 'github_main_protection') return 'github_main_protection'
  fail('admin_technical_coordination_gate_invalid')
}

function branchPushApprovalText({ commit, branch }) {
  return `I approve one normal fast-forward-only push of ${commit} to origin/${branch} for review only. I do not approve merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`
}

function sourceSummary(sourceFileNames = {}) {
  return {
    currentReleaseControlIndex: safeFileName(sourceFileNames.currentReleaseControlIndex),
    releaseOwnerApprovalPacket: safeFileName(sourceFileNames.releaseOwnerApprovalPacket),
    reviewBranchPushPlan: safeFileName(sourceFileNames.reviewBranchPushPlan),
    pullRequestCreatePlan: safeFileName(sourceFileNames.pullRequestCreatePlan),
    shopPilotOwnerObservationPack: safeFileName(sourceFileNames.shopPilotOwnerObservationPack),
  }
}

function nextGate(controlIndex, remoteReviewBranchCommit) {
  const candidateCommit = controlIndex.candidate.commit
  const branch = controlIndex.candidate.branch
  const actionKind = currentReviewActionKind(controlIndex)
  if (actionKind === 'review_branch_push') {
    if (remoteReviewBranchCommit === candidateCommit) {
      return {
        id: 'pull_request_creation_readiness_refresh',
        label: 'Refresh plans for review-only pull request creation',
        ownerApprovalRequiredBeforeExternalWrite: true,
        exactApprovalText: null,
      }
    }
    return {
      id: 'review_branch_push',
      label: 'Approve exact fast-forward-only review-branch push only',
      ownerApprovalRequiredBeforeExternalWrite: true,
      exactApprovalText: branchPushApprovalText({ commit: candidateCommit, branch }),
    }
  }
  if (actionKind === 'pull_request_creation') {
    return {
      id: 'pull_request_creation',
      label: 'Approve one review-only pull request creation only',
      ownerApprovalRequiredBeforeExternalWrite: true,
      exactApprovalText: null,
    }
  }
  return {
    id: 'github_main_protection',
    label: 'Approve GitHub main protection only',
    ownerApprovalRequiredBeforeExternalWrite: true,
    exactApprovalText: null,
  }
}

export function buildAdminTechnicalCoordinationPacket(input = {}) {
  const controlIndex = validateCurrentReleaseControlIndex(input.currentReleaseControlIndex)
  const candidateCommit = sha(controlIndex.candidate?.commit, 'admin_technical_coordination_candidate_invalid')
  const candidateBranch = safeString(controlIndex.candidate?.branch, 'admin_technical_coordination_branch_invalid')
  const remoteReviewBranchCommit = sha(input.remoteReviewBranchCommit, 'admin_technical_coordination_remote_review_branch_invalid', { optional: true })
  const remoteMainCommit = sha(input.remoteMainCommit, 'admin_technical_coordination_remote_main_invalid', { optional: true })
  const currentAction = controlIndex.currentOwnerAction
  if (currentAction.exactCommit !== candidateCommit) fail('admin_technical_coordination_owner_action_candidate_mismatch')
  if (currentAction.externalWriteRequiresOwnerApproval !== true) fail('admin_technical_coordination_owner_gate_invalid')
  if (currentAction.branchPushAllowedNow !== false
    || currentAction.pullRequestAllowedNow !== false
    || currentAction.deployAllowedNow !== false
    || currentAction.supabaseWriteAllowedNow !== false
    || currentAction.customerContactAllowedNow !== false
    || currentAction.paymentOrStockAllowedNow !== false
    || currentAction.managedActivationAllowedNow !== false) {
    fail('admin_technical_coordination_owner_action_controls_invalid')
  }

  const controls = Object.fromEntries(REQUIRED_FALSE_CONTROLS.map((key) => [key, false]))
  const body = {
    contract: ADMIN_TECHNICAL_COORDINATION_PACKET_CONTRACT,
    generatedAt: input.generatedAt || new Date().toISOString(),
    purpose: 'owner_safe_admin_rog_coordination_only',
    mode: 'read_only_no_external_authority',
    candidate: {
      branch: candidateBranch,
      commit: candidateCommit,
      clean: controlIndex.candidate.clean === true,
      aheadOfMain: controlIndex.candidate.aheadOfMain,
      aheadOfLive: controlIndex.candidate.aheadOfLive,
    },
    observedRemote: {
      reviewBranchCommit: remoteReviewBranchCommit,
      mainCommit: remoteMainCommit,
      reviewBranchEqualsCandidate: remoteReviewBranchCommit === candidateCommit,
    },
    currentOwnerAction: {
      gateId: currentAction.gateId,
      label: currentAction.label,
      sourcePacketFileName: currentAction.sourcePacketFileName,
      sourceActionCardFileName: currentAction.sourceActionCardFileName,
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
    nextGate: nextGate(controlIndex, remoteReviewBranchCommit),
    shopPilot: {
      day0Status: controlIndex.shopPilot?.day0Status,
      currentPrivateGate: controlIndex.shopPilot?.currentPrivateGate,
      nextLocalAction: controlIndex.shopPilot?.nextLocalAction,
      customerContactAllowed: false,
      managedActivationAllowed: false,
    },
    adminRogOperatingRules: {
      do: [
        'preserve_one_primary_task_and_zero_local_subagents_unless_owner_authorizes_bounded_worker',
        'preserve_one_supermega_dev_server_and_one_local_worker_when_present',
        'treat_current_artifact_family_as_authoritative_until_a_newer_control_index_is_verified',
        'summarize_only_owner_safe_counts_labels_booleans_digests_gates_and_next_actions',
        'keep_shop_identity_and_private_observation_evidence_out_of_git_ci_hq_and_public_reports',
      ],
      doNot: [
        'do_not_push_create_pr_merge_dispatch_workflow_deploy_or_promote',
        'do_not_edit_domains_environment_variables_supabase_or_credentials',
        'do_not_contact_customers_send_messages_take_payments_or_move_stock',
        'do_not_perform_hosted_writes_or_managed_activation',
        'do_not_treat_synthetic_local_tests_as_customer_pilot_acceptance',
        'do_not_generate_post_observation_shop_outputs_before_real_private_evidence',
      ],
    },
    sourceFiles: sourceSummary(input.sourceFileNames),
    controls,
  }
  body.digest = digest(JSON.stringify(body, null, 2))
  return validateAdminTechnicalCoordinationPacket(body)
}

export function validateAdminTechnicalCoordinationPacket(packet) {
  if (!isRecord(packet) || packet.contract !== ADMIN_TECHNICAL_COORDINATION_PACKET_CONTRACT) {
    fail('admin_technical_coordination_contract_invalid')
  }
  sha(packet.candidate?.commit, 'admin_technical_coordination_candidate_invalid')
  safeString(packet.candidate?.branch, 'admin_technical_coordination_branch_invalid')
  sha(packet.observedRemote?.reviewBranchCommit, 'admin_technical_coordination_remote_review_branch_invalid', { optional: true })
  sha(packet.observedRemote?.mainCommit, 'admin_technical_coordination_remote_main_invalid', { optional: true })
  if (packet.currentOwnerAction?.exactCommit !== packet.candidate.commit) {
    fail('admin_technical_coordination_current_action_candidate_mismatch')
  }
  if (packet.currentOwnerAction?.externalWriteRequiresOwnerApproval !== true) {
    fail('admin_technical_coordination_owner_approval_required')
  }
  if (packet.currentOwnerAction?.branchPushAllowedNow !== false
    || packet.currentOwnerAction?.pullRequestAllowedNow !== false
    || packet.currentOwnerAction?.deployAllowedNow !== false
    || packet.currentOwnerAction?.supabaseWriteAllowedNow !== false
    || packet.currentOwnerAction?.customerContactAllowedNow !== false
    || packet.currentOwnerAction?.paymentOrStockAllowedNow !== false
    || packet.currentOwnerAction?.managedActivationAllowedNow !== false) {
    fail('admin_technical_coordination_current_action_controls_invalid')
  }
  if (packet.shopPilot?.customerContactAllowed !== false || packet.shopPilot?.managedActivationAllowed !== false) {
    fail('admin_technical_coordination_shop_controls_invalid')
  }
  if (packet.nextGate?.ownerApprovalRequiredBeforeExternalWrite !== true) {
    fail('admin_technical_coordination_next_gate_invalid')
  }
  assertFalseControls(packet.controls)
  for (const value of Object.values(packet.sourceFiles || {})) {
    if (value !== null && value !== undefined) safeFileName(value)
  }
  if (!DIGEST_PATTERN.test(String(packet.digest || ''))) fail('admin_technical_coordination_digest_invalid')
  const withoutDigest = { ...packet }
  delete withoutDigest.digest
  if (packet.digest !== digest(JSON.stringify(withoutDigest, null, 2))) {
    fail('admin_technical_coordination_digest_mismatch')
  }
  assertNoPrivateOrSecretShape(packet)
  return packet
}

export function renderAdminTechnicalCoordinationMarkdown(packet) {
  const verified = validateAdminTechnicalCoordinationPacket(packet)
  const sourceFiles = Object.values(verified.sourceFiles || {}).filter(Boolean)
  const remoteReview = verified.observedRemote.reviewBranchCommit || 'not_observed'
  const remoteMain = verified.observedRemote.mainCommit || 'not_observed'
  const exactApproval = verified.nextGate.exactApprovalText
    ? [
        '',
        'Exact owner approval text for the next push gate:',
        '',
        '```text',
        verified.nextGate.exactApprovalText,
        '```',
      ]
    : []
  const markdown = [
    '# SuperMega Admin/ROG Technical Coordination Packet',
    '',
    `Generated: ${verified.generatedAt}`,
    '',
    'Purpose: owner-safe coordination for the Admin/ROG Ally task. This packet is read-only guidance and performs no external action.',
    '',
    '## Current technical state',
    '',
    `- Candidate branch: \`${verified.candidate.branch}\``,
    `- Candidate commit: \`${verified.candidate.commit}\``,
    `- Remote review branch commit: \`${remoteReview}\``,
    `- Remote main commit: \`${remoteMain}\``,
    `- Remote review branch equals candidate: \`${verified.observedRemote.reviewBranchEqualsCandidate}\``,
    `- Current owner gate: \`${verified.currentOwnerAction.gateId}\``,
    `- Current owner action: ${verified.currentOwnerAction.label}`,
    '',
    '## Authoritative source files',
    '',
    ...sourceFiles.map((fileName) => `- \`${fileName}\``),
    '',
    '## Admin/ROG operating rules',
    '',
    'Do:',
    '',
    ...verified.adminRogOperatingRules.do.map((item) => `- \`${item}\``),
    '',
    'Do not:',
    '',
    ...verified.adminRogOperatingRules.doNot.map((item) => `- \`${item}\``),
    '',
    '## Next gate',
    '',
    `- Gate: \`${verified.nextGate.id}\``,
    `- Label: ${verified.nextGate.label}`,
    '- External write requires separate owner approval: `true`',
    ...exactApproval,
    '',
    '## Shop pilot gate',
    '',
    `- Day-zero status: \`${verified.shopPilot.day0Status}\``,
    `- Private gate: \`${verified.shopPilot.currentPrivateGate}\``,
    `- Next local action: \`${verified.shopPilot.nextLocalAction}\``,
    '- Customer contact allowed: `false`',
    '- Managed activation allowed: `false`',
    '',
    '## Controls',
    '',
    ...REQUIRED_FALSE_CONTROLS.map((key) => `- ${key}: \`false\``),
    '',
    `Digest: \`${verified.digest}\``,
  ].join('\n')
  assertNoPrivateOrSecretShape(markdown)
  return markdown
}

function sampleReviewBranchControlIndex() {
  const base = sampleCurrentReleaseControlIndexInput()
  const paths = { ...base.paths }
  delete paths.githubMainProtectionOwnerActionCard
  return buildCurrentReleaseControlIndex(sampleCurrentReleaseControlIndexInput({
    githubMainProtectionSnapshot: {
      ...base.githubMainProtectionSnapshot,
      assessmentOk: true,
      currentAction: 'main_protection_verified_continue_to_review_branch_push',
    },
    reviewBranchPushPlan: {
      ...base.reviewBranchPushPlan,
      possibleWrite: { kind: 'fast_forward_branch_push' },
    },
    operatorBoard: {
      ...base.operatorBoard,
      currentAction: { gateId: 'review_branch_push' },
    },
    productReadinessMatrix: {
      ...base.productReadinessMatrix,
      release: { currentGateId: 'review_branch_push' },
    },
    statusBrief: {
      ...base.statusBrief,
      release: { currentGateId: 'review_branch_push' },
    },
    nextReleaseActionPreflight: {
      ...base.nextReleaseActionPreflight,
      currentGateId: 'review_branch_push',
    },
    githubMainProtectionOwnerActionCard: null,
    paths,
  }))
}

export function runSelfTest() {
  const controlIndex = sampleReviewBranchControlIndex()
  const packet = buildAdminTechnicalCoordinationPacket({
    generatedAt: '2026-08-26T00:00:00.000Z',
    currentReleaseControlIndex: controlIndex,
    remoteReviewBranchCommit: '2'.repeat(40),
    remoteMainCommit: '3'.repeat(40),
    sourceFileNames: {
      currentReleaseControlIndex: 'supermega.current-release-control-index.v99.generated-20260826.json',
      releaseOwnerApprovalPacket: 'supermega.release-owner-approval-packet.v99.generated-20260826.md',
      reviewBranchPushPlan: 'supermega.review-branch-push-plan.v99.generated-20260826.json',
      pullRequestCreatePlan: 'supermega.pull-request-create-plan.v99.generated-20260826.json',
      shopPilotOwnerObservationPack: 'supermega.shop-pilot-owner-observation-pack.v99.current-control.generated-20260826.md',
    },
  })
  const markdown = renderAdminTechnicalCoordinationMarkdown(packet)
  const equalRemotePacket = buildAdminTechnicalCoordinationPacket({
    generatedAt: '2026-08-26T00:00:00.000Z',
    currentReleaseControlIndex: controlIndex,
    remoteReviewBranchCommit: controlIndex.candidate.commit,
  })
  let unsafeRejected = false
  try {
    validateAdminTechnicalCoordinationPacket({
      ...packet,
      currentOwnerAction: {
        ...packet.currentOwnerAction,
        branchPushAllowedNow: true,
      },
    })
  } catch (error) {
    unsafeRejected = String(error?.message || '').includes('current_action_controls_invalid')
  }
  return {
    ok: validateAdminTechnicalCoordinationPacket(packet) === packet
      && markdown.includes('Exact owner approval text for the next push gate')
      && markdown.includes(controlIndex.candidate.commit)
      && equalRemotePacket.nextGate.id === 'pull_request_creation_readiness_refresh'
      && !hasPrivateOrSecretShape(markdown)
      && unsafeRejected,
    contract: `${ADMIN_TECHNICAL_COORDINATION_PACKET_CONTRACT}.self-test`,
    checks: {
      packet_valid: true,
      push_gate_text_present: markdown.includes('fast-forward-only push'),
      equal_remote_advances_to_pr_refresh: equalRemotePacket.nextGate.id === 'pull_request_creation_readiness_refresh',
      markdown_safe: !hasPrivateOrSecretShape(markdown),
      unsafe_control_drift_rejected: unsafeRejected,
    },
    externalWritesPerformed: false,
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path || ''), 'utf8'))
}

async function writeOutput(path, content) {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
}

function parseArgs(argv) {
  const options = {
    selfTest: false,
    verify: null,
    controlIndexPath: null,
    remoteReviewBranchCommit: null,
    remoteMainCommit: null,
    output: null,
    markdownOutput: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--verify') options.verify = argv[++index] || null
    else if (arg === '--control-index') options.controlIndexPath = argv[++index] || null
    else if (arg === '--remote-review-branch-commit') options.remoteReviewBranchCommit = argv[++index] || null
    else if (arg === '--remote-main-commit') options.remoteMainCommit = argv[++index] || null
    else if (arg === '--output') options.output = argv[++index] || null
    else if (arg === '--markdown-output') options.markdownOutput = argv[++index] || null
    else fail(`admin_technical_coordination_usage_invalid:${arg}`)
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
  if (options.verify) {
    const packet = validateAdminTechnicalCoordinationPacket(await readJson(options.verify))
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      candidateCommit: packet.candidate.commit,
      nextGateId: packet.nextGate.id,
      digest: packet.digest,
      externalWritesPerformed: false,
    }))
    return
  }
  if (!options.controlIndexPath) fail('admin_technical_coordination_control_index_required')
  const packet = buildAdminTechnicalCoordinationPacket({
    currentReleaseControlIndex: await readJson(options.controlIndexPath),
    remoteReviewBranchCommit: options.remoteReviewBranchCommit,
    remoteMainCommit: options.remoteMainCommit,
    sourceFileNames: {
      currentReleaseControlIndex: options.controlIndexPath,
    },
  })
  if (options.output) await writeOutput(options.output, `${JSON.stringify(packet, null, 2)}\n`)
  if (options.markdownOutput) await writeOutput(options.markdownOutput, `${renderAdminTechnicalCoordinationMarkdown(packet)}\n`)
  if (!options.output && !options.markdownOutput) {
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      candidateCommit: packet.candidate.commit,
      nextGateId: packet.nextGate.id,
      digest: packet.digest,
      externalWritesPerformed: false,
    }, null, 2))
  } else {
    console.log(JSON.stringify({
      ok: true,
      contract: packet.contract,
      output: options.output ? resolve(options.output) : null,
      markdownOutput: options.markdownOutput ? resolve(options.markdownOutput) : null,
      digest: packet.digest,
      externalWritesPerformed: false,
    }))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: ADMIN_TECHNICAL_COORDINATION_PACKET_CONTRACT,
      error: String(error?.message || 'admin_technical_coordination_failed').slice(0, 260),
      externalWritesPerformed: false,
    }))
    process.exitCode = 1
  })
}
