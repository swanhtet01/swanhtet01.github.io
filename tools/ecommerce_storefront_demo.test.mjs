import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCE_KEY,
  commerceOrderItemSummary,
  commerceOrderPromiseUrgency,
  commercePaymentDecision,
  commercePaymentPolicies,
  commercePromotionDecision,
  commercePromotionPolicies,
  commerceReceivablesAging,
  commerceShippingDecision,
  commerceShippingPolicies,
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
  // The install is on a clean slate — seed SKUs are absent from the workspace.
  assert.ok(!state.items.some((item) => item.sku.startsWith('SM-')))
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

test('a storefront uses the industry vocabulary of the client pack', async () => {
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
  const { LOCAL_STOREFRONT_DRAFT_SCOPE, readStorefrontDraft } = await import(
    '../showroom/src/products/ecommerce/storefront-draft.ts'
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
  const rows = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE, storageAdapter).draft.merchandising
  const collections = new Set(rows.map((row) => row.collection))
  assert.ok(collections.has('Treatments'), `spa storefront must use spa wording, saw ${JSON.stringify([...collections])}`)
  assert.ok(!collections.has('Featured today'), 'generic demo wording must not appear for a known pack')
  assert.ok(
    rows.every((row) => !row.note.startsWith('Demo ')),
    `notes must read as trade guidance, saw ${JSON.stringify(rows.map((row) => row.note))}`,
  )
})

const RETAIL_ITEMS = [
  { sku: 'RTL-SHIRT', name: 'Cotton shirt', onHand: 12, reorderAt: 3, price: 18000 },
  { sku: 'RTL-PANTS', name: 'Denim pants', onHand: 8, reorderAt: 2, price: 35000 },
  { sku: 'RTL-JACKET', name: 'Light jacket', onHand: 4, reorderAt: 1, price: 58000 },
  { sku: 'RTL-BAG', name: 'Tote bag', onHand: 6, reorderAt: 2, price: 12000 },
]

function retailWorkspace() {
  const installed = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
    sampleId: 'retail',
    sampleName: 'Retail',
    items: RETAIL_ITEMS,
    capturedAt: CAPTURED_AT,
  })
  assert.ok(installed, 'the retail working sample must install')
  return installed
}

test('a retail storefront uses trade vocabulary, not spa or generic wording', async () => {
  const state = retailWorkspace()
  const storage = new Map([[COMMERCE_KEY, JSON.stringify(state)]])
  const storageAdapter = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: (key) => { storage.delete(key) },
  }
  const { activateLocalEcommerceWorkingSample } = await import(
    '../showroom/src/products/ecommerce/local-merchandising-import.ts'
  )
  const { LOCAL_STOREFRONT_DRAFT_SCOPE, readStorefrontDraft } = await import(
    '../showroom/src/products/ecommerce/storefront-draft.ts'
  )
  const result = await activateLocalEcommerceWorkingSample(
    { templateId: 'social-storefront', businessName: 'Rangoon Threads', capturedAt: CAPTURED_AT },
    {
      storage: storageAdapter,
      catalog: state.items,
      locks: { request: async (_name, _options, callback) => callback() },
    },
  )
  assert.ok(result.ok, `retail activation failed: ${result.ok ? '' : result.error}`)
  const rows = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE, storageAdapter).draft.merchandising
  const collections = new Set(rows.map((row) => row.collection))
  assert.ok(
    collections.has('Trade essentials'),
    `retail storefront must use retail vocabulary, saw ${JSON.stringify([...collections])}`,
  )
  assert.ok(!collections.has('Treatments'), 'spa wording must not bleed onto a retail storefront')
  assert.ok(!collections.has('Featured today'), 'generic demo wording must not appear for a known pack')
  assert.ok(
    rows.every((row) => row.sku.startsWith('RTL-')),
    `all storefront rows must be client products, saw ${JSON.stringify(rows.map((row) => row.sku))}`,
  )
})

const GYM_ITEMS = [
  { sku: 'GYM-COACHING', name: 'Personal coaching session', onHand: 10, reorderAt: 2, price: 35000 },
  { sku: 'GYM-ACCESS', name: 'Monthly access pass', onHand: 20, reorderAt: 5, price: 80000 },
  { sku: 'GYM-YOGA', name: 'Yoga class pack', onHand: 8, reorderAt: 2, price: 25000 },
  { sku: 'GYM-NUTRITION', name: 'Nutrition plan', onHand: 5, reorderAt: 1, price: 18000 },
]

function gymWorkspace() {
  const installed = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
    sampleId: 'gym',
    sampleName: 'Gym',
    items: GYM_ITEMS,
    capturedAt: CAPTURED_AT,
  })
  assert.ok(installed, 'the gym working sample must install')
  return installed
}

test('a gym storefront uses coaching vocabulary, not spa or retail wording', async () => {
  const state = gymWorkspace()
  const storage = new Map([[COMMERCE_KEY, JSON.stringify(state)]])
  const storageAdapter = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: (key) => { storage.delete(key) },
  }
  const { activateLocalEcommerceWorkingSample } = await import(
    '../showroom/src/products/ecommerce/local-merchandising-import.ts'
  )
  const { LOCAL_STOREFRONT_DRAFT_SCOPE, readStorefrontDraft } = await import(
    '../showroom/src/products/ecommerce/storefront-draft.ts'
  )
  const result = await activateLocalEcommerceWorkingSample(
    { templateId: 'social-storefront', businessName: 'Fitness Studio', capturedAt: CAPTURED_AT },
    {
      storage: storageAdapter,
      catalog: state.items,
      locks: { request: async (_name, _options, callback) => callback() },
    },
  )
  assert.ok(result.ok, `gym activation failed: ${result.ok ? '' : result.error}`)
  const rows = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE, storageAdapter).draft.merchandising
  const collections = new Set(rows.map((row) => row.collection))
  assert.ok(
    collections.has('Coaching'),
    `gym storefront must use coaching vocabulary, saw ${JSON.stringify([...collections])}`,
  )
  assert.ok(!collections.has('Treatments'), 'spa wording must not appear on a gym storefront')
  assert.ok(!collections.has('Trade essentials'), 'retail wording must not appear on a gym storefront')
  assert.ok(!collections.has('Featured today'), 'generic demo wording must not appear for a known pack')
  assert.ok(
    rows.every((row) => row.sku.startsWith('GYM-')),
    `all gym storefront rows must be gym products, saw ${JSON.stringify(rows.map((row) => row.sku))}`,
  )
})

test('payment decision approves matching adapter+fulfilment pairs and rejects mismatches', () => {
  const state = createSeedCommerce()
  const policies = commercePaymentPolicies(state)
  assert.ok(policies.length >= 3, 'seed must carry at least three payment policies')
  const REVIEWED_AT = '2026-08-08T02:00:00.000Z'

  // pay_on_pickup with pickup → approved; with delivery → rejected.
  const pickupApproved = commercePaymentDecision(policies, 'pay_on_pickup', 'pickup', 50000, REVIEWED_AT)
  assert.ok(pickupApproved, 'pay_on_pickup must return a decision')
  assert.equal(pickupApproved.status, 'approved')
  assert.equal(pickupApproved.reason, 'approved')

  const pickupWrongFulfilment = commercePaymentDecision(policies, 'pay_on_pickup', 'delivery', 50000, REVIEWED_AT)
  assert.ok(pickupWrongFulfilment)
  assert.equal(pickupWrongFulfilment.status, 'rejected')
  assert.equal(pickupWrongFulfilment.reason, 'fulfilment_not_allowed')

  // cash_on_delivery with delivery, within limit → approved.
  const codApproved = commercePaymentDecision(policies, 'cash_on_delivery', 'delivery', 100000, REVIEWED_AT)
  assert.ok(codApproved)
  assert.equal(codApproved.status, 'approved')

  // cash_on_delivery above the 500,000 MMK cap → rejected.
  const codExceeded = commercePaymentDecision(policies, 'cash_on_delivery', 'delivery', 600000, REVIEWED_AT)
  assert.ok(codExceeded)
  assert.equal(codExceeded.status, 'rejected')
  assert.equal(codExceeded.reason, 'amount_exceeded')

  // kbzpay_manual allows both fulfilments.
  const kbzPickup = commercePaymentDecision(policies, 'kbzpay_manual', 'pickup', 200000, REVIEWED_AT)
  assert.ok(kbzPickup)
  assert.equal(kbzPickup.status, 'approved')
  const kbzDelivery = commercePaymentDecision(policies, 'kbzpay_manual', 'delivery', 200000, REVIEWED_AT)
  assert.ok(kbzDelivery)
  assert.equal(kbzDelivery.status, 'approved')

  // An invalid adapter must return null.
  assert.equal(commercePaymentDecision(policies, 'unknown_adapter', 'pickup', 50000, REVIEWED_AT), null)

  // An empty policy list means not_found.
  const notFound = commercePaymentDecision([], 'pay_on_pickup', 'pickup', 50000, REVIEWED_AT)
  assert.ok(notFound)
  assert.equal(notFound.status, 'rejected')
  assert.equal(notFound.reason, 'not_found')
})

test('shipping decision resolves a known township, returns pickup for pickup fulfilment, and rejects unknown townships', () => {
  const state = createSeedCommerce()
  const policies = commerceShippingPolicies(state)
  assert.ok(policies.length >= 1, 'seed must carry at least one shipping policy')
  const REVIEWED_AT = '2026-08-08T02:00:00.000Z'

  // Pickup fulfilment is always status: pickup, fee 0.
  const pickup = commerceShippingDecision(policies, 'pickup', null, REVIEWED_AT)
  assert.ok(pickup)
  assert.equal(pickup.status, 'pickup')
  assert.equal(pickup.feeMmk, 0)
  assert.equal(pickup.zoneCode, null)

  // Known township (case-insensitive) → approved with the zone fee.
  const known = commerceShippingDecision(policies, 'delivery', 'Bahan', REVIEWED_AT)
  assert.ok(known)
  assert.equal(known.status, 'approved')
  assert.equal(known.feeMmk, 3000)
  assert.equal(known.zoneCode, 'YGN-CENTRAL')

  const knownLower = commerceShippingDecision(policies, 'delivery', 'bahan', REVIEWED_AT)
  assert.ok(knownLower)
  assert.equal(knownLower.status, 'approved', 'township lookup must be case-insensitive')

  // Unknown township → not_found.
  const unknown = commerceShippingDecision(policies, 'delivery', 'Mandalay', REVIEWED_AT)
  assert.ok(unknown)
  assert.equal(unknown.status, 'rejected')
  assert.equal(unknown.reason, 'not_found')

  // Empty township for delivery → null.
  assert.equal(commerceShippingDecision(policies, 'delivery', '', REVIEWED_AT), null)
})

test('promotion decision applies a percentage discount, enforces minimum subtotal, and rejects unknown codes', () => {
  const state = createSeedCommerce()
  const policies = commercePromotionPolicies(state)
  assert.ok(policies.length >= 1, 'seed must carry at least one promotion policy')
  const REVIEWED_AT = '2026-08-08T02:00:00.000Z'

  // null code → not_requested, full amount returned.
  const noCode = commercePromotionDecision(policies, null, 50000, REVIEWED_AT)
  assert.ok(noCode)
  assert.equal(noCode.status, 'not_requested')
  assert.equal(noCode.netSubtotalMmk, 50000)
  assert.equal(noCode.discountMmk, 0)

  // WELCOME code with sufficient subtotal → approved, 10% off (capped at 10,000 MMK).
  const approved = commercePromotionDecision(policies, 'WELCOME', 50000, REVIEWED_AT)
  assert.ok(approved)
  assert.equal(approved.status, 'approved')
  assert.equal(approved.discountMmk, 5000)
  assert.equal(approved.netSubtotalMmk, 45000)

  // Case-insensitive code entry.
  const approvedLower = commercePromotionDecision(policies, 'welcome', 50000, REVIEWED_AT)
  assert.ok(approvedLower)
  assert.equal(approvedLower.status, 'approved')

  // Subtotal below minimum → minimum_not_met.
  const tooSmall = commercePromotionDecision(policies, 'WELCOME', 5000, REVIEWED_AT)
  assert.ok(tooSmall)
  assert.equal(tooSmall.status, 'rejected')
  assert.equal(tooSmall.reason, 'minimum_not_met')

  // Unknown code → not_found.
  const notFound = commercePromotionDecision(policies, 'DOESNOTEXIST', 50000, REVIEWED_AT)
  assert.ok(notFound)
  assert.equal(notFound.status, 'rejected')
  assert.equal(notFound.reason, 'not_found')

  // Empty string → null.
  assert.equal(commercePromotionDecision(policies, '', 50000, REVIEWED_AT), null)
})

// The seed orders were created relative to deterministicSeedNow = 2026-07-23T08:00:00.000Z.
// ORD-1042 promisedAt = seedNow + 1h; ORD-1041 promisedAt = seedNow + 1.5h.
const SEED_NOW_MS = Date.parse('2026-07-23T08:00:00.000Z')

test('receivables aging buckets pending orders and excludes reconciled orders', () => {
  const state = createSeedCommerce()

  // At seed time, both pending orders are current (promisedAt is in the future).
  const atSeedTime = commerceReceivablesAging(state, SEED_NOW_MS)
  assert.equal(atSeedTime.rows.length, 2, 'aging must include both pending orders')
  assert.equal(atSeedTime.overdueOrders, 0, 'no orders are overdue at seed time')
  assert.equal(atSeedTime.overdueMmk, 0)
  assert.equal(atSeedTime.totalOutstandingMmk, 37000 + 12000)
  assert.ok(atSeedTime.rows.every((row) => row.bucket === 'current'), 'all rows must be current at seed time')

  // Ten days later both orders are overdue (~10 days past due → '8_30' bucket).
  const tenDaysLaterMs = SEED_NOW_MS + 10 * 24 * 60 * 60 * 1000
  const at10Days = commerceReceivablesAging(state, tenDaysLaterMs)
  assert.equal(at10Days.overdueOrders, 2)
  assert.equal(at10Days.overdueMmk, 37000 + 12000)
  assert.ok(at10Days.rows.every((row) => row.bucket === '8_30'), 'rows must be in 8_30 bucket at 10 days past due')

  // The reconciled order (ORD-1039) must never appear in aging.
  assert.ok(at10Days.rows.every((row) => row.orderId !== 'ORD-1039'), 'reconciled order must be excluded')

  // totalsMmk sums must add up.
  const bucketsTotal = Object.values(at10Days.totalsMmk).reduce((sum, v) => sum + v, 0)
  assert.equal(bucketsTotal, at10Days.totalOutstandingMmk)
})

test('commerceOrderPromiseUrgency and commerceOrderItemSummary return correct values', () => {
  const baseOrder = { promisedAt: new Date(SEED_NOW_MS + 90 * 60 * 1000).toISOString() }

  // Due in 90 minutes — beyond the 60-minute threshold → scheduled.
  assert.equal(commerceOrderPromiseUrgency(baseOrder, SEED_NOW_MS), 'scheduled')

  // Due in 30 minutes — within the 60-minute window → due_soon.
  const dueSoonOrder = { promisedAt: new Date(SEED_NOW_MS + 30 * 60 * 1000).toISOString() }
  assert.equal(commerceOrderPromiseUrgency(dueSoonOrder, SEED_NOW_MS), 'due_soon')

  // Past promised time → late.
  const lateOrder = { promisedAt: new Date(SEED_NOW_MS - 1).toISOString() }
  assert.equal(commerceOrderPromiseUrgency(lateOrder, SEED_NOW_MS), 'late')

  // No promisedAt → unrecorded.
  assert.equal(commerceOrderPromiseUrgency({}, SEED_NOW_MS), 'unrecorded')

  // Item summary: a single line uses the line name; multiple lines → "N items".
  const oneLine = [{ sku: 'SM-1001', name: 'Daily essentials basket', quantity: 2, unitPriceMmk: 18500 }]
  assert.equal(commerceOrderItemSummary(oneLine), 'Daily essentials basket')
  const twoLines = [
    { sku: 'SM-1001', name: 'Daily essentials basket', quantity: 2, unitPriceMmk: 18500 },
    { sku: 'SM-1003', name: 'Household refill', quantity: 1, unitPriceMmk: 12000 },
  ]
  assert.equal(commerceOrderItemSummary(twoLines), '2 items')
})
