import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const tool = resolve(root, 'tools', 'manage_client_extension.mjs')
const prepare = resolve(root, 'tools', 'prepare_client_demo.mjs')

function run(...args) {
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 90_000 })
}

function output(result) {
  return JSON.parse((result.stdout || result.stderr).trim())
}

function assertMetadataOnlyReceipt(receipt, workspaceId) {
  assert.equal(receipt.workspaceId, undefined)
  assert.equal(receipt.workspaceDigest, `sha256:${createHash('sha256').update(workspaceId).digest('hex')}`)
  assert.equal(receipt.clientIdentifiersExposed, false)
  assert.doesNotMatch(JSON.stringify(receipt), new RegExp(workspaceId))
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
}

test('internal extension tool creates and verifies a tenant-bound no-write extension lifecycle', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'supermega-extension-'))
  const intake = resolve(directory, 'intake')
  const initialized = run(prepare, '--init', intake, '--preset', 'service-business', '--products', 'shop,website,ecommerce')
  assert.equal(initialized.status, 0, initialized.stderr)
  const profilePath = resolve(intake, 'client.json')
  const profile = JSON.parse(await readFile(profilePath, 'utf8'))
  profile.workspace = 'Named Spa Workspace'
  profile.owner = 'Named Spa Owner'
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`)
  const preparation = resolve(directory, 'private-review.json')
  const prepared = run(prepare, '--data-dir', intake, '--out', preparation)
  assert.equal(prepared.status, 0, prepared.stderr)

  const requestPath = resolve(directory, 'extension-request.json')
  await writeFile(requestPath, `${JSON.stringify({
    id: 'ext-spa-membership',
    label: 'Spa membership packages',
    outcome: 'Track reviewed package balances through the existing Shop payment authority.',
    baseProduct: 'commerce',
    domain: 'customer',
    mode: 'reviewed-write',
    records: ['membership_plan', 'membership_balance', 'membership_redemption'],
    roles: ['Spa manager', 'Front desk operator'],
    dependsOn: ['shop-order-to-cash', 'shop-customer-credit', 'platform-approval'],
    acceptanceCriteria: ['Drafting never charges a customer.', 'A reviewed Shop payment creates one balance.'],
  }, null, 2)}\n`)
  const manifestPath = resolve(directory, 'extension-manifest.json')
  const requested = run(tool, 'request', '--preparation', preparation, '--request', requestPath, '--created-at', '2026-08-21T00:00:00.000Z', '--output', manifestPath)
  assert.equal(requested.status, 0, requested.stderr)
  assert.equal(output(requested).externalWritesPerformed, false)
  const duplicateOutput = run(tool, 'request', '--preparation', preparation, '--request', requestPath, '--created-at', '2026-08-21T00:00:00.000Z', '--output', manifestPath)
  assert.notEqual(duplicateOutput.status, 0)
  const verifiedRequest = run(tool, 'verify-request', '--preparation', preparation, '--manifest', manifestPath)
  assert.equal(verifiedRequest.status, 0, verifiedRequest.stderr)

  const digest = (character) => `sha256:${character.repeat(64)}`
  const evidencePath = resolve(directory, 'activation-evidence.json')
  await writeFile(evidencePath, `${JSON.stringify({
    implementationVersion: 1,
    implementationDigest: digest('1'),
    migrationDigest: digest('2'),
    rollbackDigest: digest('3'),
    securityReviewDigest: digest('4'),
    securityReviewedBy: 'Named Security Reviewer',
    securityReviewedAt: '2026-08-21T01:00:00.000Z',
    approvedBy: 'Named Spa Owner',
    approvedAt: '2026-08-21T02:00:00.000Z',
  }, null, 2)}\n`)
  const planPath = resolve(directory, 'activation-plan.json')
  const planned = run(tool, 'plan', '--preparation', preparation, '--manifest', manifestPath, '--evidence', evidencePath, '--output', planPath)
  assert.equal(planned.status, 0, planned.stderr)
  assert.equal(output(planned).status, 'planned-not-applied')
  const verifiedPlan = run(tool, 'verify-plan', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath)
  assert.equal(verifiedPlan.status, 0, verifiedPlan.stderr)
  assert.equal(output(verifiedPlan).externalWritesPerformed, false)

  const portalPayload = {
    contract: 'supermega.client_portal_activation_manifest.v1',
    version: 1,
    status: 'approved_plan_not_applied',
    tenant: {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workspaceLabel: 'Named Spa Workspace',
      ownerActorId: '22222222-2222-4222-8222-222222222222',
      ownerLabel: 'Named Spa Owner',
      products: ['shop', 'website', 'ecommerce'],
    },
    portal: {
      bundleDigest: digest('5'),
      productBindings: [{ product: 'shop', runtimeProduct: 'commerce' }, { product: 'website', runtimeProduct: 'website' }, { product: 'ecommerce', runtimeProduct: 'ecommerce' }],
      crossTenantReadsAllowed: false,
      crossProductWritesAllowed: false,
    },
    customSolutions: {
      activationStatus: 'not_applied',
      tenantBound: true,
      purchasedBaseProductRequired: true,
      securityReviewRequired: true,
      namedOwnerApprovalRequired: true,
      crossProductWritesAllowed: false,
    },
    authority: {
      humanApprovalBound: true,
      tenantWritesPerformed: false,
      providerCallsPerformed: false,
      externalMessagesSent: false,
      deploymentPerformed: false,
      productionActivationPerformed: false,
    },
  }
  const portalPath = resolve(directory, 'portal-activation.json')
  await writeFile(portalPath, `${JSON.stringify({ ...portalPayload, manifestDigest: `sha256:${createHash('sha256').update(canonicalJson(portalPayload)).digest('hex')}` }, null, 2)}\n`)
  const bindingPath = resolve(directory, 'portal-binding.json')
  const bound = run(tool, 'bind-portal', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath, '--portal', portalPath, '--output', bindingPath)
  assert.equal(bound.status, 0, bound.stderr)
  assert.equal(output(bound).status, 'approved-not-applied')
  assertMetadataOnlyReceipt(output(bound), portalPayload.tenant.workspaceId)
  assert.equal(output(bound).externalWritesPerformed, false)
  const verifiedBinding = run(tool, 'verify-portal-binding', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath, '--portal', portalPath, '--binding', bindingPath)
  assert.equal(verifiedBinding.status, 0, verifiedBinding.stderr)
  assert.equal(output(verifiedBinding).status, 'approved-not-applied')
  assertMetadataOnlyReceipt(output(verifiedBinding), portalPayload.tenant.workspaceId)

  const authorizationEvidencePath = resolve(directory, 'runtime-authorization-evidence.json')
  await writeFile(authorizationEvidencePath, `${JSON.stringify({
    environment: 'pilot',
    releaseCommit: 'a'.repeat(40),
    approvedBy: 'Named Spa Owner',
    approvedByActorId: portalPayload.tenant.ownerActorId,
    approvedAt: '2026-08-21T03:00:00.000Z',
    expiresAt: '2026-08-21T04:00:00.000Z',
    idempotencyKey: 'activate:named-spa:ext-spa-membership:v1',
  }, null, 2)}\n`)
  const authorizationPath = resolve(directory, 'runtime-authorization.json')
  const authorized = run(tool, 'authorize-activation', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath, '--portal', portalPath, '--binding', bindingPath, '--authorization-evidence', authorizationEvidencePath, '--output', authorizationPath)
  assert.equal(authorized.status, 0, authorized.stderr)
  assert.equal(output(authorized).status, 'authorized-not-applied')
  assertMetadataOnlyReceipt(output(authorized), portalPayload.tenant.workspaceId)
  assert.equal(output(authorized).externalWritesPerformed, false)
  const verifiedAuthorization = run(tool, 'verify-activation-authorization', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath, '--portal', portalPath, '--binding', bindingPath, '--authorization', authorizationPath, '--at', '2026-08-21T03:30:00.000Z')
  assert.equal(verifiedAuthorization.status, 0, verifiedAuthorization.stderr)
  assert.equal(output(verifiedAuthorization).status, 'authorized-not-applied')
  assert.equal(output(verifiedAuthorization).executable, true)
  assertMetadataOnlyReceipt(output(verifiedAuthorization), portalPayload.tenant.workspaceId)
  const expiredAuthorization = run(tool, 'verify-activation-authorization', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath, '--portal', portalPath, '--binding', bindingPath, '--authorization', authorizationPath, '--at', '2026-08-21T04:00:00.001Z')
  assert.notEqual(expiredAuthorization.status, 0)

  const receiptEvidencePath = resolve(directory, 'activation-receipt-evidence.json')
  await writeFile(receiptEvidencePath, `${JSON.stringify({
    activatedAt: '2026-08-21T03:30:00.000Z',
    activatedByActorId: portalPayload.tenant.ownerActorId,
    idempotencyKey: 'activate:named-spa:ext-spa-membership:v1',
    runtimeRelease: { commit: 'a'.repeat(40), brandVersion: 'jade-v3', contextVersion: '2026-08-21.1', catalogVersion: '2026-08-21.1' },
    tenantConfigRevision: 1,
    tenantConfigDigest: digest('7'),
    executionEvidenceDigest: digest('8'),
    rollbackReady: true,
    customerRecordWritesPerformed: false,
    providerCallsPerformed: false,
    deploymentPerformed: false,
    externalMessagesSent: false,
    crossTenantWritesPerformed: false,
    crossProductWritesPerformed: false,
  }, null, 2)}\n`)
  const receiptPath = resolve(directory, 'activation-receipt.json')
  const recorded = run(tool, 'record-activation', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath, '--portal', portalPath, '--binding', bindingPath, '--authorization', authorizationPath, '--receipt-evidence', receiptEvidencePath, '--output', receiptPath)
  assert.equal(recorded.status, 0, recorded.stderr)
  assert.equal(output(recorded).status, 'active')
  assert.equal(output(recorded).tenantConfigRevision, 1)
  assert.equal(output(recorded).externalWritesPerformed, false)
  assertMetadataOnlyReceipt(output(recorded), portalPayload.tenant.workspaceId)
  const verifiedReceipt = run(tool, 'verify-activation-receipt', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath, '--portal', portalPath, '--binding', bindingPath, '--authorization', authorizationPath, '--receipt', receiptPath)
  assert.equal(verifiedReceipt.status, 0, verifiedReceipt.stderr)
  assert.equal(output(verifiedReceipt).status, 'active')
  assertMetadataOnlyReceipt(output(verifiedReceipt), portalPayload.tenant.workspaceId)

  const contextProfilePath = resolve(directory, 'managed-context-profile.json')
  await writeFile(contextProfilePath, `${JSON.stringify({
    contract: 'supermega.managed_context_profile.v2',
    version: 2,
    workspaceId: portalPayload.tenant.workspaceId,
    retainedBy: portalPayload.tenant.ownerActorId,
    approvedContextDigest: digest('9'),
    product: 'shop',
    templateId: 'social-commerce',
    sourceCounts: { selectedProductRecords: 3, behaviorSignals: 2, reviewedDecisions: 1 },
    behaviorPreference: { product: 'commerce', chosenCount: 1 },
    outcome: { status: 'improved', digest: digest('a'), accepted: true },
    approvedBy: portalPayload.tenant.ownerLabel,
    approvedAt: '2026-08-21T03:20:00.000Z',
    allowedUses: ['rank_next_actions', 'draft_internal_recommendations', 'prepare_import_mapping', 'summarize_workspace_evidence'],
    forbiddenActions: ['customer_message_send', 'payment_capture', 'stock_move', 'production_write', 'domain_publish', 'crm_write', 'model_training'],
    profileDigest: digest('b'),
    rawProductRecordsIncluded: false,
    rawBehaviorEntriesIncluded: false,
    rawDecisionRecordsIncluded: false,
    modelTrainingAllowed: false,
  }, null, 2)}\n`)
  const agentContextPath = resolve(directory, 'extension-agent-context.json')
  const boundAgentContext = run(tool, 'bind-agent-context', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath, '--portal', portalPath, '--binding', bindingPath, '--authorization', authorizationPath, '--receipt', receiptPath, '--context-profile', contextProfilePath, '--output', agentContextPath)
  assert.equal(boundAgentContext.status, 0, boundAgentContext.stderr)
  assert.equal(output(boundAgentContext).status, 'context-ready-advisory')
  assertMetadataOnlyReceipt(output(boundAgentContext), portalPayload.tenant.workspaceId)
  const agentContextArtifact = JSON.parse(await readFile(agentContextPath, 'utf8'))
  assert.equal(agentContextArtifact.agentPolicy.writeExecutionAllowed, false)
  assert.equal(agentContextArtifact.agentPolicy.externalToolCallsAllowed, false)
  assert.equal(agentContextArtifact.privacyBoundary.customerRecordsIncluded, false)
  const verifiedAgentContext = run(tool, 'verify-agent-context', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath, '--portal', portalPath, '--binding', bindingPath, '--authorization', authorizationPath, '--receipt', receiptPath, '--context-profile', contextProfilePath, '--agent-context', agentContextPath)
  assert.equal(verifiedAgentContext.status, 0, verifiedAgentContext.stderr)
  assert.equal(output(verifiedAgentContext).status, 'context-ready-advisory')
  assertMetadataOnlyReceipt(output(verifiedAgentContext), portalPayload.tenant.workspaceId)

  const tamperedReceipt = JSON.parse(await readFile(receiptPath, 'utf8'))
  tamperedReceipt.execution.tenantConfigRevision = 2
  await writeFile(receiptPath, `${JSON.stringify(tamperedReceipt, null, 2)}\n`)
  const rejectedReceipt = run(tool, 'verify-activation-receipt', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath, '--portal', portalPath, '--binding', bindingPath, '--authorization', authorizationPath, '--receipt', receiptPath)
  assert.notEqual(rejectedReceipt.status, 0)
  assert.match(output(rejectedReceipt).error, /invalid|stale|changed/)

  const tamperedBinding = JSON.parse(await readFile(bindingPath, 'utf8'))
  tamperedBinding.tenant.workspaceId = '33333333-3333-4333-8333-333333333333'
  await writeFile(bindingPath, `${JSON.stringify(tamperedBinding, null, 2)}\n`)
  const rejectedBinding = run(tool, 'verify-portal-binding', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath, '--portal', portalPath, '--binding', bindingPath)
  assert.notEqual(rejectedBinding.status, 0)
  assert.match(output(rejectedBinding).error, /invalid|cross-tenant|changed/)

  const tampered = JSON.parse(await readFile(planPath, 'utf8'))
  tampered.implementation.version = 2
  await writeFile(planPath, `${JSON.stringify(tampered, null, 2)}\n`)
  const rejected = run(tool, 'verify-plan', '--preparation', preparation, '--manifest', manifestPath, '--plan', planPath)
  assert.notEqual(rejected.status, 0)
  assert.match(output(rejected).error, /invalid|stale|changed/)
})
