import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import { buildClientPortalLaunchProof } from './assemble_client_portal_launch_proof.mjs'
import {
  buildGitHubMainProtectionSnapshot,
} from './collect_github_main_protection_snapshot.mjs'
import { buildReleaseHandoff, validateWorkflowAuthority } from './prepare_release_handoff.mjs'
import { portalEvidenceBindingDigest } from './verify_hosted_product_acceptance.mjs'

const commit = 'a'.repeat(40)
const workspaceId = 'workspace-owner'
const ownerId = 'owner-actor'

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

const workflow = `
name: SuperMega - Coordinated Verified Release
on:
  workflow_dispatch:
    inputs:
      release_commit:
      confirmation:
permissions:
  contents: read
concurrency:
  group: supermega-coordinated-production
  cancel-in-progress: false
jobs:
  release:
    if: github.ref == 'refs/heads/main'
    environment: production
    env:
      APP_VERCEL_PROJECT_ID: prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG
      PUBLIC_VERCEL_PROJECT_ID: prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR
    steps:
      - name: Require exact owner release instruction
        env:
          REQUESTED_RELEASE_COMMIT: \${{ inputs.release_commit }}
          RELEASE_CONFIRMATION: \${{ inputs.confirmation }}
          RELEASE_ACTOR: \${{ github.actor }}
        run: |
          if [ "$REQUESTED_RELEASE_COMMIT" != "$GITHUB_SHA" ]; then exit 1; fi
          if [ "$RELEASE_CONFIRMATION" != "DEPLOY SUPERMEGA PAIRED PRODUCTION" ]; then exit 1; fi
          if [ "$RELEASE_ACTOR" != "swanhtet01" ]; then exit 1; fi
      - name: Capture app production rollback target
      - name: Capture current production rollback target
      - name: Roll back a failed production verification
`

function releaseHandoff() {
  const mainCommit = 'b'.repeat(40)
  const identity = { commit: 'c'.repeat(40), brandVersion: 'jade-v2', contextVersion: '2026-08', catalogVersion: '2026-08' }
  return buildReleaseHandoff({
    generatedAt: '2026-08-22T00:00:00.000Z',
    repository: 'swanhtet01/swanhtet01.github.io',
    candidate: { branch: 'codex/client-launch', commit, clean: true },
    remote: { origin: 'https://github.com/swanhtet01/swanhtet01.github.io.git', mainCommit, candidateCommit: null },
    live: { app: identity, public: identity },
    relations: { mainIsAncestor: true, liveIsAncestor: true, remoteCandidateIsAncestor: null, candidateAheadOfMain: 1, candidateAheadOfLive: 2 },
    legacyReleaseBranch: { commit: null, isAncestorOfCandidate: null, legacyOnlyCommits: 0, candidateOnlyCommits: 0 },
    verification: { passed: true, verifiedCommit: commit, workflowAuthority: validateWorkflowAuthority(workflow) },
    githubMainProtection: buildGitHubMainProtectionSnapshot({
      generatedAt: '2026-08-22T00:00:00.000Z',
      branch: {
        name: 'main',
        protected: false,
        commit: { sha: mainCommit },
        protection: { enabled: false, required_status_checks: { contexts: [], checks: [] } },
      },
      rulesets: [],
    }),
  })
}

function activationRequery() {
  const body = {
    contract: 'supermega.managed_workspace_activation_requery_evidence.v2',
    version: 2,
    status: 'database_activation_verified',
    observedAt: '2026-08-22T01:00:00.000Z',
    activation: {
      activationId: '11111111-1111-4111-8111-111111111111',
      planDigest: `sha256:${'1'.repeat(64)}`,
      receiptDigest: `sha256:${'2'.repeat(64)}`,
      activatedAt: '2026-08-22T00:59:00.000Z',
      workspaceId,
      ownerActorId: ownerId,
      ownerApprovalDigest: sha256('approval-id'),
      products: ['shop', 'website'],
    },
    target: { projectRef: 'project-ref', releaseCommit: commit, postgresMajor: 17, schemaVersion: 11 },
    proofs: {
      ownerAuthorizationRequeried: true,
      workspaceAccessRequeried: true,
      singleOwnerMembershipRequeried: true,
      immutableActivationEventRequeried: true,
      databaseMutationStatementsExecuted: 0,
    },
    remainingGates: ['exact_release_live_verification_required', 'named_owner_portal_smoke_required', 'cross_tenant_denial_smoke_required'],
    controls: {
      containsSecrets: false,
      containsRawClientRows: false,
      hostedDatabaseReadPerformed: true,
      databaseReadOnly: true,
      tenantWritesPerformed: false,
      deploymentPerformed: false,
      portalSmokePerformed: false,
      activationMutationPerformedByThisCommand: false,
    },
  }
  return { ...body, evidenceDigest: sha256(canonical(body)) }
}

function portalSmoke() {
  return {
    contract: 'supermega.hosted_client_portal_smoke.v1', status: 'passed', capturedAt: '2026-08-22T02:00:00.000Z',
    target: { baseUrl: 'https://app.supermega.dev', exactReleaseCommit: commit, workspaceDigest: sha256(workspaceId), ownerDigest: sha256(ownerId), expectedProducts: ['commerce', 'website'] },
    release: { exactCommitMatched: true },
    runtime: { managedDatabaseReady: true, namedUserAuthReady: true, writesEnabled: true },
    ownerPortal: { namedOwnerVerified: true, ownerWorkspaceVisible: true, access: 'owner', readReady: true, writeReady: true, productEntitlements: ['commerce', 'website'] },
    crossTenant: { independentNamedPrincipalVerified: true, ownerWorkspaceAbsentFromDirectory: true, ownerWorkspaceBootstrapDenied: true, denialStatus: 403, denialCode: 'trial_membership_required' },
    boundaries: { tenantWritesPerformed: false, credentialsPersisted: false, clientIdentifiersPersisted: false, secretValuesExposed: false },
  }
}

function productAcceptance({ portal = portalSmoke(), portalArtifactDigest = `sha256:${'6'.repeat(64)}` } = {}) {
  return {
    contract: 'supermega.hosted_product_acceptance_smoke.v2', status: 'passed', capturedAt: '2026-08-22T03:00:00.000Z',
    target: { exactReleaseCommit: commit, workspaceDigest: sha256(workspaceId), ownerDigest: sha256(ownerId), ownerApprovalDigest: sha256('approval-id'), expectedProducts: ['commerce', 'website'] },
    prerequisitePortalArtifactDigest: portalArtifactDigest,
    prerequisitePortalBindingDigest: portalEvidenceBindingDigest(portal),
    products: ['commerce', 'website'].map((product) => ({ product, ownerReadbackPassed: true, crossTenantDenied: true, replayPassed: true, stateDigest: `sha256:${'3'.repeat(64)}` })),
    summary: { productCount: 2, newlyWritten: 2, idempotentExisting: 0, ownerReadbacksPassed: 2, crossTenantDenialsPassed: 2, replaysPassed: 2 },
    boundaries: { productStateMutationsPerformed: false, deploymentPerformed: false, billingActivated: false, customerMessagesSent: false, scheduledAutomationEnabled: false, credentialsPersisted: false, clientIdentifiersPersisted: false, secretValuesExposed: false },
  }
}

function input(overrides = {}) {
  return {
    releaseHandoff: releaseHandoff(), activationRequery: activationRequery(), portalSmoke: portalSmoke(), productAcceptance: productAcceptance(),
    assembledAt: '2026-08-22T04:00:00.000Z',
    artifactDigests: { releaseHandoff: `sha256:${'4'.repeat(64)}`, activationRequery: `sha256:${'5'.repeat(64)}`, portalSmoke: `sha256:${'6'.repeat(64)}`, productAcceptance: `sha256:${'7'.repeat(64)}` },
    ...overrides,
  }
}

test('binds one isolated named-owner portal across activation, release, denial, and per-product acceptance', () => {
  const proof = buildClientPortalLaunchProof(input())
  assert.equal(proof.status, 'ready_for_named_use')
  assert.equal(proof.exactReleaseCommit, commit)
  assert.equal(proof.tenant.isolated, true)
  assert.equal(proof.tenant.ownerApprovalDigest, sha256('approval-id'))
  assert.deepEqual(proof.portal.products.map((item) => item.productId), ['shop', 'website'])
  assert.deepEqual(proof.portal.products.map((item) => item.url), ['https://app.supermega.dev/shop/', 'https://app.supermega.dev/website/'])
  assert.equal(proof.customSolutions.lifecycle, 'available_post_launch')
  assert.equal(proof.customSolutions.activatedByThisProof, false)
  assert.equal(proof.boundaries.rawClientIdentifiersPersisted, false)
  assert.doesNotMatch(JSON.stringify(proof), new RegExp(`${workspaceId}|${ownerId}`))
})

test('fails closed on cross-artifact release, tenant, product, or time drift', () => {
  const wrongRelease = portalSmoke()
  wrongRelease.target.exactReleaseCommit = 'f'.repeat(40)
  assert.throws(() => buildClientPortalLaunchProof(input({ portalSmoke: wrongRelease })), /launch_release_mismatch/)

  const wrongTenant = productAcceptance()
  wrongTenant.target.workspaceDigest = sha256('another-workspace')
  assert.throws(() => buildClientPortalLaunchProof(input({ productAcceptance: wrongTenant })), /launch_workspace_mismatch/)

  const wrongApproval = productAcceptance()
  wrongApproval.target.ownerApprovalDigest = sha256('another-approval')
  assert.throws(() => buildClientPortalLaunchProof(input({ productAcceptance: wrongApproval })), /launch_owner_approval_mismatch/)

  const wrongProducts = productAcceptance()
  wrongProducts.target.expectedProducts = ['commerce']
  wrongProducts.products = wrongProducts.products.slice(0, 1)
  wrongProducts.summary = { productCount: 1, newlyWritten: 1, idempotentExisting: 0, ownerReadbacksPassed: 1, crossTenantDenialsPassed: 1, replaysPassed: 1 }
  assert.throws(() => buildClientPortalLaunchProof(input({ productAcceptance: wrongProducts })), /launch_product_set_mismatch/)

  const wrongTime = productAcceptance()
  wrongTime.capturedAt = '2026-08-22T01:30:00.000Z'
  assert.throws(() => buildClientPortalLaunchProof(input({ productAcceptance: wrongTime })), /launch_evidence_time_order_invalid/)
})

test('rejects tampered activation evidence and incomplete acceptance proof', () => {
  const tamperedActivation = activationRequery()
  tamperedActivation.activation.products = ['shop']
  assert.throws(() => buildClientPortalLaunchProof(input({ activationRequery: tamperedActivation })), /launch_activation_digest_mismatch/)

  const incomplete = productAcceptance()
  incomplete.products[0].crossTenantDenied = false
  assert.throws(() => buildClientPortalLaunchProof(input({ productAcceptance: incomplete })), /launch_acceptance_product_invalid/)

  const substitutedPortal = portalSmoke()
  substitutedPortal.release.service = 'substituted-service'
  assert.throws(() => buildClientPortalLaunchProof(input({ portalSmoke: substitutedPortal })), /launch_acceptance_portal_binding_mismatch/)

  const detachedAcceptance = productAcceptance()
  detachedAcceptance.prerequisitePortalArtifactDigest = `sha256:${'8'.repeat(64)}`
  assert.throws(() => buildClientPortalLaunchProof(input({ productAcceptance: detachedAcceptance })), /launch_acceptance_portal_artifact_mismatch/)
})

test('CLI writes one exclusive metadata-only launch proof', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supermega-client-launch-proof-'))
  const files = {
    release: join(directory, 'release.json'),
    activation: join(directory, 'activation.json'),
    portal: join(directory, 'portal.json'),
    acceptance: join(directory, 'acceptance.json'),
    output: join(directory, 'launch-proof.json'),
  }
  const portal = portalSmoke()
  const portalRaw = JSON.stringify(portal)
  const acceptance = productAcceptance({ portal, portalArtifactDigest: sha256(portalRaw) })
  await Promise.all([
    writeFile(files.release, JSON.stringify(releaseHandoff())),
    writeFile(files.activation, JSON.stringify(activationRequery())),
    writeFile(files.portal, portalRaw),
    writeFile(files.acceptance, JSON.stringify(acceptance)),
  ])
  const args = [
    resolve('tools/assemble_client_portal_launch_proof.mjs'),
    '--release-handoff', files.release,
    '--activation-requery', files.activation,
    '--portal-smoke', files.portal,
    '--product-acceptance', files.acceptance,
    '--output', files.output,
  ]
  const receipt = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', windowsHide: true }))
  const proof = JSON.parse(await readFile(files.output, 'utf8'))
  assert.equal(receipt.status, 'ready_for_named_use')
  assert.deepEqual(receipt.products, ['shop', 'website'])
  assert.equal(receipt.externalWritesPerformed, false)
  assert.equal(proof.tenant.workspaceDigest, sha256(workspaceId))
  assert.doesNotMatch(JSON.stringify(proof), new RegExp(`${workspaceId}|${ownerId}`))
  const duplicate = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true })
  assert.notEqual(duplicate.status, 0)
  assert.match(duplicate.stderr, /EEXIST/)
})
