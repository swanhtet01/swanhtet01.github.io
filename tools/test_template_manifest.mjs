import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)
const bundle = await build({
  stdin: { contents: "export * from './template-manifest.ts'", resolveDir: 'showroom/src/core', sourcefile: 'template-manifest-test-entry.ts', loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
})
const model = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
const check = (value, label) => { checks += 1; assert.ok(value, label) }
const rejects = (input, label) => {
  checks += 1
  assert.throws(() => model.validateTemplateManifest(input), /Invalid template manifest/, label)
}
const valid = {
  schema: model.TEMPLATE_MANIFEST_SCHEMA,
  id: 'city-cafe',
  version: 'v1',
  capabilities: ['shop.counter', 'shop.inventory', 'website.presence', 'commerce.storefront', 'commerce.fulfilment'],
  slots: { identity: true, catalog: true, content: true, fulfilment: true },
}
const manifest = model.validateTemplateManifest(valid)
check(Object.isFrozen(manifest), 'validated manifest is immutable')
check(model.templateManifestKey(manifest) === 'city-cafe@v1', 'manifest key is stable and versioned')
check(model.templateManifestSupports(manifest, 'commerce.storefront'), 'declared capability is available')
check(!model.templateManifestSupports(manifest, 'plant.production'), 'undeclared capability remains unavailable')
const nextManifest = { ...valid, id: 'clinic-services', version: 'v2', capabilities: ['website.presence', 'website.inquiries'], slots: { identity: true, content: true } }
const registry = model.createTemplateManifestRegistry([nextManifest, valid])
check(Object.isFrozen(registry), 'manifest registry is immutable')
check(Object.isFrozen(registry.manifests), 'manifest registry entries are immutable')
check(registry.manifests.map(model.templateManifestKey).join(',') === 'city-cafe@v1,clinic-services@v2', 'registry order is stable')
check(registry.find('clinic-services', 'v2')?.id === 'clinic-services', 'registry resolves a versioned custom manifest')
check(registry.find('city-cafe')?.version === 'v1', 'registry resolves a manifest by portable identifier')
check(registry.find('unknown') === null && registry.find('city-cafe', 'v3') === null, 'registry leaves unknown manifests unavailable')
rejects([valid, valid], 'duplicate manifest registry entry')
for (const [input, label] of [
  [{ ...valid, id: 'Cafe!' }, 'noncanonical identifier'],
  [{ ...valid, version: '1' }, 'nonversioned revision'],
  [{ ...valid, capabilities: ['shop.counter', 'shop.counter'] }, 'duplicate capability'],
  [{ ...valid, capabilities: ['unknown.capability'] }, 'unknown capability'],
  [{ ...valid, slots: { identity: true, script: true } }, 'arbitrary slot'],
  [{ ...valid, capabilities: ['commerce.fulfilment'], slots: {} }, 'fulfilment without declared slot'],
  [{ ...valid, capabilities: ['plant.production'], slots: {} }, 'production without declared operations slot'],
  [{ ...valid, tenantData: { email: 'never-here@example.test' } }, 'tenant data cannot enter shared manifest'],
]) rejects(input, label)
console.log(`template manifest: ${checks} checks passed`)
