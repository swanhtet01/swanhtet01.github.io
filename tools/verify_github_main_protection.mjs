#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const GITHUB_MAIN_PROTECTION_CONTRACT = 'supermega.github-main-protection.v1'
export const REQUIRED_MAIN_CHECKS = [
  'SuperMega App CI',
  'Dependency Security Audit',
  'Kernel Console - Verify & Owner-Gated Release',
]

const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024
const PASSING_ENFORCEMENT = new Set(['active'])
const MAIN_REFS = new Set(['main', 'refs/heads/main', '~DEFAULT_BRANCH'])

function sha256(value) {
  return createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex').toUpperCase()
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(code) {
  throw new Error(code)
}

function readSnapshot(path) {
  const resolved = resolve(path)
  const linkMetadata = lstatSync(resolved)
  if (linkMetadata.isSymbolicLink()) fail('github_main_protection_snapshot_file_invalid')
  const metadata = statSync(resolved)
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_SNAPSHOT_BYTES) fail('github_main_protection_snapshot_file_invalid')
  const raw = readFileSync(resolved, 'utf8')
  if (Buffer.byteLength(raw, 'utf8') !== metadata.size) fail('github_main_protection_snapshot_file_changed')
  return { path: resolved, raw, digest: sha256(raw), json: JSON.parse(raw) }
}

function unwrapConnectorContent(value) {
  if (isRecord(value?.structuredContent) && typeof value.structuredContent.content === 'string') {
    return JSON.parse(value.structuredContent.content)
  }
  if (typeof value?.content === 'string') {
    try {
      return JSON.parse(value.content)
    } catch {}
  }
  return value
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function ruleTypes(ruleset) {
  return new Set(asArray(ruleset?.rules).map((rule) => typeof rule === 'string' ? rule : rule?.type).filter(Boolean))
}

function ruleByType(ruleset, type) {
  return asArray(ruleset?.rules).find((rule) => (typeof rule === 'string' ? rule : rule?.type) === type)
}

function refListCoversMain(include = []) {
  if (!Array.isArray(include) || include.length === 0) return true
  return include.some((ref) => {
    const value = String(ref || '').trim()
    return MAIN_REFS.has(value) || value === '*' || value === 'refs/heads/*'
  })
}

function refListExcludesMain(exclude = []) {
  if (!Array.isArray(exclude)) return false
  return exclude.some((ref) => MAIN_REFS.has(String(ref || '').trim()))
}

function rulesetCoversMain(ruleset) {
  if (!isRecord(ruleset) || ruleset.target !== 'branch' || !PASSING_ENFORCEMENT.has(ruleset.enforcement)) return false
  const refName = ruleset.conditions?.ref_name
  if (!isRecord(refName)) return true
  return refListCoversMain(refName.include) && !refListExcludesMain(refName.exclude)
}

function legacyRequiredChecks(branch) {
  const checks = branch?.protection?.required_status_checks
  const names = new Set()
  for (const context of asArray(checks?.contexts)) names.add(String(context))
  for (const check of asArray(checks?.checks)) names.add(String(check?.context || check?.name || ''))
  return names
}

function rulesetRequiredChecks(rulesets) {
  const names = new Set()
  for (const ruleset of asArray(rulesets).filter(rulesetCoversMain)) {
    const rule = ruleByType(ruleset, 'required_status_checks')
    const parameters = typeof rule === 'string' ? null : rule?.parameters
    for (const context of asArray(parameters?.contexts)) names.add(String(context))
    for (const check of asArray(parameters?.required_status_checks)) names.add(String(check?.context || check?.name || ''))
  }
  return names
}

function hasLegacyPullRequestProtection(branch) {
  return isRecord(branch?.protection?.required_pull_request_reviews)
}

function hasLegacyForcePushBlock(branch) {
  return branch?.protection?.allow_force_pushes?.enabled === false
}

function hasLegacyDeletionBlock(branch) {
  return branch?.protection?.allow_deletions?.enabled === false
}

function hasLegacyConversationResolution(branch) {
  return branch?.protection?.required_conversation_resolution?.enabled === true
}

function pullRequestRuleRequiresResolution(rule) {
  const parameters = typeof rule === 'string' ? null : rule?.parameters
  return parameters?.required_review_thread_resolution === true
    || parameters?.require_review_thread_resolution === true
    || parameters?.requires_conversation_resolution === true
}

function ruleSummary(rulesets) {
  return asArray(rulesets).filter(rulesetCoversMain).map((ruleset) => ({
    id: ruleset.id ?? null,
    name: String(ruleset.name || ''),
    enforcement: ruleset.enforcement,
    target: ruleset.target,
    rules: [...ruleTypes(ruleset)].sort(),
  }))
}

export function assessGitHubMainProtection(input = {}) {
  const branch = unwrapConnectorContent(input.branch)
  const rulesets = unwrapConnectorContent(input.rulesets)
  if (!isRecord(branch)) fail('github_main_protection_branch_snapshot_invalid')
  if (!Array.isArray(rulesets)) fail('github_main_protection_rulesets_snapshot_invalid')

  const activeRulesets = asArray(rulesets).filter(rulesetCoversMain)
  const activeRuleTypes = new Set(activeRulesets.flatMap((ruleset) => [...ruleTypes(ruleset)]))
  const legacyChecks = legacyRequiredChecks(branch)
  const rulesetChecks = rulesetRequiredChecks(rulesets)
  const requiredChecks = new Set([...legacyChecks, ...rulesetChecks].filter(Boolean))

  const failures = []
  if (branch.name !== 'main') failures.push('main_branch_snapshot_missing')
  if (branch.protected !== true && activeRulesets.length === 0) failures.push('main_unprotected')
  if (!hasLegacyForcePushBlock(branch) && !activeRuleTypes.has('non_fast_forward')) failures.push('force_push_block_missing')
  if (!hasLegacyDeletionBlock(branch) && !activeRuleTypes.has('deletion')) failures.push('branch_deletion_block_missing')
  if (!hasLegacyPullRequestProtection(branch) && !activeRuleTypes.has('pull_request')) failures.push('pull_request_required_missing')

  const pullRequestRules = activeRulesets.map((ruleset) => ruleByType(ruleset, 'pull_request')).filter(Boolean)
  if (!hasLegacyConversationResolution(branch) && !pullRequestRules.some(pullRequestRuleRequiresResolution)) {
    failures.push('conversation_resolution_required_missing')
  }

  for (const check of REQUIRED_MAIN_CHECKS) {
    if (!requiredChecks.has(check)) failures.push(`required_status_check_missing:${check}`)
  }

  return {
    ok: failures.length === 0,
    contract: GITHUB_MAIN_PROTECTION_CONTRACT,
    repository: 'swanhtet01/swanhtet01.github.io',
    branch: 'main',
    requiredChecks: [...REQUIRED_MAIN_CHECKS],
    observedRequiredChecks: [...requiredChecks].sort(),
    evidence: {
      branchProtected: branch.protected === true,
      legacyProtectionEnabled: branch.protection?.enabled === true,
      legacyForcePushBlocked: hasLegacyForcePushBlock(branch),
      legacyDeletionBlocked: hasLegacyDeletionBlock(branch),
      legacyPullRequestRequired: hasLegacyPullRequestProtection(branch),
      legacyConversationResolutionRequired: hasLegacyConversationResolution(branch),
      activeMainRulesets: ruleSummary(rulesets),
    },
    failures,
    controls: {
      mode: 'snapshot_verification',
      githubWritesPerformed: false,
      repositorySettingsMutated: false,
      branchMutated: false,
    },
  }
}

function passingLegacyFixture() {
  return {
    branch: {
      name: 'main',
      protected: true,
      protection: {
        enabled: true,
        allow_force_pushes: { enabled: false },
        allow_deletions: { enabled: false },
        required_pull_request_reviews: { required_approving_review_count: 1 },
        required_conversation_resolution: { enabled: true },
        required_status_checks: {
          contexts: REQUIRED_MAIN_CHECKS,
          checks: [],
        },
      },
    },
    rulesets: [],
  }
}

function passingRulesetFixture() {
  return {
    branch: { name: 'main', protected: false, protection: { enabled: false } },
    rulesets: [{
      id: 1,
      name: 'protect main',
      target: 'branch',
      enforcement: 'active',
      conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
      rules: [
        { type: 'deletion' },
        { type: 'non_fast_forward' },
        { type: 'pull_request', parameters: { required_review_thread_resolution: true } },
        { type: 'required_status_checks', parameters: { required_status_checks: REQUIRED_MAIN_CHECKS.map((context) => ({ context })) } },
      ],
    }],
  }
}

function runSelfTest() {
  const legacy = assessGitHubMainProtection(passingLegacyFixture())
  const ruleset = assessGitHubMainProtection(passingRulesetFixture())
  const currentMissing = assessGitHubMainProtection({ branch: { name: 'main', protected: false, protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } } }, rulesets: [] })
  const checks = {
    legacy_branch_protection_passes: legacy.ok === true,
    active_ruleset_protection_passes: ruleset.ok === true,
    missing_protection_fails_closed: currentMissing.ok === false && currentMissing.failures.includes('main_unprotected'),
  }
  const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ok: failedChecks.length === 0,
    contract: `${GITHUB_MAIN_PROTECTION_CONTRACT}.self-test`,
    checks,
    failedChecks,
  }
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--self-test') return { selfTest: true }
  const branchIndex = argv.indexOf('--branch-file')
  const rulesetsIndex = argv.indexOf('--rulesets-file')
  if (branchIndex < 0 || rulesetsIndex < 0 || !argv[branchIndex + 1] || !argv[rulesetsIndex + 1]) fail('github_main_protection_usage_invalid')
  return { branchFile: argv[branchIndex + 1], rulesetsFile: argv[rulesetsIndex + 1] }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (args.selfTest) {
      const result = runSelfTest()
      console.log(JSON.stringify(result, null, 2))
      if (!result.ok) process.exitCode = 1
    } else {
      const branch = readSnapshot(args.branchFile)
      const rulesets = readSnapshot(args.rulesetsFile)
      const result = assessGitHubMainProtection({ branch: branch.json, rulesets: rulesets.json })
      console.log(JSON.stringify({
        ...result,
        snapshotDigests: {
          branch: branch.digest,
          rulesets: rulesets.digest,
        },
      }, null, 2))
      if (!result.ok) process.exitCode = 1
    }
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      contract: GITHUB_MAIN_PROTECTION_CONTRACT,
      error: String(error?.message || 'github_main_protection_failed').slice(0, 240),
      controls: {
        githubWritesPerformed: false,
        repositorySettingsMutated: false,
        branchMutated: false,
      },
    }, null, 2))
    process.exitCode = 1
  }
}
