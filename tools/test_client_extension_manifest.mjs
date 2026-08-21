import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
const bundle = await build({
  stdin: {
    contents: `
      export { buildClientDemoBlueprint, clientDemoPresets } from './client-onboarding.ts'
      export { buildClientExtensionManifest, verifyClientExtensionManifest, buildClientExtensionActivationPlan, verifyClientExtensionActivationPlan, buildClientExtensionPortalBinding, verifyClientExtensionPortalBinding } from './client-extension-manifest.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/client-extension-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})
const model = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

const preset = model.clientDemoPresets.find((candidate) => candidate.id === 'service-business')
const blueprint = model.buildClientDemoBlueprint({ workspace: 'Private spa client', owner: 'Implementation owner', presetId: preset.id, selections: preset.selections })
const request = {
  id: 'ext-spa-membership',
  label: 'Spa membership packages',
  outcome: 'Track reviewed treatment packages and remaining sessions without bypassing Shop payment authority.',
  baseProduct: 'commerce',
  domain: 'customer',
  mode: 'reviewed-write',
  records: ['membership_plan', 'membership_balance', 'membership_redemption'],
  roles: ['Spa manager', 'Front desk operator'],
  dependsOn: ['shop-order-to-cash', 'shop-customer-credit', 'platform-approval'],
  acceptanceCriteria: [
    'A named operator can draft a package without charging or reducing a balance.',
    'A reviewed Shop payment creates one idempotent membership balance.',
    'Every redemption retains actor reason and source-order evidence.',
  ],
}
const manifest = await model.buildClientExtensionManifest(blueprint, request, '2026-08-21T00:00:00.000Z')
assert.match(manifest.digest, /^sha256:[a-f0-9]{64}$/)
assert.match(manifest.blueprintDigest, /^sha256:[a-f0-9]{64}$/)
assert.deepEqual(manifest.authority.requestedActions, ['read', 'draft', 'propose-write'])
assert.equal(manifest.authority.crossProductWritesAllowed, false)
assert.equal(manifest.lifecycle.status, 'requested')
assert.equal(manifest.controls.activationStatus, 'not-implemented')
assert.deepEqual(await model.verifyClientExtensionManifest(manifest, blueprint), {
  ok: true,
  contract: 'supermega.client_extension_manifest.v1',
  digest: manifest.digest,
  blueprintDigest: manifest.blueprintDigest,
})

const tampered = structuredClone(manifest)
tampered.records.push('secret_override')
await assert.rejects(model.verifyClientExtensionManifest(tampered, blueprint), /invalid|changed/)
const otherBlueprint = model.buildClientDemoBlueprint({ workspace: 'Another spa client', owner: 'Implementation owner', presetId: preset.id, selections: preset.selections })
await assert.rejects(model.verifyClientExtensionManifest(manifest, otherBlueprint), /another client blueprint|changed/)
await assert.rejects(model.buildClientExtensionManifest(blueprint, { ...request, baseProduct: 'production' }, manifest.createdAt), /not selected/)
await assert.rejects(model.buildClientExtensionManifest(blueprint, { ...request, dependsOn: ['plant-job-control'] }, manifest.createdAt), /known capability/)
await assert.rejects(model.buildClientExtensionManifest(blueprint, { ...request, records: ['MembershipBalance'] }, manifest.createdAt), /snake_case/)
await assert.rejects(model.buildClientExtensionManifest(blueprint, { ...request, acceptanceCriteria: ['Only one'] }, manifest.createdAt), /acceptance criteria/)

const digest = (character) => `sha256:${character.repeat(64)}`
const activationEvidence = {
  implementationVersion: 1,
  implementationDigest: digest('1'),
  migrationDigest: digest('2'),
  rollbackDigest: digest('3'),
  securityReviewDigest: digest('4'),
  securityReviewedBy: 'Named security reviewer',
  securityReviewedAt: '2026-08-21T01:00:00.000Z',
  approvedBy: blueprint.client.owner,
  approvedAt: '2026-08-21T02:00:00.000Z',
}
const activationPlan = await model.buildClientExtensionActivationPlan(manifest, blueprint, activationEvidence)
assert.equal(activationPlan.schema, 'supermega.client_extension_activation_plan.v1')
assert.equal(activationPlan.manifestDigest, manifest.digest)
assert.equal(activationPlan.authority.status, 'planned-not-applied')
assert.equal(activationPlan.authority.tenantWritesPerformed, false)
assert.equal(activationPlan.controls.crossProductWritesAllowed, false)
assert.deepEqual(await model.verifyClientExtensionActivationPlan(activationPlan, manifest, blueprint), {
  ok: true,
  contract: 'supermega.client_extension_activation_plan.v1',
  digest: activationPlan.digest,
  manifestDigest: manifest.digest,
  status: 'planned-not-applied',
})

const tamperedPlan = structuredClone(activationPlan)
tamperedPlan.implementation.version = 2
await assert.rejects(model.verifyClientExtensionActivationPlan(tamperedPlan, manifest, blueprint), /invalid|stale|changed/)
await assert.rejects(model.buildClientExtensionActivationPlan(manifest, blueprint, { ...activationEvidence, approvedBy: 'Another owner' }), /named client owner/)
await assert.rejects(model.buildClientExtensionActivationPlan(manifest, blueprint, { ...activationEvidence, approvedAt: '2026-08-21T00:00:00.000Z' }), /predate/)
await assert.rejects(model.buildClientExtensionActivationPlan(manifest, blueprint, { ...activationEvidence, rollbackDigest: digest('2') }), /independently digest-bound/)

const canonicalJson = (value) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
}
const portal = (overrides = {}) => {
  const payload = {
    contract: 'supermega.client_portal_activation_manifest.v1',
    version: 1,
    status: 'approved_plan_not_applied',
    tenant: {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workspaceLabel: blueprint.client.workspace,
      ownerActorId: '22222222-2222-4222-8222-222222222222',
      ownerLabel: blueprint.client.owner,
      products: ['shop', 'website', 'ecommerce'],
      ...overrides.tenant,
    },
    portal: {
      bundleDigest: digest('5'),
      productBindings: [
        { product: 'shop', runtimeProduct: 'commerce' },
        { product: 'website', runtimeProduct: 'website' },
        { product: 'ecommerce', runtimeProduct: 'ecommerce' },
      ],
      crossTenantReadsAllowed: false,
      crossProductWritesAllowed: false,
      ...overrides.portal,
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
  return { ...payload, manifestDigest: `sha256:${createHash('sha256').update(canonicalJson(payload)).digest('hex')}` }
}
const portalManifest = portal()
const portalBinding = await model.buildClientExtensionPortalBinding(manifest, activationPlan, blueprint, portalManifest)
assert.equal(portalBinding.schema, 'supermega.client_extension_portal_binding.v1')
assert.equal(portalBinding.tenant.workspaceId, portalManifest.tenant.workspaceId)
assert.equal(portalBinding.module.productEntitlement, 'shop')
assert.equal(portalBinding.authority.status, 'approved-not-applied')
assert.equal(portalBinding.authority.tenantWritesPerformed, false)
assert.equal(portalBinding.controls.separateActivationRequired, true)
assert.deepEqual(await model.verifyClientExtensionPortalBinding(portalBinding, manifest, activationPlan, blueprint, portalManifest), {
  ok: true,
  contract: 'supermega.client_extension_portal_binding.v1',
  digest: portalBinding.digest,
  portalManifestDigest: portalManifest.manifestDigest,
  workspaceId: portalManifest.tenant.workspaceId,
  status: 'approved-not-applied',
})
await assert.rejects(model.buildClientExtensionPortalBinding(manifest, activationPlan, blueprint, portal({ tenant: { workspaceLabel: 'Another tenant' } })), /does not match/)
await assert.rejects(model.buildClientExtensionPortalBinding(manifest, activationPlan, blueprint, portal({ tenant: { products: ['website', 'ecommerce'] }, portal: { productBindings: [{ product: 'website', runtimeProduct: 'website' }, { product: 'ecommerce', runtimeProduct: 'ecommerce' }] } })), /not purchased/)
const tamperedPortalBinding = structuredClone(portalBinding)
tamperedPortalBinding.tenant.workspaceId = '33333333-3333-4333-8333-333333333333'
await assert.rejects(model.verifyClientExtensionPortalBinding(tamperedPortalBinding, manifest, activationPlan, blueprint, portalManifest), /invalid|cross-tenant|changed/)

console.log(JSON.stringify({ ok: true, contract: 'supermega.client-extension-manifest.v1', checks: 36, digest: manifest.digest, activationPlanDigest: activationPlan.digest, portalBindingDigest: portalBinding.digest, blueprintDigest: manifest.blueprintDigest }))
