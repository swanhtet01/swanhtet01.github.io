import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import { buildApplyPlan } from './apply_github_main_protection.mjs'
import { buildReviewBranchPushPlan } from './apply_review_branch_push.mjs'
import { buildPullRequestPlan } from './apply_release_pull_request.mjs'
import { buildGitHubMainProtectionSnapshot } from './collect_github_main_protection_snapshot.mjs'
import {
  NEXT_RELEASE_ACTION_PREFLIGHT_CONTRACT,
  buildNextReleaseActionPreflight,
  renderNextReleaseActionPreflightMarkdown,
  validateNextReleaseActionPreflight,
} from './prepare_next_release_action_preflight.mjs'
import { buildCurrentOperatorBoard } from './prepare_current_operator_board.mjs'
import { buildProductReadinessMatrix } from './prepare_product_readiness_matrix.mjs'

const repository = 'swanhtet01/swanhtet01.github.io'
const origin = `https://github.com/${repository}.git`
const products = ['shop', 'plant', 'website', 'ecommerce']
const commit = 'a'.repeat(40)
const main = 'b'.repeat(40)
const live = 'c'.repeat(40)

function digestOf(char) {
  return `sha256:${char.repeat(64)}`
}

function baseHandoff({ protectedMain = false, branchPublished = false } = {}) {
  const branch = 'codex/release-stack-integration-rehearsal-20260825'
  return {
    generatedAt: '2026-08-25T00:00:00.000Z',
    repository,
    candidate: { branch, commit, clean: true },
    remote: { origin, mainCommit: main, candidateBranchState: branchPublished ? 'exact' : 'unpublished', candidateCommit: branchPublished ? commit : null },
    live: { canonicalPair: ['https://supermega.dev', 'https://app.supermega.dev'], identity: { commit: live } },
    relations: { candidateAheadOfMain: 100, candidateAheadOfLive: 102 },
    verification: { passed: true, verifiedCommit: commit, workflowAuthority: { workflowDigest: digestOf('d') } },
    githubMainProtection: {
      assessment: protectedMain
        ? { ok: true, failures: [] }
        : { ok: false, failures: ['main_unprotected', 'required_status_check_missing:SuperMega App CI'] },
    },
    actions: {
      reviewBranchPush: {
        kind: branchPublished ? 'owner_review_fast_forward_branch_push' : 'owner_review_initial_branch_push',
        branch,
        exactCommit: commit,
        forcePushAllowed: false,
        mergeIncluded: false,
        deploymentIncluded: false,
        approvalTemplate: branchPublished
          ? `I approve one normal fast-forward-only push of ${commit} to origin/${branch} for review only. I do not approve merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`
          : `I approve one normal initial push of ${commit} to origin/${branch} for review only. I do not approve merge, workflow dispatch, deployment, domain, environment, database, credential, payment, message, customer contact, stock, or production changes.`,
      },
    },
    nextAction: { forcePushAllowed: false, mergeIncluded: false, deploymentIncluded: false },
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
    },
    digest: digestOf('e'),
  }
}

function technicalEstate() {
  return {
    products: products.map((productId) => ({
      productId,
      name: productId[0].toUpperCase() + productId.slice(1),
      classification: 'customer-product',
      lifecycleState: 'release-candidate-local',
      appRoute: `/${productId}/`,
      sourcePaths: ['showroom/src/core/CoreApp.tsx', `showroom/src/products/${productId}`, `tools/test_${productId}_readiness.mjs`],
      workOrderId: `${productId}-work-order`,
      requiredProof: `${productId} owner-reviewed proof remains required.`,
    })),
    lifecycle: { nextProductSequence: [...products] },
    sharedCapabilities: [{ id: 'ai-assistance', classification: 'shared-capability-not-product' }],
    sourceDigest: digestOf('f'),
  }
}

function readiness() {
  return {
    contract: 'supermega.managed-pilot-readiness.v5',
    pilotMode: 'owner_named',
    overall: {
      hostedActivationReady: false,
      blockingGateIds: ['preview_rehearsal', 'pilot_evidence', 'production_activation'],
    },
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
    products: products.map((productId) => ({
      productId,
      localStatus: 'release-candidate-local',
      managedPilotStatus: 'blocked',
      automationStatus: 'owner-gated',
      workOrderId: productId === 'shop' ? 'shop-spa-owner-pilot' : `${productId}-managed-proof`,
      requiredProof: `${productId} proof must come from owner-reviewed private evidence.`,
    })),
    sourceDigest: digestOf('9'),
  }
}

function actionBoard() {
  return {
    contract: 'supermega.operating-action-board.v1',
    products,
    weeklyReport: {
      totalActions: 4,
      openActionCount: 2,
      ownerGatedCount: 2,
      criticalOpenCount: 1,
    },
    actions: [
      { id: 'release-main-protection', status: 'owner-gated' },
      { id: 'shop-owner-pilot-baseline', status: 'owner-gated' },
    ],
    digest: digestOf('8'),
  }
}

function githubSnapshot({ protectedMain = false } = {}) {
  return buildGitHubMainProtectionSnapshot({
    generatedAt: '2026-08-25T00:00:00.000Z',
    branch: protectedMain
      ? {
          name: 'main',
          protected: true,
          commit: { sha: main },
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
        }
      : {
          name: 'main',
          protected: false,
          commit: { sha: main },
          protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
        },
    rulesets: [],
  })
}

function fixture({ protectedMain = false, branchPublished = false, env = {}, bindGitHubExpectedHead = true } = {}) {
  const handoff = baseHandoff({ protectedMain, branchPublished })
  const handoffReceipt = { name: 'release-handoff.json', digest: digestOf('0'), packet: handoff }
  const gitState = { branch: handoff.candidate.branch, head: commit, clean: true, origin }
  const snapshot = githubSnapshot({ protectedMain })
  const snapshotReceipt = { name: 'github-snapshot.json', digest: digestOf('1'), packet: snapshot }
  const proposalReceipt = {
    name: 'github-proposal.json',
    digest: digestOf('2'),
    packet: {
      digest: digestOf('3'),
      githubApi: { apiVersion: '2026-03-10' },
      proposedRuleset: { name: 'SuperMega main release gate', target: 'branch' },
      ownerApprovalTemplate: `I approve one GitHub repository settings write to create or update the main protection ruleset for ${repository} using the reviewed SuperMega main release gate proposal only. I do not approve push, PR creation, merge, deployment, Supabase mutation, credential change, customer contact, payment, stock, domain, hosted-write, or managed activation.`,
    },
  }
  const githubApplyPlan = buildApplyPlan({
    proposalReceipt,
    gitState,
    env,
    expectedHead: bindGitHubExpectedHead ? commit : 'f'.repeat(40),
  })
  const operatorBoardApplyPlan = bindGitHubExpectedHead
    ? githubApplyPlan
    : buildApplyPlan({ proposalReceipt, gitState, env, expectedHead: commit })
  const branchPushPlan = buildReviewBranchPushPlan({ handoffReceipt, mainProtectionSnapshotReceipt: snapshotReceipt, gitState, env })
  const pullRequestPlan = buildPullRequestPlan({ handoffReceipt, mainProtectionSnapshotReceipt: snapshotReceipt, gitState, env })
  const estate = technicalEstate()
  const ready = readiness()
  const operatingActionBoard = actionBoard()
  const operatorBoard = buildCurrentOperatorBoard({
    generatedAt: '2026-08-25T00:00:00.000Z',
    handoffReceipt,
    technicalEstate: estate,
    readiness: ready,
    githubProposalReceipt: proposalReceipt,
    githubProtectionSnapshot: snapshot,
    supabaseProposalReceipt: {
      name: 'supabase-proposal.json',
      digest: digestOf('4'),
      packet: {
        contract: 'supermega.supabase-preview-rehearsal-proposal.v1',
        mode: 'owner_approval_required',
        state: 'prepared-not-executed',
        digest: digestOf('5'),
        previewBranch: { maximumLifetimeHours: 24 },
        migrationPlan: { productionApplyAllowed: false, chainDigest: digestOf('6') },
        controls: { providerMutationsPerformed: false },
      },
    },
    githubApplyPlan: operatorBoardApplyPlan,
    branchPushPlan,
    pullRequestPlan,
    gitState,
  })
  const productReadinessMatrix = buildProductReadinessMatrix({
    generatedAt: '2026-08-25T00:00:00.000Z',
    releaseHandoff: handoff,
    technicalEstate: estate,
    readiness: ready,
    operatingActionBoard,
    sourceDigests: {
      releaseHandoff: handoffReceipt,
      technicalEstate: { packet: estate },
      readiness: { packet: ready },
      operatingActionBoard: { packet: operatingActionBoard },
    },
  })
  return {
    generatedAt: '2026-08-25T00:00:00.000Z',
    handoff,
    handoffReceipt,
    githubProtectionSnapshot: snapshot,
    githubProtectionSnapshotReceipt: snapshotReceipt,
    githubApplyPlan,
    githubApplyPlanReceipt: { name: 'apply-plan.json', digest: digestOf('7'), packet: githubApplyPlan },
    branchPushPlan,
    branchPushPlanReceipt: { name: 'branch-plan.json', digest: digestOf('a'), packet: branchPushPlan },
    pullRequestPlan,
    pullRequestPlanReceipt: { name: 'pr-plan.json', digest: digestOf('b'), packet: pullRequestPlan },
    operatorBoard,
    operatorBoardReceipt: { name: 'operator-board.json', digest: digestOf('c'), packet: operatorBoard },
    productReadinessMatrix,
    productReadinessMatrixReceipt: { name: 'matrix.json', digest: digestOf('d'), packet: productReadinessMatrix },
  }
}

test('builds current preflight with GitHub main protection as the first gate', () => {
  const packet = validateNextReleaseActionPreflight(buildNextReleaseActionPreflight(fixture()))
  assert.equal(packet.contract, NEXT_RELEASE_ACTION_PREFLIGHT_CONTRACT)
  assert.equal(packet.currentAction.gateId, 'github_main_protection')
  assert.equal(packet.currentAction.executeReady, false)
  assert.ok(packet.currentAction.blockers.includes('main_unprotected'))
  const reviewBranchGate = packet.gates.find((gate) => gate.id === 'review_branch_push')
  assert.equal(
    reviewBranchGate.blockers.filter((blocker) => blocker === 'github_main_protection_unverified').length,
    1,
  )
  assert.equal(packet.allowedNow.externalActions.length, 0)
  assert.equal(Object.values(packet.controls).every((value) => value === false), true)
})

test('advances to branch push only after GitHub main protection is verified', () => {
  const packet = buildNextReleaseActionPreflight(fixture({ protectedMain: true }))
  assert.equal(packet.gates[0].status, 'satisfied')
  assert.equal(packet.currentAction.gateId, 'review_branch_push')
  assert.ok(packet.currentAction.blockers.includes('owner_approval_missing'))
})

test('advances to pull request creation after the review branch is already exact', () => {
  const packet = buildNextReleaseActionPreflight(fixture({ protectedMain: true, branchPublished: true }))
  assert.equal(packet.gates.find((gate) => gate.id === 'review_branch_push').status, 'satisfied')
  assert.deepEqual(packet.gates.find((gate) => gate.id === 'review_branch_push').blockers, [])
  assert.equal(packet.currentAction.gateId, 'pull_request_creation')
  assert.ok(packet.currentAction.blockers.includes('owner_approval_missing'))
  assert.ok(packet.currentAction.blockers.includes('github_token_missing'))
})

test('fails closed for candidate mismatch and write-control drift', () => {
  assert.throws(() => buildNextReleaseActionPreflight({
    ...fixture(),
    productReadinessMatrix: {
      ...fixture().productReadinessMatrix,
      release: { ...fixture().productReadinessMatrix.release, candidateCommit: 'f'.repeat(40) },
    },
  }), /next_release_action_preflight_candidate_mismatch|product_readiness_matrix_digest_mismatch/)
  assert.throws(
    () => buildNextReleaseActionPreflight(fixture({ bindGitHubExpectedHead: false })),
    /next_release_action_preflight_github_apply_expected_head_invalid|current_operator_board_github_apply_expected_head_invalid/,
  )

  const packet = buildNextReleaseActionPreflight(fixture())
  assert.throws(() => validateNextReleaseActionPreflight({
    ...packet,
    controls: { ...packet.controls, vercelDeploymentsPerformed: true },
  }), /next_release_action_preflight_controls_invalid/)
})

test('rejects private identity, phone, and credential-shaped text', () => {
  const packet = buildNextReleaseActionPreflight(fixture())
  const fakeCredential = ['sk', 'proj', '123456789012345678901234567890'].join('-')
  for (const leakedValue of [
    'owner@example.com',
    '09 123 456 789',
    String.raw`C:\Users\thesw\OneDrive - BDA\private-shop`,
    fakeCredential,
  ]) {
    assert.throws(() => validateNextReleaseActionPreflight({
      ...packet,
      currentAction: { ...packet.currentAction, blockers: [...packet.currentAction.blockers, leakedValue] },
    }), /next_release_action_preflight_private_or_secret_shape/)
  }
})

test('renders public-safe markdown and verifies packet with the CLI', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'supermega-next-preflight-'))
  try {
    const packet = buildNextReleaseActionPreflight(fixture())
    const markdown = renderNextReleaseActionPreflightMarkdown(packet)
    assert.match(markdown, /SuperMega next release action preflight/)
    assert.match(markdown, /No external action is allowed/)
    assert.doesNotMatch(markdown, /owner@example\.com|09 123|C:\\Users|sk-proj-/)
    const packetPath = join(workspace, 'preflight.json')
    await writeFile(packetPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8')
    const tool = resolve('tools/prepare_next_release_action_preflight.mjs')
    const verified = spawnSync(process.execPath, [tool, '--verify', packetPath], { encoding: 'utf8' })
    assert.equal(verified.status, 0, verified.stderr || verified.stdout)
    assert.match(verified.stdout, /"currentGateId": "github_main_protection"/)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
