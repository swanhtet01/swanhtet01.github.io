import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GITHUB_MAIN_PROTECTION_APPLY_CONTRACT,
  applyGitHubMainProtectionWithClient,
  buildApplyPlan,
  buildGitHubMainProtectionApplyFailureReceipt,
  selectRulesetAction,
  validateApplyReport,
  validateOwnerApproval,
} from './apply_github_main_protection.mjs'
import {
  buildGitHubMainProtectionPacket,
} from './prepare_github_main_protection_packet.mjs'

const approval = 'I approve one GitHub repository settings write to create or update the main protection ruleset for swanhtet01/swanhtet01.github.io using the reviewed SuperMega main release gate proposal only. I do not approve push, PR creation, merge, deployment, Supabase mutation, credential change, customer contact, payment, stock, domain, hosted-write, or managed activation.'

const sourceReceipts = [
  'package.json',
  'tools/verify_github_main_protection.mjs',
  'tools/prepare_github_main_protection_packet.mjs',
  'tools/apply_github_main_protection.mjs',
].map((path) => ({ path, digest: `sha256:${'0'.repeat(64)}` }))

function proposalReceipt() {
  const packet = buildGitHubMainProtectionPacket({ sourceReceipts })
  return {
    path: '/tmp/github-main-protection-proposal.json',
    digest: `sha256:${'1'.repeat(64)}`,
    packet,
  }
}

function gitState() {
  return {
    branch: 'codex/release-stack-integration-rehearsal-20260825',
    head: 'c280a33bee349b25468a39a16a8cd2769b2f0de7',
    clean: true,
  }
}

function branchSnapshot() {
  return {
    name: 'main',
    protected: false,
    protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
  }
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body)
    },
  }
}

function fakeRequest({ beforeRulesets = [], afterRulesets = null, writeStatus = 201 } = {}) {
  const calls = []
  const request = async (url, options = {}) => {
    const path = new URL(url).pathname.replace('/repos/swanhtet01/swanhtet01.github.io', '')
    calls.push({
      path,
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body) : null,
      authHeader: options.headers?.Authorization ? 'present' : 'missing',
    })
    if (path === '/rulesets' && (options.method || 'GET') === 'GET') {
      return response(200, calls.filter((call) => call.path === '/rulesets' && call.method === 'GET').length === 1
        ? beforeRulesets
        : afterRulesets ?? beforeRulesets)
    }
    if (path === '/branches/main' && (options.method || 'GET') === 'GET') return response(200, branchSnapshot())
    if (path === '/rulesets' && options.method === 'POST') return response(writeStatus, { id: 9 })
    if (path === '/rulesets/7' && options.method === 'PUT') return response(writeStatus, { id: 7 })
    return response(404, { message: 'not found' })
  }
  return { request, calls }
}

async function failureReceipt(action) {
  try {
    await action()
    assert.fail('expected GitHub main-protection apply failure')
  } catch (error) {
    return buildGitHubMainProtectionApplyFailureReceipt(error)
  }
}

test('builds a plan-only applicator report without token or write execution', () => {
  const plan = buildApplyPlan({ proposalReceipt: proposalReceipt(), gitState: gitState(), env: {} })
  assert.equal(plan.contract, GITHUB_MAIN_PROTECTION_APPLY_CONTRACT)
  assert.equal(plan.digestScope, 'utf8_compact_json_without_digest')
  assert.equal(plan.mode, 'plan_only_no_github_write')
  assert.match(plan.digest, /^sha256:[0-9a-f]{64}$/)
  assert.equal(validateApplyReport(plan, { expectedMode: 'plan_only_no_github_write' }), plan)
  assert.equal(plan.controls.githubWriteAttempted, false)
  assert.equal(plan.controls.githubWritesPerformed, false)
  assert.equal(plan.controls.githubWriteOutcome, 'confirmed_not_performed')
  assert.equal(plan.controls.githubWriteRetryAllowed, false)
  assert.equal(plan.controls.repositorySettingsMutated, false)
  assert.equal(plan.token.present, false)
  assert.equal(plan.candidate.expectedHead, gitState().head)
  assert.equal(plan.candidate.expectedHeadMatched, true)
  assert.equal(plan.candidate.expectedHeadRequiredForExecute, true)
  assert.equal(plan.possibleWrite.headers.Authorization, 'Bearer <redacted>')
  assert.equal(plan.possibleWrite.headers['Content-Type'], 'application/json')
  assert.doesNotMatch(JSON.stringify(plan), /ghp_|github_pat_|Bearer\s+[A-Za-z0-9._-]{8,}/)
})

test('rejects tampered plan reports before owner execution', () => {
  const plan = buildApplyPlan({ proposalReceipt: proposalReceipt(), gitState: gitState(), env: {}, expectedHead: gitState().head })
  assert.throws(
    () => validateApplyReport({ ...plan, mode: 'executed_owner_approved_github_settings_write' }, { expectedMode: 'plan_only_no_github_write' }),
    /github_main_protection_apply_report_digest_invalid/,
  )
  assert.throws(
    () => validateApplyReport({ ...plan, digest: `sha256:${'f'.repeat(64)}` }, { expectedMode: 'plan_only_no_github_write' }),
    /github_main_protection_apply_report_digest_invalid/,
  )
  assert.throws(
    () => validateApplyReport({ ...plan, possibleWrite: { ...plan.possibleWrite, headers: { ...plan.possibleWrite.headers, Authorization: 'Bearer ghp_shouldnotappear_12345678901234567890' } }, digest: plan.digest }, { expectedMode: 'plan_only_no_github_write' }),
    /github_main_protection_apply_report_digest_invalid/,
  )
})

test('requires exact owner approval before execution', () => {
  const proposal = proposalReceipt().packet
  assert.equal(validateOwnerApproval({ proposal, env: { SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL: approval } }).approved, true)
  assert.throws(() => validateOwnerApproval({ proposal, env: {}, execute: true }), /github_main_protection_apply_owner_approval_required/)
  assert.throws(() => validateOwnerApproval({ proposal, env: { SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL: `${approval} ` }, execute: true }), /github_main_protection_apply_owner_approval_required/)
  assert.throws(() => validateOwnerApproval({ proposal, env: { SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL: approval.replace('one GitHub', 'two GitHub') }, execute: true }), /github_main_protection_apply_owner_approval_required/)
})

test('selects create, update, and ambiguous ruleset states safely', () => {
  assert.deepEqual(selectRulesetAction([]), {
    action: 'create',
    method: 'POST',
    path: '/repos/swanhtet01/swanhtet01.github.io/rulesets',
    rulesetId: null,
  })
  assert.deepEqual(selectRulesetAction([{ id: 7, name: 'SuperMega main release gate', target: 'branch' }]), {
    action: 'update',
    method: 'PUT',
    path: '/repos/swanhtet01/swanhtet01.github.io/rulesets/7',
    rulesetId: 7,
  })
  assert.throws(() => selectRulesetAction([
    { id: 7, name: 'SuperMega main release gate', target: 'branch' },
    { id: 8, name: 'SuperMega main release gate', target: 'branch' },
  ]), /github_main_protection_apply_ruleset_ambiguous/)
})

test('executes create path only with approval, token, and post-write verification', async () => {
  const proposed = proposalReceipt()
  const { request, calls } = fakeRequest({ beforeRulesets: [], afterRulesets: [{ id: 9, ...proposed.packet.proposedRuleset }] })
  const result = await applyGitHubMainProtectionWithClient({
    proposalReceipt: proposed,
    env: { SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL: approval, GITHUB_TOKEN: 'github_pat_testtokennotprinted_1234567890' },
    gitState: gitState(),
    expectedHead: gitState().head,
    request,
  })
  assert.equal(result.ok, true)
  assert.equal(result.action.kind, 'create')
  assert.equal(result.controls.githubWriteAttempted, true)
  assert.equal(result.controls.githubWritesPerformed, true)
  assert.equal(result.controls.githubWriteOutcome, 'confirmed_performed')
  assert.equal(result.controls.githubWriteRetryAllowed, false)
  assert.match(result.digest, /^sha256:[0-9a-f]{64}$/)
  assert.equal(validateApplyReport(result, { expectedMode: 'executed_owner_approved_github_settings_write' }), result)
  assert.equal(result.controls.branchMutated, false)
  assert.equal(result.controls.credentialValueExposed, false)
  assert.equal(result.candidate.expectedHead, gitState().head)
  assert.equal(result.candidate.expectedHeadMatched, true)
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    'GET /rulesets',
    'POST /rulesets',
    'GET /branches/main',
    'GET /rulesets',
  ])
  assert.doesNotMatch(JSON.stringify(result), /github_pat_testtokennotprinted/)
})

test('executes update path for exactly one existing named ruleset', async () => {
  const proposed = proposalReceipt()
  const existing = { id: 7, ...proposed.packet.proposedRuleset }
  const { request, calls } = fakeRequest({ beforeRulesets: [existing], afterRulesets: [existing], writeStatus: 200 })
  const result = await applyGitHubMainProtectionWithClient({
    proposalReceipt: proposed,
    env: { SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL: approval, GH_TOKEN: 'ghp_testtokennotprinted_1234567890' },
    gitState: gitState(),
    expectedHead: gitState().head,
    request,
  })
  assert.equal(result.action.kind, 'update')
  assert.equal(result.action.rulesetId, 7)
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    'GET /rulesets',
    'PUT /rulesets/7',
    'GET /branches/main',
    'GET /rulesets',
  ])
  assert.doesNotMatch(JSON.stringify(result), /ghp_testtokennotprinted/)
})

test('fails closed when post-write read-only verification does not pass', async () => {
  const proposed = proposalReceipt()
  const { request } = fakeRequest({ beforeRulesets: [], afterRulesets: [] })
  const receipt = await failureReceipt(() => applyGitHubMainProtectionWithClient({
    proposalReceipt: proposed,
    env: { SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL: approval, GITHUB_TOKEN: 'github_pat_testtokennotprinted_1234567890' },
    gitState: gitState(),
    expectedHead: gitState().head,
    request,
  }))
  assert.equal(receipt.error, 'github_main_protection_apply_write_outcome_unknown')
  assert.equal(receipt.controls.githubWriteAttempted, true)
  assert.equal(receipt.controls.githubWritesPerformed, null)
  assert.equal(receipt.controls.githubWriteOutcome, 'outcome_unknown')
  assert.equal(receipt.controls.githubWriteRetryAllowed, false)
  assert.equal(receipt.controls.repositorySettingsMutated, null)
})

test('write transport, malformed response, and read-back failures stay unknown without write retry', async () => {
  const proposed = proposalReceipt()
  const execute = (request) => applyGitHubMainProtectionWithClient({
    proposalReceipt: proposed,
    env: { SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL: approval, GITHUB_TOKEN: 'github_pat_testtokennotprinted_1234567890' },
    gitState: gitState(),
    expectedHead: gitState().head,
    request,
  })

  for (const failureKind of ['transport', 'malformed-response', 'read-back']) {
    const base = fakeRequest({ beforeRulesets: [], afterRulesets: [{ id: 9, ...proposed.packet.proposedRuleset }] })
    let writeCalls = 0
    const request = async (url, options = {}) => {
      const path = new URL(url).pathname.replace('/repos/swanhtet01/swanhtet01.github.io', '')
      if (options.method === 'POST') {
        writeCalls += 1
        if (failureKind === 'transport') throw new Error('socket_closed_after_request_start')
        if (failureKind === 'malformed-response') {
          return { ok: true, status: 201, async text() { return '{' } }
        }
      }
      if (failureKind === 'read-back' && writeCalls === 1 && path === '/branches/main') {
        throw new Error('read_back_connection_lost')
      }
      return base.request(url, options)
    }
    const receipt = await failureReceipt(() => execute(request))
    assert.equal(writeCalls, 1)
    assert.equal(receipt.error, 'github_main_protection_apply_write_outcome_unknown')
    assert.equal(receipt.controls.githubWriteAttempted, true)
    assert.equal(receipt.controls.githubWritesPerformed, null)
    assert.equal(receipt.controls.githubWriteOutcome, 'outcome_unknown')
    assert.equal(receipt.controls.githubWriteRetryAllowed, false)
    assert.equal(receipt.controls.repositorySettingsMutated, null)
    assert.doesNotMatch(JSON.stringify(receipt), /github_pat_testtokennotprinted/)
  }
})

test('explicit client rejection and pre-write validation retain confirmed no-write evidence', async () => {
  const proposed = proposalReceipt()
  const rejected = fakeRequest({ beforeRulesets: [], writeStatus: 422 })
  const rejectedReceipt = await failureReceipt(() => applyGitHubMainProtectionWithClient({
    proposalReceipt: proposed,
    env: { SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL: approval, GITHUB_TOKEN: 'github_pat_testtokennotprinted_1234567890' },
    gitState: gitState(),
    expectedHead: gitState().head,
    request: rejected.request,
  }))
  assert.equal(rejected.calls.filter((call) => call.method === 'POST').length, 1)
  assert.equal(rejectedReceipt.controls.githubWriteAttempted, true)
  assert.equal(rejectedReceipt.controls.githubWritesPerformed, false)
  assert.equal(rejectedReceipt.controls.githubWriteOutcome, 'confirmed_not_performed')
  assert.equal(rejectedReceipt.controls.githubWriteRetryAllowed, false)
  assert.equal(rejectedReceipt.controls.repositorySettingsMutated, false)

  const before = fakeRequest()
  const preWriteReceipt = await failureReceipt(() => applyGitHubMainProtectionWithClient({
    proposalReceipt: proposed,
    env: { SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL: approval, GITHUB_TOKEN: 'github_pat_testtokennotprinted_1234567890' },
    gitState: gitState(),
    expectedHead: 'f'.repeat(40),
    request: before.request,
  }))
  assert.deepEqual(before.calls, [])
  assert.equal(preWriteReceipt.error, 'github_main_protection_apply_expected_head_mismatch')
  assert.equal(preWriteReceipt.controls.githubWriteAttempted, false)
  assert.equal(preWriteReceipt.controls.githubWritesPerformed, false)
  assert.equal(preWriteReceipt.controls.githubWriteOutcome, 'confirmed_not_performed')
  assert.equal(preWriteReceipt.controls.githubWriteRetryAllowed, false)
  assert.equal(preWriteReceipt.controls.repositorySettingsMutated, false)
})

test('rejects missing or mismatched expected head before any GitHub write path', async () => {
  const proposed = proposalReceipt()
  const first = fakeRequest({ beforeRulesets: [], afterRulesets: [{ id: 9, ...proposed.packet.proposedRuleset }] })
  await assert.rejects(() => applyGitHubMainProtectionWithClient({
    proposalReceipt: proposed,
    env: { SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL: approval, GITHUB_TOKEN: 'github_pat_testtokennotprinted_1234567890' },
    gitState: gitState(),
    request: first.request,
  }), /github_main_protection_apply_expected_head_required/)
  assert.deepEqual(first.calls, [])

  const second = fakeRequest({ beforeRulesets: [], afterRulesets: [{ id: 9, ...proposed.packet.proposedRuleset }] })
  await assert.rejects(() => applyGitHubMainProtectionWithClient({
    proposalReceipt: proposed,
    env: { SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL: approval, GITHUB_TOKEN: 'github_pat_testtokennotprinted_1234567890' },
    gitState: gitState(),
    expectedHead: 'f'.repeat(40),
    request: second.request,
  }), /github_main_protection_apply_expected_head_mismatch/)
  assert.deepEqual(second.calls, [])
})
