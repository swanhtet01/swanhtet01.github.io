import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  GITHUB_MAIN_PROTECTION_PROPOSAL_CONTRACT,
  buildGitHubMainProtectionPacket,
  validateGitHubMainProtectionPacket,
} from './prepare_github_main_protection_packet.mjs'
import { assessGitHubMainProtection, REQUIRED_MAIN_CHECKS } from './verify_github_main_protection.mjs'

const sourceReceipts = [
  'package.json',
  'tools/verify_github_main_protection.mjs',
  'tools/prepare_github_main_protection_packet.mjs',
  'tools/apply_github_main_protection.mjs',
].map((path) => ({ path, digest: `sha256:${createHash('sha256').update(path).digest('hex')}` }))

function packet() {
  return buildGitHubMainProtectionPacket({ sourceReceipts })
}

test('builds an owner-gated GitHub ruleset proposal that satisfies the verifier', () => {
  const built = packet()
  assert.equal(built.contract, GITHUB_MAIN_PROTECTION_PROPOSAL_CONTRACT)
  assert.equal(built.repository, 'swanhtet01/swanhtet01.github.io')
  assert.equal(built.mode, 'owner_approval_required')
  assert.equal(built.controls.githubWritesApproved, false)
  assert.equal(built.controls.githubWritesPerformed, false)
  assert.equal(built.githubApi.method, 'POST')
  assert.equal(built.githubApi.path, '/repos/swanhtet01/swanhtet01.github.io/rulesets')
  assert.equal(built.applicator.tool, 'tools/apply_github_main_protection.mjs')
  assert.equal(built.applicator.defaultMode, 'plan_only_no_github_write')
  assert.equal(built.applicator.executeRequiresExactOwnerApproval, true)
  assert.equal(built.applicator.credentialValueExposed, false)
  assert.deepEqual(built.proposedRuleset.bypass_actors, [])
  assert.deepEqual(built.proposedRuleset.conditions.ref_name.include, ['refs/heads/main'])

  const assessed = assessGitHubMainProtection({
    branch: { name: 'main', protected: false, protection: { enabled: false } },
    rulesets: [built.proposedRuleset],
  })
  assert.equal(assessed.ok, true)
  assert.deepEqual(assessed.requiredChecks, REQUIRED_MAIN_CHECKS)
  assert.deepEqual(assessed.failures, [])
  assert.deepEqual(validateGitHubMainProtectionPacket(built), built)
})

test('proposal rejects bypasses, weak PR settings, missing checks, and tampered digests', () => {
  const built = packet()
  assert.throws(() => validateGitHubMainProtectionPacket({
    ...built,
    proposedRuleset: { ...built.proposedRuleset, bypass_actors: [{ actor_type: 'User', actor_id: 1, bypass_mode: 'always' }] },
  }), /github_main_protection_proposal_bypass_invalid/)
  assert.throws(() => validateGitHubMainProtectionPacket({
    ...built,
    proposedRuleset: {
      ...built.proposedRuleset,
      rules: built.proposedRuleset.rules.map((rule) => rule.type === 'pull_request'
        ? { ...rule, parameters: { ...rule.parameters, required_review_thread_resolution: false } }
        : rule),
    },
  }), /github_main_protection_proposal_conversations_invalid/)
  assert.throws(() => validateGitHubMainProtectionPacket({
    ...built,
    proposedRuleset: {
      ...built.proposedRuleset,
      rules: built.proposedRuleset.rules.map((rule) => rule.type === 'required_status_checks'
        ? { ...rule, parameters: { ...rule.parameters, required_status_checks: rule.parameters.required_status_checks.slice(1) } }
        : rule),
    },
  }), /github_main_protection_proposal_checks_invalid/)
  assert.throws(() => validateGitHubMainProtectionPacket({ ...built, digest: `sha256:${'f'.repeat(64)}` }), /github_main_protection_proposal_digest_invalid/)
})

test('proposal does not include secret-bearing command material or broader release authority', () => {
  const text = JSON.stringify(packet())
  assert.doesNotMatch(text, /Authorization|Bearer\s+|ghp_|github_pat_|sk-[A-Za-z0-9_-]+/i)
  assert.match(text, /I do not approve push, PR creation, merge, deployment, Supabase mutation/)
})
