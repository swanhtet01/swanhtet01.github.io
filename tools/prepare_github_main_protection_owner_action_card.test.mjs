import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildApplyPlan,
} from './apply_github_main_protection.mjs'
import {
  buildGitHubMainProtectionPacket,
} from './prepare_github_main_protection_packet.mjs'
import {
  GITHUB_MAIN_PROTECTION_OWNER_ACTION_CARD_CONTRACT,
  buildGitHubMainProtectionOwnerActionCard,
  renderGitHubMainProtectionOwnerActionCardMarkdown,
  validateGitHubMainProtectionOwnerActionCard,
} from './prepare_github_main_protection_owner_action_card.mjs'

const repository = 'swanhtet01/swanhtet01.github.io'
const commit = 'a'.repeat(40)
const liveCommit = 'b'.repeat(40)
const mainCommit = 'c'.repeat(40)
const sourceReceipts = [
  'package.json',
  'tools/verify_github_main_protection.mjs',
  'tools/prepare_github_main_protection_packet.mjs',
  'tools/apply_github_main_protection.mjs',
].map((path) => ({ path, digest: `sha256:${'0'.repeat(64)}` }))

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value || '').replace(/\r\n?/g, '\n')).digest('hex')}`
}

function sign(body) {
  return { ...body, digest: digest(JSON.stringify(body)) }
}

function resign(packet) {
  const body = { ...packet }
  delete body.digest
  return sign(body)
}

function falseControls() {
  return {
    externalWritesPerformed: false,
    gitRemoteWritesPerformed: false,
    githubWritesPerformed: false,
    vercelDeploymentsPerformed: false,
    supabaseMutationsPerformed: false,
    credentialValuesInspected: false,
    customerContactPerformed: false,
    automaticMessagesSent: false,
    paymentOrStockActionPerformed: false,
    hostedWritesPerformed: false,
    managedActivationPerformed: false,
    localSubagentsStarted: false,
    privateIdentityExposed: false,
  }
}

function applyPlan({ proposalPath = 'hq/readiness/github-main-protection-proposal.json' } = {}) {
  const proposalPacket = buildGitHubMainProtectionPacket({ sourceReceipts })
  return buildApplyPlan({
    proposalReceipt: {
      name: 'github-main-protection-proposal.json',
      path: proposalPath,
      digest: `sha256:${'1'.repeat(64)}`,
      packet: proposalPacket,
    },
    gitState: {
      branch: 'codex/release-stack-integration-rehearsal-20260825',
      head: commit,
      clean: true,
    },
    env: {},
    expectedHead: commit,
  })
}

function preflight(plan = applyPlan()) {
  const gates = [
    {
      id: 'github_main_protection',
      label: 'GitHub main protection',
      status: 'owner_approval_or_token_required',
      executeReady: false,
      approvalEnv: 'SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL',
      digest: plan.digest,
      blockers: [
        'main_unprotected',
        'force_push_block_missing',
        'branch_deletion_block_missing',
        'owner_approval_missing',
        'github_token_missing',
      ],
    },
    ['review_branch_push', 'Review branch push'],
    ['pull_request_creation', 'Pull request creation'],
    ['supabase_preview_rehearsal', 'Supabase preview rehearsal'],
    ['paired_vercel_preview_release', 'Paired Vercel preview release'],
    ['shop_pilot_evidence', 'Shop pilot evidence'],
    ['managed_activation', 'Managed activation'],
  ].map((gate) => Array.isArray(gate)
    ? { id: gate[0], label: gate[1], status: 'blocked', executeReady: false, approvalEnv: null, digest: null, blockers: ['blocked'] }
    : gate)
  return sign({
    contract: 'supermega.next-release-action-preflight.v1',
    digestScope: 'utf8_compact_json_without_digest',
    generatedAt: '2026-08-26T00:00:00.000Z',
    mode: 'local_no_external_effects',
    repository,
    candidate: {
      branch: 'codex/release-stack-integration-rehearsal-20260825',
      commit,
      clean: true,
      localVerificationPassed: true,
      remoteMainCommit: mainCommit,
      liveCommit,
      candidateBranchState: 'unpublished',
      candidateAheadOfMain: 1,
      candidateAheadOfLive: 2,
    },
    products: {
      customerProducts: ['shop', 'plant', 'website', 'ecommerce'],
      firstPilotProduct: 'shop',
      aiIsSharedCapabilityOnly: true,
    },
    currentAction: {
      gateId: 'github_main_protection',
      label: gates[0].label,
      status: gates[0].status,
      executeReady: gates[0].executeReady,
      approvalEnv: gates[0].approvalEnv,
      blockers: gates[0].blockers,
    },
    gates,
    allowedNow: {
      localVerification: ['npm.cmd run hq:verify'],
      externalActions: [],
      reason: 'No external action is executable without separate owner approval.',
    },
    claims: {
      productionLive: false,
      commercialProofReady: false,
      revenueProven: false,
      managedActivationReady: false,
      erpReplacementClaimAllowed: false,
      customerMessageAutomationReady: false,
      paymentOrStockAutomationReady: false,
    },
    sourceArtifacts: {
      releaseHandoff: { name: 'release-handoff.json', digest: `sha256:${'2'.repeat(64)}` },
      githubProtectionSnapshot: { name: 'github-main-protection-snapshot.json', digest: `sha256:${'3'.repeat(64)}` },
      githubApplyPlan: { name: 'github-main-protection-apply-plan.json', digest: `sha256:${'4'.repeat(64)}`, packetDigest: plan.digest },
      branchPushPlan: { name: 'release-branch-push-plan.json', digest: `sha256:${'5'.repeat(64)}` },
      pullRequestPlan: { name: 'release-pull-request-plan.json', digest: `sha256:${'6'.repeat(64)}` },
      operatorBoard: { name: 'current-operator-board.json', digest: `sha256:${'7'.repeat(64)}` },
      productReadinessMatrix: { name: 'product-readiness-matrix.json', digest: `sha256:${'8'.repeat(64)}` },
    },
    controls: falseControls(),
  })
}

function ownerMarkdown(plan = applyPlan()) {
  return `# SuperMega Release Handoff Owner Approval Packet v112

Use these approvals one at a time only if you want the next external action to happen. This packet is current for candidate commit \`${commit}\`.

## 1. GitHub main protection ruleset

Required env: \`SUPERMEGA_GITHUB_MAIN_PROTECTION_APPROVAL\`

Exact approval text:

\`\`\`text
${buildGitHubMainProtectionPacket({ sourceReceipts }).ownerApprovalTemplate}
\`\`\`

Review command, no-write:

\`\`\`powershell
npm.cmd run github:main-protection:apply:plan -- --proposal "hq/readiness/github-main-protection-proposal.json" --expected-head "${commit}"
\`\`\`

Execute command, only after approval and token are available:

\`\`\`powershell
node tools/apply_github_main_protection.mjs --execute --proposal "hq/readiness/github-main-protection-proposal.json" --expected-head "${commit}"
\`\`\`

`
}

test('builds a public-safe owner action card for GitHub main protection only', () => {
  const plan = applyPlan()
  const card = buildGitHubMainProtectionOwnerActionCard({
    generatedAt: '2026-08-26T00:00:00.000Z',
    preflight: preflight(plan),
    githubMainProtectionApplyPlan: plan,
    releaseOwnerApprovalMarkdown: ownerMarkdown(plan),
  })

  assert.equal(card.contract, GITHUB_MAIN_PROTECTION_OWNER_ACTION_CARD_CONTRACT)
  assert.equal(card.currentAction.id, 'github_main_protection')
  assert.equal(card.currentAction.allowedNow, false)
  assert.equal(card.currentAction.expectedHead, commit)
  assert.match(card.commands.executeAfterApprovalAndTokenOnly, new RegExp(`--expected-head "${commit}"`))
  assert.equal(card.mustRemainFalse.branchPushAllowed, false)
  assert.equal(card.mustRemainFalse.pullRequestAllowed, false)
  assert.equal(card.controls.githubWritesPerformed, false)
  assert.doesNotMatch(JSON.stringify(card), /[A-Za-z]:\\|ghp_|github_pat_|@/)
  assert.equal(validateGitHubMainProtectionOwnerActionCard(card), card)
})

test('renders concise markdown without granting later release actions', () => {
  const plan = applyPlan()
  const card = buildGitHubMainProtectionOwnerActionCard({
    generatedAt: '2026-08-26T00:00:00.000Z',
    preflight: preflight(plan),
    githubMainProtectionApplyPlan: plan,
    releaseOwnerApprovalMarkdown: ownerMarkdown(plan),
  })
  const markdown = renderGitHubMainProtectionOwnerActionCardMarkdown(card)

  assert.match(markdown, /Apply GitHub main protection only|GitHub Main Protection Owner Action Card/)
  assert.match(markdown, /does not approve branch push, PR creation, merge, deployment/)
  assert.match(markdown, /github:main-protection:apply:plan/)
  assert.match(markdown, new RegExp(`--expected-head "${commit}"`))
  assert.doesNotMatch(markdown, /[A-Za-z]:\\|ghp_|github_pat_|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
})

test('rejects stale owner text and non-GitHub current gates', () => {
  const plan = applyPlan()
  assert.throws(
    () => buildGitHubMainProtectionOwnerActionCard({
      preflight: preflight(plan),
      githubMainProtectionApplyPlan: plan,
      releaseOwnerApprovalMarkdown: ownerMarkdown(plan).replace('one GitHub repository settings write', 'two GitHub repository settings writes'),
    }),
    /github_main_protection_owner_action_card_owner_approval_digest_invalid/,
  )

  assert.throws(
    () => buildGitHubMainProtectionOwnerActionCard({
      preflight: preflight(plan),
      githubMainProtectionApplyPlan: plan,
      releaseOwnerApprovalMarkdown: ownerMarkdown(plan).replaceAll(` --expected-head "${commit}"`, ''),
    }),
    /github_main_protection_owner_action_card_(review|execute)_expected_head_invalid/,
  )

  const wrongPreflight = preflight(plan)
  wrongPreflight.currentAction = { ...wrongPreflight.currentAction, gateId: 'review_branch_push' }
  const resignedWrongPreflight = resign(wrongPreflight)
  assert.throws(
    () => buildGitHubMainProtectionOwnerActionCard({
      preflight: resignedWrongPreflight,
      githubMainProtectionApplyPlan: plan,
      releaseOwnerApprovalMarkdown: ownerMarkdown(plan),
    }),
    /next_release_action_preflight_current_action_invalid|github_main_protection_owner_action_card_current_action_invalid/,
  )
})

test('CLI writes and verifies a local no-write action card', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'github-main-protection-card-'))
  try {
    const plan = applyPlan({
      proposalPath: 'C:\\Users\\thesw\\Projects\\supermega-platform\\hq\\readiness\\github-main-protection-proposal.json',
    })
    const preflightPath = join(directory, 'preflight.json')
    const planPath = join(directory, 'apply-plan.json')
    const ownerPath = join(directory, 'owner.md')
    const outputPath = join(directory, 'card.json')
    const markdownPath = join(directory, 'card.md')
    await writeFile(preflightPath, `${JSON.stringify(preflight(plan), null, 2)}\n`, 'utf8')
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
    await writeFile(ownerPath, ownerMarkdown(plan), 'utf8')

    const write = spawnSync(process.execPath, [
      'tools/prepare_github_main_protection_owner_action_card.mjs',
      '--preflight',
      preflightPath,
      '--github-main-protection-apply-plan',
      planPath,
      '--release-owner-approval',
      ownerPath,
      '--output',
      outputPath,
      '--markdown-output',
      markdownPath,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(write.status, 0, write.stderr || write.stdout)
    const written = JSON.parse(write.stdout)
    assert.equal(written.ok, true)
    assert.equal(written.externalWritesPerformed, false)

    const verify = spawnSync(process.execPath, [
      'tools/prepare_github_main_protection_owner_action_card.mjs',
      '--verify',
      outputPath,
    ], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(verify.status, 0, verify.stderr || verify.stdout)
    assert.equal(JSON.parse(verify.stdout).ok, true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
