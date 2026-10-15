import assert from 'node:assert/strict'
import test from 'node:test'
import { templateManifestKey, templateManifestSupports } from '../showroom/src/core/template-manifest.ts'
import { shopBusinessTemplateManifests } from '../showroom/src/products/shop/business-templates.ts'
import { websiteStarterTemplateManifests } from '../showroom/src/products/website/website-starter.ts'
import { ecommerceWorkingSampleManifests } from '../showroom/src/products/ecommerce/local-merchandising-import.ts'

test('all shipped product templates retain unique portable identities and capability boundaries', () => {
  const manifests = [
    ...shopBusinessTemplateManifests.manifests,
    ...websiteStarterTemplateManifests.manifests,
    ...ecommerceWorkingSampleManifests.manifests,
  ]
  assert.equal(manifests.length, 16)
  assert.equal(new Set(manifests.map(templateManifestKey)).size, manifests.length)
  for (const manifest of manifests) {
    assert.equal(manifest.slots.identity, true)
    assert.equal(manifest.capabilities.includes('plant.production'), false)
  }
  assert.equal(shopBusinessTemplateManifests.manifests.every((manifest) => templateManifestSupports(manifest, 'shop.counter')), true)
  assert.equal(websiteStarterTemplateManifests.manifests.every((manifest) => templateManifestSupports(manifest, 'website.presence')), true)
  assert.equal(ecommerceWorkingSampleManifests.manifests.every((manifest) => templateManifestSupports(manifest, 'commerce.storefront')), true)
})
