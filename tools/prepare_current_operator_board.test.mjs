import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  CURRENT_OPERATOR_BOARD_CONTRACT,
  buildCurrentOperatorBoard,
  renderOperatorBoardMarkdown,
  validateCurrentOperatorBoard,
} from './prepare_current_operator_board.mjs'
import {
  buildGitHubMainProtectionSnapshot,
} from './collect_github_main_protection_snapshot.mjs'

const repository = 'swanhtet01/swanhtet01.github.io'
const products = ['shop', 'plant', 'website', 'ecommerce']
const commit = 'a'.repeat(40)
const main = 'b'.repeat(40)
const live = 'c'.repeat(40)

function digestOf(char) {
  return `sha256:${char.repeat(64)}`
}

function fixture(overrides = {}) {
  const branch = 'codex/release-stack-integration-rehearsal-20260825'
  const handoffPacket = {
    generatedAt: '2026-08-25T00:00:00.000Z',
    repository,
    candidate: { branch, commit, clean: true },
    remote: { mainCommit: main, candidateBranchState: 'unpublished', candidateCommit: null },
    live: { canonicalPair: ['https://supermega.dev', 'https://app.supermega.dev'], identity: { commit: live } },
    relations: { candidateAheadOfMain: 59, candidateAheadOfLive: 61 },
    verification: { workflowAuthority: { workflowDigest: digestOf('d') } },
    digest: digestOf('e'),
  }
  return {
    handoffReceipt: { path: 'handoff.json', digest: digestOf('0'), packet: handoffPacket },
    technicalEstate: {
      products: products.map((productId) => ({ productId })),
      lifecycle: { nextProductSequence: [...products] },
      sharedCapabilities: [{ id: 'ai-assistance', classification: 'shared-capability-not-product' }],
    },
    readiness: {
      contract: 'supermega.managed-pilot-readiness.v5',
      pilotMode: 'owner_named',
      overall: { hostedActivationReady: false, blockingGateIds: ['preview_rehearsal', 'pilot_evidence', 'production_activation'] },
      liveProduction: { operatingMode: 'isolated_demo', managedWritesEnabled: false },
      pilotEvidence: {
        proofComplete: false,
        acceptedConsecutiveRuns: 0,
        requiredAcceptedConsecutiveRuns: 20,
        requiredPilotDayIndexes: [1, 2, 3, 4, 5],
        acceptedConsecutivePilotDayIndexes: [],
        pilotSequenceCoverageMet: false,
      },
    },
    githubProposalReceipt: { path: 'github.json', digest: digestOf('1'), packet: { digest: digestOf('2') } },
    githubProtectionSnapshot: buildGitHubMainProtectionSnapshot({
      generatedAt: '2026-08-25T00:00:00.000Z',
      branch: {
        name: 'main',
        protected: false,
        commit: { sha: main },
        protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
      },
      rulesets: [],
    }),
    supabaseProposalReceipt: {
      path: 'supabase.json',
      digest: digestOf('3'),
      packet: {
        contract: 'supermega.supabase-preview-rehearsal-proposal.v1',
        mode: 'owner_approval_required',
        state: 'prepared-not-executed',
        digest: digestOf('4'),
        previewBranch: { maximumLifetimeHours: 24 },
        migrationPlan: { productionApplyAllowed: false, chainDigest: digestOf('5') },
        controls: { providerMutationsPerformed: false },
      },
    },
    githubApplyPlan: {
      contract: 'supermega.github-main-protection-apply.v1',
      mode: 'plan_only_no_github_write',
      candidate: { branch, head: commit, clean: true, expectedHead: commit, expectedHeadMatched: true, expectedHeadRequiredForExecute: true },
      approval: { env: 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL', approved: false, expectedDigest: digestOf('6') },
      token: { present: false },
      possibleWrite: { create: `POST /repos/${repository}/rulesets` },
      controls: { githubWritesPerformed: false },
    },
    branchPushPlan: {
      contract: 'supermega.review-branch-push-apply.v1',
      mode: 'plan_only_no_git_remote_write',
      candidate: { clean: true },
      approval: { env: 'SUPERMEGA_REVIEW_BRANCH_PUSH_APPROVAL', approved: false, expectedDigest: digestOf('7') },
      possibleWrite: { kind: 'initial_branch_push' },
      controls: { gitRemoteWritesPerformed: false },
    },
    pullRequestPlan: {
      contract: 'supermega.release-pull-request-apply.v1',
      mode: 'plan_only_no_github_write',
      approval: { env: 'SUPERMEGA_PULL_REQUEST_CREATION_APPROVAL', approved: false, expectedDigest: digestOf('8') },
      readiness: { executeReady: false, blockers: ['remote_review_branch_not_exact', 'owner_approval_missing', 'github_token_missing'] },
      possibleWrite: { payloadDigest: digestOf('9') },
      controls: { githubWritesPerformed: false },
    },
    gitState: { branch, head: commit, clean: true },
    ...overrides,
  }
}

test('builds a no-write operator board with GitHub protection as the first current action', () => {
  const board = buildCurrentOperatorBoard(fixture())
  assert.equal(board.contract, CURRENT_OPERATOR_BOARD_CONTRACT)
  assert.equal(board.currentAction.gateId, 'github_main_protection')
  assert.ok(board.currentAction.blockers.includes('main_unprotected'))
  assert.deepEqual(board.products.customerProducts, products)
  assert.equal(board.products.aiIsSharedCapability, true)
  assert.equal(board.controls.githubWritesPerformed, false)
  assert.equal(board.controls.supabaseMutationsPerformed, false)
  assert.equal(board.controls.vercelDeploymentsPerformed, false)
  assert.equal(validateCurrentOperatorBoard(board), board)
})

test('keeps the ordered owner-gated path explicit through pilot activation', () => {
  const board = buildCurrentOperatorBoard(fixture())
  assert.deepEqual(board.orderedGateIds, [
    'github_main_protection',
    'review_branch_push',
    'pull_request_creation',
    'pull_request_review_merge',
    'supabase_preview_rehearsal',
    'paired_vercel_preview_release',
    'shop_pilot_evidence',
    'managed_activation',
  ])
  assert.equal(board.gates.find((gate) => gate.id === 'shop_pilot_evidence').status, 'private_observation_required')
  assert.ok(board.gates.find((gate) => gate.id === 'shop_pilot_evidence').blockers.includes('pilot_sequence_days_missing'))
  assert.ok(board.gates.find((gate) => gate.id === 'pull_request_creation').blockers.includes('remote_review_branch_not_exact'))
})

test('advances to review branch push once live GitHub main protection is verified', () => {
  const protectedSnapshot = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch: {
      name: 'main',
      protected: true,
      protection: {
        enabled: true,
        required_status_checks: {
          contexts: ['SuperMega App CI', 'Dependency Security Audit', 'Kernel Console - Verify & Owner-Gated Release'],
          checks: [],
        },
        allow_force_pushes: { enabled: false },
        allow_deletions: { enabled: false },
        required_pull_request_reviews: { required_approving_review_count: 1 },
        required_conversation_resolution: { enabled: true },
      },
      commit: { sha: main },
    },
    rulesets: [],
  })
  const board = buildCurrentOperatorBoard(fixture({ githubProtectionSnapshot: protectedSnapshot }))
  assert.equal(board.gates[0].status, 'satisfied')
  assert.equal(board.currentAction.gateId, 'review_branch_push')
})

test('advances to pull request creation when the review branch already matches the candidate', () => {
  const protectedSnapshot = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch: {
      name: 'main',
      protected: true,
      protection: {
        enabled: true,
        required_status_checks: {
          contexts: ['SuperMega App CI', 'Dependency Security Audit', 'Kernel Console - Verify & Owner-Gated Release'],
          checks: [],
        },
        allow_force_pushes: { enabled: false },
        allow_deletions: { enabled: false },
        required_pull_request_reviews: { required_approving_review_count: 1 },
        required_conversation_resolution: { enabled: true },
      },
      commit: { sha: main },
    },
    rulesets: [],
  })
  const base = fixture({ githubProtectionSnapshot: protectedSnapshot })
  const board = buildCurrentOperatorBoard(fixture({
    githubProtectionSnapshot: protectedSnapshot,
    handoffReceipt: {
      ...base.handoffReceipt,
      packet: {
        ...base.handoffReceipt.packet,
        remote: {
          ...base.handoffReceipt.packet.remote,
          candidateBranchState: 'exact',
          candidateCommit: commit,
        },
      },
    },
    branchPushPlan: {
      ...base.branchPushPlan,
      remoteBefore: { candidateBranchState: 'exact', candidateCommit: commit },
      readiness: { executeReady: false, blockers: ['owner_approval_missing'] },
      possibleWrite: { kind: 'already_published_no_push' },
    },
    pullRequestPlan: {
      ...base.pullRequestPlan,
      remoteBefore: { branchExactForPr: true, candidateBranchState: 'exact', candidateCommit: commit },
      readiness: { executeReady: false, blockers: ['owner_approval_missing', 'github_token_missing'] },
    },
  }))
  assert.equal(board.gates.find((gate) => gate.id === 'review_branch_push').status, 'satisfied')
  assert.deepEqual(board.gates.find((gate) => gate.id === 'review_branch_push').blockers, [])
  assert.equal(board.currentAction.gateId, 'pull_request_creation')
  assert.ok(board.currentAction.blockers.includes('owner_approval_missing'))
})

test('fails closed for dirty worktree, fifth-product AI, and write controls', () => {
  assert.throws(() => buildCurrentOperatorBoard(fixture({ gitState: { ...fixture().gitState, clean: false } })), /current_operator_board_worktree_dirty/)
  assert.throws(() => buildCurrentOperatorBoard(fixture({
    technicalEstate: {
      ...fixture().technicalEstate,
      products: [...fixture().technicalEstate.products, { productId: 'ai' }],
    },
  })), /current_operator_board_products_invalid/)
  assert.throws(() => buildCurrentOperatorBoard(fixture({
    pullRequestPlan: {
      ...fixture().pullRequestPlan,
      controls: { githubWritesPerformed: true },
    },
  })), /current_operator_board_controls_invalid/)
  assert.throws(() => buildCurrentOperatorBoard(fixture({
    githubApplyPlan: {
      ...fixture().githubApplyPlan,
      candidate: { ...fixture().githubApplyPlan.candidate, expectedHead: null, expectedHeadMatched: null },
    },
  })), /current_operator_board_github_apply_expected_head_invalid/)
})

test('renders a public-safe markdown board without credential-shaped text', () => {
  const markdown = renderOperatorBoardMarkdown(buildCurrentOperatorBoard(fixture()))
  assert.ok(markdown.includes('SuperMega Current Operator Board'))
  assert.ok(markdown.includes('AI remains a shared capability'))
  assert.ok(markdown.includes('All provider writes'))
  assert.ok(!/ghp_[A-Za-z0-9]{20,}/.test(markdown))
  assert.ok(!/sk-[A-Za-z0-9_-]{20,}/.test(markdown))
})

test('generated board uses the same safe GitHub CLI auth readiness path as the PR plan', () => {
  const source = readFileSync(new URL('./prepare_current_operator_board.mjs', import.meta.url), 'utf8')
  assert.match(source, /const pullRequestPlan = buildPullRequestPlan\(\{[\s\S]*?useGitHubCliAuth: true,[\s\S]*?\}\)/)
})
