import assert from 'node:assert/strict'
import test from 'node:test'
import { ecommerceWorkingSampleManifest, ecommerceWorkingSampleManifests, ecommerceWorkingSampleTemplateIds } from '../showroom/src/products/ecommerce/local-merchandising-import.ts'

test('Commerce workflows resolve through portable manifests with only supported capabilities', () => {
  assert.equal(ecommerceWorkingSampleManifests.manifests.length, ecommerceWorkingSampleTemplateIds.length)
  for (const templateId of ecommerceWorkingSampleTemplateIds) {
    const manifest = ecommerceWorkingSampleManifest(templateId)
    assert.equal(manifest.id, `commerce-${templateId}`)
    assert.equal(manifest.version, 'v1')
    assert.equal(manifest.slots.identity, true)
    assert.equal(manifest.slots.catalog, true)
    assert.equal(manifest.slots.content, true)
    assert.equal(manifest.capabilities.includes('commerce.storefront'), true)
    assert.equal(manifest.capabilities.includes('shop.counter'), false)
  }
  const social = ecommerceWorkingSampleManifest('social-storefront')
  assert.deepEqual(social.capabilities, ['commerce.storefront'])
  assert.equal(social.slots.fulfilment, undefined)
  for (const templateId of ['pickup-preorder', 'wholesale-request']) {
    const manifest = ecommerceWorkingSampleManifest(templateId)
    assert.deepEqual(manifest.capabilities, ['commerce.storefront', 'commerce.fulfilment'])
    assert.equal(manifest.slots.fulfilment, true)
  }
})
