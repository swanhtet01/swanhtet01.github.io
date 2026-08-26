import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GITHUB_MAIN_PROTECTION_SNAPSHOT_CONTRACT,
  buildGitHubMainProtectionSnapshot,
  collectGitHubMainProtectionSnapshot,
  sanitizeBranchSnapshot,
  sanitizeRulesetsSnapshot,
  validateGitHubMainProtectionSnapshot,
} from './collect_github_main_protection_snapshot.mjs'
import { REQUIRED_MAIN_CHECKS } from './verify_github_main_protection.mjs'

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
  id: 123,
  node_id: 'private-node-id-not-needed',
  name: 'SuperMega main release gate',
  target: 'branch',
  enforcement: 'active',
  conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
  rules: [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    { type: 'pull_request', parameters: { required_review_thread_resolution: true, required_approving_review_count: 1 } },
    {
      type: 'required_status_checks',
      parameters: { required_status_checks: REQUIRED_MAIN_CHECKS.map((context) => ({ context, integration_id: 999 })) },
    },
  ],
}]

test('sanitizes branch snapshots down to verifier fields and removes identity details', () => {
  const sanitized = sanitizeBranchSnapshot(branch)
  assert.equal(sanitized.name, 'main')
  assert.equal(sanitized.commit.sha, 'a'.repeat(40))
  const text = JSON.stringify(sanitized)
  assert.ok(!text.includes('private@example.com'))
  assert.ok(!text.includes('PGP SIGNATURE'))
})

test('builds failing live-style packet for unprotected main and empty rulesets', () => {
  const packet = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch,
    rulesets: [],
    tokenEnv: null,
  })
  assert.equal(packet.contract, GITHUB_MAIN_PROTECTION_SNAPSHOT_CONTRACT)
  assert.equal(packet.assessment.ok, false)
  assert.ok(packet.assessment.failures.includes('main_unprotected'))
  assert.equal(packet.currentAction, 'apply_github_main_protection_after_owner_approval')
  assert.equal(packet.controls.githubWritesPerformed, false)
  assert.equal(validateGitHubMainProtectionSnapshot(packet), packet)
})

test('passes when an active ruleset covers main with required checks', () => {
  const packet = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch,
    rulesets,
    tokenEnv: 'GITHUB_TOKEN',
  })
  assert.equal(packet.assessment.ok, true)
  assert.equal(packet.source.tokenPresent, true)
  assert.equal(packet.source.tokenValueExposed, false)
  assert.equal(packet.currentAction, 'main_protection_verified_continue_to_review_branch_push')
  assert.deepEqual(packet.assessment.observedRequiredChecks.sort(), [...REQUIRED_MAIN_CHECKS].sort())
  assert.ok(!JSON.stringify(packet).includes('ghp_'))
})

test('ruleset sanitizer keeps only protection-relevant fields', () => {
  const sanitized = sanitizeRulesetsSnapshot(rulesets)
  assert.deepEqual(sanitized[0].rules.map((rule) => rule.type), ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks'])
  assert.ok(!JSON.stringify(sanitized).includes('private-node-id-not-needed'))
  assert.ok(!JSON.stringify(sanitized).includes('integration_id'))
})

test('collector expands ruleset list entries before protection assessment', async () => {
  const calls = []
  const listRuleset = {
    id: 123,
    name: 'SuperMega main release gate',
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [],
  }
  const request = async (url) => {
    calls.push(String(url))
    let body
    if (String(url).endsWith('/branches/main')) body = branch
    else if (String(url).endsWith('/rulesets')) body = [listRuleset]
    else if (String(url).endsWith('/rulesets/123')) body = rulesets[0]
    else throw new Error(`unexpected_url:${url}`)
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(body)
      },
    }
  }
  const { packet } = await collectGitHubMainProtectionSnapshot({ request, env: {} })
  assert.equal(packet.assessment.ok, true)
  assert.ok(calls.some((url) => url.endsWith('/rulesets/123')))
  assert.deepEqual(packet.rulesets[0].rules.map((rule) => rule.type), ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks'])
})

test('rejects tampered write controls and digest mismatch', () => {
  const packet = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch,
    rulesets: [],
  })
  assert.throws(() => validateGitHubMainProtectionSnapshot({
    ...packet,
    controls: { ...packet.controls, githubWritesPerformed: true },
  }), /github_main_protection_snapshot_control_not_false/)
  assert.throws(() => validateGitHubMainProtectionSnapshot({
    ...packet,
    currentAction: 'main_protection_verified_continue_to_review_branch_push',
  }), /github_main_protection_snapshot_action_invalid/)
})
