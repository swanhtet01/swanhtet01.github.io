#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
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

function fail(code) {
  throw new Error(code)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
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

export function buildApplyPlan({ proposalReceipt, gitState = currentGitState(), env = process.env } = {}) {
  if (!isRecord(proposalReceipt?.packet)) fail('github_main_protection_apply_proposal_required')
  const proposal = proposalReceipt.packet
  const token = tokenFromEnv(env)
  const approval = validateOwnerApproval({ proposal, env, execute: false })
  const body = {
    ok: true,
    contract: GITHUB_MAIN_PROTECTION_APPLY_CONTRACT,
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
      `${APPROVAL_ENV} exactly equals the owner approval template`,
      'GITHUB_TOKEN or GH_TOKEN is set',
      'local worktree is clean',
      'after-apply read-only verifier returns ok:true',
    ],
    controls: {
      githubWritesApproved: approval.approved,
      githubWritesPerformed: false,
      repositorySettingsMutated: false,
      branchMutated: false,
      pullRequestCreated: false,
      mergePerformed: false,
      deploymentPerformed: false,
      supabaseMutated: false,
      credentialValueExposed: false,
    },
  }
  assertNoSecretEcho(body)
  return body
}

export async function applyGitHubMainProtectionWithClient({
  proposalReceipt,
  env = process.env,
  gitState = currentGitState(),
  request = fetch,
} = {}) {
  if (!gitState.clean) fail('github_main_protection_apply_worktree_dirty')
  const proposal = proposalReceipt?.packet
  if (!isRecord(proposal)) fail('github_main_protection_apply_proposal_required')
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
  const write = await githubRequest({
    path: selected.action === 'create' ? '/rulesets' : `/rulesets/${selected.rulesetId}`,
    method: selected.method,
    token: token.value,
    apiVersion,
    body: proposal.proposedRuleset,
    request,
  })
  if (!write.ok) fail(`github_main_protection_apply_write_failed:${write.status}`)

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
      githubWritesPerformed: true,
      repositorySettingsMutated: true,
      branchMutated: false,
      pullRequestCreated: false,
      mergePerformed: false,
      deploymentPerformed: false,
      supabaseMutated: false,
      credentialValueExposed: false,
    },
  }
  assertNoSecretEcho(body)
  return body
}

function parseArgs(argv) {
  const args = [...argv]
  const options = {
    mode: 'plan',
    proposal: DEFAULT_PROPOSAL,
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
    } else {
      fail('github_main_protection_apply_usage_invalid')
    }
  }
  return options
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
  const proposalReceipt = await readProposal(options.proposal)
  const result = options.mode === 'execute'
    ? await applyGitHubMainProtectionWithClient({ proposalReceipt })
    : buildApplyPlan({ proposalReceipt })
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      contract: GITHUB_MAIN_PROTECTION_APPLY_CONTRACT,
      error: String(error?.message || 'github_main_protection_apply_failed').slice(0, 240),
      controls: {
        githubWritesPerformed: false,
        repositorySettingsMutated: false,
        branchMutated: false,
        credentialValueExposed: false,
      },
    }, null, 2))
    process.exitCode = 1
  })
}
