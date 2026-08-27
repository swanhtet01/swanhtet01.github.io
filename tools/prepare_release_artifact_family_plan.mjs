#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RELEASE_ARTIFACT_FAMILY_PLAN_CONTRACT = 'supermega.release-artifact-family-plan.v1'

const SHA_PATTERN = /^[0-9a-f]{40}$/u
const VERSION_PATTERN = /^v[0-9]{1,3}$/u
const DATE_PATTERN = /^[0-9]{8}$/u
const DEFAULT_REVIEW_BRANCH = 'codex/release-stack-integration-rehearsal-20260825'
const FALSE_CONTROL_KEYS = Object.freeze([
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
])

const FORBIDDEN_COMMAND_PATTERNS = Object.freeze([
  /\bgit\s+push\b/iu,
  /\bgh\s+workflow\s+run\b/iu,
  /\bgh\s+pr\s+merge\b/iu,
  /\bvercel\s+(?:deploy|promote|rollback|alias|domains?|env)\b/iu,
  /\bsupabase\s+(?:db|migration|branches?|secrets?|functions?|link|deploy)\b/iu,
  /\b(?:stripe|payment|stock)\b/iu,
  /\b(?:workflow\s+dispatch|managed\s+activation)\b/iu,
  /--execute\b/iu,
])

function fail(code) {
  throw new Error(code)
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function normalizeVersion(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!VERSION_PATTERN.test(normalized)) fail('release_artifact_family_plan_version_invalid')
  return normalized
}

function normalizeDate(value) {
  const normalized = String(value || '').trim()
  if (!DATE_PATTERN.test(normalized)) fail('release_artifact_family_plan_date_invalid')
  return normalized
}

function normalizeSha(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SHA_PATTERN.test(normalized)) fail(code)
  return normalized
}

function optionalSha(value, code) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  return normalizeSha(value, code)
}

function normalizePath(value, code) {
  const normalized = String(value || '').trim()
  if (!normalized || /[\u0000-\u001f\u007f]/u.test(normalized)) fail(code)
  return normalized
}

function falseControls() {
  return Object.fromEntries(FALSE_CONTROL_KEYS.map((key) => [key, false]))
}

function gitHead() {
  try {
    return normalizeSha(execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: resolve(fileURLToPath(new URL('..', import.meta.url))),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }), 'release_artifact_family_plan_candidate_head_invalid')
  } catch {
    fail('release_artifact_family_plan_candidate_head_unavailable')
  }
}

function artifactName(name, version, date, extension) {
  return `supermega.${name}.${version}.generated-${date}.${extension}`
}

function artifactPath(artifactsDir, name, version, date, extension) {
  return join(artifactsDir, artifactName(name, version, date, extension))
}

function artifactPaths(options) {
  const { artifactsDir, version, date } = options
  return {
    handoff: artifactPath(artifactsDir, 'release-handoff', version, date, 'json'),
    githubMainProtectionSnapshot: artifactPath(artifactsDir, 'github-main-protection-snapshot', version, date, 'json'),
    githubMainProtectionApplyPlan: artifactPath(artifactsDir, 'github-main-protection-apply-plan', version, date, 'json'),
    reviewBranchPushPlan: artifactPath(artifactsDir, 'review-branch-push-plan', version, date, 'json'),
    pullRequestCreatePlan: artifactPath(artifactsDir, 'pull-request-create-plan', version, date, 'json'),
    operatorBoardJson: artifactPath(artifactsDir, 'current-operator-board', version, date, 'json'),
    operatorBoardMarkdown: artifactPath(artifactsDir, 'current-operator-board', version, date, 'md'),
    shopPrivateIntakeJson: artifactPath(artifactsDir, 'shop-pilot-private-intake-packet', version, date, 'json'),
    shopPrivateIntakeMarkdown: artifactPath(artifactsDir, 'shop-pilot-private-intake-packet', version, date, 'md'),
    shopBaselineTemplate: artifactPath(artifactsDir, 'shop-pilot-baseline-input.template.private', version, date, 'json'),
    shopBaselineWorksheet: artifactPath(artifactsDir, 'shop-pilot-baseline-worksheet.private', version, date, 'md'),
    shopLaunchGateReport: artifactPath(artifactsDir, 'shop-pilot-launch-gate-report', version, date, 'json'),
    shopDay0ReadinessJson: artifactPath(artifactsDir, 'shop-pilot-day0-readiness', version, date, 'json'),
    shopDay0ReadinessMarkdown: artifactPath(artifactsDir, 'shop-pilot-day0-readiness', version, date, 'md'),
    shopDay0OwnerBaselineActionCardJson: artifactPath(artifactsDir, 'shop-pilot-day0-owner-baseline-action-card', version, date, 'json'),
    shopDay0OwnerBaselineActionCardMarkdown: artifactPath(artifactsDir, 'shop-pilot-day0-owner-baseline-action-card', version, date, 'md'),
    productReadinessMatrixJson: artifactPath(artifactsDir, 'product-readiness-matrix', version, date, 'json'),
    productReadinessMatrixMarkdown: artifactPath(artifactsDir, 'product-readiness-matrix', version, date, 'md'),
    statusBriefJson: artifactPath(artifactsDir, 'status-brief', version, date, 'json'),
    statusBriefMarkdown: artifactPath(artifactsDir, 'status-brief', version, date, 'md'),
    nextReleaseActionPreflightJson: artifactPath(artifactsDir, 'next-release-action-preflight', version, date, 'json'),
    nextReleaseActionPreflightMarkdown: artifactPath(artifactsDir, 'next-release-action-preflight', version, date, 'md'),
    releaseOwnerApprovalMarkdown: artifactPath(artifactsDir, 'release-owner-approval-packet', version, date, 'md'),
    controlIndexJson: artifactPath(artifactsDir, 'current-release-control-index', version, date, 'json'),
    controlIndexMarkdown: artifactPath(artifactsDir, 'current-release-control-index', version, date, 'md'),
    shopOwnerObservationPackJson: join(artifactsDir, `supermega.shop-pilot-owner-observation-pack.${version}.generated-${date}.current-control.json`),
    shopOwnerObservationPackMarkdown: join(artifactsDir, `supermega.shop-pilot-owner-observation-pack.${version}.generated-${date}.current-control.md`),
    adminTechnicalCoordinationJson: artifactPath(artifactsDir, 'admin-technical-v167-coordination-packet', version, date, 'json'),
    adminTechnicalCoordinationMarkdown: artifactPath(artifactsDir, 'admin-technical-v167-coordination-packet', version, date, 'md'),
  }
}

function command(id, purpose, args) {
  return {
    id,
    purpose,
    command: [...args],
    commandText: args.map((part) => String(part).includes(' ') ? JSON.stringify(String(part)) : String(part)).join(' '),
    externalWritesPerformed: false,
  }
}

function commandText(entry) {
  return Array.isArray(entry?.command) ? entry.command.join(' ') : String(entry?.commandText || '')
}

function includesToken(entry, token) {
  return Array.isArray(entry?.command) && entry.command.includes(token)
}

function tokenAfter(entry, token) {
  if (!Array.isArray(entry?.command)) return null
  const index = entry.command.indexOf(token)
  return index >= 0 ? entry.command[index + 1] : null
}

export function buildReleaseArtifactFamilyPlan(input = {}) {
  const version = normalizeVersion(input.version || 'v999')
  const date = normalizeDate(input.date || '20260827')
  const artifactsDir = normalizePath(input.artifactsDir || '.', 'release_artifact_family_plan_artifacts_dir_invalid')
  const candidateHead = normalizeSha(input.candidateHead || gitHead(), 'release_artifact_family_plan_candidate_head_invalid')
  const remoteReviewBranchCommit = optionalSha(input.remoteReviewBranchCommit, 'release_artifact_family_plan_remote_review_invalid')
  const remoteMainCommit = optionalSha(input.remoteMainCommit, 'release_artifact_family_plan_remote_main_invalid')
  const staleOwnerApprovalPath = input.staleOwnerApprovalPath
    ? normalizePath(input.staleOwnerApprovalPath, 'release_artifact_family_plan_stale_owner_approval_invalid')
    : null
  const paths = artifactPaths({ artifactsDir, version, date })
  const commands = [
    command('release_handoff', 'Generate the release handoff only after the serial app gate passes.', [
      'node', 'tools/prepare_release_handoff.mjs',
      '--output', paths.handoff,
    ]),
    command('github_main_protection_snapshot', 'Capture the current main protection snapshot before all dependent packets.', [
      'node', 'tools/collect_github_main_protection_snapshot.mjs',
      '--output', paths.githubMainProtectionSnapshot,
    ]),
    command('github_main_protection_apply_plan', 'Prepare a GitHub main protection plan only; do not execute it.', [
      'node', 'tools/apply_github_main_protection.mjs',
      '--plan',
      '--proposal', 'hq/readiness/github-main-protection-proposal.json',
      '--expected-head', candidateHead,
      '--output', paths.githubMainProtectionApplyPlan,
    ]),
    command('review_branch_push_plan', 'Prepare the exact owner-gated review-branch push plan only.', [
      'node', 'tools/apply_review_branch_push.mjs',
      '--plan',
      '--handoff', paths.handoff,
      '--github-protection-snapshot', paths.githubMainProtectionSnapshot,
      '--output', paths.reviewBranchPushPlan,
    ]),
    command('pull_request_create_plan', 'Prepare the exact owner-gated pull request creation plan only.', [
      'node', 'tools/apply_release_pull_request.mjs',
      '--plan',
      '--handoff', paths.handoff,
      '--github-protection-snapshot', paths.githubMainProtectionSnapshot,
      '--output', paths.pullRequestCreatePlan,
    ]),
    command('operator_board', 'Generate the operator board bound to the same protection snapshot.', [
      'node', 'tools/prepare_current_operator_board.mjs',
      '--handoff', paths.handoff,
      '--github-protection-snapshot', paths.githubMainProtectionSnapshot,
      '--output', paths.operatorBoardJson,
      '--markdown-output', paths.operatorBoardMarkdown,
    ]),
    command('shop_private_intake_json', 'Generate the public-safe private-intake packet for owner review.', [
      'node', 'tools/prepare_shop_pilot_private_intake_packet.mjs',
      '--output', paths.shopPrivateIntakeJson,
    ]),
    command('shop_private_intake_markdown', 'Generate the matching public-safe private-intake markdown.', [
      'node', 'tools/prepare_shop_pilot_private_intake_packet.mjs',
      '--output', paths.shopPrivateIntakeMarkdown,
      '--format', 'markdown',
    ]),
    command('shop_baseline_template_and_worksheet', 'Generate blank private baseline inputs for owner/operator observation.', [
      'node', 'tools/prepare_shop_pilot_baseline_packet.mjs',
      '--template', paths.shopBaselineTemplate,
      '--worksheet-output', paths.shopBaselineWorksheet,
    ]),
    command('shop_launch_gate_report', 'Verify the Shop launch gate from safe intake/baseline artifacts.', [
      'node', 'tools/verify_shop_pilot_launch_gate.mjs',
      '--intake-packet', paths.shopPrivateIntakeJson,
      '--output', paths.shopLaunchGateReport,
    ]),
    command('shop_day0_readiness', 'Generate Day 0 readiness from launch-gate evidence without reopening raw intake input.', [
      'node', 'tools/prepare_shop_pilot_day0_readiness_packet.mjs',
      '--launch-gate-report', paths.shopLaunchGateReport,
      '--baseline-template', paths.shopBaselineTemplate,
      '--baseline-worksheet', paths.shopBaselineWorksheet,
      '--release-handoff', paths.handoff,
      '--github-protection-snapshot', paths.githubMainProtectionSnapshot,
      '--output', paths.shopDay0ReadinessJson,
      '--markdown-output', paths.shopDay0ReadinessMarkdown,
    ]),
    command('shop_day0_owner_baseline_action_card', 'Generate the owner baseline action card for the private Day 0 observation.', [
      'node', 'tools/prepare_shop_pilot_day0_owner_baseline_action_card.mjs',
      '--day0-readiness', paths.shopDay0ReadinessJson,
      '--output', paths.shopDay0OwnerBaselineActionCardJson,
      '--markdown-output', paths.shopDay0OwnerBaselineActionCardMarkdown,
    ]),
    command('product_readiness_matrix', 'Generate the product matrix bound to the Day 0 Shop gate.', [
      'node', 'tools/prepare_product_readiness_matrix.mjs',
      '--handoff', paths.handoff,
      '--shop-day0-readiness', paths.shopDay0ReadinessJson,
      '--output', paths.productReadinessMatrixJson,
      '--markdown-output', paths.productReadinessMatrixMarkdown,
    ]),
    command('status_brief', 'Generate the owner-safe status brief from the current operator board.', [
      'node', 'tools/prepare_supermega_status_brief.mjs',
      '--operator-board', paths.operatorBoardJson,
      '--output', paths.statusBriefJson,
      '--markdown-output', paths.statusBriefMarkdown,
    ]),
    command('next_release_action_preflight', 'Generate the next owner action preflight from all release-gate plans.', [
      'node', 'tools/prepare_next_release_action_preflight.mjs',
      '--handoff', paths.handoff,
      '--github-protection-snapshot', paths.githubMainProtectionSnapshot,
      '--github-protection-apply-plan', paths.githubMainProtectionApplyPlan,
      '--branch-push-plan', paths.reviewBranchPushPlan,
      '--pull-request-plan', paths.pullRequestCreatePlan,
      '--operator-board', paths.operatorBoardJson,
      '--product-readiness-matrix', paths.productReadinessMatrixJson,
      '--output', paths.nextReleaseActionPreflightJson,
      '--markdown-output', paths.nextReleaseActionPreflightMarkdown,
    ]),
    command('release_owner_approval_packet', 'Generate the exact owner approval packet for the current gate.', [
      'node', 'tools/prepare_release_owner_approval_packet.mjs',
      '--handoff', paths.handoff,
      '--github-protection-snapshot', paths.githubMainProtectionSnapshot,
      '--packet-version', version,
      '--output', paths.releaseOwnerApprovalMarkdown,
    ]),
    command('current_release_control_index', 'Index the artifact family and omit the GitHub action card unless that is the current gate.', [
      'node', 'tools/prepare_current_release_control_index.mjs',
      '--handoff', paths.handoff,
      '--github-protection-snapshot', paths.githubMainProtectionSnapshot,
      '--github-protection-apply-plan', paths.githubMainProtectionApplyPlan,
      '--branch-push-plan', paths.reviewBranchPushPlan,
      '--pull-request-plan', paths.pullRequestCreatePlan,
      '--operator-board', paths.operatorBoardJson,
      '--product-readiness-matrix', paths.productReadinessMatrixJson,
      '--status-brief', paths.statusBriefJson,
      '--next-release-action-preflight', paths.nextReleaseActionPreflightJson,
      '--release-owner-approval', paths.releaseOwnerApprovalMarkdown,
      '--shop-day0-readiness', paths.shopDay0ReadinessJson,
      '--shop-day0-owner-baseline-card', paths.shopDay0OwnerBaselineActionCardJson,
      ...(staleOwnerApprovalPath ? ['--stale-owner-approval', staleOwnerApprovalPath] : []),
      '--output', paths.controlIndexJson,
      '--markdown-output', paths.controlIndexMarkdown,
    ]),
    command('shop_owner_observation_pack', 'Generate the current private Shop observation control packet.', [
      'node', 'tools/prepare_shop_pilot_owner_observation_pack.mjs',
      '--day0-readiness', paths.shopDay0ReadinessJson,
      '--owner-baseline-action-card', paths.shopDay0OwnerBaselineActionCardJson,
      '--current-release-control-index', paths.controlIndexJson,
      '--output', paths.shopOwnerObservationPackJson,
      '--markdown-output', paths.shopOwnerObservationPackMarkdown,
    ]),
    command('admin_technical_coordination_packet', 'Generate the admin/technical coordination packet from the current control index.', [
      'node', 'tools/prepare_admin_technical_coordination_packet.mjs',
      '--control-index', paths.controlIndexJson,
      ...(remoteReviewBranchCommit ? ['--remote-review-branch-commit', remoteReviewBranchCommit] : []),
      ...(remoteMainCommit ? ['--remote-main-commit', remoteMainCommit] : []),
      '--output', paths.adminTechnicalCoordinationJson,
      '--markdown-output', paths.adminTechnicalCoordinationMarkdown,
    ]),
    command('release_artifact_family_verify', 'Verify the full generated artifact family before owner approval is requested.', [
      'node', 'tools/verify_release_artifact_family.mjs',
      '--control-index', paths.controlIndexJson,
      '--artifacts-dir', artifactsDir,
    ]),
  ]
  const body = {
    contract: RELEASE_ARTIFACT_FAMILY_PLAN_CONTRACT,
    generatedAt: new Date().toISOString(),
    mode: 'plan_only_no_external_write',
    artifactFamily: { version, date, artifactsDir },
    candidate: {
      branch: input.branch || DEFAULT_REVIEW_BRANCH,
      head: candidateHead,
    },
    remote: {
      reviewBranchCommit: remoteReviewBranchCommit,
      mainCommit: remoteMainCommit,
    },
    paths,
    commands,
    invariants: {
      operatorBoardUsesGitHubProtectionSnapshot: true,
      day0LaunchGateReportDoesNotReopenIntakePacket: true,
      controlIndexOmitsGitHubOwnerActionCardByDefault: true,
      commandsArePlanOrLocalArtifactPreparationOnly: true,
      ownerApprovalRequiredForExternalWrites: true,
    },
    controls: falseControls(),
  }
  body.digest = digest(JSON.stringify(body))
  return validateReleaseArtifactFamilyPlan(body)
}

export function validateReleaseArtifactFamilyPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) fail('release_artifact_family_plan_required')
  if (plan.contract !== RELEASE_ARTIFACT_FAMILY_PLAN_CONTRACT) fail('release_artifact_family_plan_contract_invalid')
  normalizeVersion(plan.artifactFamily?.version)
  normalizeDate(plan.artifactFamily?.date)
  normalizePath(plan.artifactFamily?.artifactsDir, 'release_artifact_family_plan_artifacts_dir_invalid')
  normalizeSha(plan.candidate?.head, 'release_artifact_family_plan_candidate_head_invalid')
  if (!plan.controls || FALSE_CONTROL_KEYS.some((key) => plan.controls[key] !== false)) {
    fail('release_artifact_family_plan_controls_invalid')
  }
  if (!Array.isArray(plan.commands) || plan.commands.length !== 20) {
    fail('release_artifact_family_plan_command_count_invalid')
  }
  const ids = plan.commands.map((entry) => String(entry?.id || ''))
  const expectedIds = [
    'release_handoff',
    'github_main_protection_snapshot',
    'github_main_protection_apply_plan',
    'review_branch_push_plan',
    'pull_request_create_plan',
    'operator_board',
    'shop_private_intake_json',
    'shop_private_intake_markdown',
    'shop_baseline_template_and_worksheet',
    'shop_launch_gate_report',
    'shop_day0_readiness',
    'shop_day0_owner_baseline_action_card',
    'product_readiness_matrix',
    'status_brief',
    'next_release_action_preflight',
    'release_owner_approval_packet',
    'current_release_control_index',
    'shop_owner_observation_pack',
    'admin_technical_coordination_packet',
    'release_artifact_family_verify',
  ]
  if (ids.length !== expectedIds.length || !ids.every((id, index) => id === expectedIds[index])) {
    fail('release_artifact_family_plan_command_order_invalid')
  }
  for (const entry of plan.commands) {
    if (!Array.isArray(entry.command) || entry.command[0] !== 'node' || !String(entry.command[1] || '').startsWith('tools/')) {
      fail(`release_artifact_family_plan_command_invalid:${entry?.id || 'unknown'}`)
    }
    if (entry.externalWritesPerformed !== false) {
      fail(`release_artifact_family_plan_external_write_invalid:${entry.id}`)
    }
    const text = commandText(entry)
    if (FORBIDDEN_COMMAND_PATTERNS.some((pattern) => pattern.test(text))) {
      fail(`release_artifact_family_plan_forbidden_command:${entry.id}`)
    }
  }
  const byId = Object.fromEntries(plan.commands.map((entry) => [entry.id, entry]))
  if (!includesToken(byId.operator_board, '--github-protection-snapshot')) {
    fail('release_artifact_family_plan_operator_snapshot_missing')
  }
  if (!includesToken(byId.review_branch_push_plan, '--github-protection-snapshot')
    || !includesToken(byId.pull_request_create_plan, '--github-protection-snapshot')) {
    fail('release_artifact_family_plan_review_pr_snapshot_missing')
  }
  if (!includesToken(byId.shop_launch_gate_report, '--intake-packet')
    || includesToken(byId.shop_launch_gate_report, '--baseline-template')
    || includesToken(byId.shop_launch_gate_report, '--baseline-worksheet')) {
    fail('release_artifact_family_plan_launch_gate_input_invalid')
  }
  if (!includesToken(byId.shop_day0_readiness, '--launch-gate-report')
    || includesToken(byId.shop_day0_readiness, '--intake-packet')) {
    fail('release_artifact_family_plan_day0_launch_gate_binding_invalid')
  }
  if (includesToken(byId.current_release_control_index, '--github-owner-action-card')) {
    fail('release_artifact_family_plan_github_owner_action_card_unconditional')
  }
  if (!includesToken(byId.current_release_control_index, '--branch-push-plan')
    || !includesToken(byId.current_release_control_index, '--release-owner-approval')) {
    fail('release_artifact_family_plan_control_index_required_sources_missing')
  }
  if (tokenAfter(byId.github_main_protection_apply_plan, '--expected-head') !== plan.candidate.head) {
    fail('release_artifact_family_plan_expected_head_mismatch')
  }
  const suffix = `${plan.artifactFamily.version}.generated-${plan.artifactFamily.date}`
  const pathValues = Object.values(plan.paths || {}).map((value) => basename(String(value || '')))
  if (!pathValues.length || pathValues.some((name) => !name.includes(suffix))) {
    fail('release_artifact_family_plan_artifact_family_suffix_mismatch')
  }
  const copy = { ...plan }
  const actualDigest = copy.digest
  delete copy.digest
  if (actualDigest !== digest(JSON.stringify(copy))) fail('release_artifact_family_plan_digest_invalid')
  return plan
}

export function runSelfTest() {
  const candidateHead = 'a'.repeat(40)
  const remoteReviewBranchCommit = 'b'.repeat(40)
  const remoteMainCommit = 'c'.repeat(40)
  const plan = buildReleaseArtifactFamilyPlan({
    version: 'v167',
    date: '20260827',
    artifactsDir: 'artifacts',
    candidateHead,
    remoteReviewBranchCommit,
    remoteMainCommit,
    staleOwnerApprovalPath: 'artifacts/supermega.release-owner-approval-packet.v166.generated-20260827.md',
  })
  const checks = {
    plan_validates: validateReleaseArtifactFamilyPlan(plan) === plan,
    expected_head_pinned: plan.commands.find((entry) => entry.id === 'github_main_protection_apply_plan').command.includes(candidateHead),
    operator_board_snapshot_required: plan.commands.find((entry) => entry.id === 'operator_board').command.includes('--github-protection-snapshot'),
    launch_gate_uses_intake_without_private_baseline_template: plan.commands.find((entry) => entry.id === 'shop_launch_gate_report').command.includes('--intake-packet')
      && !plan.commands.find((entry) => entry.id === 'shop_launch_gate_report').command.includes('--baseline-template'),
    day0_uses_launch_gate_without_intake: plan.commands.find((entry) => entry.id === 'shop_day0_readiness').command.includes('--launch-gate-report')
      && !plan.commands.find((entry) => entry.id === 'shop_day0_readiness').command.includes('--intake-packet'),
    control_index_uses_current_sources: plan.commands.find((entry) => entry.id === 'current_release_control_index').command.includes('--branch-push-plan')
      && plan.commands.find((entry) => entry.id === 'current_release_control_index').command.includes('--release-owner-approval')
      && plan.commands.find((entry) => entry.id === 'current_release_control_index').command.includes('--stale-owner-approval'),
    forbidden_external_commands_absent: plan.commands.every((entry) => !FORBIDDEN_COMMAND_PATTERNS.some((pattern) => pattern.test(commandText(entry)))),
    controls_false: FALSE_CONTROL_KEYS.every((key) => plan.controls[key] === false),
    invalid_version_rejected: (() => {
      try {
        buildReleaseArtifactFamilyPlan({ version: '167', date: '20260827', artifactsDir: 'artifacts', candidateHead })
        return false
      } catch (error) {
        return String(error?.message || '').includes('release_artifact_family_plan_version_invalid')
      }
    })(),
    missing_operator_snapshot_rejected: (() => {
      try {
        const tampered = structuredClone(plan)
        const operator = tampered.commands.find((entry) => entry.id === 'operator_board')
        const index = operator.command.indexOf('--github-protection-snapshot')
        operator.command.splice(index, 2)
        const copy = { ...tampered }
        delete copy.digest
        tampered.digest = digest(JSON.stringify(copy))
        validateReleaseArtifactFamilyPlan(tampered)
        return false
      } catch (error) {
        return String(error?.message || '').includes('release_artifact_family_plan_operator_snapshot_missing')
      }
    })(),
    day0_intake_reopen_rejected: (() => {
      try {
        const tampered = structuredClone(plan)
        const day0 = tampered.commands.find((entry) => entry.id === 'shop_day0_readiness')
        day0.command.splice(day0.command.indexOf('--launch-gate-report'), 0, '--intake-packet', plan.paths.shopPrivateIntakeJson)
        const copy = { ...tampered }
        delete copy.digest
        tampered.digest = digest(JSON.stringify(copy))
        validateReleaseArtifactFamilyPlan(tampered)
        return false
      } catch (error) {
        return String(error?.message || '').includes('release_artifact_family_plan_day0_launch_gate_binding_invalid')
      }
    })(),
    private_baseline_template_in_launch_gate_rejected: (() => {
      try {
        const tampered = structuredClone(plan)
        const launchGate = tampered.commands.find((entry) => entry.id === 'shop_launch_gate_report')
        launchGate.command.splice(launchGate.command.indexOf('--output'), 0, '--baseline-template', plan.paths.shopBaselineTemplate)
        const copy = { ...tampered }
        delete copy.digest
        tampered.digest = digest(JSON.stringify(copy))
        validateReleaseArtifactFamilyPlan(tampered)
        return false
      } catch (error) {
        return String(error?.message || '').includes('release_artifact_family_plan_launch_gate_input_invalid')
      }
    })(),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key)
  return {
    ok: failedChecks.length === 0,
    contract: `${RELEASE_ARTIFACT_FAMILY_PLAN_CONTRACT}.self-test`,
    checks,
    failedChecks,
    externalWritesPerformed: false,
  }
}

function parseArgs(argv) {
  const options = {
    selfTest: false,
    version: null,
    date: null,
    artifactsDir: '.',
    candidateHead: null,
    remoteReviewBranchCommit: null,
    remoteMainCommit: null,
    staleOwnerApprovalPath: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--self-test') options.selfTest = true
    else if (arg === '--version') options.version = argv[++index] || null
    else if (arg === '--date') options.date = argv[++index] || null
    else if (arg === '--artifacts-dir') options.artifactsDir = argv[++index] || null
    else if (arg === '--candidate-head') options.candidateHead = argv[++index] || null
    else if (arg === '--remote-review-branch-commit') options.remoteReviewBranchCommit = argv[++index] || null
    else if (arg === '--remote-main-commit') options.remoteMainCommit = argv[++index] || null
    else if (arg === '--stale-owner-approval') options.staleOwnerApprovalPath = argv[++index] || null
    else fail(`release_artifact_family_plan_usage_invalid:${arg}`)
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
  const plan = buildReleaseArtifactFamilyPlan({
    version: options.version,
    date: options.date,
    artifactsDir: options.artifactsDir,
    candidateHead: options.candidateHead,
    remoteReviewBranchCommit: options.remoteReviewBranchCommit,
    remoteMainCommit: options.remoteMainCommit,
    staleOwnerApprovalPath: options.staleOwnerApprovalPath,
  })
  console.log(JSON.stringify(plan, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: RELEASE_ARTIFACT_FAMILY_PLAN_CONTRACT,
      error: String(error?.message || 'release_artifact_family_plan_failed').slice(0, 240),
      externalWritesPerformed: false,
    }))
    process.exitCode = 1
  })
}
