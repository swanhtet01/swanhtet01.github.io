import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
const bundle = await build({
  stdin: {
    contents: `
      export { buildClientDemoBlueprint, clientDemoPresets } from './client-onboarding.ts'
      export { buildClientExtensionManifest, verifyClientExtensionManifest } from './client-extension-manifest.ts'
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

console.log(JSON.stringify({ ok: true, contract: 'supermega.client-extension-manifest.v1', checks: 15, digest: manifest.digest, blueprintDigest: manifest.blueprintDigest }))
