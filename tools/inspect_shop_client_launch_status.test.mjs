import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  createShopPilotClientWorkspace,
  initShopPilotIntakeStarter,
  initShopPilotSalesWorkspaceFromBundle,
  inspectShopClientLaunchStatus,
  prepareShopPilotClientLaunch,
  prepareShopPilotSalesWorkspace,
} from './manage_shop_pilot_workspace.mjs'
import { buildReleaseHandoff, validateWorkflowAuthority } from './prepare_release_handoff.mjs'

const contactEvent = {
  event: 'supermega.contact.created',
  record: {
    lead_id: 'LEAD-STATUS-0123456789',
    workflow: 'shop',
    company: 'Fictional Status Spa',
    name: 'Fictional Operator',
    email: 'fictional-status@example.invalid',
    goal: 'Reduce package reconciliation time and preserve reviewed exceptions.',
    source_url: 'https://supermega.dev/contact/',
    raw: {
      shop: {
        operator_role: 'Spa manager',
        weekly_orders: 80,
        median_minutes_per_order: 7,
        weekly_exception_count: 8,
        close_minutes_per_day: 30,
        contact_is_operator: true,
      },
    },
  },
}

const ownerInput = {
  tenantLabel: 'fictional-status-spa',
  startDate: '2026-08-24',
  reviewDate: '2026-08-28',
  fixedPilotFeeUsd: 500,
  contactIsNamedOperator: true,
  contactBaselineReviewed: true,
  spaBaseline: {
    clientImportRowCount: 30,
    weeklyPackageSales: 10,
    weeklyTreatmentRedemptions: 20,
    medianMinutesPerRedemption: 3,
    weeklyPackageCorrectionCount: 2,
  },
  isolatedNonProductionTenantApproved: true,
  namedOperatorAuthorized: true,
  pilotDataHandlingApproved: true,
  ownerReviewedCommercialDraft: true,
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

function releasePacket() {
  const candidate = 'a'.repeat(40)
  const identity = { commit: 'c'.repeat(40), brandVersion: 'jade-v2', contextVersion: '2026-08', catalogVersion: '2026-08' }
  return buildReleaseHandoff({
    generatedAt: '2026-08-22T06:00:00.000Z',
    repository: 'swanhtet01/swanhtet01.github.io',
    candidate: { branch: 'codex/status-inspector', commit: candidate, clean: true },
    remote: { origin: 'https://github.com/swanhtet01/swanhtet01.github.io.git', mainCommit: 'b'.repeat(40), candidateCommit: null },
    live: { app: identity, public: identity },
    relations: { mainIsAncestor: true, liveIsAncestor: true, remoteCandidateIsAncestor: null, candidateAheadOfMain: 1, candidateAheadOfLive: 2 },
    legacyReleaseBranch: { commit: null, isAncestorOfCandidate: false, legacyOnlyCommits: 0, candidateOnlyCommits: 0 },
    verification: { passed: true, verifiedCommit: candidate, workflowAuthority: validateWorkflowAuthority(workflow) },
  })
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
}

function activationReceipt() {
  const body = {
    contract: 'supermega.managed_workspace_activation_receipt.v2',
    version: 2,
    status: 'active',
    replayed: false,
    activationId: '00000000-0000-4000-8000-000000000001',
    planDigest: `sha256:${'1'.repeat(64)}`,
    workspaceId: 'fictional-status-spa',
    ownerActorId: '00000000-0000-4000-8000-000000000002',
    projectRef: 'fictionalprojectrefx',
    releaseCommit: 'a'.repeat(40),
    adminCaSha256: `sha256:${'2'.repeat(64)}`,
    activatedAt: '2026-08-22T06:30:00.000Z',
    authority: { system: 'postgresql', table: 'app_private.workspace_events', commandId: '00000000-0000-4000-8000-000000000001', verification: 'requery_required' },
    localProjectionTrusted: false,
    secretValuesExposed: false,
    externalActionsPerformed: ['workspace_access_control_insert', 'workspace_membership_insert', 'immutable_activation_event_insert'],
  }
  return { ...body, projectionDigest: `sha256:${createHash('sha256').update(canonicalJson(body)).digest('hex')}` }
}

test('reports every private Spa launch stage without returning client identity', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-client-status-'))
  const starter = join(parent, 'starter')
  const pilot = join(parent, 'pilot')
  const protectedWorkspace = join(parent, 'protected-client')
  const launchWorkspace = join(parent, 'client-launch')
  try {
    await initShopPilotIntakeStarter(starter)
    const starterStatus = await inspectShopClientLaunchStatus(starter)
    assert.equal(starterStatus.overallStage, 'private-owner-intake-required')
    assert.equal(starterStatus.client.entryFile, 'START-HERE.html')
    const unboundReceiptPath = join(parent, 'unbound-activation.json')
    await writeFile(unboundReceiptPath, `${JSON.stringify(activationReceipt())}\n`)
    await assert.rejects(
      () => inspectShopClientLaunchStatus(starter, { activationReceipt: unboundReceiptPath }),
      /shop_client_launch_status_activation_binding_invalid/,
    )

    await initShopPilotSalesWorkspaceFromBundle({ contract: 'supermega.shop.pilot_intake_bundle.v1', contactEvent, ownerInput }, pilot)
    assert.equal((await inspectShopClientLaunchStatus(pilot)).client.stage, 'owner-input-required')
    await prepareShopPilotSalesWorkspace(pilot)
    assert.equal((await inspectShopClientLaunchStatus(pilot)).client.stage, 'owner-decision-required')

    await createShopPilotClientWorkspace(pilot, protectedWorkspace, 'Fictional implementation operator', '2026-08-22T06:00:00.000Z')
    assert.equal((await inspectShopClientLaunchStatus(protectedWorkspace)).client.stage, 'protected-shop-workspace-created')

    await prepareShopPilotClientLaunch(pilot, launchWorkspace, 'Fictional implementation operator', '2026-08-22T06:00:00.000Z')
    const launchStatus = await inspectShopClientLaunchStatus(launchWorkspace)
    assert.equal(launchStatus.client.stage, 'private-client-launch-dashboard-ready')
    assert.equal(launchStatus.activation.hostedActivationProven, false)
    assert.equal(launchStatus.controls.externalWritesPerformed, false)
    assert.doesNotMatch(JSON.stringify(launchStatus), /Fictional Status Spa|Fictional Operator|fictional-status@example\.invalid/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('adds locally verified release and receipt posture without claiming hosted activation', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-client-status-evidence-'))
  const pilot = join(parent, 'pilot')
  const launchWorkspace = join(parent, 'client-launch')
  const packetPath = join(parent, 'release.json')
  const receiptPath = join(parent, 'activation.json')
  try {
    await initShopPilotSalesWorkspaceFromBundle({ contract: 'supermega.shop.pilot_intake_bundle.v1', contactEvent, ownerInput }, pilot)
    await prepareShopPilotSalesWorkspace(pilot)
    await prepareShopPilotClientLaunch(pilot, launchWorkspace, 'Fictional implementation operator', '2026-08-22T06:00:00.000Z')
    await writeFile(packetPath, `${JSON.stringify(releasePacket(), null, 2)}\n`)
    await writeFile(receiptPath, `${JSON.stringify(activationReceipt(), null, 2)}\n`)
    const status = await inspectShopClientLaunchStatus(launchWorkspace, { releasePacket: packetPath, activationReceipt: receiptPath })
    assert.equal(status.overallStage, 'hosted-activation-requery-required')
    assert.equal(status.release.status, 'owner-review-packet-locally-verified')
    assert.equal(status.release.currentRemoteStateVerified, false)
    assert.equal(status.activation.status, 'receipt-projection-locally-verified')
    assert.equal(status.activation.databaseRequeryRequired, true)
    assert.equal(status.activation.hostedActivationProven, false)
    assert.equal(status.nextAction, 'requery_hosted_activation_and_verify_client_portal')

    const altered = activationReceipt()
    altered.status = 'suspended'
    await writeFile(receiptPath, `${JSON.stringify(altered)}\n`)
    await assert.rejects(
      () => inspectShopClientLaunchStatus(launchWorkspace, { activationReceipt: receiptPath }),
      /shop_client_launch_status_activation_receipt_invalid/,
    )
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('CLI status is metadata-only and rejects unknown workspaces', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'supermega-client-status-cli-'))
  const starter = join(parent, 'starter')
  const unknown = join(parent, 'unknown')
  try {
    await initShopPilotIntakeStarter(starter)
    const run = spawnSync(process.execPath, [resolve('tools/manage_shop_pilot_workspace.mjs'), '--status', '--workspace', starter], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    const receipt = JSON.parse(run.stdout)
    assert.equal(receipt.contract, 'supermega.shop.client_launch_status.v1')
    assert.equal(receipt.client.workspaceKind, 'private-pilot-intake-starter')
    assert.doesNotMatch(run.stdout, /supermega-client-status-cli|\\|\/[A-Za-z]/)
    await assert.rejects(() => inspectShopClientLaunchStatus(unknown), /shop_client_launch_status_workspace_unrecognized/)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})
