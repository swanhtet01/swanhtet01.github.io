import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RELEASE_PULL_REQUEST_APPLY_CONTRACT,
  RELEASE_PULL_REQUEST_OWNER_DIALOG_TIMEOUT_MS,
  RELEASE_PULL_REQUEST_OWNER_RECEIPT_TTL_MS,
  applyReleasePullRequestWithClient,
  buildPullRequestOwnerReceipt,
  buildPullRequestPlan,
  confirmPullRequestOwnerClick,
  consumePullRequestOwnerReceipt,
  renderPullRequestOwnerConfirmation,
  validateOwnerApproval,
  validatePullRequestHandoff,
  validatePullRequestOwnerReceipt,
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
const ownerConfirmedAt = new Date('2026-08-29T00:00:00.000Z')
let ownerReceiptSequence = 0

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

function ownerApproval({
  handoffReceipt = receipt(),
  protectionReceipt = mainProtectionReceipt(),
  confirmedAt = ownerConfirmedAt,
  now = new Date(ownerConfirmedAt.getTime() + 1_000),
} = {}) {
  ownerReceiptSequence += 1
  const executionChallenge = ownerReceiptSequence.toString(16).padStart(64, '0')
  const gate = validatePullRequestHandoff(handoffReceipt.packet)
  const packetValue = buildPullRequestOwnerReceipt({
    gate,
    handoffReceipt,
    mainProtectionSnapshotReceipt: protectionReceipt,
    executionChallenge,
    confirmedAt,
    nonce: (ownerReceiptSequence + 256).toString(16).padStart(64, '0'),
  })
  return {
    gate,
    handoffReceipt,
    protectionReceipt,
    ownerApprovalReceipt: { packet: packetValue },
    ownerApprovalChallenge: executionChallenge,
    now: () => now,
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

function stubGh({ statusToken = 'gho_placeholder_token_value_0000', authStatusOk = true } = {}) {
  const calls = []
  const gh = (args) => {
    calls.push([...args])
    const command = args.join(' ')
    if (command === 'auth status --hostname github.com') {
      return {
        status: authStatusOk ? 0 : 1,
        stdout: '',
        stderr: authStatusOk ? 'Logged in to github.com account swanhtet01 (keyring)' : 'not logged in',
        errorCode: null,
        signal: null,
      }
    }
    if (command === 'auth token --hostname github.com') {
      return {
        status: statusToken ? 0 : 1,
        stdout: statusToken || '',
        stderr: '',
        errorCode: null,
        signal: null,
      }
    }
    throw new Error(`unexpected gh call: ${command}`)
  }
  return { gh, calls }
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

test('plan remains owner-click blocked even with exact branch, clean tree, and token presence', () => {
  const plan = buildPullRequestPlan({
    handoffReceipt: receipt(),
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    gitState: gitState(),
    env: {
      SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL: 'plaintext must never approve',
      GITHUB_TOKEN: 'placeholder',
    },
  })
  assert.equal(plan.readiness.executeReady, false)
  assert.deepEqual(plan.readiness.blockers, ['owner_approval_missing'])
  assert.equal(plan.approval.env, null)
  assert.equal(plan.approval.method, 'none')
  assert.equal(plan.approval.approved, false)
  assert.equal(plan.token.present, true)
  assert.equal(plan.token.valueExposed, false)
})

test('plan can use authenticated GitHub CLI keyring as token readiness without exposing token value', () => {
  const { gh, calls } = stubGh()
  const plan = buildPullRequestPlan({
    handoffReceipt: receipt(),
    mainProtectionSnapshotReceipt: mainProtectionReceipt(),
    gitState: gitState(),
    env: {},
    gh,
    useGitHubCliAuth: true,
  })
  assert.equal(plan.readiness.executeReady, false)
  assert.deepEqual(plan.readiness.blockers, ['owner_approval_missing'])
  assert.equal(plan.token.present, true)
  assert.equal(plan.token.env, 'gh_cli')
  assert.equal(plan.token.source, 'github_cli_keyring')
  assert.equal(plan.token.valueExposed, false)
  assert.deepEqual(calls, [['auth', 'status', '--hostname', 'github.com']])
  assert.doesNotMatch(JSON.stringify(plan), /gho_placeholder/)
})

test('execution requires an exact current owner-click receipt and ignores plaintext approval', () => {
  const handoffReceipt = receipt()
  const protectionReceipt = mainProtectionReceipt()
  const gate = validatePullRequestHandoff(handoffReceipt.packet)
  assert.throws(
    () => validateOwnerApproval({
      gate,
      handoffReceipt,
      mainProtectionSnapshotReceipt: protectionReceipt,
      env: { SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL: gate.approvalTemplate },
      execute: true,
    }),
    /release_pull_request_owner_approval_required/,
  )
  const approved = ownerApproval({ handoffReceipt, protectionReceipt })
  const result = validateOwnerApproval({
    gate,
    handoffReceipt,
    mainProtectionSnapshotReceipt: protectionReceipt,
    ownerApprovalReceipt: approved.ownerApprovalReceipt,
    ownerApprovalChallenge: approved.ownerApprovalChallenge,
    execute: true,
    now: approved.now(),
  })
  assert.equal(result.env, null)
  assert.equal(result.method, 'in_process_owner_click_receipt')
  assert.equal(result.approved, true)
  assert.equal(result.receipt.consumed, false)
})

test('owner dialog is exact, default-No, ten-minute, and credential-isolated', () => {
  const handoffReceipt = receipt()
  const protectionReceipt = mainProtectionReceipt()
  const gate = validatePullRequestHandoff(handoffReceipt.packet)
  const message = renderPullRequestOwnerConfirmation({
    gate,
    handoffReceipt,
    mainProtectionSnapshotReceipt: protectionReceipt,
  })
  assert.match(message, new RegExp(branch.replaceAll('/', '\\/')))
  assert.match(message, new RegExp(commit))
  assert.match(message, /Into branch: main/)
  assert.match(message, /No is the default/)
  assert.match(message, /expires after 10 minutes/)

  let invocation = null
  const approved = confirmPullRequestOwnerClick(message, {
    platform: 'win32',
    spawn: (command, args, options) => {
      invocation = { command, args, options }
      return { status: 0, signal: null, error: null, stdout: 'APPROVED\r\n', stderr: '' }
    },
  })
  assert.equal(approved, true)
  assert.equal(invocation.command, 'powershell.exe')
  assert.equal(invocation.options.timeout, 600_000)
  assert.equal(RELEASE_PULL_REQUEST_OWNER_DIALOG_TIMEOUT_MS, RELEASE_PULL_REQUEST_OWNER_RECEIPT_TTL_MS)
  assert.match(invocation.args.join(' '), /MessageBoxDefaultButton\]::Button2/)
  assert.equal('GITHUB_TOKEN' in invocation.options.env, false)
  assert.equal('GH_TOKEN' in invocation.options.env, false)
  assert.equal('SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL' in invocation.options.env, false)
  assert.throws(
    () => confirmPullRequestOwnerClick(message, {
      platform: 'win32',
      spawn: () => ({ status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stdout: '', stderr: '' }),
    }),
    /release_pull_request_owner_receipt_confirmation_timed_out/,
  )
})

test('owner receipt binds handoff, protection snapshot, payload, challenge, and expiry', () => {
  const approved = ownerApproval()
  const validated = validatePullRequestOwnerReceipt(approved.ownerApprovalReceipt.packet, {
    gate: approved.gate,
    handoffReceipt: approved.handoffReceipt,
    mainProtectionSnapshotReceipt: approved.protectionReceipt,
    executionChallenge: approved.ownerApprovalChallenge,
    now: approved.now(),
  })
  assert.equal(validated.action.commit, commit)
  assert.equal(validated.action.branch, branch)
  assert.equal(validated.action.base, 'main')
  assert.equal(validated.action.pushIncluded, false)
  assert.equal(validated.action.mergeIncluded, false)
  assert.equal(validated.authority.pullRequestCreationApproved, true)
  assert.equal(validated.authority.deploymentApproved, false)
  assert.equal(
    Date.parse(validated.confirmation.expiresAt) - Date.parse(validated.confirmation.confirmedAt),
    RELEASE_PULL_REQUEST_OWNER_RECEIPT_TTL_MS,
  )
  assert.throws(
    () => validatePullRequestOwnerReceipt(approved.ownerApprovalReceipt.packet, {
      gate: approved.gate,
      handoffReceipt: approved.handoffReceipt,
      mainProtectionSnapshotReceipt: approved.protectionReceipt,
      executionChallenge: 'f'.repeat(64),
      now: approved.now(),
    }),
    /release_pull_request_owner_receipt_execution_seal_invalid/,
  )
  assert.throws(
    () => validatePullRequestOwnerReceipt(approved.ownerApprovalReceipt.packet, {
      gate: approved.gate,
      handoffReceipt: approved.handoffReceipt,
      mainProtectionSnapshotReceipt: approved.protectionReceipt,
      executionChallenge: approved.ownerApprovalChallenge,
      now: new Date(ownerConfirmedAt.getTime() + RELEASE_PULL_REQUEST_OWNER_RECEIPT_TTL_MS),
    }),
    /release_pull_request_owner_receipt_expired_or_not_current/,
  )
})

test('owner receipt is consumed exactly once in the same process', async () => {
  const approved = ownerApproval()
  const first = await consumePullRequestOwnerReceipt(approved.ownerApprovalReceipt)
  assert.equal(first.ok, true)
  assert.equal(first.packetDigest, approved.ownerApprovalReceipt.packet.digest)
  await assert.rejects(
    consumePullRequestOwnerReceipt(approved.ownerApprovalReceipt),
    /release_pull_request_owner_receipt_already_consumed/,
  )
})

test('execute creates one pull request after handoff and remote branch verification', async () => {
  const approved = ownerApproval()
  const { git, calls } = stubGit()
  const requests = []
  const sequence = []
  const result = await applyReleasePullRequestWithClient({
    handoffReceipt: approved.handoffReceipt,
    mainProtectionSnapshotReceipt: approved.protectionReceipt,
    ownerApprovalReceipt: approved.ownerApprovalReceipt,
    ownerApprovalChallenge: approved.ownerApprovalChallenge,
    now: approved.now,
    env: { GITHUB_TOKEN: 'ghp_placeholder_token_value_0000' },
    git,
    verifyHandoff: async () => ({ ok: true, candidate: { branch, commit, clean: true } }),
    consumeApprovalReceipt: async (ownerApprovalReceipt) => {
      sequence.push('consume')
      return { ok: true, packetDigest: ownerApprovalReceipt.packet.digest }
    },
    request: async (url, options) => {
      sequence.push(options.method)
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
  assert.equal(validatePullRequestReport(result, { expectedMode: 'executed_owner_approved_github_pr_write' }), result)
  assert.equal(result.controls.githubWritesPerformed, true)
  assert.equal(result.controls.pullRequestCreated, true)
  assert.equal(result.controls.ownerApprovalReceiptConsumed, true)
  assert.equal(result.approval.receipt.consumed, true)
  assert.equal(result.controls.mergePerformed, false)
  assert.equal(result.controls.deploymentPerformed, false)
  assert.equal(result.verification.releaseHandoffCurrent, true)
  assert.equal(result.verification.remoteBranchObservedAtCreate, commit)
  assert.equal(result.verification.remoteBranchExactAtCreate, true)
  assert.equal(result.verification.existingPullRequestCheckedBeforeCreate, true)
  assert.equal(result.verification.existingPullRequestResult, 'none_before_create')
  assert.equal(result.verification.duplicatePullRequestCreated, false)
  assert.deepEqual(calls.filter((args) => args[0] === 'ls-remote'), [['ls-remote', '--heads', 'origin', branch]])
  assert.equal(requests.length, 2)
  assert.deepEqual(sequence, ['consume', 'GET', 'POST'])
  assert.ok(String(requests[0].url).includes('/pulls?'))
  assert.ok(String(requests[1].url).endsWith('/pulls'))
  assert.doesNotMatch(JSON.stringify(result), /ghp_placeholder/)
})

test('execute can use GitHub CLI keyring token without exposing it in the report', async () => {
  const approved = ownerApproval()
  const { git } = stubGit()
  const { gh, calls } = stubGh()
  const result = await applyReleasePullRequestWithClient({
    handoffReceipt: approved.handoffReceipt,
    mainProtectionSnapshotReceipt: approved.protectionReceipt,
    ownerApprovalReceipt: approved.ownerApprovalReceipt,
    ownerApprovalChallenge: approved.ownerApprovalChallenge,
    now: approved.now,
    env: {},
    git,
    gh,
    useGitHubCliAuth: true,
    verifyHandoff: async () => ({ ok: true, candidate: { branch, commit, clean: true } }),
    request: async (url, options) => {
      assert.match(String(options.headers.Authorization), /^Bearer gho_placeholder_token_value_0000$/)
      if (options.method === 'GET') return response(200, [])
      if (options.method === 'POST') {
        return response(201, {
          number: 43,
          state: 'open',
          html_url: 'https://github.com/swanhtet01/swanhtet01.github.io/pull/43',
          head: { ref: branch, sha: commit },
          base: { ref: 'main' },
        })
      }
      throw new Error(`unexpected request ${options.method}`)
    },
  })
  assert.equal(result.mode, 'executed_owner_approved_github_pr_write')
  assert.equal(validatePullRequestReport(result, { expectedMode: 'executed_owner_approved_github_pr_write' }), result)
  assert.equal(result.token.env, 'gh_cli')
  assert.equal(result.token.source, 'github_cli_keyring')
  assert.equal(result.token.valueExposed, false)
  assert.deepEqual(calls, [['auth', 'token', '--hostname', 'github.com']])
  assert.doesNotMatch(JSON.stringify(result), /gho_placeholder/)
})

test('execute returns no-write when an exact open PR already exists', async () => {
  const approved = ownerApproval()
  const { git } = stubGit()
  const result = await applyReleasePullRequestWithClient({
    handoffReceipt: approved.handoffReceipt,
    mainProtectionSnapshotReceipt: approved.protectionReceipt,
    ownerApprovalReceipt: approved.ownerApprovalReceipt,
    ownerApprovalChallenge: approved.ownerApprovalChallenge,
    now: approved.now,
    env: { GITHUB_TOKEN: 'ghp_placeholder_token_value_0000' },
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
  assert.equal(validatePullRequestReport(result, { expectedMode: 'executed_owner_approved_existing_pr_no_write' }), result)
  assert.equal(result.controls.githubWritesPerformed, false)
  assert.equal(result.controls.pullRequestCreated, false)
  assert.equal(result.controls.ownerApprovalReceiptConsumed, true)
  assert.equal(result.verification.remoteBranchObservedAtCreate, commit)
  assert.equal(result.verification.remoteBranchExactAtCreate, true)
  assert.equal(result.verification.existingPullRequestCheckedBeforeCreate, true)
  assert.equal(result.verification.existingPullRequestResult, 'exact_open_pr_reused')
  assert.equal(result.verification.duplicatePullRequestCreated, false)
  assert.equal(result.pullRequest.number, 41)
})

test('execute rejects stale remote branch before checking or creating a pull request', async () => {
  const approved = ownerApproval()
  const staleRemoteCommit = 'c'.repeat(40)
  const { git, calls } = stubGit({ remote: staleRemoteCommit })
  const requests = []
  let consumeCount = 0
  await assert.rejects(
    applyReleasePullRequestWithClient({
      handoffReceipt: approved.handoffReceipt,
      mainProtectionSnapshotReceipt: approved.protectionReceipt,
      ownerApprovalReceipt: approved.ownerApprovalReceipt,
      ownerApprovalChallenge: approved.ownerApprovalChallenge,
      now: approved.now,
      env: { GITHUB_TOKEN: 'ghp_placeholder_token_value_0000' },
      git,
      verifyHandoff: async () => ({ ok: true, candidate: { branch, commit, clean: true } }),
      consumeApprovalReceipt: async () => {
        consumeCount += 1
        return { ok: true, packetDigest: approved.ownerApprovalReceipt.packet.digest }
      },
      request: async (url, options) => {
        requests.push({ url, options })
        return response(200, [])
      },
    }),
    /release_pull_request_remote_branch_not_exact/,
  )
  assert.deepEqual(calls.filter((args) => args[0] === 'ls-remote'), [['ls-remote', '--heads', 'origin', branch]])
  assert.equal(requests.length, 0)
  assert.equal(consumeCount, 0)
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
  const approved = ownerApproval()
  const { git } = stubGit({ remote: null })
  await assert.rejects(
    applyReleasePullRequestWithClient({
      handoffReceipt: approved.handoffReceipt,
      mainProtectionSnapshotReceipt: approved.protectionReceipt,
      ownerApprovalReceipt: approved.ownerApprovalReceipt,
      ownerApprovalChallenge: approved.ownerApprovalChallenge,
      now: approved.now,
      env: { GITHUB_TOKEN: 'ghp_placeholder_token_value_0000' },
      git,
      verifyHandoff: async () => ({ ok: true, candidate: { branch, commit, clean: true } }),
      request: async () => response(200, []),
    }),
    /release_pull_request_remote_branch_not_exact/,
  )
})
