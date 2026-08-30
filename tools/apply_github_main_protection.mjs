#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assessGitHubMainProtection,
} from './verify_github_main_protection.mjs'
import {
  buildGitHubMainProtectionPacket,
  validateGitHubMainProtectionPacket,
} from './prepare_github_main_protection_packet.mjs'

export const GITHUB_MAIN_PROTECTION_APPLY_CONTRACT = 'supermega.github-main-protection-apply.v1'

const root = resolve(import.meta.dirname, '..')
const DEFAULT_PROPOSAL = resolve(root, 'hq', 'readiness', 'github-main-protection-proposal.json')
const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const RULESET_NAME = 'SuperMega main release gate'
const APPROVAL_ENV = 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL'
const TOKEN_ENVS = ['GITHUB_TOKEN', 'GH_TOKEN']
const API_BASE = `https://api.github.com/repos/${REPOSITORY}`
const SHA_PATTERN = /^[0-9a-f]{40}$/
const WRITE_CONFIRMED_PERFORMED = 'confirmed_performed'
const WRITE_CONFIRMED_NOT_PERFORMED = 'confirmed_not_performed'
const WRITE_OUTCOME_UNKNOWN = 'outcome_unknown'

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function githubWriteControls({ attempted, outcome }) {
  const performedByOutcome = {
    [WRITE_CONFIRMED_PERFORMED]: true,
    [WRITE_CONFIRMED_NOT_PERFORMED]: false,
    [WRITE_OUTCOME_UNKNOWN]: null,
  }
  if (!(outcome in performedByOutcome)) fail('github_main_protection_apply_write_outcome_invalid')
  if (!attempted && outcome !== WRITE_CONFIRMED_NOT_PERFORMED) fail('github_main_protection_apply_write_outcome_invalid')
  const performed = performedByOutcome[outcome]
  return {
    githubWriteAttempted: attempted,
    githubWritesPerformed: performed,
    githubWriteOutcome: outcome,
    githubWriteRetryAllowed: false,
    repositorySettingsMutated: performed,
  }
}

function safeFailureCode(error) {
  const code = String(error?.message || 'github_main_protection_apply_failed')
  return /^[a-z0-9_:-]{1,240}$/.test(code) ? code : 'github_main_protection_apply_failed'
}

function writeFailure(code, { attempted, outcome }) {
  const error = new Error(code)
  error.writeOutcome = { attempted, outcome }
  return error
}

function throwWithWriteOutcome(error, attempted) {
  if (isRecord(error?.writeOutcome)) throw error
  throw writeFailure(
    attempted ? 'github_main_protection_apply_write_outcome_unknown' : safeFailureCode(error),
    {
      attempted,
      outcome: attempted ? WRITE_OUTCOME_UNKNOWN : WRITE_CONFIRMED_NOT_PERFORMED,
    },
  )
}

export function buildGitHubMainProtectionApplyFailureReceipt(error) {
  const writeOutcome = isRecord(error?.writeOutcome)
    ? error.writeOutcome
    : { attempted: false, outcome: WRITE_CONFIRMED_NOT_PERFORMED }
  return {
    ok: false,
    contract: GITHUB_MAIN_PROTECTION_APPLY_CONTRACT,
    error: safeFailureCode(error),
    controls: {
      ...githubWriteControls(writeOutcome),
      branchMutated: false,
      pullRequestCreated: false,
      mergePerformed: false,
      deploymentPerformed: false,
      supabaseMutated: false,
      credentialValueExposed: false,
    },
  }
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function signed(body) {
  return { ...body, digest: digest(JSON.stringify(body)) }
}

function normalizedExpectedHead(value, { required = false } = {}) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) {
    if (required) fail('github_main_protection_apply_expected_head_required')
    return null
  }
  if (!SHA_PATTERN.test(normalized)) fail('github_main_protection_apply_expected_head_invalid')
  return normalized
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
  if (!optional && (result.error || result.signal || result.status !== 0)) fail('github_main_protection_apply_git_failed')
  return String(result.stdout || '').trim()
}

function currentGitState() {
  const branch = git(['symbolic-ref', '--short', 'HEAD'])
  const head = git(['rev-parse', 'HEAD'])
  const dirty = git(['status', '--porcelain=v1'], { optional: true })
  return {
    branch,
    head,
    clean: dirty.length === 0,
  }
}

async function readProposal(path = DEFAULT_PROPOSAL) {
  const absolute = resolve(path)
  const payload = await readFile(absolute, 'utf8')
  const packet = validateGitHubMainProtectionPacket(JSON.parse(payload))
  return {
    path: absolute,
    digest: digest(payload),
    packet,
  }
}

function tokenFromEnv(env = process.env) {
  for (const key of TOKEN_ENVS) {
    const value = String(env[key] || '').trim()
    if (value) return { key, value }
  }
  return null
}

export function validateOwnerApproval({ proposal, env = process.env, execute = false } = {}) {
  if (!isRecord(proposal)) fail('github_main_protection_apply_proposal_required')
  const expected = String(proposal.ownerApprovalTemplate || '')
  if (!expected.includes('I approve one GitHub repository settings write')) fail('github_main_protection_apply_approval_template_invalid')
  const actual = String(env[APPROVAL_ENV] || '')
  const approved = actual === expected
  if (execute && !approved) fail('github_main_protection_apply_owner_approval_required')
  return {
    env: APPROVAL_ENV,
    approved,
    expectedDigest: digest(expected),
    actualDigest: actual ? digest(actual) : null,
  }
}

export function selectRulesetAction(rulesets = []) {
  if (!Array.isArray(rulesets)) fail('github_main_protection_apply_rulesets_invalid')
  const matches = rulesets.filter((ruleset) => ruleset?.name === RULESET_NAME && ruleset?.target === 'branch')
  if (matches.length > 1) fail('github_main_protection_apply_ruleset_ambiguous')
  if (matches.length === 1) {
    const id = matches[0]?.id
    if (!Number.isSafeInteger(id) && !/^\d+$/.test(String(id || ''))) fail('github_main_protection_apply_ruleset_id_invalid')
    return {
      action: 'update',
      method: 'PUT',
      path: `/repos/${REPOSITORY}/rulesets/${id}`,
      rulesetId: Number(id),
    }
  }
  return {
    action: 'create',
    method: 'POST',
    path: `/repos/${REPOSITORY}/rulesets`,
    rulesetId: null,
  }
}

function redactedHeaders(tokenKey, apiVersion) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer <redacted>',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': apiVersion,
    tokenEnv: tokenKey,
  }
}

async function githubRequest({ path, method = 'GET', token, apiVersion, body, request = fetch }) {
  const response = await request(`${API_BASE}${path}`, {
    method,
    redirect: 'error',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': apiVersion,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  let json = null
  if (text) {
    try { json = JSON.parse(text) } catch {
      fail('github_main_protection_apply_response_json_invalid')
    }
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      json,
    }
  }
  return {
    ok: true,
    status: response.status,
    json,
  }
}

function assertNoSecretEcho(value) {
  const text = JSON.stringify(value || {})
  if (/Bearer\s+[A-Za-z0-9._-]+/i.test(text)
    || /gh[pousr]_[A-Za-z0-9_]{20,}/.test(text)
    || /github_pat_[A-Za-z0-9_]{20,}/.test(text)) {
    fail('github_main_protection_apply_secret_echo')
  }
}

export function buildApplyPlan({ proposalReceipt, gitState = currentGitState(), env = process.env, expectedHead = null } = {}) {
  if (!isRecord(proposalReceipt?.packet)) fail('github_main_protection_apply_proposal_required')
  const proposal = proposalReceipt.packet
  const token = tokenFromEnv(env)
  const approval = validateOwnerApproval({ proposal, env, execute: false })
  const expected = normalizedExpectedHead(expectedHead ?? gitState.head)
  const body = {
    ok: true,
    contract: GITHUB_MAIN_PROTECTION_APPLY_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    mode: 'plan_only_no_github_write',
    repository: REPOSITORY,
    proposal: {
      path: proposalReceipt.path || null,
      digest: proposalReceipt.digest || null,
      packetDigest: proposal.digest,
      apiVersion: proposal.githubApi?.apiVersion,
    },
    candidate: {
      branch: gitState.branch || null,
      head: gitState.head || null,
      clean: gitState.clean === true,
      expectedHead: expected,
      expectedHeadMatched: expected ? String(gitState.head || '').toLowerCase() === expected : null,
      expectedHeadRequiredForExecute: true,
    },
    approval,
    token: {
      present: Boolean(token),
      env: token?.key || null,
      valueExposed: false,
    },
    plannedNetworkReads: [
      `GET /repos/${REPOSITORY}/rulesets`,
      `GET /repos/${REPOSITORY}/branches/main`,
    ],
    possibleWrite: {
      create: `POST /repos/${REPOSITORY}/rulesets`,
      update: `PUT /repos/${REPOSITORY}/rulesets/{ruleset_id}`,
      payloadDigest: digest(JSON.stringify(proposal.proposedRuleset)),
      headers: redactedHeaders(token?.key || '<token-env-required>', proposal.githubApi?.apiVersion),
    },
    executionRequirements: [
      '--execute flag',
      '--expected-head exactly equals the owner-reviewed candidate commit',
      `${APPROVAL_ENV} exactly equals the owner approval template`,
      'GITHUB_TOKEN or GH_TOKEN is set',
      'local worktree is clean',
      'local HEAD equals --expected-head before any GitHub write',
      'after-apply read-only verifier returns ok:true',
    ],
    controls: {
      githubWritesApproved: approval.approved,
      ...githubWriteControls({ attempted: false, outcome: WRITE_CONFIRMED_NOT_PERFORMED }),
      branchMutated: false,
      pullRequestCreated: false,
      mergePerformed: false,
      deploymentPerformed: false,
      supabaseMutated: false,
      credentialValueExposed: false,
    },
  }
  assertNoSecretEcho(body)
  return signed(body)
}

export function validateApplyReport(packet, { expectedMode = null } = {}) {
  if (!isRecord(packet)) fail('github_main_protection_apply_report_invalid')
  const { digest: actualDigest, ...body } = packet
  if (actualDigest !== digest(JSON.stringify(body))) fail('github_main_protection_apply_report_digest_invalid')
  if (packet.contract !== GITHUB_MAIN_PROTECTION_APPLY_CONTRACT) fail('github_main_protection_apply_report_contract_invalid')
  if (packet.repository !== REPOSITORY) fail('github_main_protection_apply_report_repository_invalid')
  if (packet.digestScope !== 'utf8_compact_json_without_digest') fail('github_main_protection_apply_report_digest_scope_invalid')
  if (expectedMode && packet.mode !== expectedMode) fail('github_main_protection_apply_report_mode_invalid')
  if (!isRecord(packet.proposal)
    || !/^sha256:[0-9a-f]{64}$/.test(String(packet.proposal.packetDigest || ''))
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(packet.proposal.apiVersion || ''))) {
    fail('github_main_protection_apply_report_proposal_invalid')
  }
  if (!isRecord(packet.candidate)
    || typeof packet.candidate.branch !== 'string'
    || !/^[0-9a-f]{40}$/.test(String(packet.candidate.head || ''))
    || typeof packet.candidate.clean !== 'boolean'
    || packet.candidate.expectedHeadRequiredForExecute !== true) {
    fail('github_main_protection_apply_report_candidate_invalid')
  }
  if (packet.candidate.expectedHead !== null && !SHA_PATTERN.test(String(packet.candidate.expectedHead || ''))) {
    fail('github_main_protection_apply_report_candidate_expected_head_invalid')
  }
  if (packet.candidate.expectedHead !== null && typeof packet.candidate.expectedHeadMatched !== 'boolean') {
    fail('github_main_protection_apply_report_candidate_expected_head_match_invalid')
  }
  if (!isRecord(packet.token) || packet.token.valueExposed !== false) fail('github_main_protection_apply_report_token_invalid')
  if (packet.mode === 'plan_only_no_github_write') {
    if (packet.ok !== true
      || packet.controls?.githubWriteAttempted !== false
      || packet.controls?.githubWritesPerformed !== false
      || packet.controls?.githubWriteOutcome !== WRITE_CONFIRMED_NOT_PERFORMED
      || packet.controls?.githubWriteRetryAllowed !== false
      || packet.controls?.repositorySettingsMutated !== false
      || packet.controls?.branchMutated !== false
      || packet.controls?.pullRequestCreated !== false
      || packet.controls?.mergePerformed !== false
      || packet.controls?.deploymentPerformed !== false
      || packet.controls?.supabaseMutated !== false
      || packet.controls?.credentialValueExposed !== false) {
      fail('github_main_protection_apply_plan_controls_invalid')
    }
    if (!Array.isArray(packet.plannedNetworkReads)
      || !packet.plannedNetworkReads.includes(`GET /repos/${REPOSITORY}/rulesets`)
      || !packet.plannedNetworkReads.includes(`GET /repos/${REPOSITORY}/branches/main`)) {
      fail('github_main_protection_apply_plan_reads_invalid')
    }
    if (packet.possibleWrite?.create !== `POST /repos/${REPOSITORY}/rulesets`
      || packet.possibleWrite?.update !== `PUT /repos/${REPOSITORY}/rulesets/{ruleset_id}`
      || !/^sha256:[0-9a-f]{64}$/.test(String(packet.possibleWrite?.payloadDigest || ''))
      || packet.possibleWrite?.headers?.Authorization !== 'Bearer <redacted>') {
      fail('github_main_protection_apply_plan_write_invalid')
    }
    if (!Array.isArray(packet.executionRequirements)
      || !packet.executionRequirements.includes('--execute flag')
      || !packet.executionRequirements.includes('--expected-head exactly equals the owner-reviewed candidate commit')
      || !packet.executionRequirements.includes('local HEAD equals --expected-head before any GitHub write')
      || !packet.executionRequirements.includes('after-apply read-only verifier returns ok:true')) {
      fail('github_main_protection_apply_plan_requirements_invalid')
    }
  } else if (packet.mode === 'executed_owner_approved_github_settings_write') {
    if (packet.controls?.githubWriteAttempted !== true
      || packet.controls?.githubWritesPerformed !== true
      || packet.controls?.githubWriteOutcome !== WRITE_CONFIRMED_PERFORMED
      || packet.controls?.githubWriteRetryAllowed !== false
      || packet.controls?.repositorySettingsMutated !== true
      || packet.controls?.branchMutated !== false
      || packet.controls?.credentialValueExposed !== false
      || packet.verification?.ok !== true
      || packet.candidate.expectedHead !== packet.candidate.head
      || packet.candidate.expectedHeadMatched !== true) {
      fail('github_main_protection_apply_execute_controls_invalid')
    }
  } else {
    fail('github_main_protection_apply_report_mode_invalid')
  }
  assertNoSecretEcho(packet)
  return packet
}

export async function applyGitHubMainProtectionWithClient({
  proposalReceipt,
  env = process.env,
  gitState = currentGitState(),
  request = fetch,
  expectedHead = null,
} = {}) {
  let githubWriteAttempted = false
  try {
    if (!gitState.clean) fail('github_main_protection_apply_worktree_dirty')
    const proposal = proposalReceipt?.packet
    if (!isRecord(proposal)) fail('github_main_protection_apply_proposal_required')
    const expected = normalizedExpectedHead(expectedHead, { required: true })
    if (String(gitState.head || '').toLowerCase() !== expected) fail('github_main_protection_apply_expected_head_mismatch')
    const approval = validateOwnerApproval({ proposal, env, execute: true })
    const token = tokenFromEnv(env)
    if (!token) fail('github_main_protection_apply_token_required')
    const apiVersion = proposal.githubApi?.apiVersion
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(apiVersion || ''))) fail('github_main_protection_apply_api_version_invalid')

    const before = await githubRequest({
      path: '/rulesets',
      token: token.value,
      apiVersion,
      request,
    })
    if (!before.ok) fail(`github_main_protection_apply_rulesets_fetch_failed:${before.status}`)
    const selected = selectRulesetAction(before.json)
    githubWriteAttempted = true
    const write = await githubRequest({
      path: selected.action === 'create' ? '/rulesets' : `/rulesets/${selected.rulesetId}`,
      method: selected.method,
      token: token.value,
      apiVersion,
      body: proposal.proposedRuleset,
      request,
    })
    if (!write.ok) {
      const confirmedNotPerformed = write.status >= 400 && write.status < 500
      throw writeFailure(
        confirmedNotPerformed
          ? `github_main_protection_apply_write_failed:${write.status}`
          : 'github_main_protection_apply_write_outcome_unknown',
        {
          attempted: true,
          outcome: confirmedNotPerformed ? WRITE_CONFIRMED_NOT_PERFORMED : WRITE_OUTCOME_UNKNOWN,
        },
      )
    }

    const [branch, rulesets] = await Promise.all([
      githubRequest({ path: '/branches/main', token: token.value, apiVersion, request }),
      githubRequest({ path: '/rulesets', token: token.value, apiVersion, request }),
    ])
    if (!branch.ok) fail(`github_main_protection_apply_branch_verify_fetch_failed:${branch.status}`)
    if (!rulesets.ok) fail(`github_main_protection_apply_rulesets_verify_fetch_failed:${rulesets.status}`)
    const verification = assessGitHubMainProtection({ branch: branch.json, rulesets: rulesets.json })
    if (!verification.ok) fail('github_main_protection_apply_verification_failed')

    const body = {
      ok: true,
      contract: GITHUB_MAIN_PROTECTION_APPLY_CONTRACT,
      digestScope: 'utf8_compact_json_without_digest',
      mode: 'executed_owner_approved_github_settings_write',
      repository: REPOSITORY,
      proposal: {
        path: proposalReceipt.path || null,
        digest: proposalReceipt.digest || null,
        packetDigest: proposal.digest,
        apiVersion,
      },
      candidate: {
        branch: gitState.branch || null,
        head: gitState.head || null,
        clean: true,
        expectedHead: expected,
        expectedHeadMatched: true,
        expectedHeadRequiredForExecute: true,
      },
      action: {
        kind: selected.action,
        method: selected.method,
        path: selected.path,
        status: write.status,
        rulesetId: selected.rulesetId ?? write.json?.id ?? null,
      },
      approval,
      token: {
        present: true,
        env: token.key,
        valueExposed: false,
      },
      verification: {
        ok: true,
        contract: verification.contract,
        observedRequiredChecks: verification.observedRequiredChecks,
        activeMainRulesets: verification.evidence.activeMainRulesets,
      },
      controls: {
        githubWritesApproved: true,
        ...githubWriteControls({ attempted: true, outcome: WRITE_CONFIRMED_PERFORMED }),
        branchMutated: false,
        pullRequestCreated: false,
        mergePerformed: false,
        deploymentPerformed: false,
        supabaseMutated: false,
        credentialValueExposed: false,
      },
    }
    assertNoSecretEcho(body)
    return signed(body)
  } catch (error) {
    throwWithWriteOutcome(error, githubWriteAttempted)
  }
}

function parseArgs(argv) {
  const args = [...argv]
  const options = {
    mode: 'plan',
    proposal: DEFAULT_PROPOSAL,
    output: null,
    verify: null,
    expectedHead: null,
  }
  while (args.length) {
    const arg = args.shift()
    if (arg === '--plan') {
      options.mode = 'plan'
    } else if (arg === '--execute') {
      options.mode = 'execute'
    } else if (arg === '--self-test') {
      options.mode = 'self-test'
    } else if (arg === '--proposal' && args[0]) {
      options.proposal = args.shift()
    } else if (arg === '--expected-head' && args[0]) {
      options.expectedHead = normalizedExpectedHead(args.shift())
    } else if (arg === '--output' && args[0]) {
      options.output = args.shift()
    } else if (arg === '--verify' && args[0]) {
      options.mode = 'verify'
      options.verify = args.shift()
    } else {
      fail('github_main_protection_apply_usage_invalid')
    }
  }
  if (options.output && options.mode !== 'plan') fail('github_main_protection_apply_output_plan_only')
  return options
}

async function writeExclusive(path, content) {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' })
  return absolute
}

async function runSelfTest() {
  const proposalPacket = buildGitHubMainProtectionPacket({
    sourceReceipts: [
      'package.json',
      'tools/verify_github_main_protection.mjs',
      'tools/prepare_github_main_protection_packet.mjs',
      'tools/apply_github_main_protection.mjs',
    ].map((path) => ({ path, digest: `sha256:${'0'.repeat(64)}` })),
  })
  const proposalReceipt = {
    path: '<self-test>',
    digest: `sha256:${'1'.repeat(64)}`,
    packet: proposalPacket,
  }
  const plan = buildApplyPlan({
    proposalReceipt,
    gitState: { branch: 'codex/release-stack-integration-rehearsal-20260825', head: '0'.repeat(40), clean: true },
    env: {},
    expectedHead: '0'.repeat(40),
  })
  const selectedCreate = selectRulesetAction([])
  const selectedUpdate = selectRulesetAction([{ id: 7, name: RULESET_NAME, target: 'branch' }])
  const checks = {
    plan_mode_does_not_write: plan.controls.githubWritesPerformed === false && plan.mode === 'plan_only_no_github_write',
    approval_required_for_execute: (() => {
      try {
        validateOwnerApproval({ proposal: proposalReceipt.packet, env: {}, execute: true })
        return false
      } catch (error) {
        return String(error?.message || '') === 'github_main_protection_apply_owner_approval_required'
      }
    })(),
    create_or_update_selected: selectedCreate.method === 'POST' && selectedUpdate.method === 'PUT' && selectedUpdate.rulesetId === 7,
    plan_digest_verifies: validateApplyReport(plan, { expectedMode: 'plan_only_no_github_write' }) === plan,
    expected_head_guard_documented: plan.candidate.expectedHead === '0'.repeat(40) && plan.candidate.expectedHeadMatched === true,
    no_secret_echo: plan.token.valueExposed === false,
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key)
  return {
    ok: failedChecks.length === 0,
    contract: `${GITHUB_MAIN_PROTECTION_APPLY_CONTRACT}.self-test`,
    checks,
    failedChecks,
    githubWritesPerformed: false,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.mode === 'self-test') {
    const result = await runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  if (options.mode === 'verify') {
    const report = validateApplyReport(JSON.parse(await readFile(resolve(options.verify), 'utf8')), {
      expectedMode: 'plan_only_no_github_write',
    })
    console.log(JSON.stringify({
      ok: true,
      contract: report.contract,
      mode: report.mode,
      path: resolve(options.verify),
      digest: report.digest,
      repository: report.repository,
      githubWritesPerformed: false,
      repositorySettingsMutated: false,
    }, null, 2))
    return
  }
  const proposalReceipt = await readProposal(options.proposal)
  const result = options.mode === 'execute'
    ? await applyGitHubMainProtectionWithClient({ proposalReceipt, expectedHead: options.expectedHead })
    : buildApplyPlan({ proposalReceipt, expectedHead: options.expectedHead })
  if (options.output) {
    const output = await writeExclusive(options.output, `${JSON.stringify(validateApplyReport(result, { expectedMode: 'plan_only_no_github_write' }), null, 2)}\n`)
    console.log(JSON.stringify({
      ok: true,
      contract: result.contract,
      mode: result.mode,
      output,
      digest: result.digest,
      githubWritesPerformed: false,
      repositorySettingsMutated: false,
    }, null, 2))
    return
  }
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify(buildGitHubMainProtectionApplyFailureReceipt(error), null, 2))
    process.exitCode = 1
  })
}
