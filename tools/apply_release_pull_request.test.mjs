import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RELEASE_PULL_REQUEST_APPLY_CONTRACT,
  applyReleasePullRequestWithClient,
  buildPullRequestPlan,
  validateOwnerApproval,
  validatePullRequestHandoff,
  validatePullRequestReport,
} from './apply_release_pull_request.mjs'
import {
  buildGitHubMainProtectionSnapshot,
} from './collect_github_main_protection_snapshot.mjs'

const repository = 'swanhtet01/swanhtet01.github.io'
const origin = `https://github.com/${repository}.git`
const branch = 'codex/release-stack-integration-rehearsal-20260825'
const commit = 'a'.repeat(40)
const main = 'b'.repeat(40)
const approvalEnv = 'SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL'

function packet(overrides = {}) {
  return {
    repository,
    candidate: {
      branch,
      commit,
      clean: true,
      ...(overrides.candidate || {}),
    },
    remote: {
      origin,
      mainCommit: main,
      candidateCommit: commit,
      candidateBranchState: 'exact',
      ...(overrides.remote || {}),
    },
    nextAction: {
      forcePushAllowed: false,
      mergeIncluded: false,
      deploymentIncluded: false,
      ...(overrides.nextAction || {}),
    },
    authority: {
      pushApproved: false,
      mergeApproved: false,
      workflowDispatchApproved: false,
      deploymentApproved: false,
      domainChangeApproved: false,
      providerMutationApproved: false,
      remoteWritesPerformed: false,
      providerWritesPerformed: false,
      credentialValuesInspected: false,
      ...(overrides.authority || {}),
    },
  }
}

function receipt(packetValue = packet()) {
  return {
    path: 'C:\\evidence\\supermega.release-handoff.generated.json',
    digest: `sha256:${'1'.repeat(64)}`,
    packet: {
      digest: `sha256:${'2'.repeat(64)}`,
      ...packetValue,
    },
  }
}

function mainProtectionReceipt() {
  return {
    path: 'C:\\evidence\\supermega.github-main-protection-snapshot.generated.json',
    digest: `sha256:${'3'.repeat(64)}`,
    packet: buildGitHubMainProtectionSnapshot({
      generatedAt: '2026-08-25T00:00:00.000Z',
      branch: {
        name: 'main',
        protected: false,
        commit: { sha: main },
        protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
      },
      rulesets: [{
        id: 1,
        name: 'SuperMega main release gate',
        target: 'branch',
        enforcement: 'active',
        conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
        rules: [
          { type: 'deletion' },
          { type: 'non_fast_forward' },
          { type: 'pull_request', parameters: { required_review_thread_resolution: true } },
          {
            type: 'required_status_checks',
            parameters: {
              required_status_checks: [
                { context: 'SuperMega App CI' },
                { context: 'Dependency Security Audit' },
                { context: 'Kernel Console - Verify & Owner-Gated Release' },
              ],
            },
          },
        ],
      }],
    }),
  }
}

function gitState(overrides = {}) {
  return {
    branch,
    head: commit,
    clean: true,
    origin,
    ...overrides,
  }
}

function stubGit({ remote = commit } = {}) {
  const calls = []
  const git = (args) => {
    calls.push([...args])
    const command = args.join(' ')
    if (command === 'symbolic-ref --short HEAD') return { status: 0, stdout: branch, stderr: '' }
    if (command === 'rev-parse HEAD') return { status: 0, stdout: commit, stderr: '' }
    if (command === 'status --porcelain=v1') return { status: 0, stdout: '', stderr: '' }
    if (command === 'remote get-url origin') return { status: 0, stdout: origin, stderr: '' }
    if (command === `ls-remote --heads origin ${branch}`) {
      return {
        status: 0,
        stdout: remote ? `${remote}\trefs/heads/${branch}` : '',
        stderr: '',
      }
    }
    throw new Error(`unexpected git call: ${command}`)
  }
  return { git, calls }
}

function response(status, json) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(json),
  }
}

test('plan is no-write and blocks execution until the remote branch is exact', () => {
  const unpublished = packet({ remote: { candidateCommit: null, candidateBranchState: 'unpublished' } })
  const plan = buildPullRequestPlan({
    handoffReceipt: receipt(unpublished),
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    gitState: gitState(),
    env: {},
  })
  assert.equal(plan.contract, RELEASE_PULL_REQUEST_APPLY_CONTRACT)
  assert.equal(validatePullRequestReport(plan, { expectedMode: 'plan_only_no_github_write' }), plan)
  assert.match(plan.digest, /^sha256:[0-9a-f]{64}$/)
  assert.equal(plan.digestScope, 'utf8_compact_json_without_digest')
  assert.equal(plan.mode, 'plan_only_no_github_write')
  assert.equal(plan.controls.githubWritesPerformed, false)
  assert.equal(plan.controls.pullRequestCreated, false)
  assert.equal(plan.remoteBefore.branchExactForPr, false)
  assert.deepEqual(plan.readiness.blockers, [
    'remote_review_branch_not_exact',
    'owner_approval_missing',
    'github_token_missing',
  ])
  assert.equal(plan.possibleWrite.method, 'POST')
  assert.equal(plan.possibleWrite.path, `/repos/${repository}/pulls`)
  assert.equal(plan.possibleWrite.payloadPreview.head, branch)
  assert.equal(plan.possibleWrite.payloadPreview.base, 'main')
  assert.equal(plan.existingPullRequestPolicy.checkedDuringPlan, false)
  assert.equal(plan.existingPullRequestPolicy.checkedImmediatelyBeforeCreate, true)
  assert.equal(
    plan.existingPullRequestPolicy.query,
    `GET /repos/${repository}/pulls?state=open&head=swanhtet01%3A${encodeURIComponent(branch)}&base=main&per_page=10`,
  )
  assert.equal(plan.existingPullRequestPolicy.exactOpenPullRequestResult, 'return_existing_pr_without_github_write')
  assert.equal(plan.existingPullRequestPolicy.duplicateCreationAllowed, false)
  assert.doesNotMatch(JSON.stringify(plan), /ghp_|github_pat_|Bearer\s+\w+/)
})

test('report validator rejects stale plan digests and wrong modes', () => {
  const plan = buildPullRequestPlan({
    handoffReceipt: receipt(),
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    gitState: gitState(),
    env: {},
  })
  assert.throws(
    () => validatePullRequestReport({ ...plan, mode: 'executed_owner_approved_github_pr_write' }, { expectedMode: 'plan_only_no_github_write' }),
    /release_pull_request_report_digest_invalid/,
  )
  assert.throws(
    () => validatePullRequestReport({ ...plan, digest: `sha256:${'0'.repeat(64)}` }, { expectedMode: 'plan_only_no_github_write' }),
    /release_pull_request_report_digest_invalid/,
  )
})

test('plan becomes executable only with exact branch, clean tree, approval, and token presence', () => {
  const gate = validatePullRequestHandoff(packet())
  const env = {
    [approvalEnv]: gate.approvalTemplate,
    GITHUB_TOKEN: 'placeholder',
  }
  const plan = buildPullRequestPlan({
    handoffReceipt: receipt(),
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    gitState: gitState(),
    env,
  })
  assert.equal(plan.readiness.executeReady, true)
  assert.deepEqual(plan.readiness.blockers, [])
  assert.equal(plan.approval.approved, true)
  assert.equal(plan.token.present, true)
  assert.equal(plan.token.valueExposed, false)
})

test('execution requires exact owner approval', () => {
  const gate = validatePullRequestHandoff(packet())
  assert.throws(
    () => validateOwnerApproval({ gate, env: {}, execute: true }),
    /release_pull_request_owner_approval_required/,
  )
  assert.equal(
    validateOwnerApproval({ gate, env: { [approvalEnv]: gate.approvalTemplate }, execute: true }).approved,
    true,
  )
})

test('execute creates one pull request after handoff and remote branch verification', async () => {
  const gate = validatePullRequestHandoff(packet())
  const { git, calls } = stubGit()
  const requests = []
  const result = await applyReleasePullRequestWithClient({
    handoffReceipt: receipt(),
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    env: { [approvalEnv]: gate.approvalTemplate, GITHUB_TOKEN: 'ghp_placeholder_token_value_0000' },
    git,
    verifyHandoff: async () => ({ ok: true, candidate: { branch, commit, clean: true } }),
    request: async (url, options) => {
      requests.push({ url, options })
      if (options.method === 'GET') return response(200, [])
      if (options.method === 'POST') {
        const body = JSON.parse(options.body)
        assert.equal(body.head, branch)
        assert.equal(body.base, 'main')
        assert.equal(body.draft, false)
        assert.ok(body.body.includes('source review only'))
        return response(201, {
          number: 42,
          state: 'open',
          html_url: 'https://github.com/swanhtet01/swanhtet01.github.io/pull/42',
          head: { ref: branch, sha: commit },
          base: { ref: 'main' },
        })
      }
      throw new Error(`unexpected request ${options.method}`)
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.mode, 'executed_owner_approved_github_pr_write')
  assert.equal(result.controls.githubWritesPerformed, true)
  assert.equal(result.controls.pullRequestCreated, true)
  assert.equal(result.controls.mergePerformed, false)
  assert.equal(result.controls.deploymentPerformed, false)
  assert.deepEqual(calls.filter((args) => args[0] === 'ls-remote'), [['ls-remote', '--heads', 'origin', branch]])
  assert.equal(requests.length, 2)
  assert.ok(String(requests[0].url).includes('/pulls?'))
  assert.ok(String(requests[1].url).endsWith('/pulls'))
  assert.doesNotMatch(JSON.stringify(result), /ghp_placeholder/)
})

test('execute returns no-write when an exact open PR already exists', async () => {
  const gate = validatePullRequestHandoff(packet())
  const { git } = stubGit()
  const result = await applyReleasePullRequestWithClient({
    handoffReceipt: receipt(),
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    env: { [approvalEnv]: gate.approvalTemplate, GITHUB_TOKEN: 'ghp_placeholder_token_value_0000' },
    git,
    verifyHandoff: async () => ({ ok: true, candidate: { branch, commit, clean: true } }),
    request: async () => response(200, [{
      number: 41,
      state: 'open',
      html_url: 'https://github.com/swanhtet01/swanhtet01.github.io/pull/41',
      head: { ref: branch, sha: commit },
      base: { ref: 'main' },
    }]),
  })
  assert.equal(result.mode, 'executed_owner_approved_existing_pr_no_write')
  assert.equal(result.controls.githubWritesPerformed, false)
  assert.equal(result.controls.pullRequestCreated, false)
  assert.equal(result.pullRequest.number, 41)
})

test('fails closed for wrong branch, unsafe authority, stale local head, and missing remote branch', async () => {
  assert.throws(
    () => validatePullRequestHandoff(packet({ candidate: { branch: 'main' } })),
    /release_pull_request_branch_invalid/,
  )
  assert.throws(
    () => validatePullRequestHandoff(packet({ authority: { mergeApproved: true } })),
    /release_pull_request_authority_invalid/,
  )
  assert.throws(
    () => buildPullRequestPlan({
      handoffReceipt: receipt(),
      gitState: gitState({ head: 'c'.repeat(40) }),
      env: {},
    }),
    /release_pull_request_local_state_mismatch/,
  )
  const gate = validatePullRequestHandoff(packet())
  const { git } = stubGit({ remote: null })
  await assert.rejects(
    applyReleasePullRequestWithClient({
      handoffReceipt: receipt(),
      mainProtectionSnapshotReceipt: mainProtectionReceipt(),
      env: { [approvalEnv]: gate.approvalTemplate, GITHUB_TOKEN: 'ghp_placeholder_token_value_0000' },
      git,
      verifyHandoff: async () => ({ ok: true, candidate: { branch, commit, clean: true } }),
      request: async () => response(200, []),
    }),
    /release_pull_request_remote_branch_not_exact/,
  )
})
