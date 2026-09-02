#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  REQUIRED_MAIN_CHECKS,
  assessGitHubMainProtection,
} from './verify_github_main_protection.mjs'

export const GITHUB_MAIN_PROTECTION_SNAPSHOT_CONTRACT = 'supermega.github-main-protection-snapshot.v1'
export const GITHUB_MAIN_PROTECTION_SNAPSHOT_ATTEMPTS = 3

const REPOSITORY = 'swanhtet01/swanhtet01.github.io'
const OWNER = 'swanhtet01'
const REPO = 'swanhtet01.github.io'
const BRANCH_URL = `https://api.github.com/repos/${OWNER}/${REPO}/branches/main`
const RULESETS_URL = `https://api.github.com/repos/${OWNER}/${REPO}/rulesets`
const RULESET_DETAIL_URL_PREFIX = `${RULESETS_URL}/`
const TOKEN_ENVS = ['GITHUB_TOKEN', 'GH_TOKEN']
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_COLLECTION_ATTEMPTS = 5
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /gho_[A-Za-z0-9]{20,}/,
  /ghu_[A-Za-z0-9]{20,}/,
  /ghs_[A-Za-z0-9]{20,}/,
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

function assertNoSecretShape(value, code = 'github_main_protection_snapshot_secret_shape') {
  const text = JSON.stringify(value || {})
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) fail(code)
}

function tokenFromEnv(env = process.env) {
  for (const key of TOKEN_ENVS) {
    const value = String(env[key] || '').trim()
    if (value) return { key, value }
  }
  return null
}

function exactDigest(value, code) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!DIGEST_PATTERN.test(normalized)) fail(code)
  return normalized
}

function exactShaOrNull(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return SHA_PATTERN.test(normalized) ? normalized : null
}

function boundedString(value, max = 160) {
  const text = String(value || '').trim()
  if (!text || text.length > max) return null
  return text
}

function boundedFailureReason(error) {
  return String(error?.message || 'unknown')
    .replace(/[^A-Za-z0-9_:.-]+/g, '_')
    .slice(0, 120)
}

function retryableCollectionFailure(error) {
  const reason = String(error?.message || '')
  return reason === 'github_main_protection_snapshot_branch_invalid'
    || reason === 'github_main_protection_snapshot_rulesets_invalid'
    || reason === 'github_main_protection_snapshot_ruleset_detail_invalid'
    || reason === 'github_main_protection_snapshot_response_json_invalid'
    || reason.startsWith('github_main_protection_snapshot_fetch_failed:')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function stringArray(value) {
  return asArray(value).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 100)
}

function enabledObject(value) {
  if (!isRecord(value)) return null
  return { enabled: value.enabled === true }
}

function statusCheckSnapshot(value) {
  const checks = asArray(value?.checks).map((check) => ({
    context: boundedString(check?.context) || boundedString(check?.name),
    app_id: Number.isSafeInteger(check?.app_id) ? check.app_id : null,
  })).filter((check) => check.context)
  return {
    contexts: stringArray(value?.contexts),
    checks,
  }
}

export function sanitizeBranchSnapshot(branch) {
  if (!isRecord(branch)) fail('github_main_protection_snapshot_branch_invalid')
  const protection = isRecord(branch.protection) ? branch.protection : {}
  return {
    name: String(branch.name || ''),
    protected: branch.protected === true,
    commit: {
      sha: exactShaOrNull(branch.commit?.sha),
    },
    protection: {
      enabled: protection.enabled === true,
      required_status_checks: statusCheckSnapshot(protection.required_status_checks),
      allow_force_pushes: enabledObject(protection.allow_force_pushes),
      allow_deletions: enabledObject(protection.allow_deletions),
      required_pull_request_reviews: isRecord(protection.required_pull_request_reviews)
        ? {
            required_approving_review_count: Number.isSafeInteger(protection.required_pull_request_reviews.required_approving_review_count)
              ? protection.required_pull_request_reviews.required_approving_review_count
              : null,
          }
        : null,
      required_conversation_resolution: enabledObject(protection.required_conversation_resolution),
    },
  }
}

function fallbackBranchSnapshot(commit) {
  return {
    name: 'main',
    protected: false,
    commit: { sha: commit },
    protection: {
      enabled: false,
      required_status_checks: { contexts: [], checks: [] },
      allow_force_pushes: null,
      allow_deletions: null,
      required_pull_request_reviews: null,
      required_conversation_resolution: null,
    },
  }
}

function endpointBranchEvidence(expectedRemoteMainCommit = null) {
  return {
    kind: 'github_branch_endpoint',
    branchEndpointAvailable: true,
    expectedRemoteMainCommit,
    fallbackUsed: false,
    classicBranchProtectionEvidence: 'endpoint_observed',
  }
}

function fallbackBranchEvidence(expectedRemoteMainCommit) {
  return {
    kind: 'expected_remote_main_fallback',
    branchEndpointAvailable: false,
    expectedRemoteMainCommit,
    fallbackUsed: true,
    classicBranchProtectionEvidence: 'unavailable_not_claimed',
  }
}

export function validateGitHubMainProtectionBranchEvidence(value, branch) {
  if (!isRecord(value) || !isRecord(branch)) fail('github_main_protection_snapshot_branch_evidence_invalid')
  const branchCommit = exactShaOrNull(branch.commit?.sha)
  if (!branchCommit) fail('github_main_protection_snapshot_branch_commit_invalid')
  const keys = Object.keys(value).sort().join(',')
  if (keys !== 'branchEndpointAvailable,classicBranchProtectionEvidence,expectedRemoteMainCommit,fallbackUsed,kind') {
    fail('github_main_protection_snapshot_branch_evidence_invalid')
  }
  const expectedRemoteMainCommit = value.expectedRemoteMainCommit === null
    ? null
    : exactShaOrNull(value.expectedRemoteMainCommit)
  if (value.expectedRemoteMainCommit !== null && expectedRemoteMainCommit === null) {
    fail('github_main_protection_snapshot_expected_main_invalid')
  }
  if (value.kind === 'github_branch_endpoint') {
    if (value.branchEndpointAvailable !== true
      || value.fallbackUsed !== false
      || value.classicBranchProtectionEvidence !== 'endpoint_observed') {
      fail('github_main_protection_snapshot_branch_evidence_invalid')
    }
    if (expectedRemoteMainCommit !== null && branchCommit !== expectedRemoteMainCommit) {
      fail('github_main_protection_snapshot_expected_main_mismatch')
    }
    return endpointBranchEvidence(expectedRemoteMainCommit)
  }
  if (value.kind === 'expected_remote_main_fallback') {
    if (expectedRemoteMainCommit === null
      || value.branchEndpointAvailable !== false
      || value.fallbackUsed !== true
      || value.classicBranchProtectionEvidence !== 'unavailable_not_claimed'
      || JSON.stringify(branch) !== JSON.stringify(fallbackBranchSnapshot(expectedRemoteMainCommit))) {
      fail('github_main_protection_snapshot_fallback_branch_invalid')
    }
    return fallbackBranchEvidence(expectedRemoteMainCommit)
  }
  fail('github_main_protection_snapshot_branch_evidence_invalid')
}

function sanitizeRequiredStatusChecks(value) {
  return asArray(value).map((check) => ({
    context: boundedString(check?.context) || boundedString(check?.name),
  })).filter((check) => check.context)
}

function sanitizeRule(rule) {
  if (typeof rule === 'string') return { type: rule }
  if (!isRecord(rule)) return null
  const type = boundedString(rule.type, 80)
  if (!type) return null
  const parameters = isRecord(rule.parameters) ? rule.parameters : {}
  const sanitized = { type }
  if (type === 'required_status_checks') {
    sanitized.parameters = {
      required_status_checks: sanitizeRequiredStatusChecks(parameters.required_status_checks),
      contexts: stringArray(parameters.contexts),
      strict_required_status_checks_policy: parameters.strict_required_status_checks_policy === true,
      do_not_enforce_on_create: parameters.do_not_enforce_on_create === true,
    }
  } else if (type === 'pull_request') {
    sanitized.parameters = {
      required_review_thread_resolution: parameters.required_review_thread_resolution === true,
      require_review_thread_resolution: parameters.require_review_thread_resolution === true,
      requires_conversation_resolution: parameters.requires_conversation_resolution === true,
      require_last_push_approval: parameters.require_last_push_approval === true,
      required_approving_review_count: Number.isSafeInteger(parameters.required_approving_review_count)
        ? parameters.required_approving_review_count
        : null,
    }
  }
  return sanitized
}

export function sanitizeRulesetsSnapshot(rulesets) {
  if (!Array.isArray(rulesets)) fail('github_main_protection_snapshot_rulesets_invalid')
  return rulesets.map((ruleset) => {
    if (!isRecord(ruleset)) fail('github_main_protection_snapshot_rulesets_invalid')
    return {
      id: Number.isSafeInteger(ruleset.id) ? ruleset.id : (/^\d+$/.test(String(ruleset.id || '')) ? Number(ruleset.id) : null),
      name: boundedString(ruleset.name) || '',
      target: boundedString(ruleset.target, 80) || '',
      enforcement: boundedString(ruleset.enforcement, 80) || '',
      conditions: {
        ref_name: {
          include: stringArray(ruleset.conditions?.ref_name?.include),
          exclude: stringArray(ruleset.conditions?.ref_name?.exclude),
        },
      },
      rules: asArray(ruleset.rules).map(sanitizeRule).filter(Boolean),
    }
  })
}

export function buildGitHubMainProtectionSnapshot({
  generatedAt,
  branch,
  rulesets,
  tokenEnv = null,
  branchEvidence = null,
} = {}) {
  const generated = String(generatedAt || new Date().toISOString())
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generated)) fail('github_main_protection_snapshot_time_invalid')
  const branchSnapshot = sanitizeBranchSnapshot(branch)
  const rulesetsSnapshot = sanitizeRulesetsSnapshot(rulesets)
  const normalizedBranchEvidence = validateGitHubMainProtectionBranchEvidence(
    branchEvidence || endpointBranchEvidence(null),
    branchSnapshot,
  )
  const assessment = assessGitHubMainProtection({ branch: branchSnapshot, rulesets: rulesetsSnapshot })
  if (normalizedBranchEvidence.fallbackUsed && assessment.ok !== true) {
    fail('github_main_protection_snapshot_fallback_rulesets_incomplete')
  }
  const body = {
    contract: GITHUB_MAIN_PROTECTION_SNAPSHOT_CONTRACT,
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: generated,
    repository: REPOSITORY,
    mode: 'read_only_no_github_write',
    source: {
      branchUrl: BRANCH_URL,
      rulesetsUrl: RULESETS_URL,
      tokenPresent: Boolean(tokenEnv),
      tokenEnv: tokenEnv || null,
      tokenValueExposed: false,
      branchEvidence: normalizedBranchEvidence,
    },
    branch: branchSnapshot,
    rulesets: rulesetsSnapshot,
    assessment,
    currentAction: assessment.ok
      ? 'main_protection_verified_continue_to_review_branch_push'
      : 'apply_github_main_protection_after_owner_approval',
    requiredChecks: [...REQUIRED_MAIN_CHECKS],
    controls: {
      githubApiMethods: ['GET'],
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
  const packet = { ...body, digest: digest(JSON.stringify(body)) }
  return validateGitHubMainProtectionSnapshot(packet)
}

export function validateGitHubMainProtectionSnapshot(packet) {
  if (!isRecord(packet)) fail('github_main_protection_snapshot_packet_invalid')
  if (packet.contract !== GITHUB_MAIN_PROTECTION_SNAPSHOT_CONTRACT) fail('github_main_protection_snapshot_contract_invalid')
  if (packet.digestScope !== 'utf8_compact_json_without_digest') fail('github_main_protection_snapshot_digest_scope_invalid')
  if (packet.repository !== REPOSITORY) fail('github_main_protection_snapshot_repository_invalid')
  if (packet.mode !== 'read_only_no_github_write') fail('github_main_protection_snapshot_mode_invalid')
  if (packet.source?.branchUrl !== BRANCH_URL || packet.source?.rulesetsUrl !== RULESETS_URL) fail('github_main_protection_snapshot_source_invalid')
  if (packet.source?.tokenValueExposed !== false) fail('github_main_protection_snapshot_token_invalid')
  if (!exactShaOrNull(packet.branch?.commit?.sha)) fail('github_main_protection_snapshot_branch_commit_invalid')
  const branchSnapshot = sanitizeBranchSnapshot(packet.branch)
  const rulesetsSnapshot = sanitizeRulesetsSnapshot(packet.rulesets)
  if (JSON.stringify(branchSnapshot) !== JSON.stringify(packet.branch)) fail('github_main_protection_snapshot_branch_invalid')
  if (JSON.stringify(rulesetsSnapshot) !== JSON.stringify(packet.rulesets)) fail('github_main_protection_snapshot_rulesets_invalid')
  const branchEvidence = validateGitHubMainProtectionBranchEvidence(packet.source?.branchEvidence, branchSnapshot)
  if (JSON.stringify(branchEvidence) !== JSON.stringify(packet.source.branchEvidence)) {
    fail('github_main_protection_snapshot_branch_evidence_invalid')
  }
  let tokenEnv = null
  if (packet.source.tokenEnv !== null) {
    if (!TOKEN_ENVS.includes(packet.source.tokenEnv)) fail('github_main_protection_snapshot_token_invalid')
    tokenEnv = packet.source.tokenEnv
  }
  const normalizedSource = {
    branchUrl: BRANCH_URL,
    rulesetsUrl: RULESETS_URL,
    tokenPresent: Boolean(tokenEnv),
    tokenEnv,
    tokenValueExposed: false,
    branchEvidence,
  }
  if (JSON.stringify(normalizedSource) !== JSON.stringify(packet.source)) {
    fail('github_main_protection_snapshot_source_invalid')
  }
  if (!Array.isArray(packet.controls?.githubApiMethods) || packet.controls.githubApiMethods.join(',') !== 'GET') {
    fail('github_main_protection_snapshot_methods_invalid')
  }
  for (const [key, value] of Object.entries(packet.controls || {})) {
    if (key !== 'githubApiMethods' && value !== false) fail(`github_main_protection_snapshot_control_not_false:${key}`)
  }
  const assessment = assessGitHubMainProtection({ branch: branchSnapshot, rulesets: rulesetsSnapshot })
  if (branchEvidence.fallbackUsed && assessment.ok !== true) {
    fail('github_main_protection_snapshot_fallback_rulesets_incomplete')
  }
  if (JSON.stringify(assessment) !== JSON.stringify(packet.assessment)) fail('github_main_protection_snapshot_assessment_invalid')
  const expectedAction = assessment.ok
    ? 'main_protection_verified_continue_to_review_branch_push'
    : 'apply_github_main_protection_after_owner_approval'
  if (packet.currentAction !== expectedAction) fail('github_main_protection_snapshot_action_invalid')
  exactDigest(packet.digest, 'github_main_protection_snapshot_digest_invalid')
  if (packet.digest !== digest(JSON.stringify(cloneWithoutDigest(packet)))) fail('github_main_protection_snapshot_digest_mismatch')
  assertNoSecretShape(packet)
  return packet
}

function parseJsonResponseText(text, code) {
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) fail(`${code}_too_large`)
  try {
    return text ? JSON.parse(text) : null
  } catch {
    fail(`${code}_json_invalid`)
  }
}

function powershellGetJson(url, token) {
  const childEnv = {
    ...process.env,
    SUPERMEGA_GITHUB_SNAPSHOT_URL: url,
  }
  if (token) childEnv.SUPERMEGA_GITHUB_SNAPSHOT_TOKEN = token.value
  const script = [
    "$ProgressPreference='SilentlyContinue'",
    "$headers=@{Accept='application/vnd.github+json'; 'User-Agent'='supermega-read-only-main-protection-snapshot'}",
    "if ($env:SUPERMEGA_GITHUB_SNAPSHOT_TOKEN) { $headers.Authorization = 'Bearer ' + $env:SUPERMEGA_GITHUB_SNAPSHOT_TOKEN }",
    "$response=Invoke-WebRequest -Uri $env:SUPERMEGA_GITHUB_SNAPSHOT_URL -UseBasicParsing -Headers $headers -TimeoutSec 30",
    '$response.Content',
  ].join('; ')
  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: childEnv,
    maxBuffer: MAX_RESPONSE_BYTES + 32_768,
    timeout: 45_000,
    windowsHide: true,
  })
  delete childEnv.SUPERMEGA_GITHUB_SNAPSHOT_TOKEN
  if (result.error || result.signal || result.status !== 0) {
    fail(`github_main_protection_snapshot_fetch_failed:${result.status ?? 'powershell'}`)
  }
  return parseJsonResponseText(String(result.stdout || '').trim(), 'github_main_protection_snapshot_response')
}

async function githubGetJson(url, { env = process.env, request = fetch } = {}) {
  const token = tokenFromEnv(env)
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'supermega-read-only-main-protection-snapshot',
  }
  if (token) headers.Authorization = `Bearer ${token.value}`
  try {
    const response = await request(url, {
      method: 'GET',
      redirect: 'error',
      headers,
      signal: AbortSignal.timeout(30_000),
    })
    const text = await response.text()
    const json = parseJsonResponseText(text, 'github_main_protection_snapshot_response')
    if (!response.ok) {
      const status = Number.isSafeInteger(response.status) ? response.status : 0
      fail(`github_main_protection_snapshot_fetch_failed:${status}`)
    }
    return {
      json,
      tokenEnv: token?.key || null,
    }
  } catch {
    if (process.platform !== 'win32') fail('github_main_protection_snapshot_fetch_failed:fetch')
    return {
      json: powershellGetJson(url, token),
      tokenEnv: token?.key || null,
    }
  }
}

function rulesetIdentity(ruleset) {
  if (!isRecord(ruleset)) return null
  const id = /^\d+$/.test(String(ruleset.id || '')) ? String(ruleset.id) : null
  const name = typeof ruleset.name === 'string' && ruleset.name === ruleset.name.trim() && ruleset.name.length <= 160
    ? ruleset.name
    : null
  const target = typeof ruleset.target === 'string' && ruleset.target === ruleset.target.trim() && ruleset.target.length <= 80
    ? ruleset.target
    : null
  const enforcement = typeof ruleset.enforcement === 'string'
    && ruleset.enforcement === ruleset.enforcement.trim()
    && ruleset.enforcement.length <= 80
    ? ruleset.enforcement
    : null
  if (!id || !name || !target || !enforcement) return null
  return {
    id,
    name,
    target,
    enforcement,
  }
}

function requireRulesetDetail(listEntry, detail) {
  const listIdentity = rulesetIdentity(listEntry)
  const detailIdentity = rulesetIdentity(detail)
  const sanitizedDetail = detailIdentity ? sanitizeRulesetsSnapshot([detail])[0] : null
  if (!listIdentity
    || !detailIdentity
    || JSON.stringify(detailIdentity) !== JSON.stringify(listIdentity)
    || sanitizedDetail.rules.length === 0) {
    fail('github_main_protection_snapshot_ruleset_detail_invalid')
  }
  return detail
}

async function expandRulesetsWithDetails(rulesets, { env = process.env, request = fetch } = {}) {
  if (!Array.isArray(rulesets)) fail('github_main_protection_snapshot_rulesets_invalid')
  const expanded = []
  for (const ruleset of rulesets) {
    if (!isRecord(ruleset)) fail('github_main_protection_snapshot_rulesets_invalid')
    const id = /^\d+$/.test(String(ruleset.id || '')) ? String(ruleset.id) : null
    const needsDetail = asArray(ruleset.rules).length === 0
    if (!needsDetail) {
      expanded.push(ruleset)
      continue
    }
    if (!id) fail('github_main_protection_snapshot_ruleset_detail_invalid')
    const detail = await githubGetJson(`${RULESET_DETAIL_URL_PREFIX}${id}`, { env, request })
    expanded.push(requireRulesetDetail(ruleset, detail.json))
  }
  return expanded
}

async function writeJson(path, value) {
  const absolute = resolve(path || '')
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return absolute
}

function explicitExpectedMainCommit(value) {
  if (value === null || value === undefined) return null
  const commit = exactShaOrNull(value)
  if (!commit) fail('github_main_protection_snapshot_expected_main_invalid')
  return commit
}

async function collectWithBoundedRetry(action, { attempts, delay }) {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return { ok: true, value: await action() }
    } catch (error) {
      if (!retryableCollectionFailure(error)) throw error
      lastError = error
      if (attempt >= attempts) break
      await delay(250 * attempt)
    }
  }
  return { ok: false, error: lastError }
}

async function collectBranchEndpoint({ env, request, expectedMainCommit }) {
  const branch = await githubGetJson(BRANCH_URL, { env, request })
  if (!isRecord(branch.json)
    || branch.json.name !== 'main'
    || exactShaOrNull(branch.json.commit?.sha) === null
    || typeof branch.json.protected !== 'boolean') {
    fail('github_main_protection_snapshot_branch_invalid')
  }
  const branchCommit = exactShaOrNull(branch.json.commit.sha)
  if (expectedMainCommit !== null && branchCommit !== expectedMainCommit) {
    fail('github_main_protection_snapshot_expected_main_mismatch')
  }
  return branch
}

async function collectRulesetsEndpoint({ env, request }) {
  const rulesets = await githubGetJson(RULESETS_URL, { env, request })
  sanitizeRulesetsSnapshot(rulesets.json)
  return {
    json: await expandRulesetsWithDetails(rulesets.json, { env, request }),
    tokenEnv: rulesets.tokenEnv,
  }
}

export async function collectGitHubMainProtectionSnapshot({
  outputPath = null,
  branchOutputPath = null,
  rulesetsOutputPath = null,
  env = process.env,
  request = fetch,
  attempts = GITHUB_MAIN_PROTECTION_SNAPSHOT_ATTEMPTS,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  expectedMainCommit = null,
} = {}) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > MAX_COLLECTION_ATTEMPTS) {
    fail('github_main_protection_snapshot_attempts_invalid')
  }
  if (typeof delay !== 'function') {
    fail('github_main_protection_snapshot_retry_contract_invalid')
  }
  const expectedMain = explicitExpectedMainCommit(expectedMainCommit)
  const retryContract = { attempts, delay }
  const branchResult = await collectWithBoundedRetry(
    () => collectBranchEndpoint({ env, request, expectedMainCommit: expectedMain }),
    retryContract,
  )
  let branch
  let branchEvidence
  let branchTokenEnv = null
  if (branchResult.ok) {
    branch = branchResult.value.json
    branchTokenEnv = branchResult.value.tokenEnv
    branchEvidence = endpointBranchEvidence(expectedMain)
  } else {
    if (expectedMain === null) {
      fail(`github_main_protection_snapshot_expected_main_required:${boundedFailureReason(branchResult.error)}`)
    }
    branch = fallbackBranchSnapshot(expectedMain)
    branchEvidence = fallbackBranchEvidence(expectedMain)
  }
  const rulesetsResult = await collectWithBoundedRetry(
    () => collectRulesetsEndpoint({ env, request }),
    retryContract,
  )
  if (!rulesetsResult.ok) {
    fail(`github_main_protection_snapshot_unavailable:${boundedFailureReason(rulesetsResult.error)}`)
  }
  const packet = buildGitHubMainProtectionSnapshot({
    branch,
    rulesets: rulesetsResult.value.json,
    tokenEnv: branchTokenEnv || rulesetsResult.value.tokenEnv || null,
    branchEvidence,
  })
  const outputs = {
    packet: outputPath ? await writeJson(outputPath, packet) : null,
    branch: branchOutputPath ? await writeJson(branchOutputPath, packet.branch) : null,
    rulesets: rulesetsOutputPath ? await writeJson(rulesetsOutputPath, packet.rulesets) : null,
  }
  return { packet, outputs }
}

async function verifySnapshotFile(path) {
  const raw = await readFile(resolve(path || ''), 'utf8')
  const packet = validateGitHubMainProtectionSnapshot(JSON.parse(raw))
  return {
    ok: true,
    contract: packet.contract,
    path: resolve(path),
    digest: packet.digest,
    assessmentOk: packet.assessment.ok,
    failures: packet.assessment.failures,
    currentAction: packet.currentAction,
    controls: packet.controls,
  }
}

function selfTestFixtures() {
  const branch = {
    name: 'main',
    protected: false,
    commit: {
      sha: 'a'.repeat(40),
      commit: {
        author: { email: 'private@example.com' },
        verification: { signature: '-----BEGIN PGP SIGNATURE-----\nignored\n-----END PGP SIGNATURE-----' },
      },
    },
    protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
  }
  const rulesets = [{
    id: 1,
    name: 'SuperMega main release gate',
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      { type: 'pull_request', parameters: { required_review_thread_resolution: true } },
      { type: 'required_status_checks', parameters: { required_status_checks: REQUIRED_MAIN_CHECKS.map((context) => ({ context })) } },
    ],
  }]
  return { branch, rulesets }
}

function runSelfTest() {
  const { branch, rulesets } = selfTestFixtures()
  const unprotected = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch,
    rulesets: [],
    tokenEnv: 'GITHUB_TOKEN',
  })
  const protectedByRuleset = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch,
    rulesets,
    tokenEnv: null,
  })
  const checks = {
    unprotected_main_fails_closed: unprotected.assessment.ok === false && unprotected.assessment.failures.includes('main_unprotected'),
    protected_ruleset_passes: protectedByRuleset.assessment.ok === true,
    token_value_not_exposed: unprotected.source.tokenPresent === true && unprotected.source.tokenValueExposed === false && !JSON.stringify(unprotected).includes('ghp_'),
    current_action_actionable: unprotected.currentAction === 'apply_github_main_protection_after_owner_approval',
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ok: failedChecks.length === 0,
    contract: `${GITHUB_MAIN_PROTECTION_SNAPSHOT_CONTRACT}.self-test`,
    checks,
    failedChecks,
  }
}

function parseArgs(argv) {
  const args = {
    outputPath: null,
    branchOutputPath: null,
    rulesetsOutputPath: null,
    expectedMainCommit: null,
    verifyPath: null,
    selfTest: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output') args.outputPath = argv[++index]
    else if (arg === '--branch-output') args.branchOutputPath = argv[++index]
    else if (arg === '--rulesets-output') args.rulesetsOutputPath = argv[++index]
    else if (arg === '--expected-main') {
      const value = argv[++index]
      if (!value) fail('github_main_protection_snapshot_expected_main_invalid')
      args.expectedMainCommit = value
    }
    else if (arg === '--verify') args.verifyPath = argv[++index]
    else if (arg === '--self-test') args.selfTest = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else fail(`github_main_protection_snapshot_unknown_arg:${arg}`)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Usage: node tools/collect_github_main_protection_snapshot.mjs [--output <packet.json>] [--branch-output <branch.json>] [--rulesets-output <rulesets.json>] [--expected-main <40-hex>]')
    console.log('       node tools/collect_github_main_protection_snapshot.mjs --verify <packet.json>')
    console.log('       node tools/collect_github_main_protection_snapshot.mjs --self-test')
    return
  }
  if (args.selfTest) {
    const result = runSelfTest()
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exit(1)
    return
  }
  if (args.verifyPath) {
    console.log(JSON.stringify(await verifySnapshotFile(args.verifyPath), null, 2))
    return
  }
  const { packet, outputs } = await collectGitHubMainProtectionSnapshot(args)
  const response = {
    ok: true,
    contract: packet.contract,
    output: outputs.packet,
    branchOutput: outputs.branch,
    rulesetsOutput: outputs.rulesets,
    digest: packet.digest,
    assessmentOk: packet.assessment.ok,
    failures: packet.assessment.failures,
    currentAction: packet.currentAction,
    controls: packet.controls,
  }
  assertNoSecretShape(response)
  console.log(JSON.stringify(response, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.message || error)
    process.exit(1)
  })
}
