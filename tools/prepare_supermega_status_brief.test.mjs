import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SUPERMEGA_STATUS_BRIEF_CONTRACT,
  buildSuperMegaStatusBrief,
  renderSuperMegaStatusBriefMarkdown,
  validateSuperMegaStatusBrief,
} from './prepare_supermega_status_brief.mjs'
import { buildCurrentOperatorBoard } from './prepare_current_operator_board.mjs'
import { buildGitHubMainProtectionSnapshot } from './collect_github_main_protection_snapshot.mjs'
import {
  OPERATING_ACTION_BOARD_CONTRACT,
  OPERATING_ACTION_BOARD_MODE,
  buildOperatingActionBoardSummary,
} from '../kernel/operating-action-board.mjs'

const repository = 'swanhtet01/swanhtet01.github.io'
const products = ['shop', 'plant', 'website', 'ecommerce']
const commit = 'a'.repeat(40)
const main = 'b'.repeat(40)
const live = 'c'.repeat(40)
const branch = 'codex/release-stack-integration-rehearsal-20260825'
const requiredMainChecks = [
  'SuperMega App CI',
  'Dependency Security Audit',
  'Kernel Console - Verify & Owner-Gated Release',
]

function digestOf(char) {
  return `sha256:${char.repeat(64)}`
}

function operatorBoard(overrides = {}) {
  const githubProtectionSnapshot = buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch: {
      name: 'main',
      protected: false,
      commit: { sha: main },
      protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
    },
    rulesets: [],
  })
  return buildCurrentOperatorBoard({
    handoffReceipt: {
      path: 'handoff.json',
      digest: digestOf('0'),
      packet: {
        generatedAt: '2026-08-25T00:00:00.000Z',
        repository,
        candidate: { branch, commit, clean: true },
        remote: { mainCommit: main, candidateBranchState: 'unpublished', candidateCommit: null },
        live: { canonicalPair: ['https://supermega.dev', 'https://app.supermega.dev'], identity: { commit: live } },
        relations: { candidateAheadOfMain: 59, candidateAheadOfLive: 61 },
        verification: { workflowAuthority: { workflowDigest: digestOf('d') } },
        digest: digestOf('e'),
      },
    },
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
        requiredPilotCalendarDates: 5,
        acceptedConsecutiveObservedDateCount: 0,
        acceptedConsecutiveObservedDates: [],
        pilotCalendarCoverageMet: false,
      },
    },
    githubProposalReceipt: { path: 'github.json', digest: digestOf('1'), packet: { digest: digestOf('2') } },
    githubProtectionSnapshot,
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
      contract: 'supermega.review-branch-push-apply.v2',
      mode: 'plan_only_no_git_remote_write',
      candidate: { clean: true },
      approval: { env: null, method: 'none', approved: false, expectedDigest: digestOf('7') },
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
  })
}

function protectedMainSnapshot() {
  return buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch: {
      name: 'main',
      protected: true,
      commit: { sha: main },
      protection: {
        enabled: true,
        allow_force_pushes: { enabled: false },
        allow_deletions: { enabled: false },
        required_pull_request_reviews: { required_approving_review_count: 1 },
        required_conversation_resolution: { enabled: true },
        required_status_checks: { contexts: requiredMainChecks, checks: [] },
      },
    },
    rulesets: [],
  })
}

function operatingAction(overrides = {}) {
  return {
    id: 'release-main-protection',
    openedAt: '2026-08-25T00:00:00.000Z',
    productIds: [...products],
    sourceFinding: {
      sourceType: 'release_gate',
      label: 'GitHub main protection is not verified',
      evidenceRef: 'supermega.github-main-protection-snapshot.v63.generated-20260825.json',
      evidenceDigest: digestOf('a'),
    },
    recommendation: 'Protect GitHub main before branch push, pull request, release, or pilot activation.',
    severity: 'critical',
    businessImpact: {
      kind: 'release_risk',
      estimateLabel: 'Unprotected main can invalidate owner-gated release authority.',
      measured: false,
    },
    owner: {
      role: 'Founder plus Engineering',
      namedPrivate: false,
    },
    dueDate: '2026-08-25',
    status: 'owner-gated',
    authority: {
      ownerApprovalRequired: true,
      externalWriteAllowed: false,
    },
    acceptance: {
      evidenceRequired: ['Verified main protection snapshot with required checks present'],
      tests: ['npm run hq:verify'],
    },
    closure: {
      closedAt: null,
      closureNote: null,
      measuredResult: null,
    },
    ...overrides,
  }
}

function shopPilotBaselineAction() {
  return operatingAction({
    id: 'shop-owner-pilot-baseline',
    productIds: ['shop'],
    sourceFinding: {
      sourceType: 'pilot_observation',
      label: 'Shop pilot requires observed baseline before acceptance evidence',
      evidenceRef: 'docs/pilot-kit/baseline-measurement.md',
      evidenceDigest: digestOf('b'),
    },
    recommendation: 'Capture owner-observed Shop baseline runs before day one of the five-day pilot.',
    severity: 'high',
    businessImpact: {
      kind: 'pilot_readiness',
      estimateLabel: 'Prevents sample data from being mistaken for commercial proof.',
      measured: false,
    },
    owner: {
      role: 'Founder plus Product',
      namedPrivate: false,
    },
    dueDate: '2026-08-26',
    status: 'owner-gated',
  })
}

function actionBoard(overrides = {}) {
  const actions = overrides.actions || [operatingAction(), shopPilotBaselineAction()]
  return {
    contract: OPERATING_ACTION_BOARD_CONTRACT,
    generatedAt: '2026-08-25T00:00:00.000Z',
    mode: OPERATING_ACTION_BOARD_MODE,
    products: [...products],
    controls: {
      externalWritesPerformed: false,
      gitRemoteWritesPerformed: false,
      githubWritesPerformed: false,
      vercelDeploymentsPerformed: false,
      supabaseMutationsPerformed: false,
      credentialValuesInspected: false,
      customerContactPerformed: false,
      paymentOrStockActionPerformed: false,
      managedActivationPerformed: false,
      privateIdentityExposed: false,
    },
    weeklyReport: buildOperatingActionBoardSummary(actions),
    ...overrides,
    actions,
  }
}

test('builds a founder-readable status brief from current operator and operating action boards', () => {
  const brief = buildSuperMegaStatusBrief({
    generatedAt: '2026-08-25T00:00:00.000Z',
    operatorBoard: operatorBoard(),
    operatingActionBoard: actionBoard(),
    operatorBoardFileDigest: digestOf('c'),
    operatingActionBoardFileDigest: digestOf('d'),
  })
  assert.equal(brief.contract, SUPERMEGA_STATUS_BRIEF_CONTRACT)
  assert.equal(brief.release.currentGateId, 'github_main_protection')
  assert.equal(brief.products.firstPilotProduct, 'shop')
  assert.equal(brief.products.aiBoundary, 'shared_capability_not_product')
  assert.equal(brief.operatingActions.openActionCount, 2)
  assert.equal(brief.operatingActions.currentOperatingAction.id, 'release-main-protection')
  assert.equal(brief.nextWork[0].id, 'gate-github_main_protection')
  assert.ok(!brief.nextWork.some((item) => item.id === 'action-release-main-protection'))
  assert.ok(brief.nextWork.some((item) => item.id === 'action-shop-owner-pilot-baseline'))
  assert.equal(brief.controls.githubWritesPerformed, false)
  assert.equal(validateSuperMegaStatusBrief(brief), brief)
})

test('keeps the money path explicit without claiming Shop pilot proof', () => {
  const brief = buildSuperMegaStatusBrief({
    generatedAt: '2026-08-25T00:00:00.000Z',
    operatorBoard: operatorBoard(),
    operatingActionBoard: actionBoard(),
  })
  assert.ok(brief.nextWork.some((item) => item.id === 'action-shop-owner-pilot-baseline'))
  assert.equal(brief.products.managedWritesEnabled, false)
  assert.ok(brief.release.blockers.includes('main_unprotected'))
})

test('does not present satisfied main protection as the current operating action', () => {
  const brief = buildSuperMegaStatusBrief({
    generatedAt: '2026-08-25T00:00:00.000Z',
    operatorBoard: operatorBoard({
      githubProtectionSnapshot: protectedMainSnapshot(),
      branchPushPlan: {
        contract: 'supermega.review-branch-push-apply.v2',
        mode: 'plan_only_no_git_remote_write',
        candidate: { clean: true },
        approval: { env: null, method: 'none', approved: false, expectedDigest: digestOf('7') },
        possibleWrite: { kind: 'fast_forward_branch_push' },
        controls: { gitRemoteWritesPerformed: false },
      },
    }),
    operatingActionBoard: actionBoard(),
  })
  assert.equal(brief.release.currentGateId, 'review_branch_push')
  assert.equal(brief.operatingActions.currentOperatingAction.id, 'shop-owner-pilot-baseline')
  assert.equal(brief.nextWork[0].id, 'gate-review_branch_push')
  assert.ok(!brief.nextWork.some((item) => item.id === 'action-release-main-protection'))
  assert.ok(brief.nextWork.some((item) => item.id === 'action-shop-owner-pilot-baseline'))
  assert.equal(validateSuperMegaStatusBrief(brief), brief)
})

test('fails closed on live-write, private-owner, fifth-product, and stale action summaries', () => {
  assert.throws(() => buildSuperMegaStatusBrief({
    generatedAt: '2026-08-25T00:00:00.000Z',
    operatorBoard: {
      ...operatorBoard(),
      live: { ...operatorBoard().live, managedWritesEnabled: true },
    },
    operatingActionBoard: actionBoard(),
  }), /current_operator_board_managed_writes_invalid/)
  assert.throws(() => buildSuperMegaStatusBrief({
    generatedAt: '2026-08-25T00:00:00.000Z',
    operatorBoard: operatorBoard(),
    operatingActionBoard: actionBoard({ actions: [operatingAction({ owner: { role: 'Named Human', namedPrivate: true } })] }),
  }), /operating_action_private_owner_identity_invalid/)
  assert.throws(() => buildSuperMegaStatusBrief({
    generatedAt: '2026-08-25T00:00:00.000Z',
    operatorBoard: operatorBoard(),
    operatingActionBoard: { ...actionBoard(), products: [...products, 'ai'] },
  }), /operating_action_board_product_set_invalid/)
  assert.throws(() => buildSuperMegaStatusBrief({
    generatedAt: '2026-08-25T00:00:00.000Z',
    operatorBoard: operatorBoard(),
    operatingActionBoard: { ...actionBoard(), weeklyReport: { ...actionBoard().weeklyReport, openActionCount: 1 } },
  }), /operating_action_board_weekly_report_stale/)
})

test('renders public-safe markdown with the current blocker and no credential shapes', () => {
  const markdown = renderSuperMegaStatusBriefMarkdown(buildSuperMegaStatusBrief({
    generatedAt: '2026-08-25T00:00:00.000Z',
    operatorBoard: operatorBoard(),
    operatingActionBoard: actionBoard(),
  }))
  assert.ok(markdown.includes('SuperMega Status Brief'))
  assert.ok(markdown.includes('Why it is not live-selling yet'))
  assert.ok(markdown.includes('main_unprotected'))
  assert.ok(markdown.includes('AI is a shared capability'))
  assert.ok(!/ghp_[A-Za-z0-9]{20,}/.test(markdown))
  assert.ok(!/sk-[A-Za-z0-9_-]{20,}/.test(markdown))
})
