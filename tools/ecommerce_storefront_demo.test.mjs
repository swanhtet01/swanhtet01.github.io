import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCE_ACCOUNTING_HANDOFF_SCHEMA,
  COMMERCE_CLOSE_SETTLEMENT_SCHEMA,
  COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA,
  COMMERCE_KEY,
  COMMERCE_LOCK,
  COMMERCE_ORDER_ACKNOWLEDGEMENT_SCHEMA,
  COMMERCE_ORDER_CALCULATION_SCHEMA,
  COMMERCE_ORDER_CALCULATION_V2_SCHEMA,
  COMMERCE_STOREFRONT_SCHEMA,
  COMMERCE_SUPPLIER_PAYABLES_HANDOFF_SCHEMA,
  COMMERCE_SUPPORT_WORKLOAD_EXPORT_SCHEMA,
  COMMERCE_WORKSPACE_SCHEMA,
  LEGACY_COMMERCE_KEYS,
  commerceAccountMappingConfigurations,
  commerceAccountRoles,
  commerceTaxConfigurations,
  commerceTaxDecision,
  commerceWebsiteIntakes,
  commerceWorkspaceCanWrite,
  commerceCatalogDigestSource,
  commerceCustomerCreditExposure,
  commerceOrderAdjustedTotal,
  commerceOrderCalculation,
  commerceOrderHasReleasableReservation,
  commerceOrderItemSummary,
  commerceOrderLocationAllocationPreview,
  commerceOrderNeedsAction,
  commerceOrderPaymentTermsDays,
  commerceOrderPromiseUrgency,
  commerceOrderReturnExpectation,
  commercePaymentAdapterLabel,
  commercePaymentDecision,
  commercePaymentPolicies,
  commercePromotionDecision,
  commercePromotionPolicies,
  commercePurchaseBudgetCommitment,
  commercePurchaseOrderArrivalUrgency,
  commercePurchaseOrderProgress,
  commerceReceivablesAging,
  commerceShippingDecision,
  commerceShippingPolicies,
  commerceStorefrontConfiguration,
  commerceStorefrontRequests,
  commerceSupplierPayablesAging,
  commerceSupplierReturnClaimBalance,
  commerceSupplierReturnClaimStatus,
  commerceSupplierSourcingSelectedQuote,
  commerceCatalogBaselineDigest,
  commerceCatalogBaselines,
  commerceCatalogChanges,
  commerceCloseExpectation,
  commerceCustomerCreditReview,
  commerceOrderCalculationDigest,
  commercePurchaseBudgetEnvelopes,
  commercePurchaseRequisitions,
  commerceStorefrontConfigurationActionId,
  commerceStorefrontOrderTimeline,
  commerceStorefrontRequestEquals,
  commerceStorefrontRequestLines,
  commerceSupportCaseUrgency,
  commerceSupportQueue,
  commerceSupportServiceState,
  commerceSupportSlaSummary,
  commerceCurrentPaymentPolicy,
  commerceCurrentPromotionPolicy,
  commerceCurrentShippingPolicy,
  commerceCurrentTaxConfiguration,
  commerceCustomerCreditPolicies,
  commerceCurrentCustomerCreditPolicy,
  commerceEffectiveTaxConfiguration,
  commercePurchaseOrders,
  commerceSupplierReturnClaims,
  commerceSupplierSourcingDecisions,
  commerceWorkingSampleCatalogId,
  commerceWorkingSampleSkus,
  normalizeCommerce,
  validateCommerceState,
  compareCommercePurchaseOrderAttention,
  createEmptyCommerce,
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

test('commerceOrderCalculation, commerceOrderPaymentTermsDays, and commerceCustomerCreditExposure behave correctly', () => {
  const state = createSeedCommerce()

  // Seed state has no tax configuration → returns not-configured v1 result.
  const calc = commerceOrderCalculation(state, 50000)
  assert.ok(calc)
  assert.equal(calc.schema, COMMERCE_ORDER_CALCULATION_SCHEMA)
  assert.equal(calc.subtotalMmk, 50000)
  assert.equal(calc.taxMmk, 0)
  assert.equal(calc.totalMmk, 50000)
  assert.equal(calc.taxMode, 'not_configured')

  // Invalid subtotals (zero, negative) return null.
  assert.equal(commerceOrderCalculation(state, 0), null)
  assert.equal(commerceOrderCalculation(state, -1), null)

  // commerceOrderPaymentTermsDays: no paymentDueAt → 0 (cash terms).
  assert.equal(commerceOrderPaymentTermsDays({ createdAt: '2026-08-07T00:00:00.000Z' }), 0)

  // Exactly 7 days later → 7.
  assert.equal(commerceOrderPaymentTermsDays({
    createdAt: '2026-08-07T00:00:00.000Z',
    paymentDueAt: '2026-08-14T00:00:00.000Z',
  }), 7)

  // Exactly 30 days later → 30.
  assert.equal(commerceOrderPaymentTermsDays({
    createdAt: '2026-08-07T00:00:00.000Z',
    paymentDueAt: '2026-09-06T00:00:00.000Z',
  }), 30)

  // 14 days — not a recognised term → null.
  assert.equal(commerceOrderPaymentTermsDays({
    createdAt: '2026-08-07T00:00:00.000Z',
    paymentDueAt: '2026-08-21T00:00:00.000Z',
  }), null)

  // commerceCustomerCreditExposure: sums pending non-cancelled order totals per customer.
  // ORD-1042 (May, 37 000 MMK, pending) and ORD-1041 (Ko Aung, 12 000 MMK, pending)
  // ORD-1039 (Daw Mya, 22 500 MMK, reconciled) is excluded.
  assert.equal(commerceCustomerCreditExposure(state, 'May'), 37000)
  assert.equal(commerceCustomerCreditExposure(state, 'Ko Aung'), 12000)
  assert.equal(commerceCustomerCreditExposure(state, 'Daw Mya'), 0)
  assert.equal(commerceCustomerCreditExposure(state, 'Unknown customer'), 0)
})

test('commerceOrderAdjustedTotal, commerceOrderNeedsAction, and commercePaymentAdapterLabel behave correctly', () => {
  const baseCalc = { schema: COMMERCE_ORDER_CALCULATION_SCHEMA, currency: 'MMK', catalogRevision: 0, subtotalMmk: 18500, taxMode: 'not_configured', taxMmk: 0, totalMmk: 18500 }
  const baseOrder = { id: 'ORD-T001', total: 18500, status: 'preparing', paymentStatus: 'pending', refundStatus: 'none', calculation: baseCalc, lines: [] }

  // No corrections → returns the original total.
  assert.equal(commerceOrderAdjustedTotal(baseOrder), 18500)
  assert.equal(commerceOrderAdjustedTotal({ ...baseOrder, corrections: [] }), 18500)

  // Debit correction increases the total.
  const debitOrder = {
    ...baseOrder,
    corrections: [{ kind: 'debit', calculation: { totalMmk: 2000 } }],
  }
  assert.equal(commerceOrderAdjustedTotal(debitOrder), 20500)

  // Credit correction decreases the total.
  const creditOrder = {
    ...baseOrder,
    corrections: [{ kind: 'credit', calculation: { totalMmk: 3000 } }],
  }
  assert.equal(commerceOrderAdjustedTotal(creditOrder), 15500)

  // A correction that would drive the total negative returns null.
  const wipeOrder = {
    ...baseOrder,
    corrections: [{ kind: 'credit', calculation: { totalMmk: 20000 } }],
  }
  assert.equal(commerceOrderAdjustedTotal(wipeOrder), null)

  // commerceOrderNeedsAction: active orders need action.
  assert.equal(commerceOrderNeedsAction({ ...baseOrder, status: 'preparing' }), true)
  assert.equal(commerceOrderNeedsAction({ ...baseOrder, status: 'ready' }), true)
  assert.equal(commerceOrderNeedsAction({ ...baseOrder, status: 'confirmed' }), true)

  // Completed + pending payment still needs action.
  assert.equal(commerceOrderNeedsAction({ ...baseOrder, status: 'completed', paymentStatus: 'pending', refundStatus: 'none' }), true)

  // Completed + reconciled → no action needed.
  assert.equal(commerceOrderNeedsAction({ ...baseOrder, status: 'completed', paymentStatus: 'reconciled', refundStatus: 'none' }), false)

  // Cancelled → no action needed (unless refund is due).
  assert.equal(commerceOrderNeedsAction({ ...baseOrder, status: 'cancelled', refundStatus: 'none' }), false)
  assert.equal(commerceOrderNeedsAction({ ...baseOrder, status: 'cancelled', refundStatus: 'due' }), true)

  // commercePaymentAdapterLabel: maps each adapter to its display name.
  assert.equal(commercePaymentAdapterLabel('cash_on_delivery'), 'Cash on delivery')
  assert.equal(commercePaymentAdapterLabel('kbzpay_manual'), 'KBZPay')
  assert.equal(commercePaymentAdapterLabel('pay_on_pickup'), 'Cash')
})

test('storefront accessors, location allocation preview, releasable reservation, and supplier return claim helpers work correctly', () => {
  const empty = createEmptyCommerce()
  const seed = createSeedCommerce()

  // State accessors return default values when the field is absent.
  assert.deepEqual(commerceStorefrontRequests(empty), [])
  assert.deepEqual(commerceStorefrontRequests(seed), [])
  assert.equal(commerceStorefrontConfiguration(empty), null)
  assert.equal(commerceStorefrontConfiguration(seed), null)

  // No inventoryFoundation → location allocation preview is empty.
  const baseOrder = seed.orders.find((o) => o.id === 'ORD-1042')
  assert.ok(baseOrder)
  assert.deepEqual(commerceOrderLocationAllocationPreview(seed, baseOrder), [])

  // Unknown orderId → no releasable reservation.
  assert.equal(commerceOrderHasReleasableReservation(seed, 'ORD-UNKNOWN'), false)
  // Completed order → no releasable reservation.
  assert.equal(commerceOrderHasReleasableReservation(seed, 'ORD-1039'), false)

  // commerceSupplierReturnClaimStatus: three cases based on how much has been credited.
  const noCredit = { claimAmountMmk: 5000, creditNotes: [] }
  assert.equal(commerceSupplierReturnClaimStatus(noCredit), 'awaiting_credit')
  const partialCredit = { claimAmountMmk: 5000, creditNotes: [{ amountMmk: 2000 }] }
  assert.equal(commerceSupplierReturnClaimStatus(partialCredit), 'partially_credited')
  const fullCredit = { claimAmountMmk: 5000, creditNotes: [{ amountMmk: 3000 }, { amountMmk: 2000 }] }
  assert.equal(commerceSupplierReturnClaimStatus(fullCredit), 'credited')

  // commerceSupplierReturnClaimBalance: claimAmountMmk minus sum of creditNotes.
  assert.equal(commerceSupplierReturnClaimBalance(noCredit), 5000)
  assert.equal(commerceSupplierReturnClaimBalance(partialCredit), 3000)
  assert.equal(commerceSupplierReturnClaimBalance(fullCredit), 0)
})

test('commerceSupplierSourcingSelectedQuote, commercePurchaseBudgetCommitment, commercePurchaseOrderProgress, and commercePurchaseOrderArrivalUrgency behave correctly', () => {
  const seed = createSeedCommerce()
  const seedNow = Date.parse('2026-07-23T08:00:00.000Z')

  // commerceSupplierSourcingSelectedQuote: finds by quoteReference, null when absent.
  const quoteObj = { quoteReference: 'QR-001', supplierName: 'Myanmar Beverage', totalMmk: 168_000 }
  assert.equal(commerceSupplierSourcingSelectedQuote({ quotes: [], selectedQuoteReference: 'QR-001' }), null)
  assert.deepEqual(commerceSupplierSourcingSelectedQuote({ quotes: [quoteObj], selectedQuoteReference: 'QR-001' }), quoteObj)
  assert.equal(commerceSupplierSourcingSelectedQuote({ quotes: [quoteObj], selectedQuoteReference: 'QR-999' }), null)

  // commercePurchaseBudgetCommitment: seed has no requisitions → zero commitment.
  const envelope = seed.purchaseBudgetEnvelopes[0]
  assert.ok(envelope)
  const commitment = commercePurchaseBudgetCommitment(seed, envelope)
  assert.equal(commitment.committedMmk, 0)
  assert.equal(commitment.availableMmk, envelope.ceilingMmk)
  assert.equal(commitment.utilizationBasisPoints, 0)
  assert.equal(commitment.openRequisitions, 0)
  assert.equal(commitment.activePurchaseOrders, 0)

  // commercePurchaseOrderProgress: seed PO has no receipt movements → open, full remaining.
  const po = seed.purchaseOrders[0]
  assert.ok(po)
  const progress = commercePurchaseOrderProgress(seed, po)
  assert.equal(progress.status, 'open')
  assert.equal(progress.received, 0)
  assert.equal(progress.rejected, 0)
  assert.equal(progress.delivered, 0)
  assert.equal(progress.remaining, po.quantityOrdered)

  // commercePurchaseOrderArrivalUrgency: urgency depends on status and timing.
  const openProgress = { status: 'open', received: 0, rejected: 0, delivered: 0, remaining: 10 }

  // Closed statuses return 'closed' regardless of timing.
  assert.equal(commercePurchaseOrderArrivalUrgency({ id: 'PO-T', quantityOrdered: 10 }, { ...openProgress, status: 'received' }, seedNow), 'closed')
  assert.equal(commercePurchaseOrderArrivalUrgency({ id: 'PO-T', quantityOrdered: 10 }, { ...openProgress, status: 'cancelled' }, seedNow), 'closed')

  // No expectedAt → 'unrecorded'.
  assert.equal(commercePurchaseOrderArrivalUrgency({ id: 'PO-T', quantityOrdered: 10 }, openProgress, seedNow), 'unrecorded')

  // expectedAt in the past → 'late'.
  const latePo = { id: 'PO-T', quantityOrdered: 10, expectedAt: new Date(seedNow - 60_000).toISOString() }
  assert.equal(commercePurchaseOrderArrivalUrgency(latePo, openProgress, seedNow), 'late')

  // expectedAt within 24 h → 'due_soon'.
  const dueSoonPo = { id: 'PO-T', quantityOrdered: 10, expectedAt: new Date(seedNow + 23 * 60 * 60 * 1000).toISOString() }
  assert.equal(commercePurchaseOrderArrivalUrgency(dueSoonPo, openProgress, seedNow), 'due_soon')

  // expectedAt more than 24 h away → 'scheduled'.
  const scheduledPo = { id: 'PO-T', quantityOrdered: 10, expectedAt: new Date(seedNow + 48 * 60 * 60 * 1000).toISOString() }
  assert.equal(commercePurchaseOrderArrivalUrgency(scheduledPo, openProgress, seedNow), 'scheduled')
})

test('commerceCatalogDigestSource, compareCommercePurchaseOrderAttention, commerceOrderReturnExpectation, and commerceSupplierPayablesAging behave correctly', () => {
  const seed = createSeedCommerce()
  const seedNow = Date.parse('2026-07-23T08:00:00.000Z')

  // commerceCatalogDigestSource: deterministic JSON string from sorted seed items.
  const digestSource = commerceCatalogDigestSource(seed)
  assert.equal(typeof digestSource, 'string')
  const parsed = JSON.parse(digestSource)
  assert.ok(Array.isArray(parsed))
  assert.equal(parsed.length, seed.items.length)
  // Items are sorted by SKU ascending.
  const skus = parsed.map((entry) => entry[0])
  assert.deepEqual(skus, [...skus].sort())
  // Calling again gives the same result.
  assert.equal(commerceCatalogDigestSource(seed), digestSource)

  // compareCommercePurchaseOrderAttention: active orders sort before inactive.
  const createdAt = '2026-07-01T00:00:00.000Z'
  const activePo = { id: 'PO-A', createdAt, quantityOrdered: 10, expectedAt: '2026-07-15T00:00:00.000Z' }
  const laterPo = { id: 'PO-B', createdAt: '2026-07-02T00:00:00.000Z', quantityOrdered: 10, expectedAt: '2026-07-20T00:00:00.000Z' }
  const noExpectedPo = { id: 'PO-C', createdAt, quantityOrdered: 10 }
  const openProgress = { status: 'open', received: 0, rejected: 0, delivered: 0, remaining: 10 }
  const cancelledProgress = { status: 'cancelled', received: 0, rejected: 0, delivered: 0, remaining: 0 }
  // Active before inactive.
  assert.ok(compareCommercePurchaseOrderAttention({ purchaseOrder: activePo, progress: openProgress }, { purchaseOrder: laterPo, progress: cancelledProgress }) < 0)
  assert.ok(compareCommercePurchaseOrderAttention({ purchaseOrder: laterPo, progress: cancelledProgress }, { purchaseOrder: activePo, progress: openProgress }) > 0)
  // Among active: earlier expectedAt first.
  assert.ok(compareCommercePurchaseOrderAttention({ purchaseOrder: activePo, progress: openProgress }, { purchaseOrder: laterPo, progress: openProgress }) < 0)
  // Among active: no expectedAt sorts after has expectedAt.
  assert.ok(compareCommercePurchaseOrderAttention({ purchaseOrder: noExpectedPo, progress: openProgress }, { purchaseOrder: activePo, progress: openProgress }) > 0)

  // commerceOrderReturnExpectation: completed ORD-1039 (SM-1004) is returnable.
  const returnExpectation = commerceOrderReturnExpectation(seed, 'ORD-1039', 'SM-1004', 'not_restocked')
  assert.ok(returnExpectation !== null)
  assert.equal(returnExpectation.orderId, 'ORD-1039')
  assert.equal(returnExpectation.sku, 'SM-1004')
  assert.equal(returnExpectation.soldQuantity, 1)
  assert.equal(returnExpectation.returnedQuantity, 0)
  // Invalid disposition returns null.
  assert.equal(commerceOrderReturnExpectation(seed, 'ORD-1039', 'SM-1004', 'write_off'), null)
  // Pending order (not completed) returns null.
  assert.equal(commerceOrderReturnExpectation(seed, 'ORD-1042', 'SM-1001', 'not_restocked'), null)

  // commerceSupplierPayablesAging: seed PO has no invoice → no rows, zero totals.
  const aging = commerceSupplierPayablesAging(seed, seedNow)
  assert.deepEqual(aging.rows, [])
  assert.equal(aging.totalNetPayableMmk, 0)
  assert.equal(aging.blockedInvoiceCount, 0)
  assert.equal(aging.paymentAuthority, 'none')
  assert.equal(aging.paymentInitiated, false)
})

test('commerceCustomerCreditReview, commerceOrderCalculationDigest, commerceStorefrontOrderTimeline, commerceSupportServiceState, commerceSupportCaseUrgency, commerceSupportQueue, commerceSupportSlaSummary, and commerceCloseExpectation behave correctly', () => {
  const seed = createSeedCommerce()
  const seedNow = Date.parse('2026-07-23T08:00:00.000Z')
  const seedNowIso = '2026-07-23T08:00:00.000Z'

  // commerceCustomerCreditReview: paymentTermsDays=0 is always allowed (cash_terms).
  const cashReview = commerceCustomerCreditReview(seed, 'Daw Mya', 22500, 0)
  assert.equal(cashReview.allowed, true)
  assert.equal(cashReview.reason, 'cash_terms')
  assert.equal(cashReview.exposureBeforeMmk, 0)
  assert.equal(cashReview.orderAmountMmk, 22500)

  // When no credit policy exists for the customer, credit terms are not approved.
  const noPolicyReview = commerceCustomerCreditReview(seed, 'Daw Mya', 22500, 30)
  assert.equal(noPolicyReview.allowed, false)
  assert.equal(noPolicyReview.reason, 'policy_missing')
  assert.equal(noPolicyReview.policy, null)

  // commerceOrderCalculationDigest: returns null when order has no calculation.
  const emptyOrder = { id: 'ORD-NOCALC' }
  assert.equal(commerceOrderCalculationDigest(emptyOrder), null)

  // Returns a sha256: prefixed string when order has a calculation.
  const completedOrder = seed.orders.find((o) => o.id === 'ORD-1039')
  const digest = commerceOrderCalculationDigest(completedOrder)
  assert.equal(typeof digest, 'string')
  assert.ok(digest.startsWith('sha256:'))
  // Deterministic: calling again returns the same value.
  assert.equal(commerceOrderCalculationDigest(completedOrder), digest)

  // commerceStorefrontOrderTimeline: seed has no storefrontRequests → empty timeline.
  const timeline = commerceStorefrontOrderTimeline(seed)
  assert.deepEqual(timeline, [])

  // commerceSupportServiceState: no owner/priority/dueAt fields → null.
  const noServiceCase = { status: 'open', caseId: 'SC-001', category: 'delivery', customerRequestedAt: seedNowIso }
  assert.equal(commerceSupportServiceState(noServiceCase), null)

  // Returns state when owner, priority, and dueAt are set.
  const servicedCase = { status: 'open', caseId: 'SC-002', category: 'payment', customerRequestedAt: seedNowIso, owner: 'support-op', priority: 'high', dueAt: '2026-07-24T08:00:00.000Z' }
  const serviceState = commerceSupportServiceState(servicedCase)
  assert.ok(serviceState !== null)
  assert.equal(serviceState.owner, 'support-op')
  assert.equal(serviceState.priority, 'high')

  // commerceSupportCaseUrgency: resolved status returns 'resolved'.
  const resolvedCase = { status: 'resolved', caseId: 'SC-003', category: 'delivery', customerRequestedAt: seedNowIso }
  assert.equal(commerceSupportCaseUrgency(resolvedCase, seedNow), 'resolved')

  // Open case with no service state returns 'untriaged'.
  assert.equal(commerceSupportCaseUrgency(noServiceCase, seedNow), 'untriaged')

  // Open case whose dueAt is in the past returns 'overdue'.
  const overdueCase = { status: 'open', caseId: 'SC-004', category: 'delivery', customerRequestedAt: seedNowIso, owner: 'support-op', priority: 'high', dueAt: '2026-07-01T00:00:00.000Z' }
  assert.equal(commerceSupportCaseUrgency(overdueCase, seedNow), 'overdue')

  // commerceSupportQueue: seed orders have no open support cases → empty queue.
  const queue = commerceSupportQueue(seed.orders, seedNow)
  assert.deepEqual(queue, [])

  // commerceSupportSlaSummary: no open cases → all counts are zero.
  const sla = commerceSupportSlaSummary(seed.orders, seedNow)
  assert.equal(sla.openCases, 0)
  assert.equal(sla.overdueCases, 0)
  assert.equal(sla.awaitingAcknowledgement, 0)
  assert.equal(sla.awaitingFirstResponse, 0)
  assert.equal(sla.firstResponseReady, 0)
  assert.equal(sla.responseTargetMisses, 0)

  // commerceCloseExpectation: invalid timestamp returns null.
  assert.equal(commerceCloseExpectation(seed, 'not-a-timestamp'), null)

  // Valid capturedAt after the completed order's fulfilment → non-null expectation.
  const closeExp = commerceCloseExpectation(seed, seedNowIso)
  assert.ok(closeExp !== null)
  // Only ORD-1039 is completed and reconciled.
  assert.deepEqual(closeExp.orderIds, ['ORD-1039'])
  assert.equal(closeExp.total, 22500)
  // SM-1002 is below reorderAt (onHand: 8, reorderAt: 12).
  assert.ok(closeExp.stockExceptionSkus.includes('SM-1002'))
  // ORD-1041 and ORD-1042 have pending payment.
  assert.ok(closeExp.paymentExceptionOrderIds.includes('ORD-1041'))
  assert.ok(closeExp.paymentExceptionOrderIds.includes('ORD-1042'))
})

test('commerceStorefrontConfigurationActionId, accessors, commerceWorkingSampleCatalogId, commerceStorefrontRequestLines, commerceStorefrontRequestEquals, catalog baseline helpers', () => {
  const seed = createSeedCommerce()
  const VALID_DIGEST = 'sha256:' + 'a'.repeat(64)

  // commerceStorefrontConfigurationActionId: valid inputs return expected action ID.
  const actionId = commerceStorefrontConfigurationActionId(1, VALID_DIGEST)
  assert.equal(actionId, `ACT-STOREFRONT-R1-${'a'.repeat(64)}`)

  // Throws for revision < 1.
  assert.throws(() => commerceStorefrontConfigurationActionId(0, VALID_DIGEST))
  // Throws for invalid digest.
  assert.throws(() => commerceStorefrontConfigurationActionId(1, 'not-a-digest'))

  // commercePurchaseRequisitions: seed has no requisitions.
  assert.deepEqual(commercePurchaseRequisitions(seed), [])

  // commercePurchaseBudgetEnvelopes: seed has one envelope.
  const envelopes = commercePurchaseBudgetEnvelopes(seed)
  assert.equal(envelopes.length, 1)
  assert.equal(envelopes[0].budgetCode, 'SHOP-STOCK')

  // commerceSupplierSourcingDecisions: seed has no sourcing decisions.
  assert.deepEqual(commerceSupplierSourcingDecisions(seed), [])

  // commerceWorkingSampleCatalogId: seed has no working-sample baselines → null.
  assert.equal(commerceWorkingSampleCatalogId(seed), null)

  // Spa workspace has working-sample baselines → returns 'spa'.
  const spa = spaWorkspace()
  assert.equal(commerceWorkingSampleCatalogId(spa), 'spa')

  // commerceStorefrontRequestLines: v1 request with a single line.
  const v1Request = {
    schema: 'supermega.ecommerce.order_request.v1',
    mode: 'browser-local-request',
    state: 'pending_shop_review',
    id: 'ECR-00000001',
    idempotencyKey: 'idem-001',
    createdAt: '2026-07-23T08:00:00.000Z',
    sourcePreviewDigest: VALID_DIGEST,
    customerReference: 'Ko Aung',
    fulfilment: 'pickup',
    currency: 'MMK',
    line: { sku: 'SM-1001', name: 'Daily essentials basket', variant: null, quantity: 2, unitPriceMmk: 18500 },
    totalMmk: 37000,
  }
  const lines = commerceStorefrontRequestLines(v1Request)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].sku, 'SM-1001')
  assert.equal(lines[0].quantity, 2)
  assert.equal(lines[0].lineTotalMmk, 37000)

  // commerceStorefrontRequestEquals: identical v1 requests are equal.
  assert.ok(commerceStorefrontRequestEquals(v1Request, { ...v1Request, line: { ...v1Request.line } }))

  // Different SKU → not equal.
  const diffSku = { ...v1Request, line: { ...v1Request.line, sku: 'SM-1002' } }
  assert.ok(!commerceStorefrontRequestEquals(v1Request, diffSku))

  // Different schema → not equal.
  const diffSchema = { ...v1Request, schema: 'supermega.ecommerce.order_request.v2' }
  assert.ok(!commerceStorefrontRequestEquals(v1Request, diffSchema))

  // commerceCatalogBaselines: seed has one baseline per item (4 items).
  const baselines = commerceCatalogBaselines(seed)
  assert.equal(baselines.length, seed.items.length)

  // commerceCatalogChanges: seed has no changes.
  assert.deepEqual(commerceCatalogChanges(seed), [])

  // commerceCatalogBaselineDigest: returns sha256: prefix and is deterministic.
  const firstBaseline = baselines[0]
  const baseDigest = commerceCatalogBaselineDigest(firstBaseline)
  assert.ok(baseDigest.startsWith('sha256:'))
  assert.equal(commerceCatalogBaselineDigest(firstBaseline), baseDigest)
  // The digest matches the stored anchorDigest.
  assert.equal(baseDigest, firstBaseline.anchorDigest)
})

test('commerceCurrentPolicy helpers, commercePurchaseOrders, commerceSupplierReturnClaims, normalizeCommerce, and validateCommerceState behave correctly', () => {
  const seed = createSeedCommerce()
  const seedNowIso = '2026-07-23T08:00:00.000Z'

  // commerceCurrentTaxConfiguration: seed has no tax configurations → null.
  assert.equal(commerceCurrentTaxConfiguration(seed), null)

  // commerceEffectiveTaxConfiguration: seed has no configurations → null.
  assert.equal(commerceEffectiveTaxConfiguration(seed, seedNowIso), null)
  // Invalid timestamp → null.
  assert.equal(commerceEffectiveTaxConfiguration(seed, 'bad-ts'), null)

  // commerceCustomerCreditPolicies: seed has no credit policies → [].
  assert.deepEqual(commerceCustomerCreditPolicies(seed), [])

  // commerceCurrentCustomerCreditPolicy: no policies → null for any customer.
  assert.equal(commerceCurrentCustomerCreditPolicy(seed, 'Daw Mya'), null)
  // Invalid atTime → null.
  assert.equal(commerceCurrentCustomerCreditPolicy(seed, 'Daw Mya', 'bad-ts'), null)

  // commerceCurrentPaymentPolicy: seed has kbzpay_manual → returns the policy.
  const kbzPolicy = commerceCurrentPaymentPolicy(seed, 'kbzpay_manual')
  assert.ok(kbzPolicy !== null)
  assert.equal(kbzPolicy.adapter, 'kbzpay_manual')

  // Invalid adapter → null.
  assert.equal(commerceCurrentPaymentPolicy(seed, 'unknown_adapter'), null)

  // commerceCurrentShippingPolicy: seed has YGN-CENTRAL → returns the policy.
  const shippingPolicy = commerceCurrentShippingPolicy(seed, 'YGN-CENTRAL')
  assert.ok(shippingPolicy !== null)
  assert.equal(shippingPolicy.zoneCode, 'YGN-CENTRAL')

  // Unknown zone → null.
  assert.equal(commerceCurrentShippingPolicy(seed, 'UNKNOWN-ZONE'), null)

  // commerceCurrentPromotionPolicy: seed has WELCOME → returns the policy.
  const promoPolicy = commerceCurrentPromotionPolicy(seed, 'WELCOME')
  assert.ok(promoPolicy !== null)
  assert.equal(promoPolicy.code, 'WELCOME')

  // Unknown code → null.
  assert.equal(commerceCurrentPromotionPolicy(seed, 'NONEXISTENT'), null)

  // commercePurchaseOrders: seed has one PO for SM-1002.
  const pos = commercePurchaseOrders(seed)
  assert.equal(pos.length, 1)
  assert.equal(pos[0].sku, 'SM-1002')
  assert.equal(pos[0].quantityOrdered, 40)

  // commerceSupplierReturnClaims: seed PO has no supplier returns → [].
  assert.deepEqual(commerceSupplierReturnClaims(pos[0]), [])

  // normalizeCommerce: seed has the workspace schema → returns a validated state.
  const normalized = normalizeCommerce(seed)
  assert.equal(normalized.schema, seed.schema)
  assert.equal(normalized.items.length, seed.items.length)

  // validateCommerceState: valid seed state returns without throwing.
  const validated = validateCommerceState(seed)
  assert.equal(validated.schema, seed.schema)
  assert.equal(validated.orders.length, seed.orders.length)

  // Invalid input throws.
  assert.throws(() => validateCommerceState(null))
  assert.throws(() => validateCommerceState({ schema: 'bad-schema' }))
})

test('commerce workspace schema constants and simple collection accessors are correct', () => {
  // Schema string constants.
  assert.equal(COMMERCE_WORKSPACE_SCHEMA, 'supermega.commerce.workspace.v2')
  assert.equal(COMMERCE_LOCK, 'supermega-commerce-workspace-v2')
  assert.ok(Array.isArray(LEGACY_COMMERCE_KEYS))
  assert.ok(LEGACY_COMMERCE_KEYS.length >= 2)
  assert.ok(LEGACY_COMMERCE_KEYS.includes('supermega.commerce.workspace.v1'))
  assert.equal(COMMERCE_STOREFRONT_SCHEMA, 'supermega.ecommerce.storefront.v1')
  assert.equal(COMMERCE_ORDER_CALCULATION_V2_SCHEMA, 'supermega.commerce.order-calculation.v2')
  assert.equal(COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA, 'supermega.commerce.daily-close-export.v3')
  assert.equal(COMMERCE_ACCOUNTING_HANDOFF_SCHEMA, 'supermega.commerce.accounting-handoff.v3')
  assert.equal(COMMERCE_SUPPLIER_PAYABLES_HANDOFF_SCHEMA, 'supermega.commerce.supplier-payables-handoff.v1')
  assert.equal(COMMERCE_CLOSE_SETTLEMENT_SCHEMA, 'supermega.commerce.close-settlement.v1')
  assert.equal(COMMERCE_SUPPORT_WORKLOAD_EXPORT_SCHEMA, 'supermega.commerce.support-workload.v1')
  assert.equal(COMMERCE_ORDER_ACKNOWLEDGEMENT_SCHEMA, 'supermega.commerce.order-acknowledgement.v1')

  // commerceAccountRoles includes all legacy + new roles.
  assert.ok(Array.isArray(commerceAccountRoles))
  assert.ok(commerceAccountRoles.length >= 7)
  assert.ok(commerceAccountRoles.includes('sales_revenue'))
  assert.ok(commerceAccountRoles.includes('sales_adjustment'))

  // Collection accessors return empty arrays on empty state.
  const empty = createEmptyCommerce()
  assert.deepEqual(commerceWebsiteIntakes(empty), [])
  assert.deepEqual(commerceTaxConfigurations(empty), [])
  assert.deepEqual(commerceAccountMappingConfigurations(empty), [])

  // commerceWorkspaceCanWrite returns false without browser storage or lock manager.
  assert.equal(commerceWorkspaceCanWrite(undefined, undefined), false)

  // commerceTaxDecision returns null for an invalid timestamp.
  assert.equal(commerceTaxDecision(createSeedCommerce(), 10000, 'not-a-date'), null)

  // commerceTaxDecision on seed with valid timestamp reports not_configured (no tax config in seed).
  const taxDecision = commerceTaxDecision(createSeedCommerce(), 10000, '2026-07-23T08:00:00.000Z')
  assert.ok(taxDecision !== null)
  assert.equal(taxDecision.status, 'not_configured')
})
