import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCE_KEY,
  commerceWorkingSampleSkus,
  createSeedCommerce,
  installCommerceWorkingSampleCatalog,
} from '../showroom/src/core/commerce-workspace.ts'

const CAPTURED_AT = '2026-08-08T02:00:00.000Z'

const SPA_ITEMS = [
  { sku: 'SPA-FACIAL', name: 'Signature facial', onHand: 8, reorderAt: 2, price: 45000 },
  { sku: 'SPA-MASSAGE', name: 'Aroma massage', onHand: 6, reorderAt: 2, price: 55000 },
  { sku: 'SPA-SCRUB', name: 'Body scrub', onHand: 5, reorderAt: 2, price: 38000 },
  { sku: 'SPA-OIL', name: 'Treatment oil set', onHand: 4, reorderAt: 1, price: 22000 },
]

function spaWorkspace() {
  const installed = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
    sampleId: 'spa',
    sampleName: 'Spa',
    items: SPA_ITEMS,
    capturedAt: CAPTURED_AT,
  })
  assert.ok(installed, 'the spa working sample must install')
  return installed
}

test('working-sample SKUs are recoverable and exclude the generic Shop seed items', () => {
  const state = spaWorkspace()
  const skus = commerceWorkingSampleSkus(state)
  assert.deepEqual(skus, ['SPA-FACIAL', 'SPA-MASSAGE', 'SPA-OIL', 'SPA-SCRUB'])
  assert.ok(skus.every((sku) => sku.startsWith('SPA-')))
  // The seed catalog stays in Shop but is never reported as client sample stock.
  assert.ok(state.items.some((item) => item.sku.startsWith('SM-')))
  assert.ok(!skus.some((sku) => sku.startsWith('SM-')))
})

test('a workspace with no working sample reports no preferred SKUs', () => {
  assert.deepEqual(commerceWorkingSampleSkus(createSeedCommerce()), [])
})

test("the storefront features the client's own products, not the demo seed goods", async () => {
  const state = spaWorkspace()
  const storage = new Map([[COMMERCE_KEY, JSON.stringify(state)]])
  const storageAdapter = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: (key) => { storage.delete(key) },
  }
  const { activateLocalEcommerceWorkingSample } = await import(
    '../showroom/src/products/ecommerce/local-merchandising-import.ts'
  )
  const result = await activateLocalEcommerceWorkingSample(
    { templateId: 'social-storefront', businessName: 'Yangon Wellness Spa', capturedAt: CAPTURED_AT },
    {
      storage: storageAdapter,
      catalog: state.items,
      locks: { request: async (_name, _options, callback) => callback() },
    },
  )
  assert.ok(result.ok, `activation failed: ${result.ok ? '' : result.error}`)
  const { LOCAL_STOREFRONT_DRAFT_SCOPE, readStorefrontDraft } = await import(
    '../showroom/src/products/ecommerce/storefront-draft.ts'
  )
  const stored = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE, storageAdapter)
  assert.equal(stored.status, 'ready', `draft not persisted: ${stored.error ?? ''}`)
  const rows = stored.draft.merchandising
  assert.ok(rows.length >= 4, 'the storefront must merchandise the sample products')
  const featured = rows.filter((row) => row.featured)
  assert.ok(featured.length >= 1)
  assert.ok(
    featured.every((row) => row.sku.startsWith('SPA-')),
    `featured slots must show client products, saw ${JSON.stringify(featured.map((row) => row.sku))}`,
  )
  assert.ok(
    rows.every((row) => row.sku.startsWith('SPA-')),
    `every merchandised row must be a client product, saw ${JSON.stringify(rows.map((row) => row.sku))}`,
  )
})

test('provisioning seeds one pending request that never earns the Shop proof', async () => {
  const state = spaWorkspace()
  const storage = new Map([[COMMERCE_KEY, JSON.stringify(state)]])
  const storageAdapter = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: (key) => { storage.delete(key) },
  }
  const { activateLocalEcommerceWorkingSample } = await import(
    '../showroom/src/products/ecommerce/local-merchandising-import.ts'
  )
  const { GUIDED_SAMPLE_REQUEST_ID, isGuidedSampleBuyingState } = await import(
    '../showroom/src/products/ecommerce/guided-sample-order.ts'
  )
  const { ecommerceBuyingStateStorageKey, validateEcommerceBuyingState } = await import(
    '../showroom/src/products/ecommerce/ecommerce-buying-lifecycle.ts'
  )
  const activate = () => activateLocalEcommerceWorkingSample(
    { templateId: 'social-storefront', businessName: 'Yangon Wellness Spa', capturedAt: CAPTURED_AT },
    {
      storage: storageAdapter,
      catalog: state.items,
      locks: { request: async (_name, _options, callback) => callback() },
    },
  )
  const first = await activate()
  assert.ok(first.ok, `activation failed: ${first.ok ? '' : first.error}`)

  const raw = storageAdapter.getItem(ecommerceBuyingStateStorageKey('ecommerce:local'))
  assert.ok(raw, 'a guided sample request must be seeded')
  const buying = await validateEcommerceBuyingState(JSON.parse(raw), 'ecommerce:local')
  assert.equal(buying.requests.length, 1)
  const [request] = buying.requests
  assert.equal(request.id, GUIDED_SAMPLE_REQUEST_ID)
  // The proof-earning step must be left for a human to perform in Shop.
  assert.equal(request.state, 'pending_shop_review')
  assert.ok(isGuidedSampleBuyingState(buying))
  // The Ecommerce proof counter reads Shop orders sourced ECR-; a sample creates none.
  const commerce = JSON.parse(storageAdapter.getItem(COMMERCE_KEY))
  assert.equal(commerce.orders.filter((order) => order.sourceRecordId?.startsWith('ECR-')).length, 0)

  // Re-provisioning replaces a pure guided sample rather than failing.
  const second = await activate()
  assert.ok(second.ok, `re-provisioning failed: ${second.ok ? '' : second.error}`)
})
