import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import source from '../site-manifest.json' with { type: 'json' }
import { activeProductContracts } from '../showroom/src/core/product-visibility.ts'
import { projectClientSetupManifest, clientSetupManifestPlugin } from '../showroom/scripts/client-setup-manifest.ts'

test('projection preserves exact templates, identities and acquisition policy without marketing fields', () => {
  const result = projectClientSetupManifest(source)
  assert.deepEqual(result.productVisibility, source.productVisibility)
  assert.deepEqual(result.customerProducts, source.customerProducts.map(({ id, runtimeId, name, status, headline, templates }) => ({ id, runtimeId, name, status, headline, templates: templates.map(({ id, name, outcome, workflow, entryPoints, metric }) => ({ id, name, outcome, workflow, entryPoints, metric })) })))
  assert.ok(JSON.stringify(source).includes('provisioningRecipe'))
  assert.ok(!JSON.stringify(result).includes('provisioningRecipe'))
  assert.deepEqual(activeProductContracts(result).map(p => p.id), activeProductContracts(source).map(p => p.id))
  assert.ok(result.customerProducts.some(p => p.id === 'plant'))
  assert.deepEqual(Object.keys(result).sort(), ['customerProducts', 'productVisibility'])
  assert.ok(JSON.stringify(result).length < JSON.stringify(source).length / 2)
})

test('invalid visibility or setup fields fail closed', () => {
  assert.throws(() => projectClientSetupManifest({ ...source, productVisibility: null }))
  assert.throws(() => projectClientSetupManifest({ ...source, customerProducts: source.customerProducts.map(p => ({ ...p, templates: null })) }))
  for (const template of [null, {}, { ...source.customerProducts[0].templates[0], workflow: [42] }]) {
    assert.throws(() => projectClientSetupManifest({ ...source, customerProducts: source.customerProducts.map(p => ({ ...p, templates: [template] })) }), /client_setup_template_invalid/)
  }
})

test('plugin is limited to the canonical manifest and reviewed consumer, with watched source', () => {
  const root = resolve('showroom')
  const manifest = resolve('site-manifest.json')
  const plugin = clientSetupManifestPlugin(root)
  assert.equal(plugin.resolveId('../../../site-manifest.json', resolve(root, 'src/core/product-setup.ts')), manifest)
  assert.throws(() => plugin.resolveId('../../../site-manifest.json', resolve(root, 'src/core/another.ts')), /unreviewed_consumer/)
  assert.equal(plugin.resolveId('./unrelated.json', resolve(root, 'src/core/product-setup.ts')), null)
  const watched = []
  assert.deepEqual(JSON.parse(plugin.load.call({ addWatchFile: path => watched.push(path) }, manifest)), projectClientSetupManifest(source))
  assert.deepEqual(watched, [manifest])
  assert.equal(plugin.load.call({}, resolve(root, 'unrelated.json')), null)
})
