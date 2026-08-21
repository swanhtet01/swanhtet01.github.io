import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
const bundle = await build({
  stdin: {
    contents: `
      export { buildClientDemoBlueprint, clientDemoPresets } from './client-onboarding.ts'
      export { buildClientExtensionManifest, verifyClientExtensionManifest, buildClientExtensionActivationPlan, verifyClientExtensionActivationPlan } from './client-extension-manifest.ts'
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

console.log(JSON.stringify({ ok: true, contract: 'supermega.client-extension-manifest.v1', checks: 26, digest: manifest.digest, activationPlanDigest: activationPlan.digest, blueprintDigest: manifest.blueprintDigest }))
