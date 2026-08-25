import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CURRENT_OPERATOR_BOARD_CONTRACT,
  buildCurrentOperatorBoard,
  renderOperatorBoardMarkdown,
  validateCurrentOperatorBoard,
} from './prepare_current_operator_board.mjs'

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
      pilotEvidence: { proofComplete: false, acceptedConsecutiveRuns: 0, requiredAcceptedConsecutiveRuns: 20 },
    },
    githubProposalReceipt: { path: 'github.json', digest: digestOf('1'), packet: { digest: digestOf('2') } },
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
      candidate: { clean: true },
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
  assert.ok(board.gates.find((gate) => gate.id === 'pull_request_creation').blockers.includes('remote_review_branch_not_exact'))
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
})

test('renders a public-safe markdown board without credential-shaped text', () => {
  const markdown = renderOperatorBoardMarkdown(buildCurrentOperatorBoard(fixture()))
  assert.ok(markdown.includes('SuperMega Current Operator Board'))
  assert.ok(markdown.includes('AI remains a shared capability'))
  assert.ok(markdown.includes('All provider writes'))
  assert.ok(!/ghp_[A-Za-z0-9]{20,}/.test(markdown))
  assert.ok(!/sk-[A-Za-z0-9_-]{20,}/.test(markdown))
})
