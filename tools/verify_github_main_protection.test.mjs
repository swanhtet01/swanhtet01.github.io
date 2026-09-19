import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import {
  assessGitHubMainProtection,
  GITHUB_MAIN_PROTECTION_CONTRACT,
  REQUIRED_MAIN_CHECKS,
} from './verify_github_main_protection.mjs'

function protectedBranch(overrides = {}) {
  return {
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
    ...overrides,
  }
}

function protectedRuleset(overrides = {}) {
  return {
    id: 1001,
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
    ...overrides,
  }
}

test('accepts complete legacy branch protection snapshot', () => {
  const result = assessGitHubMainProtection({ branch: protectedBranch(), rulesets: [] })
  assert.equal(result.ok, true)
  assert.equal(result.contract, GITHUB_MAIN_PROTECTION_CONTRACT)
  assert.equal(result.controls.githubWritesPerformed, false)
  assert.deepEqual(result.requiredChecks, REQUIRED_MAIN_CHECKS)
})

test('accepts active main ruleset protection snapshot', () => {
  const result = assessGitHubMainProtection({
    branch: { name: 'main', protected: false, protection: { enabled: false } },
    rulesets: [protectedRuleset()],
  })
  assert.equal(result.ok, true)
  assert.equal(result.evidence.activeMainRulesets.length, 1)
})

test('rejects current unprotected public branch and empty rulesets shape', () => {
  const result = assessGitHubMainProtection({
    branch: { name: 'main', protected: false, protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } } },
    rulesets: [],
  })
  assert.equal(result.ok, false)
  assert.ok(result.failures.includes('main_unprotected'))
  assert.ok(result.failures.includes('force_push_block_missing'))
  assert.ok(result.failures.includes('branch_deletion_block_missing'))
  assert.ok(result.failures.includes('pull_request_required_missing'))
  assert.ok(result.failures.includes('conversation_resolution_required_missing'))
  assert.ok(result.failures.includes('required_status_check_missing:SuperMega App CI'))
})

test('rejects inactive rulesets and missing required checks', () => {
  const inactive = assessGitHubMainProtection({
    branch: { name: 'main', protected: false, protection: { enabled: false } },
    rulesets: [protectedRuleset({ enforcement: 'evaluate' })],
  })
  assert.equal(inactive.ok, false)
  assert.ok(inactive.failures.includes('main_unprotected'))

  const missingCheck = assessGitHubMainProtection({
    branch: protectedBranch({
      protection: {
        ...protectedBranch().protection,
        required_status_checks: { contexts: REQUIRED_MAIN_CHECKS.slice(1), checks: [] },
      },
    }),
    rulesets: [],
  })
  assert.equal(missingCheck.ok, false)
  assert.ok(missingCheck.failures.includes('required_status_check_missing:SuperMega App CI'))
})

test('CLI verifies exported snapshots without mutating GitHub', () => {
  const root = mkdtempSync(join(tmpdir(), 'supermega-github-protection-'))
  const branchFile = join(root, 'branch.json')
  const rulesetsFile = join(root, 'rulesets.json')
  writeFileSync(branchFile, JSON.stringify(protectedBranch(), null, 2))
  writeFileSync(rulesetsFile, JSON.stringify([], null, 2))

  const pass = spawnSync(process.execPath, ['tools/verify_github_main_protection.mjs', '--branch-file', branchFile, '--rulesets-file', rulesetsFile], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.equal(pass.status, 0, pass.stderr)
  const receipt = JSON.parse(pass.stdout)
  assert.equal(receipt.ok, true)
  assert.equal(receipt.controls.repositorySettingsMutated, false)
  assert.match(receipt.snapshotDigests.branch, /^[0-9A-F]{64}$/)

  writeFileSync(branchFile, JSON.stringify({ name: 'main', protected: false, protection: { enabled: false } }, null, 2))
  const fail = spawnSync(process.execPath, ['tools/verify_github_main_protection.mjs', '--branch-file', branchFile, '--rulesets-file', rulesetsFile], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.notEqual(fail.status, 0)
  assert.match(fail.stdout, /main_unprotected/)
})
