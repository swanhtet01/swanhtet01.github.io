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
  commerceCorrectionCalculation,
  commerceCurrentAccountMappingConfiguration,
  commerceOrderAcknowledgement,
  commerceOrderCorrectionExpectation,
  commerceSupplierPayablesHandoff,
  commerceSupportWorkloadExport,
  commerceOrderAcknowledgementText,
  commerceOrderSupportOpenExpectation,
  commerceOrderSupportReopenExpectation,
  commerceOrderSupportResolveExpectation,
  commerceOrderSupportServiceExpectation,
  commerceSupplierInvoiceMatch,
  commerceSupplierPerformance,
  commerceSupportCheckpointState,
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
  createCommerceCatalogBaseline,
  upgradeCommerceSeedPolicies,
  commerceSupportWorkloadCsv,
  commerceWebsiteIntakeSnapshotDigest,
  createCommerceWebsiteIntake,
  convertCommerceWebsiteIntake,
  commerceCloseSettlementReview,
  registerCommerceItem,
  updateCommerceItem,
  reconcileCommercePayment,
  recordCommerceCollectionAction,
  cancelCommerceOrder,
  configureCommerceTax,
  configureCommercePromotionPolicy,
  configureCommerceShippingPolicy,
  configureCommercePaymentPolicy,
  advanceCommerceOrder,
  saveCommerceClose,
  commerceDailyCloseExport,
  commerceAccountingHandoff,
  configureCommerceAccountMapping,
  configureCommerceCustomerCreditPolicy,
  receiveCommerceStock,
  countCommerceStock,
  settleCommerceRefund,
  commerceDailyCloseCsv,
  commerceAccountingHandoffCsv,
  createCommercePurchaseOrder,
  receiveCommercePurchaseOrder,
  cancelCommercePurchaseOrder,
  recordCommerceOrderCorrection,
  recordCommerceSupplierInvoice,
  markCommerceSupplierInvoicePayableReady,
  commerceSupplierPayablesHandoffCsv,
  recordCommerceOrderReturn,
  installCommerceWorkingSampleActivity,
  importCommerceCatalog,
  authorizeCommerceSupplierReturn,
  recordCommerceSupplierCreditNote,
  reserveCommerceOrder,
  recordCommerceOrderSupportCase,
  recordCommerceOrderSupportServiceEvent,
  resolveCommerceOrderSupportCase,
  reopenCommerceOrderSupportCase,
  approveCommercePurchaseBudgetEnvelope,
  approveCommerceSupplierSourcingDecision,
  approveCommercePurchaseRequisition,
  issueCommerceStockToProduction,
  receiveCommerceProductionBatch,
  returnCommerceStockFromProduction,
  loadCommerceWorkspace,
  restoreBrowserLocalSamplePaymentPolicies,
} from '../showroom/src/core/commerce-workspace.ts'

import {
  buildShopInventoryImportPackage,
  createEmptyShopInventoryState,
  applyShopInventoryImport,
} from '../showroom/src/core/shop-inventory-foundation.ts'

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
  // The exact untouched seed is only a replaceability proof. Once proven, client setup removes
  // its generic household rows so the Shop counter and inventory contain the selected business
  // template rather than two unrelated catalogs.
  assert.ok(!state.items.some((item) => item.sku.startsWith('SM-')), 'generic seed SKUs do not survive client template setup')
  assert.ok(!skus.some((sku) => sku.startsWith('SM-')), 'working-sample SKU recovery excludes the seed SKUs')
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

// ---------------------------------------------------------------------------
// Per-trade Ecommerce storefront copy: what is actually written, and what is not.
//
// ecommerce-trade-storefront.ts's TRADE_STOREFRONT table is INTENTIONALLY PARTIAL -- see that
// file's header and hq/strategy/TEMPLATE-EXPANSION.md section (e), whose item 5 acceptance bar
// was `bakery` alone and item 6 added `hardware` as the delivery example. Every other Shop trade
// deliberately falls through to the generic workflow wording.
//
// The three tests below originally asserted spa/retail/gym vocabulary ("Treatments", "Trade
// essentials", "Coaching"). That copy has NEVER existed in this repo -- not in the trade table,
// not anywhere else -- and the tests had never run, because this file is unreachable from
// app:verify. They are rewritten here to assert the honest current contract. They are NOT
// weakened: STOREFRONT_TRADES_WITH_COPY below pins the exact set of trades that have copy, so the
// day a native trade writer supplies spa/fashion/etc. copy, that pin fails and these three tests
// must be revisited rather than silently continuing to assert the fallback.
//
// CONTENT GAP (not a code defect): Ecommerce storefront copy -- summary, featured/rest collection
// labels, merchandising note, hero SKUs -- is still unwritten for 7 of the 10 Shop trades:
// mini-mart, pharmacy, phone-electronics, fashion, tea-coffee, auto-parts, and restaurant.
// Beauty Spa reuses the already-reviewed Spa onboarding and Website promises and stays explicit
// that Ecommerce takes home-care pickup requests rather than booking treatments.
const STOREFRONT_TRADES_WITH_COPY = ['bakery', 'beauty-spa', 'hardware']

// The generic social-storefront wording every trade without written copy falls back to. Pinned as
// literals, deliberately: workingSamplePlan's null-trade branch must stay byte-identical, which is
// item 5's own acceptance criterion.
const GENERIC_SOCIAL_COLLECTIONS = ['Featured today', 'More to browse']

function packWorkspace(sampleId, sampleName, items) {
  const installed = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
    sampleId,
    sampleName,
    items,
    capturedAt: CAPTURED_AT,
  })
  assert.ok(installed, `the ${sampleId} working sample must install`)
  return installed
}

async function activateStorefront(state, businessName) {
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
    { templateId: 'social-storefront', businessName, capturedAt: CAPTURED_AT },
    {
      storage: storageAdapter,
      catalog: state.items,
      locks: { request: async (_name, _options, callback) => callback() },
    },
  )
  assert.ok(result.ok, `activation failed for ${businessName}: ${result.ok ? '' : result.error}`)
  return readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE, storageAdapter).draft.merchandising
}

test('exactly the trades with written Ecommerce copy resolve to a trade storefront', async () => {
  const { ecommerceTradeStorefront } = await import(
    '../showroom/src/products/ecommerce/ecommerce-trade-storefront.ts'
  )
  const { shopBusinessTemplates } = await import('../showroom/src/products/shop/business-templates.ts')
  const withCopy = shopBusinessTemplates
    .map((template) => template.id)
    .filter((id) => ecommerceTradeStorefront(id) !== null)
    .sort()
  // When this fails because a trade GAINED copy, that is the good failure: update this pin and
  // give that trade a real vocabulary test instead of the fallback assertions below.
  assert.deepEqual(
    withCopy,
    [...STOREFRONT_TRADES_WITH_COPY].sort(),
    'the set of trades with written Ecommerce storefront copy changed -- revisit the fallback tests below',
  )
  assert.equal(ecommerceTradeStorefront(null), null, 'no trade resolves to no trade copy')
})

test('a spa storefront uses honest home-care pickup wording without claiming appointment booking', async () => {
  const { ecommerceTradeStorefront } = await import(
    '../showroom/src/products/ecommerce/ecommerce-trade-storefront.ts'
  )
  const spaCopy = ecommerceTradeStorefront('beauty-spa')
  assert.ok(spaCopy, 'beauty-spa must carry written storefront copy')
  assert.equal(spaCopy.collections.featured, 'Home care')
  assert.equal(spaCopy.collections.rest, 'More for your routine')
  assert.deepEqual(spaCopy.preferredSkus, ['SPA-OIL-100ML', 'SPA-COMPRESS'])
  assert.deepEqual(spaCopy.guidedOrder, { fulfilment: 'pickup', paymentAdapter: 'pay_on_pickup' })
  const summary = spaCopy.summary('Yangon Wellness Spa')
  assert.match(summary, /home-care products/i)
  assert.match(summary, /pickup/i)
  assert.doesNotMatch(summary, /book|appointment/i, 'Ecommerce must not claim to book Spa treatments')

  const resolved = await activateStorefront(packWorkspace('beauty-spa', 'Beauty spa', SPA_ITEMS), 'Yangon Wellness Spa')
  const resolvedCollections = [...new Set(resolved.map((row) => row.collection))].sort()
  assert.deepEqual(
    resolvedCollections,
    ['Home care', 'More for your routine'].sort(),
    'a resolvable Spa trade gets its reviewed home-care collections',
  )
  assert.ok(resolved.every((row) => /treatment suitability|counter stock|pickup time/i.test(row.note)))

  // The unresolvable pack id remains generic; the trade-specific copy is never guessed.
  const unresolved = await activateStorefront(spaWorkspace(), 'Yangon Wellness Spa')
  assert.deepEqual(
    [...new Set(unresolved.map((row) => row.collection))].sort(),
    [...GENERIC_SOCIAL_COLLECTIONS].sort(),
    'an unresolvable pack id keeps the documented generic fallback',
  )
  // Client products still lead the storefront -- that half of the feature does work.
  assert.ok(
    resolved.every((row) => row.sku.startsWith('SPA-')),
    `all storefront rows must be client products, saw ${JSON.stringify(resolved.map((row) => row.sku))}`,
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

test('a retail storefront falls back to generic wording -- retail copy is unwritten', async () => {
  // fashion is the real Shop trade a clothing shop resolves to. Same shape as beauty-spa above:
  // the trade resolves, the table has no entry, the generic wording is what ships.
  const { ecommerceTradeStorefront } = await import(
    '../showroom/src/products/ecommerce/ecommerce-trade-storefront.ts'
  )
  assert.equal(ecommerceTradeStorefront('fashion'), null, 'fashion has no written storefront copy')

  const rows = await activateStorefront(packWorkspace('fashion', 'Fashion', RETAIL_ITEMS), 'Rangoon Threads')
  const collections = [...new Set(rows.map((row) => row.collection))].sort()
  assert.deepEqual(
    collections,
    [...GENERIC_SOCIAL_COLLECTIONS].sort(),
    'a resolvable trade with no written copy gets the documented generic fallback',
  )
  // Still true and still worth guarding: no other trade's copy may leak onto this storefront.
  assert.ok(!collections.includes('Fresh today'), 'bakery wording must not bleed onto a clothing storefront')
  assert.ok(!collections.includes('Site essentials'), 'hardware wording must not bleed onto a clothing storefront')
  assert.ok(
    rows.every((row) => row.sku.startsWith('RTL-')),
    `all storefront rows must be client products, saw ${JSON.stringify(rows.map((row) => row.sku))}`,
  )

  // The unresolvable pack id 'retail' reads identically.
  const unresolved = await activateStorefront(retailWorkspace(), 'Rangoon Threads')
  assert.deepEqual([...new Set(unresolved.map((row) => row.collection))].sort(), collections)
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

test('a gym pack falls back to generic wording -- there is no gym trade at all', async () => {
  // Unlike spa and retail, 'gym' is not merely a trade with unwritten copy: Shop has no gym trade
  // in ShopBusinessTemplateId at all, so this exercises the hand-imported-CSV path -- the trade is
  // unresolvable and workingSamplePlan's null branch must reproduce today's generic wording byte
  // for byte. That is item 5's stated acceptance criterion, and it is a real contract worth a test.
  const { shopBusinessTemplates } = await import('../showroom/src/products/shop/business-templates.ts')
  assert.ok(
    !shopBusinessTemplates.some((template) => template.id === 'gym'),
    'if a gym trade is ever added, this test must become a real vocabulary test',
  )

  const rows = await activateStorefront(gymWorkspace(), 'Fitness Studio')
  const collections = [...new Set(rows.map((row) => row.collection))].sort()
  assert.deepEqual(
    collections,
    [...GENERIC_SOCIAL_COLLECTIONS].sort(),
    'an unresolvable pack must reproduce the generic wording exactly',
  )
  assert.ok(!collections.includes('Fresh today'), 'bakery wording must not appear on an unresolved pack')
  assert.ok(!collections.includes('Site essentials'), 'hardware wording must not appear on an unresolved pack')
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

  // commercePurchaseBudgetCommitment: utilizationBasisPoints must be exact BigInt math, not
  // float division — committedMmk=57 of ceilingMmk=100 is exactly 5700bp (plain float division
  // yields 5699 due to imprecision).
  const precisionEnvelope = { id: 'ENV-PRECISION', ceilingMmk: 100 }
  const precisionState = {
    purchaseRequisitions: [{ id: 'PR-PRECISION', budgetEnvelopeId: 'ENV-PRECISION', totalMmk: 57 }],
    purchaseOrders: [],
  }
  assert.equal(commercePurchaseBudgetCommitment(precisionState, precisionEnvelope).utilizationBasisPoints, 5700)

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

test('support expectation queries return null for seed state and order acknowledgement works on ORD-1039', () => {
  const seed = createSeedCommerce()

  // Support expectation functions require a storefront-sourced completed order.
  // ORD-1039 is completed but has no sourceRecordId (ECR-*), so all return null.
  const VALID_INTENT = 'ESR-12345678-1234-4123-8123-123456789ABC'
  assert.equal(commerceOrderSupportOpenExpectation(seed, 'ORD-1039', VALID_INTENT), null)
  assert.equal(commerceOrderSupportOpenExpectation(seed, 'NONEXISTENT', VALID_INTENT), null)

  // Support service / resolve / reopen require an existing support case.
  assert.equal(commerceOrderSupportServiceExpectation(seed, 'ORD-1039', 'CASE-001'), null)
  assert.equal(commerceOrderSupportResolveExpectation(seed, 'ORD-1039', 'CASE-001'), null)
  assert.equal(commerceOrderSupportReopenExpectation(seed, 'ORD-1039', 'CASE-001'), null)

  // commerceOrderAcknowledgement: non-existent order returns null.
  assert.equal(commerceOrderAcknowledgement(seed, 'NONEXISTENT'), null)

  // ORD-1039 has a valid calculation, lines, fulfilment, and matching reserve movement.
  const ack = commerceOrderAcknowledgement(seed, 'ORD-1039')
  assert.ok(ack !== null, 'ORD-1039 must produce an order acknowledgement')
  assert.equal(ack.schema, COMMERCE_ORDER_ACKNOWLEDGEMENT_SCHEMA)
  assert.equal(ack.orderId, 'ORD-1039')
  assert.equal(ack.totalMmk, 22500)

  // commerceOrderAcknowledgementText formats the acknowledgement as a string report.
  const text = commerceOrderAcknowledgementText(ack)
  assert.equal(typeof text, 'string')
  assert.ok(text.includes('SUPERMEGA ORDER ACKNOWLEDGEMENT'))
  assert.ok(text.includes('ORD-1039'))
})

test('commerceSupplierInvoiceMatch, commerceSupplierPerformance, commerceSupportCheckpointState, and commerceCorrectionCalculation behave correctly', () => {
  const seed = createSeedCommerce()
  const seedPO = commercePurchaseOrders(seed)[0]
  assert.ok(seedPO, 'seed must have a purchase order')

  // commerceSupplierInvoiceMatch throws when the PO has no supplier invoice.
  assert.throws(() => commerceSupplierInvoiceMatch(seed, seedPO))

  // commerceSupplierPerformance returns one entry per supplier — seed has one PO.
  const performance = commerceSupplierPerformance(seed, Date.parse('2026-07-23T08:00:00.000Z'))
  assert.ok(Array.isArray(performance))
  assert.ok(performance.length >= 1)
  assert.equal(performance[0].supplier, 'Myanmar Beverage Supply')
  assert.equal(performance[0].totalOrders, 1)

  // commerceSupportCheckpointState returns null for both checkpoints when no events exist.
  const checkpoints = commerceSupportCheckpointState({ serviceEvents: [], status: 'open' })
  assert.equal(checkpoints.acknowledged, null)
  assert.equal(checkpoints.firstResponseReady, null)

  // commerceCorrectionCalculation: null for missing or zero amount.
  const completedOrder = seed.orders.find((o) => o.id === 'ORD-1039')
  assert.ok(completedOrder)
  assert.equal(commerceCorrectionCalculation(completedOrder, 0), null)
  assert.equal(commerceCorrectionCalculation({ ...completedOrder, calculation: undefined }, 5000), null)

  // Valid amount on v1-calculation order returns not_configured tax mode.
  const correction = commerceCorrectionCalculation(completedOrder, 5000)
  assert.ok(correction !== null)
  assert.equal(correction.taxMode, 'not_configured')
  assert.equal(correction.totalMmk, 5000)
})

test('commerceOrderCorrectionExpectation, commerceSupplierPayablesHandoff, commerceSupportWorkloadExport, and commerceCurrentAccountMappingConfiguration', () => {
  const seed = createSeedCommerce()

  // ORD-1039 is the only completed + reconciled order — correction expectation is valid.
  const correctionExpectation = commerceOrderCorrectionExpectation(seed, 'ORD-1039')
  assert.ok(correctionExpectation !== null)
  assert.equal(correctionExpectation.orderId, 'ORD-1039')
  assert.equal(correctionExpectation.currentBalanceMmk, 22500)
  assert.equal(correctionExpectation.correctionCount, 0)

  // Non-completed orders and unknown IDs return null.
  assert.equal(commerceOrderCorrectionExpectation(seed, 'ORD-1041'), null)
  assert.equal(commerceOrderCorrectionExpectation(seed, 'NONEXISTENT'), null)

  // Seed has no invoiced purchase orders → no payable rows → null.
  assert.equal(commerceSupplierPayablesHandoff(seed), null)

  // commerceSupportWorkloadExport: invalid timestamp throws.
  assert.throws(() => commerceSupportWorkloadExport(seed, 'not-a-date'))

  // Valid exact UTC timestamp produces an export with empty rows (no support cases in seed).
  const workload = commerceSupportWorkloadExport(seed, '2026-07-23T08:00:00.000Z')
  assert.equal(workload.schema, COMMERCE_SUPPORT_WORKLOAD_EXPORT_SCHEMA)
  assert.equal(workload.summary.totalCases, 0)
  assert.deepEqual(workload.rows, [])

  // Seed has no account mapping configurations.
  assert.equal(commerceCurrentAccountMappingConfiguration(seed), null)
})

test('createCommerceCatalogBaseline, upgradeCommerceSeedPolicies, commerceSupportWorkloadCsv, commerceWebsiteIntakeSnapshotDigest, createCommerceWebsiteIntake, and commerceCloseSettlementReview', () => {
  const seed = createSeedCommerce()
  const seedNowIso = '2026-07-23T08:00:00.000Z'
  const proof = {
    actionId: 'ACT-TEST-T025-001',
    capturedAt: seedNowIso,
    actor: 'Test operator',
    reason: 'Test baseline creation.',
    evidenceReference: 'TEST-REF-001',
  }

  // createCommerceCatalogBaseline: creates a baseline with an anchorDigest.
  const baseline = createCommerceCatalogBaseline({ sku: 'SM-1001', price: 18500, reorderAt: 10 }, proof)
  assert.equal(baseline.sku, 'SM-1001')
  assert.equal(baseline.price, 18500)
  assert.equal(baseline.reorderAt, 10)
  assert.ok(baseline.anchorDigest.startsWith('sha256:'))
  // The anchorDigest matches commerceCatalogBaselineDigest computed on the same object.
  assert.equal(baseline.anchorDigest, commerceCatalogBaselineDigest(baseline))

  // upgradeCommerceSeedPolicies: seed already has all policies — returns unchanged.
  const upgraded = upgradeCommerceSeedPolicies(seed)
  assert.equal(upgraded.schema, seed.schema)
  assert.equal(upgraded.promotionPolicies?.length, seed.promotionPolicies?.length)
  assert.equal(upgraded.shippingPolicies?.length, seed.shippingPolicies?.length)

  // A state with empty policy arrays but the catalog baseline — policies are added.
  const noPolicies = validateCommerceState({ ...seed, promotionPolicies: [], shippingPolicies: [], paymentPolicies: [], purchaseBudgetEnvelopes: [] })
  const upgradedNoPolicies = upgradeCommerceSeedPolicies(noPolicies)
  assert.ok((upgradedNoPolicies.promotionPolicies?.length ?? 0) > 0, 'promotion policies must be added when absent')
  assert.ok((upgradedNoPolicies.shippingPolicies?.length ?? 0) > 0, 'shipping policies must be added when absent')

  // commerceSupportWorkloadCsv: converts a valid workload export artifact to CSV.
  const workload = commerceSupportWorkloadExport(seed, seedNowIso)
  const csv = commerceSupportWorkloadCsv(workload)
  assert.equal(typeof csv, 'string')
  assert.ok(csv.includes(COMMERCE_SUPPORT_WORKLOAD_EXPORT_SCHEMA), 'CSV must embed the schema string')
  assert.ok(csv.includes('"schema"'), 'CSV must have a header row')
  // Corrupted artifact must throw.
  assert.throws(() => commerceSupportWorkloadCsv({ ...workload, digest: 'bad-digest' }))

  // commerceWebsiteIntakeSnapshotDigest: deterministic SHA-256 of intake fields.
  const source = { fingerprint: 'web-ab1234cd', approvalId: 'APR-001', snapshotId: 'SNAP-001', pageId: 'PAGE-001', siteName: 'Test Site', pagePath: '/shop/sm-1001' }
  const intakeSnapshot = {
    id: 'WINT-TESTID01',
    createdAt: seedNowIso,
    source,
    sku: 'SM-1001',
    quantity: 2,
    itemName: 'Daily essentials basket',
    unitPrice: 18500,
    total: 37000,
    creation: proof,
  }
  const snapshotDigest = commerceWebsiteIntakeSnapshotDigest(intakeSnapshot)
  assert.ok(snapshotDigest.startsWith('sha256:'))
  // Deterministic: same input produces the same digest.
  assert.equal(commerceWebsiteIntakeSnapshotDigest(intakeSnapshot), snapshotDigest)

  // createCommerceWebsiteIntake: adds a pending intake record to the state.
  const intakeInput = { id: 'WINT-TESTID01', source, sku: 'SM-1001', quantity: 2 }
  const withIntake = createCommerceWebsiteIntake(seed, intakeInput, proof)
  assert.ok(withIntake !== null, 'valid intake must be created')
  const intakes = commerceWebsiteIntakes(withIntake)
  assert.equal(intakes.length, 1)
  assert.equal(intakes[0].id, 'WINT-TESTID01')
  assert.equal(intakes[0].sku, 'SM-1001')
  assert.equal(intakes[0].quantity, 2)
  assert.equal(intakes[0].total, 37000)
  assert.equal(intakes[0].status, 'pending_confirmation')
  assert.ok(intakes[0].snapshotDigest?.startsWith('sha256:'))
  // Idempotent replay: same id + same fields returns the state unchanged.
  const replayed = createCommerceWebsiteIntake(withIntake, intakeInput, proof)
  assert.ok(replayed !== null, 'replay must succeed')
  assert.equal(commerceWebsiteIntakes(replayed).length, 1)
  // Invalid sku → null.
  assert.equal(createCommerceWebsiteIntake(seed, { ...intakeInput, sku: 'NONEXISTENT' }, proof), null)
  // Invalid id format → null.
  assert.equal(createCommerceWebsiteIntake(seed, { ...intakeInput, id: 'BAD-ID' }, proof), null)
  // Quantity 0 → null.
  assert.equal(createCommerceWebsiteIntake(seed, { ...intakeInput, quantity: 0 }, proof), null)

  // commerceCloseSettlementReview: matched settlement for ORD-1039 (Cash, 22500 MMK).
  const closeExp = commerceCloseExpectation(seed, seedNowIso)
  assert.ok(closeExp !== null)
  const matchedSettlement = commerceCloseSettlementReview(seed, closeExp, [
    { paymentMethod: 'Cash', countedMmk: 22500, varianceOwner: '', varianceReason: '' },
  ])
  assert.ok(matchedSettlement !== null)
  assert.equal(matchedSettlement.schema, COMMERCE_CLOSE_SETTLEMENT_SCHEMA)
  assert.equal(matchedSettlement.status, 'matched')
  assert.equal(matchedSettlement.totalExpectedMmk, 22500)
  assert.equal(matchedSettlement.totalCountedMmk, 22500)
  // Variance settlement when count differs.
  const varianceSettlement = commerceCloseSettlementReview(seed, closeExp, [
    { paymentMethod: 'Cash', countedMmk: 20000, varianceOwner: 'Manager', varianceReason: 'Short count' },
  ])
  assert.ok(varianceSettlement !== null)
  assert.equal(varianceSettlement.status, 'variance_review')
  assert.equal(varianceSettlement.totalVarianceMmk, -2500)
  // Empty input → null (no payment method lines).
  assert.equal(commerceCloseSettlementReview(seed, closeExp, []), null)
})

test('registerCommerceItem, updateCommerceItem, reconcileCommercePayment, recordCommerceCollectionAction, and cancelCommerceOrder behave correctly', () => {
  const seed = createSeedCommerce()
  const seedNowIso = '2026-07-23T08:00:00.000Z'

  // registerCommerceItem: adds a new item to the state.
  const newItem = { sku: 'SM-1005', name: 'New product', onHand: 10, reorderAt: 3, price: 15000 }
  const regProof = { actionId: 'ACT-REG-SM1005', capturedAt: seedNowIso, actor: 'Store manager', reason: 'Register new product.', evidenceReference: 'REG-REF-001' }
  const withItem = registerCommerceItem(seed, newItem, regProof)
  assert.ok(withItem !== null, 'valid item registration must succeed')
  assert.ok(withItem.items.some((item) => item.sku === 'SM-1005'))
  // Opening movement must be recorded.
  assert.ok(withItem.movements.some((m) => m.kind === 'opening' && m.sku === 'SM-1005' && m.quantityDelta === 10))
  // Catalog baseline must be created.
  assert.ok(commerceCatalogBaselines(withItem).some((b) => b.sku === 'SM-1005'))
  // Duplicate SKU → null.
  assert.equal(registerCommerceItem(withItem, newItem, { ...regProof, actionId: 'ACT-REG-DUP' }), null)
  // Invalid price → null.
  assert.equal(registerCommerceItem(seed, { ...newItem, price: 0, sku: 'SM-1006' }, regProof), null)

  // updateCommerceItem: changes the price of SM-1001 (seed price = 18500, reorderAt = 10).
  const updateProof = { actionId: 'ACT-UPD-SM1001', capturedAt: seedNowIso, actor: 'Store manager', reason: 'Price update.', evidenceReference: 'UPD-REF-001' }
  const update = { sku: 'SM-1001', expectedPrice: 18500, nextPrice: 19000, expectedReorderAt: 10, nextReorderAt: 10 }
  const withUpdate = updateCommerceItem(seed, update, updateProof)
  assert.ok(withUpdate !== null, 'valid price update must succeed')
  assert.equal(withUpdate.items.find((item) => item.sku === 'SM-1001')?.price, 19000)
  // Wrong expectedPrice → null.
  assert.equal(updateCommerceItem(seed, { ...update, expectedPrice: 99999 }, updateProof), null)
  // No actual change (price and reorderAt both match next values) → null.
  assert.equal(updateCommerceItem(seed, { ...update, nextPrice: 18500 }, updateProof), null)

  // reconcileCommercePayment: marks pending ORD-1041 as reconciled.
  const payProof = { actionId: 'ACT-PAY-1041', capturedAt: seedNowIso, actor: 'Counter operator', reason: 'Payment collected.', evidenceReference: 'PAY-REF-1041' }
  const withPay = reconcileCommercePayment(seed, 'ORD-1041', payProof)
  assert.ok(withPay !== null, 'payment reconciliation must succeed')
  const reconciledOrder = withPay.orders.find((o) => o.id === 'ORD-1041')
  assert.equal(reconciledOrder?.paymentStatus, 'reconciled')
  assert.equal(reconciledOrder?.paymentReconciliationActionId, 'ACT-PAY-1041')
  // Non-existent order → null.
  assert.equal(reconcileCommercePayment(seed, 'ORD-NONEXISTENT', payProof), null)

  // recordCommerceCollectionAction: records a customer contact on pending ORD-1042.
  const colProof = { actionId: 'ACT-COL-1042', capturedAt: seedNowIso, actor: 'Counter operator', reason: 'Chased payment.', evidenceReference: 'COL-REF-1042' }
  const withCol = recordCommerceCollectionAction(seed, 'ORD-1042', colProof)
  assert.ok(withCol !== null, 'collection action must be recorded')
  const colOrder = withCol.orders.find((o) => o.id === 'ORD-1042')
  assert.equal(colOrder?.collectionActions?.length, 1)
  assert.equal(colOrder?.collectionActions?.[0].kind, 'customer_contact')

  // cancelCommerceOrder: cancels ORD-1042 and releases the 2-unit SM-1001 reserve.
  const cancelProof = { actionId: 'ACT-CANCEL-1042', capturedAt: seedNowIso, actor: 'Counter operator', reason: 'Customer cancelled.', evidenceReference: 'CANCEL-REF-1042' }
  const sm1001Before = seed.items.find((item) => item.sku === 'SM-1001')?.onHand ?? 0
  const withCancel = cancelCommerceOrder(seed, 'ORD-1042', cancelProof)
  assert.ok(withCancel !== null, 'cancel must succeed for an order with a releasable reservation')
  assert.equal(withCancel.orders.find((o) => o.id === 'ORD-1042')?.status, 'cancelled')
  // Stock must be released back.
  assert.equal(withCancel.items.find((item) => item.sku === 'SM-1001')?.onHand, sm1001Before + 2)
  // Completed order (ORD-1039) has no releasable reservation → null.
  assert.equal(cancelCommerceOrder(seed, 'ORD-1039', cancelProof), null)
})

test('configureCommerceTax, configureCommercePromotionPolicy, configureCommerceShippingPolicy, and configureCommercePaymentPolicy configure operational policies', () => {
  const seed = createSeedCommerce()
  const seedNowIso = '2026-07-23T08:00:00.000Z'

  // configureCommerceTax — the seed starts with no tax configurations.
  assert.equal(commerceTaxConfigurations(seed).length, 0)
  const taxProof = { actionId: 'ACT-TEST-T027-001', capturedAt: seedNowIso, actor: 'Config operator', reason: 'Configure tax.', evidenceReference: 'T027-TAX-REF' }
  const taxInput = { code: 'MMR-GST', label: 'Myanmar GST', rateBasisPoints: 500, mode: 'exclusive', jurisdictionCode: 'MMR-YGN', effectiveFrom: seedNowIso }
  const withTax = configureCommerceTax(seed, taxInput, taxProof)
  assert.ok(withTax !== null, 'valid tax configuration must succeed')
  assert.equal(commerceTaxConfigurations(withTax).length, 1)
  assert.equal(commerceTaxConfigurations(withTax)[0].code, 'MMR-GST')
  assert.equal(commerceTaxConfigurations(withTax)[0].rateBasisPoints, 500)
  // Lowercase code fails the pattern → null.
  assert.equal(configureCommerceTax(seed, { ...taxInput, code: 'mmr-gst' }, taxProof), null)
  // effectiveFrom before capturedAt → null.
  assert.equal(configureCommerceTax(seed, { ...taxInput, effectiveFrom: '2026-07-22T00:00:00.000Z' }, taxProof), null)

  // configureCommercePromotionPolicy — seed has WELCOME; adding a new SUMMER10 code succeeds.
  const promoProof = { actionId: 'ACT-TEST-T027-002', capturedAt: seedNowIso, actor: 'Config operator', reason: 'Add promotion.', evidenceReference: 'T027-PROMO-REF' }
  const promoInput = { code: 'SUMMER10', discountBasisPoints: 1000, minimumSubtotalMmk: 20000, maximumDiscountMmk: 5000, status: 'active', effectiveFrom: seedNowIso, effectiveUntil: null }
  const existingPromos = commercePromotionPolicies(seed).length
  const withPromo = configureCommercePromotionPolicy(seed, promoInput, promoProof)
  assert.ok(withPromo !== null, 'valid promotion policy must be created')
  assert.equal(commercePromotionPolicies(withPromo).length, existingPromos + 1)
  assert.ok(commercePromotionPolicies(withPromo).some((p) => p.code === 'SUMMER10'))
  // Replay with same actionId → returns unchanged state (not null).
  assert.ok(configureCommercePromotionPolicy(withPromo, promoInput, promoProof) !== null)
  // Lowercase code fails the pattern → null.
  assert.equal(configureCommercePromotionPolicy(seed, { ...promoInput, code: 'summer10' }, promoProof), null)
  // Zero discountBasisPoints → null.
  assert.equal(configureCommercePromotionPolicy(seed, { ...promoInput, discountBasisPoints: 0 }, promoProof), null)

  // configureCommerceShippingPolicy — seed has YGN-CENTRAL; adding MDY-001 for Mandalay succeeds.
  const shipProof = { actionId: 'ACT-TEST-T027-003', capturedAt: seedNowIso, actor: 'Config operator', reason: 'Add shipping zone.', evidenceReference: 'T027-SHIP-REF' }
  const shipInput = { zoneCode: 'MDY-001', townships: ['Aungmyethazan', 'Chanayethazan'], feeMmk: 3000, promiseMinutes: 120, status: 'active', effectiveFrom: seedNowIso, effectiveUntil: null }
  const existingShipping = commerceShippingPolicies(seed).length
  const withShipping = configureCommerceShippingPolicy(seed, shipInput, shipProof)
  assert.ok(withShipping !== null, 'valid shipping policy must be created')
  assert.equal(commerceShippingPolicies(withShipping).length, existingShipping + 1)
  assert.ok(commerceShippingPolicies(withShipping).some((p) => p.zoneCode === 'MDY-001'))
  // promiseMinutes below minimum (15) → null.
  assert.equal(configureCommerceShippingPolicy(seed, { ...shipInput, promiseMinutes: 5 }, shipProof), null)
  // Unsorted townships (descending order) → null.
  assert.equal(configureCommerceShippingPolicy(seed, { ...shipInput, townships: ['Chanayethazan', 'Aungmyethazan'] }, shipProof), null)

  // configureCommercePaymentPolicy — seed has kbzpay_manual (maxMmk=5M); adding one with null max and different instructions succeeds.
  const payProof = { actionId: 'ACT-TEST-T027-004', capturedAt: seedNowIso, actor: 'Config operator', reason: 'Update payment policy.', evidenceReference: 'T027-PAY-REF' }
  const payInput = { adapter: 'kbzpay_manual', allowedFulfilments: ['delivery', 'pickup'], maximumOrderMmk: null, instructions: 'Send screenshot to KBZPay number 09XXXXXXX.', status: 'active', effectiveFrom: seedNowIso, effectiveUntil: null }
  const existingPayments = commercePaymentPolicies(seed).length
  const withPayment = configureCommercePaymentPolicy(seed, payInput, payProof)
  assert.ok(withPayment !== null, 'valid payment policy must be created')
  assert.equal(commercePaymentPolicies(withPayment).length, existingPayments + 1)
  assert.ok(commercePaymentPolicies(withPayment).some((p) => p.adapter === 'kbzpay_manual' && p.maximumOrderMmk === null))
  // Invalid adapter → null.
  assert.equal(configureCommercePaymentPolicy(seed, { ...payInput, adapter: 'bad_adapter' }, payProof), null)
  // Empty instructions → null.
  assert.equal(configureCommercePaymentPolicy(seed, { ...payInput, instructions: '' }, payProof), null)
})

test('advanceCommerceOrder, saveCommerceClose, commerceDailyCloseExport, and commerceAccountingHandoff drive the order lifecycle and daily close', () => {
  const seed = createSeedCommerce()
  const seedNowIso = '2026-07-23T08:00:00.000Z'

  // advanceCommerceOrder: ORD-1042 is 'preparing' in the seed; advance it to 'ready'.
  const advanceProof = { actionId: 'ACT-TEST-T028-ADV', capturedAt: seedNowIso, actor: 'Counter operator', reason: 'Order is packed and ready.', evidenceReference: 'T028-ADV-REF' }
  const withReady = advanceCommerceOrder(seed, 'ORD-1042', 'preparing', advanceProof)
  assert.ok(withReady !== null, 'advancing preparing→ready must succeed')
  assert.equal(withReady.orders.find((o) => o.id === 'ORD-1042')?.status, 'ready')
  // Wrong expectedStatus (seed has 'preparing', not 'ready') → null.
  assert.equal(advanceCommerceOrder(seed, 'ORD-1042', 'ready', advanceProof), null)
  // ORD-1039 is already 'completed' → cannot advance → null.
  assert.equal(advanceCommerceOrder(seed, 'ORD-1039', 'completed', advanceProof), null)
  // ORD-1041 is 'ready' but paymentStatus is 'pending' → cannot complete → null.
  assert.equal(advanceCommerceOrder(seed, 'ORD-1041', 'ready', advanceProof), null)
  // Replay: same actionId, same expectedStatus, against the already-advanced state → returns
  // the unchanged state (idempotent), not null.
  const replayedAdvance = advanceCommerceOrder(withReady, 'ORD-1042', 'preparing', advanceProof)
  assert.ok(replayedAdvance !== null, 'retrying a completed advancement with the same actionId must not fail')
  assert.equal(replayedAdvance.orders.find((o) => o.id === 'ORD-1042')?.status, 'ready')
  // A different actionId against the already-advanced order is a genuine mismatch → null.
  assert.equal(advanceCommerceOrder(withReady, 'ORD-1042', 'preparing', { ...advanceProof, actionId: 'ACT-TEST-T028-ADV-OTHER' }), null)

  // saveCommerceClose: close the day using ORD-1039 (the only completed+reconciled seed order).
  const closeExp = commerceCloseExpectation(seed, seedNowIso)
  assert.ok(closeExp !== null, 'seed must produce a valid close expectation')
  assert.ok(closeExp.orderIds.includes('ORD-1039'), 'ORD-1039 must be in the close')
  assert.equal(closeExp.total, 22500, 'ORD-1039 total is 22500 MMK')
  const closeId = 'CLOSE-11111111-1111-4111-8111-111111111111'
  const closeProof = { actionId: 'ACT-11111111-1111-4111-8111-111111111111', capturedAt: seedNowIso, actor: 'Counter operator', reason: 'End-of-day close.', evidenceReference: 'T028-CLOSE-REF' }
  const withClose = saveCommerceClose(seed, closeId, closeProof, closeExp)
  assert.ok(withClose !== null, 'daily close must be saved')
  assert.equal(withClose.closes.length, 1)
  assert.equal(withClose.closes[0].id, closeId)
  assert.equal(withClose.closes[0].total, 22500)
  // Replay with same proof and closeId → returns unchanged state (not null).
  assert.ok(saveCommerceClose(withClose, closeId, closeProof, closeExp) !== null)
  // Bad closeId pattern → null.
  assert.equal(saveCommerceClose(seed, 'CLOSE-BAD-ID', closeProof, closeExp), null)

  // commerceDailyCloseExport: derive the export artifact from the saved close.
  const dailyExport = commerceDailyCloseExport(withClose, closeId)
  assert.ok(dailyExport !== null, 'daily close export must be generated')
  assert.equal(dailyExport.schema, COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA)
  assert.equal(dailyExport.totalMmk, 22500)
  assert.equal(dailyExport.orderCount, 1)
  assert.ok(dailyExport.orders.some((o) => o.orderId === 'ORD-1039'))
  // Unknown closeId → null.
  assert.equal(commerceDailyCloseExport(withClose, 'CLOSE-NONEXISTENT'), null)

  // commerceAccountingHandoff: builds journal entries (entries unmapped since no GL mapping is configured).
  const handoff = commerceAccountingHandoff(withClose, closeId)
  assert.ok(handoff !== null, 'accounting handoff must be generated even without account mapping')
  assert.equal(handoff.schema, COMMERCE_ACCOUNTING_HANDOFF_SCHEMA)
  assert.ok(Array.isArray(handoff.entries) && handoff.entries.length > 0)
  // Unknown closeId → null (no close export → null handoff).
  assert.equal(commerceAccountingHandoff(withClose, 'CLOSE-NONEXISTENT'), null)
})

test('configureCommerceAccountMapping, configureCommerceCustomerCreditPolicy, receiveCommerceStock, and countCommerceStock manage GL mapping, credit, and inventory', () => {
  const seed = createSeedCommerce()
  const seedNowIso = '2026-07-23T08:00:00.000Z'
  const proof = { actionId: 'ACT-TEST-T029-001', capturedAt: seedNowIso, actor: 'Store manager', reason: 'Test.', evidenceReference: 'T029-REF-001' }

  // configureCommerceAccountMapping — provide a full set of GL account codes, one per role.
  const glMappings = commerceAccountRoles.map((accountRole, i) => ({
    accountRole,
    externalAccountCode: String(1000 + i * 100),
  }))
  const withMapping = configureCommerceAccountMapping(seed, { mappings: glMappings }, proof)
  assert.ok(withMapping !== null, 'valid GL mapping must succeed')
  assert.equal(commerceAccountMappingConfigurations(withMapping).length, 1)
  assert.equal(commerceAccountMappingConfigurations(withMapping)[0].mappings.length, commerceAccountRoles.length)
  // Too few mappings → null.
  assert.equal(configureCommerceAccountMapping(seed, { mappings: glMappings.slice(0, 3) }, proof), null)
  // Roles in wrong order (first two swapped) → null.
  const swappedMappings = [...glMappings]
  ;[swappedMappings[0], swappedMappings[1]] = [swappedMappings[1], swappedMappings[0]]
  assert.equal(configureCommerceAccountMapping(seed, { mappings: swappedMappings }, proof), null)

  // configureCommerceCustomerCreditPolicy — extend 30-day terms to seed customer Ko Aung.
  const creditProof = { ...proof, actionId: 'ACT-TEST-T029-002' }
  const creditInput = { customer: 'Ko Aung', creditLimitMmk: 100000, maxPaymentTermsDays: 30, status: 'active' }
  const withCredit = configureCommerceCustomerCreditPolicy(seed, creditInput, creditProof)
  assert.ok(withCredit !== null, 'valid credit policy must be created')
  assert.equal(commerceCustomerCreditPolicies(withCredit).length, 1)
  assert.equal(commerceCustomerCreditPolicies(withCredit)[0].customer, 'Ko Aung')
  assert.equal(commerceCustomerCreditPolicies(withCredit)[0].maxPaymentTermsDays, 30)
  // 15 days is not in the allowed set {0, 7, 30} → null.
  assert.equal(configureCommerceCustomerCreditPolicy(seed, { ...creditInput, maxPaymentTermsDays: 15 }, creditProof), null)
  // Empty customer string → null.
  assert.equal(configureCommerceCustomerCreditPolicy(seed, { ...creditInput, customer: '' }, creditProof), null)

  // receiveCommerceStock — add 20 units of SM-1002 (seed onHand=8, reorderAt=12 → stock exception before receive).
  const receiveProof = { ...proof, actionId: 'ACT-TEST-T029-003' }
  const sm1002Before = seed.items.find((item) => item.sku === 'SM-1002')?.onHand ?? 0
  const withReceived = receiveCommerceStock(seed, 'SM-1002', 20, receiveProof)
  assert.ok(withReceived !== null, 'valid stock receive must succeed')
  assert.equal(withReceived.items.find((item) => item.sku === 'SM-1002')?.onHand, sm1002Before + 20)
  assert.ok(withReceived.movements.some((m) => m.kind === 'receipt' && m.sku === 'SM-1002' && m.quantityDelta === 20))
  // Zero quantity → null.
  assert.equal(receiveCommerceStock(seed, 'SM-1002', 0, receiveProof), null)
  // Non-existent SKU → null.
  assert.equal(receiveCommerceStock(seed, 'SM-NONEXISTENT', 5, receiveProof), null)

  // countCommerceStock — physical count of SM-1003 (seed onHand=21) finds 25; delta = +4.
  const countProof = { ...proof, actionId: 'ACT-TEST-T029-004' }
  const sm1003Before = seed.items.find((item) => item.sku === 'SM-1003')?.onHand ?? 0
  const withCount = countCommerceStock(seed, 'SM-1003', 25, countProof)
  assert.ok(withCount !== null, 'valid stock count must succeed')
  assert.equal(withCount.items.find((item) => item.sku === 'SM-1003')?.onHand, 25)
  assert.ok(withCount.movements.some((m) => m.kind === 'count' && m.sku === 'SM-1003' && m.countedQuantity === 25 && m.quantityDelta === 25 - sm1003Before))
  // Non-existent SKU → null.
  assert.equal(countCommerceStock(seed, 'SM-NONEXISTENT', 10, countProof), null)
})

test('settleCommerceRefund, commerceDailyCloseCsv, and commerceAccountingHandoffCsv settle refunds and produce CSV exports', () => {
  const seed = createSeedCommerce()
  const seedNowIso = '2026-07-23T08:00:00.000Z'

  // settleCommerceRefund: build a chain to create a cancelled+reconciled order with refundStatus='due'.
  // Step 1: reconcile payment on ORD-1041 (ready, pending).
  const payProof = { actionId: 'ACT-TEST-T030-PAY', capturedAt: seedNowIso, actor: 'Counter operator', reason: 'Payment collected.', evidenceReference: 'T030-PAY-REF' }
  const withPay = reconcileCommercePayment(seed, 'ORD-1041', payProof)
  assert.ok(withPay !== null)
  // Step 2: cancel ORD-1041 while it has a reconciled payment → refundStatus='due'.
  const cancelProof = { actionId: 'ACT-TEST-T030-CANCEL', capturedAt: seedNowIso, actor: 'Counter operator', reason: 'Customer cancelled.', evidenceReference: 'T030-CANCEL-REF' }
  const withCancelled = cancelCommerceOrder(withPay, 'ORD-1041', cancelProof)
  assert.ok(withCancelled !== null)
  assert.equal(withCancelled.orders.find((o) => o.id === 'ORD-1041')?.refundStatus, 'due')
  // Step 3: settle the refund.
  const refundProof = { actionId: 'ACT-TEST-T030-REFUND', capturedAt: seedNowIso, actor: 'Counter operator', reason: 'Refund settled in cash.', evidenceReference: 'T030-REFUND-REF' }
  const withRefund = settleCommerceRefund(withCancelled, 'ORD-1041', refundProof)
  assert.ok(withRefund !== null, 'valid refund settlement must succeed')
  assert.equal(withRefund.orders.find((o) => o.id === 'ORD-1041')?.refundStatus, 'settled')
  // Order with refundStatus='none' (ORD-1042, not cancelled or reconciled) → null.
  assert.equal(settleCommerceRefund(seed, 'ORD-1042', refundProof), null)
  // Non-existent order → null.
  assert.equal(settleCommerceRefund(seed, 'ORD-NONEXISTENT', refundProof), null)

  // commerceDailyCloseCsv: produce a CSV from a saved daily close artifact.
  const closeExp = commerceCloseExpectation(seed, seedNowIso)
  assert.ok(closeExp !== null)
  const closeId = 'CLOSE-22222222-2222-4222-8222-222222222222'
  const closeProof = { actionId: 'ACT-22222222-2222-4222-8222-222222222222', capturedAt: seedNowIso, actor: 'Counter operator', reason: 'End-of-day close.', evidenceReference: 'T030-CLOSE-REF' }
  const withClose = saveCommerceClose(seed, closeId, closeProof, closeExp)
  assert.ok(withClose !== null)
  const dailyExport = commerceDailyCloseExport(withClose, closeId)
  assert.ok(dailyExport !== null)
  const csv = commerceDailyCloseCsv(dailyExport)
  assert.ok(typeof csv === 'string' && csv.length > 0, 'CSV output must be non-empty')
  assert.ok(csv.includes(COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA), 'CSV must include the schema identifier')
  assert.ok(csv.includes('ORD-1039'), 'CSV must include the closed order ID')
  assert.ok(csv.includes('\r\n'), 'CSV must use CRLF line endings')

  // commerceAccountingHandoffCsv: produce a CSV from an accounting handoff artifact.
  const handoff = commerceAccountingHandoff(withClose, closeId)
  assert.ok(handoff !== null)
  const handoffCsv = commerceAccountingHandoffCsv(handoff)
  assert.ok(typeof handoffCsv === 'string' && handoffCsv.length > 0, 'accounting handoff CSV must be non-empty')
  assert.ok(handoffCsv.includes(COMMERCE_ACCOUNTING_HANDOFF_SCHEMA), 'handoff CSV must include the schema identifier')
  assert.ok(handoffCsv.includes('\r\n'), 'handoff CSV must use CRLF line endings')
})

test('createCommercePurchaseOrder, receiveCommercePurchaseOrder, and cancelCommercePurchaseOrder manage the purchase order lifecycle', () => {
  const seed = createSeedCommerce()
  const seedNowIso = '2026-07-23T08:00:00.000Z'
  const expectedAt = '2026-07-30T08:00:00.000Z'

  // createCommercePurchaseOrder — SM-1003 has no active PO in seed.
  const poId = 'PO-33333333-3333-4333-8333-333333333333'
  const createProof = { actionId: 'ACT-TEST-T031-CREATE', capturedAt: seedNowIso, actor: 'Store manager', reason: 'Replenish SM-1003.', evidenceReference: 'T031-CREATE-REF' }
  const poInput = { id: poId, sku: 'SM-1003', supplier: 'Super Supplier Ltd', quantityOrdered: 50, unitCostMmk: 9000, expectedAt }
  const withPo = createCommercePurchaseOrder(seed, poInput, createProof)
  assert.ok(withPo !== null, 'creating a PO for SM-1003 must succeed')
  assert.ok(commercePurchaseOrders(withPo).some((po) => po.id === poId && po.sku === 'SM-1003' && po.quantityOrdered === 50))
  // SM-1002 already has an active PO in seed → a second one returns null.
  assert.equal(createCommercePurchaseOrder(seed, { ...poInput, id: 'PO-44444444-4444-4444-8444-444444444444', sku: 'SM-1002' }, createProof), null)
  // Invalid PO ID format → null.
  assert.equal(createCommercePurchaseOrder(seed, { ...poInput, id: 'PO-BADINPUT' }, createProof), null)
  // expectedAt equal to capturedAt (not strictly after) → null.
  assert.equal(createCommercePurchaseOrder(seed, { ...poInput, expectedAt: seedNowIso }, createProof), null)
  // Replay (same id and all matching details) → returns unchanged state.
  assert.ok(createCommercePurchaseOrder(withPo, poInput, createProof) !== null)

  // receiveCommercePurchaseOrder — partial delivery: 30 of 50 ordered units arriving at expectedAt.
  const sm1003Before = withPo.items.find((item) => item.sku === 'SM-1003')?.onHand ?? 0
  const receiveProof = { actionId: 'ACT-TEST-T031-RECEIVE', capturedAt: expectedAt, actor: 'Warehouse staff', reason: 'Partial delivery received.', evidenceReference: 'T031-RECEIVE-REF' }
  const withReceived = receiveCommercePurchaseOrder(withPo, poId, 30, receiveProof)
  assert.ok(withReceived !== null, 'partial receipt of 30 units must succeed')
  assert.equal(withReceived.items.find((item) => item.sku === 'SM-1003')?.onHand, sm1003Before + 30)
  assert.ok(withReceived.movements.some((m) => m.kind === 'receipt' && m.purchaseOrderId === poId && m.quantityDelta === 30))
  // 21 exceeds remaining (50 − 30 = 20) → null.
  const overProof = { ...receiveProof, actionId: 'ACT-TEST-T031-OVER' }
  assert.equal(receiveCommercePurchaseOrder(withReceived, poId, 21, overProof), null)
  // Zero quantity → null.
  const zeroProof = { ...receiveProof, actionId: 'ACT-TEST-T031-ZERO' }
  assert.equal(receiveCommercePurchaseOrder(withPo, poId, 0, zeroProof), null)
  // Non-existent PO → null.
  assert.equal(receiveCommercePurchaseOrder(withPo, 'PO-99999999-9999-4999-8999-999999999999', 10, receiveProof), null)

  // cancelCommercePurchaseOrder — cancel the receipt-free PO; capturedAt equals PO createdAt so the >= check passes.
  const cancelProof = { actionId: 'ACT-TEST-T031-CANCEL', capturedAt: seedNowIso, actor: 'Store manager', reason: 'Supplier unavailable.', evidenceReference: 'T031-CANCEL-REF' }
  const withCancelled = cancelCommercePurchaseOrder(withPo, poId, cancelProof)
  assert.ok(withCancelled !== null, 'cancelling a receipt-free PO must succeed')
  assert.ok(commercePurchaseOrders(withCancelled).find((po) => po.id === poId)?.cancellation !== undefined)
  // Replay cancel → returns unchanged state (idempotent).
  assert.ok(cancelCommercePurchaseOrder(withCancelled, poId, cancelProof) !== null)
  // capturedAt ('2026-07-23') < latestReceiptAt ('2026-07-30') → null.
  assert.equal(cancelCommercePurchaseOrder(withReceived, poId, cancelProof), null)
})

test('recordCommerceOrderCorrection records a post-completion order correction', () => {
  const seed = createSeedCommerce()
  const seedNowIso = '2026-07-23T08:00:00.000Z'

  // ORD-1039 is the only completed+reconciled order in seed and has no corrections yet.
  const correctionExp = commerceOrderCorrectionExpectation(seed, 'ORD-1039')
  assert.ok(correctionExp !== null, 'ORD-1039 must be eligible for correction')
  assert.equal(correctionExp.orderId, 'ORD-1039')
  assert.equal(correctionExp.correctionCount, 0)
  assert.equal(correctionExp.currentBalanceMmk, 22500)

  // Record a credit correction for a pricing error on ORD-1039.
  const proof = { actionId: 'ACT-TEST-T032-CREDIT', capturedAt: seedNowIso, actor: 'Store manager', reason: 'Price was listed incorrectly.', evidenceReference: 'T032-CREDIT-REF' }
  const corrInput = { orderId: 'ORD-1039', kind: 'credit', reasonCode: 'pricing_error', listedAmountMmk: 1000 }
  const withCredit = recordCommerceOrderCorrection(seed, corrInput, proof, correctionExp)
  assert.ok(withCredit !== null, 'valid credit correction must succeed')
  const correctedOrder = withCredit.orders.find((o) => o.id === 'ORD-1039')
  assert.equal(correctedOrder?.corrections?.length, 1)
  assert.equal(correctedOrder?.corrections?.[0]?.kind, 'credit')
  assert.equal(correctedOrder?.corrections?.[0]?.reasonCode, 'pricing_error')
  // Replay (same actionId, same input) → unchanged state.
  assert.ok(recordCommerceOrderCorrection(withCredit, corrInput, proof, correctionExp) !== null)

  // Stale expectation (withCredit has a correction; correctionExp was derived from seed) → null.
  const staleProof = { ...proof, actionId: 'ACT-TEST-T032-STALE' }
  assert.equal(recordCommerceOrderCorrection(withCredit, corrInput, staleProof, correctionExp), null)

  // Invalid correction kind → null.
  assert.equal(recordCommerceOrderCorrection(seed, { ...corrInput, kind: 'invalid' }, proof, correctionExp), null)
  // Invalid reason code → null.
  assert.equal(recordCommerceOrderCorrection(seed, { ...corrInput, reasonCode: 'bad_code' }, proof, correctionExp), null)
  // listedAmountMmk = 0 → null.
  assert.equal(recordCommerceOrderCorrection(seed, { ...corrInput, listedAmountMmk: 0 }, proof, correctionExp), null)
  // Order not completed (ORD-1042 is 'preparing') → commerceOrderCorrectionExpectation returns null → mismatch → null.
  assert.equal(recordCommerceOrderCorrection(seed, { ...corrInput, orderId: 'ORD-1042' }, proof, correctionExp), null)
})

test('recordCommerceSupplierInvoice, markCommerceSupplierInvoicePayableReady, commerceSupplierPayablesHandoff, and commerceSupplierPayablesHandoffCsv process a supplier invoice to payables', () => {
  const seed = createSeedCommerce()
  const seedNowIso = '2026-07-23T08:00:00.000Z'
  const seedPoId = 'PO-11111111-1111-4111-8111-111111111111'

  // No invoiced POs with payableReview in seed → commerceSupplierPayablesHandoff returns null.
  assert.equal(commerceSupplierPayablesHandoff(seed), null)

  // Receive all 40 units so the invoice can match (quantity_ordered=40, unit_cost=4200).
  const receiveProof = { actionId: 'ACT-TEST-T033-RECV', capturedAt: seedNowIso, actor: 'Warehouse staff', reason: 'Full delivery received.', evidenceReference: 'T033-RECV-REF' }
  const withReceipt = receiveCommercePurchaseOrder(seed, seedPoId, 40, receiveProof)
  assert.ok(withReceipt !== null, 'receiving 40 units on PO-11111111 must succeed')

  // Record a supplier invoice for the full delivery.
  const invoiceId = 'PINV-55555555-5555-4555-8555-555555555555'
  const invoiceInput = {
    id: invoiceId,
    supplierReference: 'MBS-INV-2026-0723',
    issuedAt: seedNowIso,
    dueAt: '2026-08-06T08:00:00.000Z',
    quantityInvoiced: 40,
    unitCostMmk: 4200,
  }
  const invoiceProof = { actionId: 'ACT-TEST-T033-INV', capturedAt: seedNowIso, actor: 'Finance officer', reason: 'Supplier invoice received.', evidenceReference: 'T033-INV-REF' }
  const withInvoice = recordCommerceSupplierInvoice(withReceipt, seedPoId, invoiceInput, invoiceProof)
  assert.ok(withInvoice !== null, 'recording a matching supplier invoice must succeed')
  const po = commercePurchaseOrders(withInvoice).find((p) => p.id === seedPoId)
  assert.ok(po?.supplierInvoice?.id === invoiceId)
  assert.equal(po?.supplierInvoice?.quantityInvoiced, 40)
  assert.equal(po?.supplierInvoice?.totalMmk, 40 * 4200)
  // Replay (same actionId) → unchanged state.
  assert.ok(recordCommerceSupplierInvoice(withInvoice, seedPoId, invoiceInput, invoiceProof) !== null)
  // Invalid invoice ID format → null.
  assert.equal(recordCommerceSupplierInvoice(withReceipt, seedPoId, { ...invoiceInput, id: 'PINV-BADINPUT' }, invoiceProof), null)
  // Price variance: different unitCostMmk → invoice records but match status is 'price_variance'.
  // Still records successfully; only payable-ready step would fail.
  const priceVarianceInvoice = recordCommerceSupplierInvoice(withReceipt, seedPoId, { ...invoiceInput, id: 'PINV-66666666-6666-4666-8666-666666666666', unitCostMmk: 3900 }, invoiceProof)
  assert.ok(priceVarianceInvoice !== null, 'invoice with price variance still records')

  // markCommerceSupplierInvoicePayableReady — invoice matches (qty=40, cost=4200); status → 'matched'.
  const payableProof = { actionId: 'ACT-TEST-T033-PAYABLE', capturedAt: seedNowIso, actor: 'Finance officer', reason: 'Invoice verified against delivery.', evidenceReference: 'T033-PAYABLE-REF' }
  const withPayable = markCommerceSupplierInvoicePayableReady(withInvoice, seedPoId, payableProof)
  assert.ok(withPayable !== null, 'marking matched invoice as payable-ready must succeed')
  assert.ok(commercePurchaseOrders(withPayable).find((p) => p.id === seedPoId)?.supplierInvoice?.payableReview)
  // Replay payable-ready → unchanged state.
  assert.ok(markCommerceSupplierInvoicePayableReady(withPayable, seedPoId, payableProof) !== null)
  // Price-variance invoice is not matched → marking payable-ready fails.
  assert.equal(markCommerceSupplierInvoicePayableReady(priceVarianceInvoice, seedPoId, payableProof), null)

  // commerceSupplierPayablesHandoff — now has one payable-ready row.
  const handoff = commerceSupplierPayablesHandoff(withPayable)
  assert.ok(handoff !== null, 'payables handoff must be generated after payable-ready')
  assert.equal(handoff.schema, COMMERCE_SUPPLIER_PAYABLES_HANDOFF_SCHEMA)
  assert.equal(handoff.readyInvoiceCount, 1)
  assert.equal(handoff.rows[0].purchaseOrderId, seedPoId)
  assert.equal(handoff.rows[0].grossInvoiceMmk, 40 * 4200)
  assert.equal(handoff.netPayableTotalMmk, 40 * 4200)

  // commerceSupplierPayablesHandoffCsv — produces CRLF-terminated CSV.
  const csv = commerceSupplierPayablesHandoffCsv(handoff)
  assert.ok(typeof csv === 'string' && csv.length > 0, 'payables handoff CSV must be non-empty')
  assert.ok(csv.includes(COMMERCE_SUPPLIER_PAYABLES_HANDOFF_SCHEMA), 'CSV must include the schema identifier')
  assert.ok(csv.includes(seedPoId), 'CSV must include the PO ID')
  assert.ok(csv.includes('\r\n'), 'CSV must use CRLF line endings')
})

test('recordCommerceOrderReturn records a post-completion order return', () => {
  const seed = createSeedCommerce()
  const seedNowIso = '2026-07-23T08:00:00.000Z'

  // ORD-1039 is completed with SM-1004 qty=1 and no prior returns.
  const returnExp = commerceOrderReturnExpectation(seed, 'ORD-1039', 'SM-1004', 'not_restocked')
  assert.ok(returnExp !== null, 'ORD-1039 SM-1004 must be eligible for return')
  assert.equal(returnExp.orderId, 'ORD-1039')
  assert.equal(returnExp.soldQuantity, 1)
  assert.equal(returnExp.returnedQuantity, 0)

  // not_restocked: item is returned but not put back into stock.
  const proof = { actionId: 'ACT-TEST-T034-RETURN', capturedAt: seedNowIso, actor: 'Store manager', reason: 'Customer returned item.', evidenceReference: 'T034-RETURN-REF' }
  const returnInput = { orderId: 'ORD-1039', sku: 'SM-1004', quantity: 1, disposition: 'not_restocked' }
  const withReturn = recordCommerceOrderReturn(seed, returnInput, proof, returnExp)
  assert.ok(withReturn !== null, 'recording a not_restocked return must succeed')
  const order1039 = withReturn.orders.find((o) => o.id === 'ORD-1039')
  assert.equal(order1039?.returns?.length, 1)
  assert.equal(order1039?.returns?.[0]?.sku, 'SM-1004')
  assert.equal(order1039?.returns?.[0]?.quantity, 1)
  assert.equal(order1039?.returns?.[0]?.disposition, 'not_restocked')
  // onHand is unchanged for not_restocked.
  assert.equal(withReturn.items.find((i) => i.sku === 'SM-1004')?.onHand, seed.items.find((i) => i.sku === 'SM-1004')?.onHand)
  // Replay → unchanged state.
  assert.ok(recordCommerceOrderReturn(withReturn, returnInput, proof, returnExp) !== null)

  // restock disposition: item is returned to stock.
  const sm1004Before = seed.items.find((i) => i.sku === 'SM-1004')?.onHand ?? 0
  const restockExp = commerceOrderReturnExpectation(seed, 'ORD-1039', 'SM-1004', 'restock', 1)
  assert.ok(restockExp !== null, 'ORD-1039 SM-1004 must be eligible for restock return')
  const restockProof = { ...proof, actionId: 'ACT-TEST-T034-RESTOCK' }
  const withRestock = recordCommerceOrderReturn(seed, { ...returnInput, disposition: 'restock' }, restockProof, restockExp)
  assert.ok(withRestock !== null, 'recording a restock return must succeed')
  assert.equal(withRestock.items.find((i) => i.sku === 'SM-1004')?.onHand, sm1004Before + 1)

  // After all units returned, expectation is null (returnedQuantity >= soldQuantity).
  assert.equal(commerceOrderReturnExpectation(withReturn, 'ORD-1039', 'SM-1004', 'not_restocked'), null)

  // Invalid disposition → null.
  assert.equal(recordCommerceOrderReturn(seed, { ...returnInput, disposition: 'invalid' }, proof, returnExp), null)
  // Zero quantity → null.
  assert.equal(recordCommerceOrderReturn(seed, { ...returnInput, quantity: 0 }, proof, returnExp), null)
  // Non-completed order (ORD-1042 is 'preparing') → expectation null → null.
  assert.equal(recordCommerceOrderReturn(seed, { ...returnInput, orderId: 'ORD-1042' }, proof, returnExp), null)
})

test('installCommerceWorkingSampleActivity installs counter sales and a pending order', () => {
  const state = spaWorkspace()

  const input = {
    sampleId: 'spa',
    sampleName: 'Spa',
    counterSales: [
      { recordedAt: CAPTURED_AT, payment: 'Cash', lines: [{ sku: 'SPA-FACIAL', quantity: 1 }] },
      { recordedAt: CAPTURED_AT, payment: 'KBZPay', lines: [{ sku: 'SPA-MASSAGE', quantity: 1 }] },
    ],
    pendingOrder: {
      customerName: 'Ko Aung',
      requestedAt: CAPTURED_AT,
      promisedFor: '2026-08-08T02:30:00.000Z',
      lines: [{ sku: 'SPA-SCRUB', quantity: 2 }],
    },
  }
  const activity = installCommerceWorkingSampleActivity(state, input)
  assert.ok(activity !== null, 'installCommerceWorkingSampleActivity must succeed with valid inputs')

  // Two completed sales + one pending order = 3 working-sample orders.
  const sampleOrders = activity.orders.filter((o) => o.id.startsWith('SETUP-SAMPLE-SPA-'))
  assert.equal(sampleOrders.length, 3)
  assert.ok(activity.orders.some((o) => o.id === 'SETUP-SAMPLE-SPA-SALE-1' && o.status === 'completed'))
  assert.ok(activity.orders.some((o) => o.id === 'SETUP-SAMPLE-SPA-SALE-2' && o.status === 'completed'))
  assert.ok(activity.orders.some((o) => o.id === 'SETUP-SAMPLE-SPA-ORDER' && o.status === 'confirmed'))

  // Idempotent: calling again with the same input returns the same state.
  assert.ok(installCommerceWorkingSampleActivity(activity, input) !== null)

  // Wrong sampleId (doesn't match installed catalog 'spa') → null.
  assert.equal(installCommerceWorkingSampleActivity(state, { ...input, sampleId: 'wellness' }), null)

  // Empty counterSales → null.
  assert.equal(installCommerceWorkingSampleActivity(state, { ...input, counterSales: [] }), null)

  // Unknown SKU in counterSales → null.
  assert.equal(installCommerceWorkingSampleActivity(state, {
    ...input,
    counterSales: [{ recordedAt: CAPTURED_AT, payment: 'Cash', lines: [{ sku: 'SPA-NONEXISTENT', quantity: 1 }] }],
  }), null)
})

test('createCommerceWebsiteIntake and convertCommerceWebsiteIntake register and convert a website order', () => {
  const seed = createSeedCommerce()

  const source = {
    fingerprint: 'web-a1b2c3d4',
    approvalId: 'appr-001',
    snapshotId: 'snap-001',
    pageId: 'page-001',
    siteName: 'supermega.dev',
    pagePath: '/products/sm-1001',
  }

  const intakeProof = {
    actionId: 'ACT-TEST-T036-INTAKE',
    capturedAt: CAPTURED_AT,
    actor: 'Website visitor',
    reason: 'Customer initiated purchase',
    evidenceReference: 'evt-test-t036-intake',
  }

  // Create a website intake for SM-1001, qty 2.
  const withIntake = createCommerceWebsiteIntake(
    seed,
    { id: 'WINT-ORD12345', source, sku: 'SM-1001', quantity: 2 },
    intakeProof,
  )
  assert.ok(withIntake !== null, 'createCommerceWebsiteIntake must succeed for valid input')

  const intakes = commerceWebsiteIntakes(withIntake)
  assert.equal(intakes.length, 1)
  assert.equal(intakes[0].id, 'WINT-ORD12345')
  assert.equal(intakes[0].status, 'pending_confirmation')
  assert.equal(intakes[0].sku, 'SM-1001')
  assert.equal(intakes[0].quantity, 2)

  // Idempotent on same id, source, sku, quantity → returns current (not null).
  assert.ok(createCommerceWebsiteIntake(withIntake, { id: 'WINT-ORD12345', source, sku: 'SM-1001', quantity: 2 }, intakeProof) !== null)

  // Idempotent on source quadruple (fingerprint|approvalId|snapshotId|pageId) with same sku/qty → returns current.
  const proof2 = { ...intakeProof, actionId: 'ACT-TEST-T036-INTAKE2' }
  assert.ok(createCommerceWebsiteIntake(withIntake, { id: 'WINT-ANOTHER1', source, sku: 'SM-1001', quantity: 2 }, proof2) !== null)

  // Invalid id pattern → null.
  assert.equal(createCommerceWebsiteIntake(seed, { id: 'INVALID-ID', source, sku: 'SM-1001', quantity: 2 }, intakeProof), null)

  // Quantity out of range → null.
  assert.equal(createCommerceWebsiteIntake(seed, { id: 'WINT-RANGE001', source, sku: 'SM-1001', quantity: 0 }, intakeProof), null)
  assert.equal(createCommerceWebsiteIntake(seed, { id: 'WINT-RANGE002', source, sku: 'SM-1001', quantity: 100 }, intakeProof), null)

  // Unknown SKU → null.
  assert.equal(createCommerceWebsiteIntake(seed, { id: 'WINT-NOSKU001', source, sku: 'SM-GHOST000', quantity: 1 }, intakeProof), null)

  // Convert the intake to a confirmed order.
  const convertProof = {
    actionId: 'ACT-TEST-T036-CONVERT',
    capturedAt: CAPTURED_AT,
    actor: 'Store staff',
    reason: 'Order confirmed by store',
    evidenceReference: 'evt-test-t036-convert',
  }
  const convertInput = {
    customer: 'Ko Mg Mg',
    fulfilmentMethod: 'local_delivery',
    paymentMethod: 'cash_on_delivery',
    promisedAt: '2026-08-08T06:00:00.000Z',
  }

  const sm1001Before = seed.items.find((i) => i.sku === 'SM-1001').onHand
  const converted = convertCommerceWebsiteIntake(withIntake, 'WINT-ORD12345', convertInput, convertProof)
  assert.ok(converted !== null, 'convertCommerceWebsiteIntake must succeed for valid input')

  // Order id is derived from intake.id.slice(5).
  const order = converted.orders.find((o) => o.id === 'ORD-WEB-ORD12345')
  assert.ok(order, 'order must exist with id ORD-WEB-ORD12345')
  assert.equal(order.status, 'confirmed')
  assert.equal(order.channel, 'Website')
  assert.equal(order.fulfilment, 'delivery')
  assert.equal(order.payment, 'Cash on delivery')

  // Item onHand decreases by intake quantity.
  assert.equal(converted.items.find((i) => i.sku === 'SM-1001').onHand, sm1001Before - 2)

  // Intake status becomes converted.
  assert.equal(commerceWebsiteIntakes(converted).find((i) => i.id === 'WINT-ORD12345').status, 'converted')

  // Idempotent: same conversion input and proof on already-converted intake → returns current (not null).
  assert.ok(convertCommerceWebsiteIntake(converted, 'WINT-ORD12345', convertInput, convertProof) !== null)

  // promisedAt equal to capturedAt → null (must be strictly after).
  assert.equal(convertCommerceWebsiteIntake(withIntake, 'WINT-ORD12345', { ...convertInput, promisedAt: CAPTURED_AT }, convertProof), null)

  // Invalid fulfilmentMethod → null.
  assert.equal(convertCommerceWebsiteIntake(withIntake, 'WINT-ORD12345', { ...convertInput, fulfilmentMethod: 'courier' }, convertProof), null)

  // Invalid paymentMethod → null.
  assert.equal(convertCommerceWebsiteIntake(withIntake, 'WINT-ORD12345', { ...convertInput, paymentMethod: 'credit_card' }, convertProof), null)
})

test('importCommerceCatalog imports new catalog items and handles conflicts and idempotency', () => {
  const seed = createSeedCommerce()

  const IMPORT_DIGEST = 'sha256:' + 'a'.repeat(64)
  const importItems = [
    { sku: 'IMP-ITEM-01', name: 'Imported item one', onHand: 10, reorderAt: 3, price: 5000 },
    { sku: 'IMP-ITEM-02', name: 'Imported item two', onHand: 20, reorderAt: 5, price: 8000 },
  ]

  const result = importCommerceCatalog(seed, {
    items: importItems,
    sourceDigest: IMPORT_DIGEST,
    capturedAt: CAPTURED_AT,
    actor: 'Store Manager',
  })
  assert.ok(result !== null, 'importCommerceCatalog must succeed with valid input')
  assert.equal(result.created, 2)
  assert.equal(result.alreadyPresent, 0)
  assert.equal(result.replayed, false)
  assert.ok(result.state.items.some((i) => i.sku === 'IMP-ITEM-01'))
  assert.ok(result.state.items.some((i) => i.sku === 'IMP-ITEM-02'))

  // Idempotent: same items already present → created=0, alreadyPresent=2, replayed=true.
  const result2 = importCommerceCatalog(result.state, {
    items: importItems,
    sourceDigest: IMPORT_DIGEST,
    capturedAt: CAPTURED_AT,
    actor: 'Store Manager',
  })
  assert.ok(result2 !== null, 'repeat import of same items must succeed')
  assert.equal(result2.created, 0)
  assert.equal(result2.alreadyPresent, 2)
  assert.equal(result2.replayed, true)

  // Invalid sourceDigest → null.
  assert.equal(importCommerceCatalog(seed, {
    items: importItems,
    sourceDigest: 'not-a-digest',
    capturedAt: CAPTURED_AT,
    actor: 'Store Manager',
  }), null)

  // Empty items array → null.
  assert.equal(importCommerceCatalog(seed, {
    items: [],
    sourceDigest: IMPORT_DIGEST,
    capturedAt: CAPTURED_AT,
    actor: 'Store Manager',
  }), null)

  // Duplicate SKUs in items array → null.
  assert.equal(importCommerceCatalog(seed, {
    items: [importItems[0], importItems[0]],
    sourceDigest: IMPORT_DIGEST,
    capturedAt: CAPTURED_AT,
    actor: 'Store Manager',
  }), null)

  // Existing SKU with mismatched field value → null.
  assert.equal(importCommerceCatalog(seed, {
    items: [{ sku: 'SM-1001', name: 'Wrong product name', onHand: 34, reorderAt: 10, price: 18500 }],
    sourceDigest: IMPORT_DIGEST,
    capturedAt: CAPTURED_AT,
    actor: 'Store Manager',
  }), null)
})

test('authorizeCommerceSupplierReturn and recordCommerceSupplierCreditNote process a supplier return and credit note', () => {
  const seed = createSeedCommerce()
  const SEED_PO_ID = 'PO-11111111-1111-4111-8111-111111111111'

  // Receive the seed PO with 38 accepted and 2 damaged (returned to vendor).
  const receiveProof = {
    actionId: 'ACT-TEST-T038-RECEIVE',
    capturedAt: CAPTURED_AT,
    actor: 'Warehouse staff',
    reason: 'Partial receipt with damaged units returned',
    evidenceReference: 'evt-test-t038-receive',
  }
  const withReceipt = receiveCommercePurchaseOrder(
    seed, SEED_PO_ID, 38, receiveProof,
    undefined,
    { quantityRejected: 2, reasonCode: 'damaged', disposition: 'return_to_vendor' },
  )
  assert.ok(withReceipt !== null, 'receiveCommercePurchaseOrder with discrepancy must succeed')

  // The receipt movement id is deterministic from the proof actionId.
  const receiptMovementId = 'MOV2:ACT-TEST-T038-RECEIVE'

  // Authorize a return claim for the 2 rejected units.
  const RETURN_ID = 'SRET-11111111-1111-4111-8111-111111111111'
  const returnProof = {
    actionId: 'ACT-TEST-T038-RETURN',
    capturedAt: CAPTURED_AT,
    actor: 'Purchasing officer',
    reason: 'Damaged goods authorized for return',
    evidenceReference: 'evt-test-t038-return',
  }
  const withReturn = authorizeCommerceSupplierReturn(
    withReceipt,
    SEED_PO_ID,
    { id: RETURN_ID, receiptMovementId, internalReturnReference: 'RET-T038-001' },
    returnProof,
  )
  assert.ok(withReturn !== null, 'authorizeCommerceSupplierReturn must succeed')

  const returnPo = commercePurchaseOrders(withReturn).find((po) => po.id === SEED_PO_ID)
  const returnClaims = commerceSupplierReturnClaims(returnPo)
  assert.equal(returnClaims.length, 1)
  assert.equal(returnClaims[0].id, RETURN_ID)
  assert.equal(returnClaims[0].quantityRejected, 2)
  assert.equal(returnClaims[0].claimAmountMmk, 8400)

  // Idempotent: same return claim → returns current (not null).
  assert.ok(authorizeCommerceSupplierReturn(withReturn, SEED_PO_ID,
    { id: RETURN_ID, receiptMovementId, internalReturnReference: 'RET-T038-001' }, returnProof) !== null)

  // Record a credit note for the full claim amount.
  const CREDIT_ID = 'SCN-11111111-1111-4111-8111-111111111111'
  const creditProof = {
    actionId: 'ACT-TEST-T038-CREDIT',
    capturedAt: CAPTURED_AT,
    actor: 'Accounts officer',
    reason: 'Supplier credit note received',
    evidenceReference: 'evt-test-t038-credit',
  }
  const creditInput = {
    id: CREDIT_ID,
    supplierReference: 'SUPP-CN-2026-001',
    issuedAt: CAPTURED_AT,
    amountMmk: 8400,
  }
  const withCredit = recordCommerceSupplierCreditNote(withReturn, SEED_PO_ID, RETURN_ID, creditInput, creditProof)
  assert.ok(withCredit !== null, 'recordCommerceSupplierCreditNote must succeed')

  const creditedPo = commercePurchaseOrders(withCredit).find((po) => po.id === SEED_PO_ID)
  const creditedClaims = commerceSupplierReturnClaims(creditedPo)
  assert.equal(creditedClaims[0].creditNotes.length, 1)
  assert.equal(creditedClaims[0].creditNotes[0].id, CREDIT_ID)
  assert.equal(creditedClaims[0].creditNotes[0].amountMmk, 8400)
  assert.equal(commerceSupplierReturnClaimStatus(creditedClaims[0]), 'credited')

  // Idempotent: same credit note → returns current (not null).
  assert.ok(recordCommerceSupplierCreditNote(withCredit, SEED_PO_ID, RETURN_ID, creditInput, creditProof) !== null)

  // Amount exceeds remaining claim balance → null.
  const credit2Proof = { ...creditProof, actionId: 'ACT-TEST-T038-CREDIT2' }
  assert.equal(recordCommerceSupplierCreditNote(withReturn, SEED_PO_ID, RETURN_ID, {
    ...creditInput,
    id: 'SCN-22222222-2222-4222-8222-222222222222',
    amountMmk: 9000,
  }, credit2Proof), null)

  // Invalid credit note id pattern → null.
  assert.equal(recordCommerceSupplierCreditNote(withReturn, SEED_PO_ID, RETURN_ID, {
    ...creditInput,
    id: 'INVALID-CREDIT-ID',
  }, creditProof), null)
})

test('recordCommerceOrderSupportCase and recordCommerceOrderSupportServiceEvent open and service a support case on an ECR-sourced order', () => {
  const seed = createSeedCommerce()
  const ORDER_ID = 'ORD-T039-001'
  const ECR_ID = 'ECR-11111111-1111-4111-8111-111111111111'
  const INTENT_ID = 'ESR-11111111-1111-4111-8111-111111111111'
  const CASE_ID = `CASE-${INTENT_ID.slice(4)}`
  const CASE_DUE_AT = '2026-08-08T06:00:00.000Z'

  // Step 1: Reserve a confirmed ECR-sourced order.
  const reserveProof = {
    actionId: 'ACT-TEST-T039-RESERVE',
    capturedAt: CAPTURED_AT,
    actor: 'Store operator',
    reason: 'Web order reserved',
    evidenceReference: 'EVT-T039-RESERVE',
  }
  const ecrOrder = {
    id: ORDER_ID,
    createdAt: CAPTURED_AT,
    customer: 'Ko Test',
    owner: 'Store operator',
    channel: 'Website',
    item: 'Daily essentials basket',
    itemSku: 'SM-1001',
    quantity: 1,
    total: 18500,
    payment: 'Cash',
    paymentStatus: 'pending',
    refundStatus: 'none',
    fulfilment: 'pickup',
    fulfilmentReference: 'Store counter T039',
    promisedAt: CASE_DUE_AT,
    status: 'confirmed',
    sourceRecordId: ECR_ID,
    evidenceReference: 'EVT-T039-RESERVE',
  }
  const withReserve = reserveCommerceOrder(seed, ecrOrder, reserveProof)
  assert.ok(withReserve !== null, 'reserveCommerceOrder must succeed')

  // Step 2: confirmed → preparing.
  const advProof1 = { actionId: 'ACT-TEST-T039-ADV1', capturedAt: CAPTURED_AT, actor: 'Counter operator', reason: 'Preparing', evidenceReference: 'EVT-T039-ADV1' }
  const withPreparing = advanceCommerceOrder(withReserve, ORDER_ID, 'confirmed', advProof1)
  assert.ok(withPreparing !== null, 'advancing confirmed→preparing must succeed')

  // Step 3: preparing → ready.
  const advProof2 = { actionId: 'ACT-TEST-T039-ADV2', capturedAt: CAPTURED_AT, actor: 'Counter operator', reason: 'Ready', evidenceReference: 'EVT-T039-ADV2' }
  const withReady = advanceCommerceOrder(withPreparing, ORDER_ID, 'preparing', advProof2)
  assert.ok(withReady !== null, 'advancing preparing→ready must succeed')

  // Step 4: Reconcile payment before completing.
  const payProof = { actionId: 'ACT-TEST-T039-PAY', capturedAt: CAPTURED_AT, actor: 'Counter operator', reason: 'Cash received', evidenceReference: 'EVT-T039-PAY' }
  const withPaid = reconcileCommercePayment(withReady, ORDER_ID, payProof)
  assert.ok(withPaid !== null, 'reconcileCommercePayment must succeed')

  // Step 5: ready → completed.
  const advProof3 = { actionId: 'ACT-TEST-T039-ADV3', capturedAt: CAPTURED_AT, actor: 'Counter operator', reason: 'Picked up', evidenceReference: 'EVT-T039-ADV3' }
  const withCompleted = advanceCommerceOrder(withPaid, ORDER_ID, 'ready', advProof3)
  assert.ok(withCompleted !== null, 'advancing ready→completed must succeed')
  const completedOrder = withCompleted.orders.find((o) => o.id === ORDER_ID)
  assert.equal(completedOrder.status, 'completed')
  assert.ok(completedOrder.completion, 'completion record must exist')
  assert.equal(completedOrder.sourceRecordId, ECR_ID)

  // Invalid intent ID pattern → null.
  assert.equal(commerceOrderSupportOpenExpectation(withCompleted, ORDER_ID, 'INVALID-INTENT'), null)

  // Step 6: Get open expectation.
  const openExpectation = commerceOrderSupportOpenExpectation(withCompleted, ORDER_ID, INTENT_ID)
  assert.ok(openExpectation !== null, 'commerceOrderSupportOpenExpectation must succeed')
  assert.equal(openExpectation.orderId, ORDER_ID)
  assert.equal(openExpectation.supportCaseCount, 0)

  // Step 7: Open the support case.
  const caseEvidenceRef = `ECOMMERCE-SUPPORT:${INTENT_ID.slice(4)}:${ORDER_ID}:${ECR_ID}`
  const caseProof = {
    actionId: 'ACT-TEST-T039-CASE',
    capturedAt: CAPTURED_AT,
    actor: 'Support agent',
    reason: 'Customer reported issue',
    evidenceReference: caseEvidenceRef,
  }
  const caseInput = {
    orderId: ORDER_ID,
    sourceIntentId: INTENT_ID,
    sourceRequestId: ECR_ID,
    category: 'delivery_issue',
    priority: 'normal',
    owner: 'Support agent',
    dueAt: CASE_DUE_AT,
    externalMessageSent: false,
    refundStarted: false,
    customerRequestedAt: CAPTURED_AT,
    customerDescription: 'Customer reports delayed pickup notification',
  }
  const withCase = recordCommerceOrderSupportCase(withCompleted, caseInput, caseProof, openExpectation)
  assert.ok(withCase !== null, 'recordCommerceOrderSupportCase must succeed')
  const caseOrder = withCase.orders.find((o) => o.id === ORDER_ID)
  assert.equal(caseOrder.supportCases.length, 1)
  assert.equal(caseOrder.supportCases[0].caseId, CASE_ID)
  assert.equal(caseOrder.supportCases[0].status, 'open')

  // Idempotent: same proof → returns current (not null).
  assert.ok(recordCommerceOrderSupportCase(withCase, caseInput, caseProof, openExpectation) !== null)

  // Wrong evidenceReference → null.
  const badCaseProof = { ...caseProof, actionId: 'ACT-TEST-T039-CASE-BAD', evidenceReference: 'WRONG-REF' }
  assert.equal(recordCommerceOrderSupportCase(withCompleted, caseInput, badCaseProof, openExpectation), null)

  // externalMessageSent: true → null.
  assert.equal(recordCommerceOrderSupportCase(withCompleted, { ...caseInput, externalMessageSent: true }, caseProof, openExpectation), null)

  // Step 8: Get service expectation.
  const serviceExpectation = commerceOrderSupportServiceExpectation(withCase, ORDER_ID, CASE_ID)
  assert.ok(serviceExpectation !== null, 'commerceOrderSupportServiceExpectation must succeed')

  // Step 9: Record acknowledged service event.
  const serviceEvidenceRef = `SUPPORT-SERVICE:${CASE_ID}`
  const serviceProof = {
    actionId: 'ACT-TEST-T039-SERVICE',
    capturedAt: CAPTURED_AT,
    actor: 'Support agent',
    reason: 'Case acknowledged',
    evidenceReference: serviceEvidenceRef,
  }
  const serviceInput = {
    orderId: ORDER_ID,
    caseId: CASE_ID,
    kind: 'acknowledged',
    owner: 'Support agent',
    priority: 'normal',
    dueAt: CASE_DUE_AT,
    note: 'Acknowledged and reviewing case details',
  }
  const withService = recordCommerceOrderSupportServiceEvent(withCase, serviceInput, serviceProof, serviceExpectation)
  assert.ok(withService !== null, 'recordCommerceOrderSupportServiceEvent must succeed')
  const servicedCase = withService.orders.find((o) => o.id === ORDER_ID).supportCases.find((c) => c.caseId === CASE_ID)
  assert.equal(servicedCase.serviceEvents.length, 1)
  assert.equal(servicedCase.serviceEvents[0].kind, 'acknowledged')

  // Idempotent: same service event → returns current (not null).
  assert.ok(recordCommerceOrderSupportServiceEvent(withService, serviceInput, serviceProof, serviceExpectation) !== null)

  // Wrong proof.evidenceReference → null.
  const badServiceProof = { ...serviceProof, actionId: 'ACT-TEST-T039-SVC-BAD', evidenceReference: 'WRONG-REF' }
  assert.equal(recordCommerceOrderSupportServiceEvent(withCase, serviceInput, badServiceProof, serviceExpectation), null)
})

test('resolveCommerceOrderSupportCase and reopenCommerceOrderSupportCase close and reopen a support case', () => {
  const seed = createSeedCommerce()
  const ORDER_ID = 'ORD-T040-001'
  const ECR_ID = 'ECR-22222222-2222-4222-8222-222222222222'
  const INTENT_ID = 'ESR-22222222-2222-4222-8222-222222222222'
  const CASE_ID = `CASE-${INTENT_ID.slice(4)}`
  const CASE_DUE_AT = '2026-08-08T06:00:00.000Z'

  // Build the completed ECR-sourced order (same pattern as test 39, different IDs).
  const reserveProof = { actionId: 'ACT-TEST-T040-RESERVE', capturedAt: CAPTURED_AT, actor: 'Store operator', reason: 'Reserved', evidenceReference: 'EVT-T040-RESERVE' }
  const ecrOrder = { id: ORDER_ID, createdAt: CAPTURED_AT, customer: 'Ko Test', owner: 'Store operator', channel: 'Website', item: 'Daily essentials basket', itemSku: 'SM-1001', quantity: 1, total: 18500, payment: 'Cash', paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'pickup', fulfilmentReference: 'Store counter T040', promisedAt: CASE_DUE_AT, status: 'confirmed', sourceRecordId: ECR_ID, evidenceReference: 'EVT-T040-RESERVE' }
  const s1 = reserveCommerceOrder(seed, ecrOrder, reserveProof)
  assert.ok(s1 !== null)
  const s2 = advanceCommerceOrder(s1, ORDER_ID, 'confirmed', { actionId: 'ACT-TEST-T040-ADV1', capturedAt: CAPTURED_AT, actor: 'Op', reason: 'r', evidenceReference: 'EVT-T040-A1' })
  assert.ok(s2 !== null)
  const s3 = advanceCommerceOrder(s2, ORDER_ID, 'preparing', { actionId: 'ACT-TEST-T040-ADV2', capturedAt: CAPTURED_AT, actor: 'Op', reason: 'r', evidenceReference: 'EVT-T040-A2' })
  assert.ok(s3 !== null)
  const s4 = reconcileCommercePayment(s3, ORDER_ID, { actionId: 'ACT-TEST-T040-PAY', capturedAt: CAPTURED_AT, actor: 'Op', reason: 'r', evidenceReference: 'EVT-T040-PAY' })
  assert.ok(s4 !== null)
  const withCompleted = advanceCommerceOrder(s4, ORDER_ID, 'ready', { actionId: 'ACT-TEST-T040-ADV3', capturedAt: CAPTURED_AT, actor: 'Op', reason: 'r', evidenceReference: 'EVT-T040-A3' })
  assert.ok(withCompleted !== null)

  // Open the support case.
  const caseEvidenceRef = `ECOMMERCE-SUPPORT:${INTENT_ID.slice(4)}:${ORDER_ID}:${ECR_ID}`
  const caseProof = { actionId: 'ACT-TEST-T040-CASE', capturedAt: CAPTURED_AT, actor: 'Support agent', reason: 'Issue filed', evidenceReference: caseEvidenceRef }
  const caseInput = { orderId: ORDER_ID, sourceIntentId: INTENT_ID, sourceRequestId: ECR_ID, category: 'delivery_issue', priority: 'normal', owner: 'Support agent', dueAt: CASE_DUE_AT, externalMessageSent: false, refundStarted: false, customerRequestedAt: CAPTURED_AT, customerDescription: 'Customer asks about order status' }
  const openExpect = commerceOrderSupportOpenExpectation(withCompleted, ORDER_ID, INTENT_ID)
  assert.ok(openExpect !== null)
  const withCase = recordCommerceOrderSupportCase(withCompleted, caseInput, caseProof, openExpect)
  assert.ok(withCase !== null)

  // Resolve expectation requires firstResponseReady when service state is set.
  assert.equal(commerceOrderSupportResolveExpectation(withCase, ORDER_ID, CASE_ID), null)

  // Add acknowledged service event.
  const svcEvidenceRef = `SUPPORT-SERVICE:${CASE_ID}`
  const ackProof = { actionId: 'ACT-TEST-T040-ACK', capturedAt: CAPTURED_AT, actor: 'Support agent', reason: 'Acknowledged', evidenceReference: svcEvidenceRef }
  const ackInput = { orderId: ORDER_ID, caseId: CASE_ID, kind: 'acknowledged', owner: 'Support agent', priority: 'normal', dueAt: CASE_DUE_AT, note: 'Reviewing case' }
  const svcExpect1 = commerceOrderSupportServiceExpectation(withCase, ORDER_ID, CASE_ID)
  assert.ok(svcExpect1 !== null)
  const withAck = recordCommerceOrderSupportServiceEvent(withCase, ackInput, ackProof, svcExpect1)
  assert.ok(withAck !== null)

  // Add first_response_ready service event.
  const frrProof = { actionId: 'ACT-TEST-T040-FRR', capturedAt: CAPTURED_AT, actor: 'Support agent', reason: 'Response ready', evidenceReference: svcEvidenceRef }
  const frrInput = { orderId: ORDER_ID, caseId: CASE_ID, kind: 'first_response_ready', owner: 'Support agent', priority: 'normal', dueAt: CASE_DUE_AT, note: 'First response sent' }
  const svcExpect2 = commerceOrderSupportServiceExpectation(withAck, ORDER_ID, CASE_ID)
  assert.ok(svcExpect2 !== null)
  const withFrr = recordCommerceOrderSupportServiceEvent(withAck, frrInput, frrProof, svcExpect2)
  assert.ok(withFrr !== null)

  // Resolve expectation now succeeds.
  const resolveExpect = commerceOrderSupportResolveExpectation(withFrr, ORDER_ID, CASE_ID)
  assert.ok(resolveExpect !== null)

  // Resolve the support case.
  const resolveProof = { actionId: 'ACT-TEST-T040-RESOLVE', capturedAt: CAPTURED_AT, actor: 'Support agent', reason: 'Resolved', evidenceReference: svcEvidenceRef }
  const resolveInput = { orderId: ORDER_ID, caseId: CASE_ID, outcome: 'information_provided', note: 'Customer confirmed satisfied' }
  const withResolved = resolveCommerceOrderSupportCase(withFrr, resolveInput, resolveProof, resolveExpect)
  assert.ok(withResolved !== null, 'resolveCommerceOrderSupportCase must succeed')
  const resolvedCase = withResolved.orders.find((o) => o.id === ORDER_ID).supportCases.find((c) => c.caseId === CASE_ID)
  assert.equal(resolvedCase.status, 'resolved')
  assert.equal(resolvedCase.resolution.outcome, 'information_provided')

  // Idempotent: same resolve proof → returns current (not null).
  assert.ok(resolveCommerceOrderSupportCase(withResolved, resolveInput, resolveProof, resolveExpect) !== null)

  // Invalid outcome → null.
  const badResolveProof = { ...resolveProof, actionId: 'ACT-TEST-T040-RES-BAD' }
  assert.equal(resolveCommerceOrderSupportCase(withFrr, { ...resolveInput, outcome: 'invalid_outcome' }, badResolveProof, resolveExpect), null)

  // Reopen expectation.
  const reopenExpect = commerceOrderSupportReopenExpectation(withResolved, ORDER_ID, CASE_ID)
  assert.ok(reopenExpect !== null, 'commerceOrderSupportReopenExpectation must succeed after resolution')

  // Reopen the case (proof.capturedAt must be strictly after resolution.proof.capturedAt = CAPTURED_AT).
  const REOPEN_AT = '2026-08-08T04:00:00.000Z'
  const REOPEN_DUE_AT = '2026-08-08T10:00:00.000Z'
  const reopenEvidenceRef = `SUPPORT-REOPEN:${CASE_ID}:ACT-TEST-T040-RESOLVE`
  const reopenProof = { actionId: 'ACT-TEST-T040-REOPEN', capturedAt: REOPEN_AT, actor: 'Support agent', reason: 'Customer followed up', evidenceReference: reopenEvidenceRef }
  const reopenInput = { orderId: ORDER_ID, caseId: CASE_ID, sourceResolutionActionId: 'ACT-TEST-T040-RESOLVE', owner: 'Support agent', priority: 'normal', dueAt: REOPEN_DUE_AT, note: 'Customer reports issue persists' }
  const withReopened = reopenCommerceOrderSupportCase(withResolved, reopenInput, reopenProof, reopenExpect)
  assert.ok(withReopened !== null, 'reopenCommerceOrderSupportCase must succeed')
  const reopenedCase = withReopened.orders.find((o) => o.id === ORDER_ID).supportCases.find((c) => c.caseId === CASE_ID)
  assert.equal(reopenedCase.status, 'open')
  assert.ok(reopenedCase.reopen, 'reopen record must exist')
  assert.equal(reopenedCase.reopen.sourceResolutionActionId, 'ACT-TEST-T040-RESOLVE')

  // Idempotent: same reopen proof → returns current (not null).
  assert.ok(reopenCommerceOrderSupportCase(withReopened, reopenInput, reopenProof, reopenExpect) !== null)

  // Wrong evidence reference for reopen → null.
  const badReopenProof = { ...reopenProof, actionId: 'ACT-TEST-T040-RO-BAD', evidenceReference: 'WRONG-REF' }
  assert.equal(reopenCommerceOrderSupportCase(withResolved, reopenInput, badReopenProof, reopenExpect), null)

  // capturedAt not strictly after resolution proof → null.
  const staleCapturedAt = { ...reopenProof, actionId: 'ACT-TEST-T040-STALE', capturedAt: CAPTURED_AT }
  assert.equal(reopenCommerceOrderSupportCase(withResolved, reopenInput, staleCapturedAt, reopenExpect), null)
})

test('procurement approval chain — budget envelope, sourcing decision, and purchase requisition', () => {
  const base = createSeedCommerce()

  const ENV_ID = 'PBE-44444444-4444-4444-8444-444444444444'
  const SSD_ID = 'SSD-44444444-4444-4444-8444-444444444444'
  const PR_ID = 'PR-44444444-4444-4444-8444-444444444444'
  const SKU = 'SM-1001'
  const SUPPLIER = 'Test Supplier Co'
  const QUOTE_REF = 'QR-T041-001'
  const DELIVERY_AT = '2026-08-20T00:00:00.000Z'
  const VALID_UNTIL = '2026-08-31T00:00:00.000Z'
  const EXPECTED_AT = '2026-08-22T00:00:00.000Z'
  const UNIT_COST = 16000
  const QUANTITY = 10
  const TOTAL_MMK = UNIT_COST * QUANTITY

  // --- Budget envelope ---
  const envInput = {
    id: ENV_ID,
    budgetCode: 'OPS-SUPPLIES-2026-Q3',
    label: 'Operations supplies Q3 2026',
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-09-01T00:00:00.000Z',
    ceilingMmk: 1_000_000,
    perRequisitionLimitMmk: 500_000,
  }
  const envProof = { actionId: 'ACT-TEST-T041-ENV', capturedAt: CAPTURED_AT, actor: 'Procurement officer', reason: 'Q3 ops supplies budget approved', evidenceReference: 'BUDGET-APPROVAL:OPS-SUPPLIES-2026-Q3' }
  const withEnv = approveCommercePurchaseBudgetEnvelope(base, envInput, envProof)
  assert.ok(withEnv !== null, 'approveCommercePurchaseBudgetEnvelope must succeed')
  const createdEnvelope = commercePurchaseBudgetEnvelopes(withEnv).find((e) => e.id === ENV_ID)
  assert.ok(createdEnvelope !== undefined, 'new envelope must be findable by ID')
  assert.equal(createdEnvelope.ceilingMmk, 1_000_000)

  // Idempotent replay.
  assert.ok(approveCommercePurchaseBudgetEnvelope(withEnv, envInput, envProof) !== null)

  // capturedAt < periodStart → null.
  const earlyProof = { ...envProof, actionId: 'ACT-TEST-T041-ENV-EARLY', capturedAt: '2026-07-31T00:00:00.000Z' }
  assert.equal(approveCommercePurchaseBudgetEnvelope(base, { ...envInput, id: 'PBE-55555555-5555-4555-8555-555555555555' }, earlyProof), null)

  // capturedAt >= periodEnd → null.
  const lateProof = { ...envProof, actionId: 'ACT-TEST-T041-ENV-LATE', capturedAt: '2026-09-01T00:00:00.000Z' }
  assert.equal(approveCommercePurchaseBudgetEnvelope(base, { ...envInput, id: 'PBE-55555555-5555-4555-8555-555555555555' }, lateProof), null)

  // perRequisitionLimitMmk > ceilingMmk → null.
  const overLimitProof = { ...envProof, actionId: 'ACT-TEST-T041-ENV-LIM' }
  assert.equal(approveCommercePurchaseBudgetEnvelope(base, { ...envInput, id: 'PBE-55555555-5555-4555-8555-555555555555', perRequisitionLimitMmk: 2_000_000 }, overLimitProof), null)

  // --- Sourcing decision ---
  const ssdInput = {
    id: SSD_ID,
    sku: SKU,
    quantity: QUANTITY,
    quotes: [{
      supplier: SUPPLIER,
      quoteReference: QUOTE_REF,
      vendorApprovalReference: 'VAR-T041-001',
      unitCostMmk: UNIT_COST,
      deliveryAt: DELIVERY_AT,
      validUntil: VALID_UNTIL,
    }],
    selectedQuoteReference: QUOTE_REF,
    unitCostToleranceBasisPoints: 500,
    deliveryToleranceDays: 7,
  }
  const ssdProof = { actionId: 'ACT-TEST-T041-SSD', capturedAt: CAPTURED_AT, actor: 'Procurement officer', reason: 'Sourcing decision for SM-1001 Q3', evidenceReference: 'SOURCING:SM-1001:QR-T041-001' }
  const withSsd = approveCommerceSupplierSourcingDecision(withEnv, ssdInput, ssdProof)
  assert.ok(withSsd !== null, 'approveCommerceSupplierSourcingDecision must succeed')
  const createdDecision = commerceSupplierSourcingDecisions(withSsd).find((d) => d.id === SSD_ID)
  assert.ok(createdDecision !== undefined, 'new sourcing decision must be findable by ID')
  const selectedQuote = commerceSupplierSourcingSelectedQuote(createdDecision)
  assert.ok(selectedQuote !== null)
  assert.equal(selectedQuote.quoteReference, QUOTE_REF)
  assert.equal(selectedQuote.unitCostMmk, UNIT_COST)

  // Idempotent replay.
  assert.ok(approveCommerceSupplierSourcingDecision(withSsd, ssdInput, ssdProof) !== null)

  // Mutated quantity → null (JSON mismatch on idempotency check).
  assert.equal(approveCommerceSupplierSourcingDecision(withSsd, { ...ssdInput, quantity: 20 }, ssdProof), null)

  // --- Purchase requisition ---
  const prInput = {
    id: PR_ID,
    budgetEnvelopeId: ENV_ID,
    sourceSourcingDecisionId: SSD_ID,
    expectedAt: EXPECTED_AT,
    supplier: SUPPLIER,
    sku: SKU,
    quantityRequested: QUANTITY,
    unitCostMmk: UNIT_COST,
    sourceDecisionDigest: 'sha256:' + 'a'.repeat(64),
    sourceReplenishmentDigest: 'sha256:' + 'b'.repeat(64),
  }
  const prProof = { actionId: 'ACT-TEST-T041-PR', capturedAt: CAPTURED_AT, actor: 'Procurement officer', reason: 'Requisition for SM-1001 Q3 resupply', evidenceReference: 'REQUISITION:PR-44444444' }
  const withPr = approveCommercePurchaseRequisition(withSsd, prInput, prProof)
  assert.ok(withPr !== null, 'approveCommercePurchaseRequisition must succeed')
  const createdRequisition = commercePurchaseRequisitions(withPr).find((r) => r.id === PR_ID)
  assert.ok(createdRequisition !== undefined, 'new requisition must be findable by ID')
  assert.equal(createdRequisition.totalMmk, TOTAL_MMK)

  // Budget commitment now reflects the requisition.
  const envelope = commercePurchaseBudgetEnvelopes(withPr).find((e) => e.id === ENV_ID)
  const commitment = commercePurchaseBudgetCommitment(withPr, envelope)
  assert.equal(commitment.committedMmk, TOTAL_MMK)
  assert.equal(commitment.availableMmk, 1_000_000 - TOTAL_MMK)
  assert.equal(commitment.openRequisitions, 1)
  assert.equal(commitment.activePurchaseOrders, 0)

  // Idempotent replay.
  assert.ok(approveCommercePurchaseRequisition(withPr, prInput, prProof) !== null)

  // SKU mismatch with sourcing decision → null.
  assert.equal(approveCommercePurchaseRequisition(withSsd, { ...prInput, sku: 'SM-1003' }, { ...prProof, actionId: 'ACT-TEST-T041-PR-SKU' }), null)

  // Quantity mismatch with sourcing decision → null.
  assert.equal(approveCommercePurchaseRequisition(withSsd, { ...prInput, id: 'PR-55555555-5555-4555-8555-555555555555', quantityRequested: 5 }, { ...prProof, actionId: 'ACT-TEST-T041-PR-QTY' }), null)

  // unitCostMmk above tolerance ceiling (maximumUnitCost = 16000 * 1.05 = 16800) → null.
  assert.equal(approveCommercePurchaseRequisition(withSsd, { ...prInput, id: 'PR-55555555-5555-4555-8555-555555555555', unitCostMmk: 17000 }, { ...prProof, actionId: 'ACT-TEST-T041-PR-COST' }), null)

  // Second requisition for the same sourcingDecisionId → null.
  assert.equal(approveCommercePurchaseRequisition(withPr, { ...prInput, id: 'PR-55555555-5555-4555-8555-555555555555' }, { ...prProof, actionId: 'ACT-TEST-T041-PR-DUP' }), null)
})

test('issueCommerceStockToProduction and receiveCommerceProductionBatch manage production stock flows', () => {
  const base = createSeedCommerce()

  // SM-1001 has onHand=34 in the seed — issue 5 units to production.
  const SOURCE_DIGEST_ISSUE = 'sha256:' + 'c'.repeat(64)
  const ISSUE_REQUEST = {
    requestId: 'PROD-REQ-T042-001',
    sourceCommandDigest: SOURCE_DIGEST_ISSUE,
    jobId: 'PROD-JOB-T042-001',
    materialId: 'PROD-MAT-T042-001',
    inputLotId: 'PROD-LOT-T042-001',
    quantityMilli: 5000,
    unit: 'kg',
  }
  const ISSUE_SKU = 'SM-1001'
  const ISSUE_QUANTITY = 5
  const CONVERSION_NOTE = '5 units of SM-1001 issued as raw material'
  const issueProof = {
    actionId: 'ACT-TEST-T042-ISSUE',
    capturedAt: CAPTURED_AT,
    actor: 'Production supervisor',
    reason: 'Issue stock for production job T042',
    evidenceReference: 'PRODUCTION-ISSUE:PROD-REQ-T042-001',
  }

  const withIssue = issueCommerceStockToProduction(base, ISSUE_REQUEST, ISSUE_SKU, ISSUE_QUANTITY, CONVERSION_NOTE, issueProof)
  assert.ok(withIssue !== null, 'issueCommerceStockToProduction must succeed')

  // SM-1001 onHand must decrease by 5 (34 → 29).
  const sm1001After = withIssue.items.find((item) => item.sku === ISSUE_SKU)
  assert.equal(sm1001After.onHand, 34 - ISSUE_QUANTITY)

  // A production_issue movement must exist with the correct fields.
  const issueMovement = withIssue.movements.find((m) => m.kind === 'production_issue' && m.actionId === issueProof.actionId)
  assert.ok(issueMovement !== undefined, 'production_issue movement must exist')
  assert.equal(issueMovement.sku, ISSUE_SKU)
  assert.equal(issueMovement.quantityDelta, -ISSUE_QUANTITY)
  assert.equal(issueMovement.productionRequestId, ISSUE_REQUEST.requestId)

  // Idempotent replay.
  assert.ok(issueCommerceStockToProduction(withIssue, ISSUE_REQUEST, ISSUE_SKU, ISSUE_QUANTITY, CONVERSION_NOTE, issueProof) !== null)

  // Duplicate requestId (different actionId) → null.
  assert.equal(issueCommerceStockToProduction(withIssue, ISSUE_REQUEST, ISSUE_SKU, ISSUE_QUANTITY, CONVERSION_NOTE, { ...issueProof, actionId: 'ACT-TEST-T042-ISSUE-DUP' }), null)

  // Excessive stock quantity (> onHand) → null.
  const bigRequest = { ...ISSUE_REQUEST, requestId: 'PROD-REQ-T042-002' }
  assert.equal(issueCommerceStockToProduction(base, bigRequest, ISSUE_SKU, 999, CONVERSION_NOTE, { ...issueProof, actionId: 'ACT-TEST-T042-ISSUE-BIG' }), null)

  // Unknown SKU → null.
  const unknownRequest = { ...ISSUE_REQUEST, requestId: 'PROD-REQ-T042-003' }
  assert.equal(issueCommerceStockToProduction(base, unknownRequest, 'SM-UNKNOWN', ISSUE_QUANTITY, CONVERSION_NOTE, { ...issueProof, actionId: 'ACT-TEST-T042-ISSUE-UNK' }), null)

  // --- Receive production batch ---
  // SM-1003 has onHand=21 in the seed — receive 10 finished units from production.
  const SOURCE_DIGEST_RECV = 'sha256:' + 'd'.repeat(64)
  const RELEASE_ID = 'QREL-T042-001'
  const RECV_SKU = 'SM-1003'
  const RECV_QUANTITY = 10
  const RELEASED_AT = '2026-08-08T01:00:00.000Z'  // one hour before CAPTURED_AT
  const batchReceipt = {
    releaseId: RELEASE_ID,
    sourceCommandDigest: SOURCE_DIGEST_RECV,
    jobId: ISSUE_REQUEST.jobId,
    outputBatchId: 'BATCH-T042-001',
    releasedAt: RELEASED_AT,
    sourceProduct: 'Household refill batch',
    sku: RECV_SKU,
    quantity: RECV_QUANTITY,
  }
  const recvEvidenceRef = `PLANT-BATCH:${RELEASE_ID}:${SOURCE_DIGEST_RECV}:LOC-MAIN`
  const recvProof = {
    actionId: 'ACT-TEST-T042-RECV',
    capturedAt: CAPTURED_AT,
    actor: 'Warehouse receiver',
    reason: 'Receive finished batch from production',
    evidenceReference: recvEvidenceRef,
  }

  const withRecv = receiveCommerceProductionBatch(withIssue, batchReceipt, recvProof)
  assert.ok(withRecv !== null, 'receiveCommerceProductionBatch must succeed')

  // SM-1003 onHand must increase by 10 (21 → 31).
  const sm1003After = withRecv.items.find((item) => item.sku === RECV_SKU)
  assert.equal(sm1003After.onHand, 21 + RECV_QUANTITY)

  // A production_receipt movement must exist with the correct fields.
  const recvMovement = withRecv.movements.find((m) => m.kind === 'production_receipt' && m.actionId === recvProof.actionId)
  assert.ok(recvMovement !== undefined, 'production_receipt movement must exist')
  assert.equal(recvMovement.sku, RECV_SKU)
  assert.equal(recvMovement.quantityDelta, RECV_QUANTITY)
  assert.equal(recvMovement.productionReleaseId, RELEASE_ID)

  // Idempotent replay (no locationReceipt needed).
  assert.ok(receiveCommerceProductionBatch(withRecv, batchReceipt, recvProof) !== null)

  // Duplicate releaseId (different actionId) → null.
  assert.equal(receiveCommerceProductionBatch(withRecv, batchReceipt, { ...recvProof, actionId: 'ACT-TEST-T042-RECV-DUP' }), null)

  // Wrong evidence reference → null.
  const freshRelease = { ...batchReceipt, releaseId: 'QREL-T042-002' }
  assert.equal(receiveCommerceProductionBatch(base, freshRelease, { ...recvProof, actionId: 'ACT-TEST-T042-RECV-BAD', evidenceReference: 'WRONG-REF' }), null)

  // capturedAt before releasedAt → null (uses QREL-T042-002 to avoid dup-releaseId rejection).
  const earlyRecvProof = {
    ...recvProof,
    actionId: 'ACT-TEST-T042-RECV-EARLY',
    capturedAt: '2026-08-07T00:00:00.000Z',
    evidenceReference: `PLANT-BATCH:QREL-T042-002:${SOURCE_DIGEST_RECV}:LOC-MAIN`,
  }
  assert.equal(receiveCommerceProductionBatch(base, freshRelease, earlyRecvProof), null)
})

test('loadCommerceWorkspace and restoreBrowserLocalSamplePaymentPolicies cover workspace boot and payment policy recovery', () => {
  // --- loadCommerceWorkspace ---

  // null storage → recovery snapshot with error.
  const nullResult = loadCommerceWorkspace(null)
  assert.equal(nullResult.source, 'recovery')
  assert.ok(nullResult.error.length > 0)

  // Empty storage (no existing data) → seeds and returns 'seed'.
  const emptyMap = new Map()
  const emptyAdapter = {
    getItem: (key) => emptyMap.has(key) ? emptyMap.get(key) : null,
    setItem: (key, value) => { emptyMap.set(key, String(value)) },
    removeItem: (key) => { emptyMap.delete(key) },
  }
  const seedResult = loadCommerceWorkspace(emptyAdapter)
  assert.equal(seedResult.source, 'seed')
  assert.equal(seedResult.error, '')
  assert.ok(emptyMap.has(COMMERCE_KEY), 'seed state must be persisted to storage')

  // Storage with valid v2 data → 'current'.
  const storedState = createSeedCommerce()
  const currentMap = new Map([[COMMERCE_KEY, JSON.stringify(storedState)]])
  const currentAdapter = {
    getItem: (key) => currentMap.has(key) ? currentMap.get(key) : null,
    setItem: (key, value) => { currentMap.set(key, String(value)) },
    removeItem: (key) => { currentMap.delete(key) },
  }
  const currentResult = loadCommerceWorkspace(currentAdapter)
  assert.equal(currentResult.source, 'current')
  assert.equal(currentResult.error, '')

  // Storage with malformed JSON → recovery.
  const badMap = new Map([[COMMERCE_KEY, 'not-valid-json{{{'] ])
  const badAdapter = {
    getItem: (key) => badMap.has(key) ? badMap.get(key) : null,
    setItem: (key, value) => { badMap.set(key, String(value)) },
    removeItem: (key) => { badMap.delete(key) },
  }
  const badResult = loadCommerceWorkspace(badAdapter)
  assert.equal(badResult.source, 'recovery')
  assert.ok(badResult.error.length > 0)

  // --- restoreBrowserLocalSamplePaymentPolicies ---

  // Get an approved seed payment decision for pay_on_pickup + pickup.
  const seedPolicies = createSeedCommerce().paymentPolicies ?? []
  const seedDecision = commercePaymentDecision(seedPolicies, 'pay_on_pickup', 'pickup', 10000, CAPTURED_AT)
  assert.ok(seedDecision !== null && seedDecision.status === 'approved', 'seed pay_on_pickup+pickup decision must be approved')

  // State with no payment policies → policies restored.
  const blankState = createEmptyCommerce()
  assert.equal(commercePaymentPolicies(blankState).length, 0)
  const restored = restoreBrowserLocalSamplePaymentPolicies(blankState, seedDecision, 'pickup', 10000)
  assert.ok(restored !== null, 'restoreBrowserLocalSamplePaymentPolicies must succeed')
  assert.ok(commercePaymentPolicies(restored).length > 0, 'payment policies must be restored')

  // State that already has payment policies → returns state with policies unchanged.
  const stateWithPolicies = createSeedCommerce()
  const policyCountBefore = commercePaymentPolicies(stateWithPolicies).length
  const kept = restoreBrowserLocalSamplePaymentPolicies(stateWithPolicies, seedDecision, 'pickup', 10000)
  assert.ok(kept !== null)
  assert.equal(commercePaymentPolicies(kept).length, policyCountBefore)

  // Tampered decision (policyRevision differs from what the function would compute) → null.
  const tampered = { ...seedDecision, policyRevision: 99999 }
  assert.equal(restoreBrowserLocalSamplePaymentPolicies(blankState, tampered, 'pickup', 10000), null)
})

test('returnCommerceStockFromProduction returns stock from production and rejects malformed inputs', () => {
  const seed = createSeedCommerce()
  const VALID_DIGEST = 'sha256:' + '0'.repeat(64)

  // --- Null path 1: invalid proof (empty actionId) → null ---
  const badProof = { actionId: '', capturedAt: CAPTURED_AT, actor: 'Op', reason: 'r', evidenceReference: 'e' }
  assert.equal(returnCommerceStockFromProduction(
    seed,
    { sourceIssueActionId: 'ACT-TEST-T044-ISSUE', productionQuantityMilli: 1000, stockQuantity: 1, stockUnitId: 'LOT-X', locationId: 'LOC-T044-A', expectedInventoryHeadDigest: VALID_DIGEST },
    badProof,
  ), null)

  // --- Null path 2: no matching source issue in state (sourceIssues.length !== 1) → null ---
  const returnProof2 = { actionId: 'ACT-TEST-T044-RET-1', capturedAt: CAPTURED_AT, actor: 'Warehouse', reason: 'Return test', evidenceReference: 'T044-RET-REF-1' }
  assert.equal(returnCommerceStockFromProduction(
    seed,
    { sourceIssueActionId: 'ACT-NONEXISTENT-T044', productionQuantityMilli: 1000, stockQuantity: 1, stockUnitId: 'LOT-T044-001', locationId: 'LOC-T044-A', expectedInventoryHeadDigest: VALID_DIGEST },
    returnProof2,
  ), null)

  // --- Null path 3: state has a production_issue movement but no inventoryFoundation → null ---
  const SOURCE_DIGEST_ISSUE = 'sha256:' + 'c'.repeat(64)
  const issueRequest44 = {
    requestId: 'PROD-REQ-T044-001',
    sourceCommandDigest: SOURCE_DIGEST_ISSUE,
    jobId: 'PROD-JOB-T044-001',
    materialId: 'PROD-MAT-T044-001',
    inputLotId: 'PROD-LOT-T044-001',
    quantityMilli: 5000,
    unit: 'kg',
  }
  const issueProof44 = { actionId: 'ACT-TEST-T044-ISSUE-A', capturedAt: CAPTURED_AT, actor: 'Production supervisor', reason: 'Issue to production', evidenceReference: 'PRODUCTION-ISSUE:PROD-REQ-T044-001' }
  const withIssueOnly = issueCommerceStockToProduction(seed, issueRequest44, 'SM-1001', 5, '5 units of SM-1001 issued', issueProof44)
  assert.ok(withIssueOnly !== null, 'issueCommerceStockToProduction must succeed for null-path 3 setup')
  const returnProof3 = { actionId: 'ACT-TEST-T044-RET-2', capturedAt: CAPTURED_AT, actor: 'Warehouse', reason: 'Return test', evidenceReference: 'T044-RET-REF-2' }
  assert.equal(returnCommerceStockFromProduction(
    withIssueOnly,
    { sourceIssueActionId: 'ACT-TEST-T044-ISSUE-A', productionQuantityMilli: 5000, stockQuantity: 5, stockUnitId: 'LOT-T044-001', locationId: 'LOC-T044-A', expectedInventoryHeadDigest: VALID_DIGEST },
    returnProof3,
  ), null)

  // --- Positive path: full inventoryFoundation setup ---

  // Step 1: Create a minimal commerce state with one item (onHand=10).
  const SKU = 'T044-SKU'
  const itemProof = { actionId: 'ACT-TEST-T044-ITEM', capturedAt: CAPTURED_AT, actor: 'Operator', reason: 'Register item for test', evidenceReference: 'T044-ITEM-REF' }
  const withItem = registerCommerceItem(createEmptyCommerce(), { sku: SKU, name: 'Test material 044', onHand: 10, reorderAt: 2, price: 5000 }, itemProof)
  assert.ok(withItem !== null, 'registerCommerceItem must succeed')

  // Step 2: Build an import package with 10 units of T044-SKU at LOC-T044-A.
  const importPkg = buildShopInventoryImportPackage({
    importId: 'IMP-T044-001',
    sourceDigest: 'sha256:' + 'e'.repeat(64),
    clients: [{ id: 'CLI-T044-001', name: 'Test client' }],
    vendors: [{ id: 'VEN-T044-001', name: 'Test vendor' }],
    locations: [{ id: 'LOC-T044-A', name: 'Location A' }, { id: 'LOC-T044-B', name: 'Location B' }],
    stockUnits: [{ id: 'LOT-T044-001', sku: SKU, tracking: 'lot', trackingCode: 'BATCH-T044-001' }],
    openings: [{ stockUnitId: 'LOT-T044-001', locationId: 'LOC-T044-A', vendorId: 'VEN-T044-001', quantity: 10 }],
    catalogSkus: [SKU],
  })

  // Step 3: Apply the import to a fresh inventory state.
  const emptyInv = createEmptyShopInventoryState()
  const importProof = { actionId: 'ACT-TEST-T044-IMPORT', capturedAt: CAPTURED_AT, actor: 'Inventory manager', reason: 'Initial inventory import', evidenceReference: 'T044-IMPORT-REF' }
  const invResult = applyShopInventoryImport(emptyInv, importPkg, importProof, [SKU], emptyInv.headDigest)
  assert.ok(invResult && !invResult.replayed, 'inventory import must succeed and not be replayed')

  // Step 4: Combine the commerce state with the inventory foundation.
  // invResult.state has availableToPromise=10 for T044-SKU, matching withItem.onHand=10.
  const commerceWithFoundation = { ...withItem, inventoryFoundation: invResult.state }

  // Step 5: Issue 5 units to production — updates both commerce onHand and inventoryFoundation.
  const issueRequest2 = {
    requestId: 'PROD-REQ-T044-002',
    sourceCommandDigest: 'sha256:' + 'f'.repeat(64),
    jobId: 'PROD-JOB-T044-002',
    materialId: 'PROD-MAT-T044-002',
    inputLotId: 'PROD-LOT-T044-002',
    quantityMilli: 5000,
    unit: 'kg',
  }
  const issueProof2 = { actionId: 'ACT-TEST-T044-ISSUE-B', capturedAt: CAPTURED_AT, actor: 'Production supervisor', reason: 'Issue material for production', evidenceReference: 'PRODUCTION-ISSUE:PROD-REQ-T044-002' }
  const withIssue = issueCommerceStockToProduction(commerceWithFoundation, issueRequest2, SKU, 5, '5 units of T044-SKU issued as raw material', issueProof2)
  assert.ok(withIssue !== null, 'issueCommerceStockToProduction with inventoryFoundation must succeed')
  assert.equal(withIssue.items.find((i) => i.sku === SKU)?.onHand, 5, 'onHand must decrease to 5 after issue')

  // Step 6: Return 2 of the 5 issued units (partial return preserving ratio: 2000milli/2 = 5000milli/5).
  // The return goes back to LOT-T044-001 at LOC-T044-A — the same lot/location the issue drew from.
  const returnProofPos = { actionId: 'ACT-TEST-T044-RET-POS', capturedAt: CAPTURED_AT, actor: 'Warehouse receiver', reason: 'Partial production return', evidenceReference: 'T044-RET-POS-REF' }
  const withReturn = returnCommerceStockFromProduction(
    withIssue,
    {
      sourceIssueActionId: 'ACT-TEST-T044-ISSUE-B',
      productionQuantityMilli: 2000,
      stockQuantity: 2,
      stockUnitId: 'LOT-T044-001',
      locationId: 'LOC-T044-A',
      expectedInventoryHeadDigest: withIssue.inventoryFoundation.headDigest,
    },
    returnProofPos,
  )
  assert.ok(withReturn !== null, 'returnCommerceStockFromProduction must succeed')
  assert.equal(withReturn.items.find((i) => i.sku === SKU)?.onHand, 7, 'onHand must increase to 7 after returning 2 units')

  const returnMovement = withReturn.movements.find((m) => m.kind === 'production_return' && m.actionId === returnProofPos.actionId)
  assert.ok(returnMovement !== undefined, 'production_return movement must exist')
  assert.equal(returnMovement.quantityDelta, 2, 'movement quantityDelta must equal returned stockQuantity')
  assert.equal(returnMovement.productionIssueActionId, 'ACT-TEST-T044-ISSUE-B', 'productionIssueActionId must reference the source issue')

  // Idempotent replay: same proof on already-returned state → returns current (not null).
  assert.ok(returnCommerceStockFromProduction(withReturn, {
    sourceIssueActionId: 'ACT-TEST-T044-ISSUE-B',
    productionQuantityMilli: 2000,
    stockQuantity: 2,
    stockUnitId: 'LOT-T044-001',
    locationId: 'LOC-T044-A',
    expectedInventoryHeadDigest: withReturn.inventoryFoundation.headDigest,
  }, returnProofPos) !== null, 'idempotent replay must return current state')
})

// --- TEMPLATE-EXPANSION.md queue item 5: Ecommerce per-trade storefront copy -----------------
//
// workingSamplePlan/matchesWorkingSample/activateLocalEcommerceWorkingSample now take a trade
// (ShopBusinessTemplateId | null) resolved via readLocalShopBusinessTemplateId. These tests prove
// the three acceptance points from TEMPLATE-EXPANSION.md section (e), item 5:
//   1. a bakery storefront reads trade-specific copy ("Fresh today"/"Order ahead" and a bakery
//      summary), not the generic workflow wording;
//   2. with no resolvable trade, every emitted string is BYTE-IDENTICAL to the literals captured
//      from this exact file before ecommerce-trade-storefront.ts existed -- not eyeballed;
//   3. provisioning a bakery storefront twice does not raise "Existing Ecommerce edits were
//      preserved", including when the FIRST provisioning happened before the Shop trade was
//      recognizable at all (the reason matchesWorkingSample must try {trade, null}, not trade
//      alone).

const CAPTURED_AT_BAKERY = '2026-08-18T02:00:00.000Z'

// Mirrors the real bakery template's catalog (business-templates.ts) closely enough to exercise
// the same "onHand ranking picks the wrong hero" bug the plan names: WATER-500ML's onHand (50)
// out-ranks most of the bread and pastry lines, so an unprefered ranking puts bottled water in
// the storefront's top four right alongside a coconut bun.
const BAKERY_ITEMS = [
  { sku: 'BREAD-WHITE', name: 'White sandwich loaf', onHand: 30, reorderAt: 5, price: 3000 },
  { sku: 'BREAD-WHOLEWHEAT', name: 'Whole wheat loaf', onHand: 20, reorderAt: 5, price: 3800 },
  { sku: 'BUN-COCONUT', name: 'Coconut bun', onHand: 60, reorderAt: 5, price: 1200 },
  { sku: 'CROISSANT-BUTTER', name: 'Butter croissant', onHand: 36, reorderAt: 5, price: 2500 },
  { sku: 'DONUT-GLAZED', name: 'Glazed donut', onHand: 48, reorderAt: 5, price: 1500 },
  { sku: 'CAKE-SLICE-CHOC', name: 'Chocolate cake slice', onHand: 24, reorderAt: 5, price: 3500 },
  { sku: 'CAKE-BIRTHDAY-1KG', name: 'Birthday cake 1kg', onHand: 6, reorderAt: 5, price: 32000 },
  { sku: 'COOKIE-BUTTER-BOX', name: 'Butter cookie box', onHand: 25, reorderAt: 5, price: 6500 },
  { sku: 'TART-EGG', name: 'Egg tart', onHand: 40, reorderAt: 5, price: 1800 },
  { sku: 'PUFF-CURRY', name: 'Curry puff', onHand: 5, reorderAt: 5, price: 1600 },
  { sku: 'COFFEE-ICED', name: 'Iced coffee', onHand: 40, reorderAt: 5, price: 2200 },
  { sku: 'WATER-500ML', name: 'Drinking water 500ml', onHand: 50, reorderAt: 5, price: 600 },
]

// sampleId 'bakery' is a real ShopBusinessTemplateId, so readLocalShopBusinessTemplateId resolves
// it -- this is what a device whose Shop was set up via provisionLocalShopBusinessTemplateSample
// looks like.
function bakeryWorkspace() {
  const installed = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
    sampleId: 'bakery',
    sampleName: 'Bakery & patisserie',
    items: BAKERY_ITEMS,
    capturedAt: CAPTURED_AT_BAKERY,
  })
  assert.ok(installed, 'the bakery working sample must install')
  return installed
}

// sampleId 'general-goods' is NOT a ShopBusinessTemplateId, so readLocalShopBusinessTemplateId
// returns null for this workspace even though it carries the same working-sample SKUs as
// bakeryWorkspace() above (commerceWorkingSampleSkus only checks the action-id PREFIX, not
// membership in a real trade). This isolates the trade-resolution axis from the
// preferredSkus/workingSampleSkus axis in the test below: swapping this workspace out for
// bakeryWorkspace() changes ONLY whether the trade resolves, not which SKUs are preferred.
function generalGoodsWorkspace() {
  const installed = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
    sampleId: 'general-goods',
    sampleName: 'General goods',
    items: BAKERY_ITEMS,
    capturedAt: CAPTURED_AT_BAKERY,
  })
  assert.ok(installed, 'the general-goods working sample must install')
  return installed
}

function memoryStorageAdapter(initial = new Map()) {
  const storage = initial
  return {
    storage,
    adapter: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => { storage.set(key, String(value)) },
      removeItem: (key) => { storage.delete(key) },
    },
  }
}

const noopLocks = { request: async (_name, _options, callback) => callback() }

test('a bakery Ecommerce storefront reads trade-specific copy, not the generic workflow wording', async () => {
  const state = bakeryWorkspace()
  const { adapter } = memoryStorageAdapter(new Map([[COMMERCE_KEY, JSON.stringify(state)]]))
  const { activateLocalEcommerceWorkingSample } = await import(
    '../showroom/src/products/ecommerce/local-merchandising-import.ts'
  )
  const { LOCAL_STOREFRONT_DRAFT_SCOPE, readStorefrontDraft } = await import(
    '../showroom/src/products/ecommerce/storefront-draft.ts'
  )
  const result = await activateLocalEcommerceWorkingSample(
    { templateId: 'social-storefront', businessName: 'Golden Bakery', capturedAt: CAPTURED_AT_BAKERY },
    { storage: adapter, catalog: state.items, locks: noopLocks },
  )
  assert.ok(result.ok, `bakery activation failed: ${result.ok ? '' : result.error}`)
  const draft = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE, adapter).draft
  const collections = new Set(draft.merchandising.map((row) => row.collection))
  assert.ok(collections.has('Fresh today'), `bakery storefront must read 'Fresh today', saw ${JSON.stringify([...collections])}`)
  assert.ok(collections.has('Order ahead'), `bakery storefront must read 'Order ahead', saw ${JSON.stringify([...collections])}`)
  assert.ok(!collections.has('Featured today'), 'generic demo wording must not appear once the trade resolves to bakery')
  assert.ok(!collections.has('More to browse'), 'generic demo wording must not appear once the trade resolves to bakery')
  assert.ok(
    draft.summary.includes('Golden Bakery') && /bread|cake|pastr/i.test(draft.summary),
    `bakery summary must be trade-specific, saw ${draft.summary}`,
  )
  assert.ok(
    draft.merchandising.every((row) => !row.note.startsWith('Demo social listing')),
    'notes must read as bakery guidance, not the generic social-listing note',
  )
  // The trade's own hero SKUs (bread, croissant, cake, tart) must be preferred over the plain
  // onHand ranking that would otherwise put a bottled water in the storefront's top four.
  assert.ok(
    draft.selectedSkus.includes('BREAD-WHITE'),
    `bakery storefront must lead with bakery goods, saw ${JSON.stringify(draft.selectedSkus)}`,
  )
  assert.ok(
    !draft.selectedSkus.includes('WATER-500ML'),
    `bakery storefront must not be led by bottled water, saw ${JSON.stringify(draft.selectedSkus)}`,
  )
})

// Literals captured from workingSamplePlan's output against this exact bakery-shaped catalog and
// business name, on the commit immediately before ecommerce-trade-storefront.ts was introduced
// (queue items 1-4 shipped, item 5 not yet started). This is the byte-identical-fallback baseline
// TEMPLATE-EXPANSION.md's acceptance point demands -- an assertion, not an eyeballed read.
const NO_TRADE_BASELINE = {
  'social-storefront': {
    summary: "Browse Golden Bakery's featured products and send one order request for Shop review.",
    selectedSkus: ['BUN-COCONUT', 'COFFEE-ICED', 'DONUT-GLAZED', 'WATER-500ML'],
    collections: ['Featured today', 'Featured today', 'More to browse', 'More to browse'],
    note: 'Demo social listing: confirm campaign copy and availability before launch.',
  },
  'pickup-preorder': {
    summary: 'Choose available items from Golden Bakery for pickup or preorder confirmation.',
    selectedSkus: ['BUN-COCONUT', 'DONUT-GLAZED', 'PUFF-CURRY', 'WATER-500ML'],
    collections: ['Pickup menu', 'Pickup menu', 'Pickup menu', 'Pickup menu'],
    note: 'Demo pickup listing: confirm collection time and availability before launch.',
  },
  'wholesale-request': {
    summary: "Browse Golden Bakery's trade assortment and request quantities for manager review.",
    selectedSkus: ['BUN-COCONUT', 'COFFEE-ICED', 'CROISSANT-BUTTER', 'DONUT-GLAZED', 'TART-EGG', 'WATER-500ML'],
    collections: Array(6).fill('Trade assortment'),
    note: 'Demo trade listing: confirm quantities, pricing, and delivery terms before launch.',
  },
}

test('with no resolvable Shop trade, Ecommerce working-sample copy is byte-identical to the pre-trade baseline', async () => {
  const { activateLocalEcommerceWorkingSample } = await import(
    '../showroom/src/products/ecommerce/local-merchandising-import.ts'
  )
  const { LOCAL_STOREFRONT_DRAFT_SCOPE, readStorefrontDraft } = await import(
    '../showroom/src/products/ecommerce/storefront-draft.ts'
  )
  for (const [templateId, expected] of Object.entries(NO_TRADE_BASELINE)) {
    const { storage, adapter } = memoryStorageAdapter()
    // No Shop workspace at all in this storage: COMMERCE_KEY is absent, so the trade must resolve
    // to null -- the exact "hand-imported CSV, trade undeterminable" case section (c) protects,
    // and also the case a fresh device is in before Shop has ever been set up.
    const result = await activateLocalEcommerceWorkingSample(
      { templateId, businessName: 'Golden Bakery', capturedAt: CAPTURED_AT_BAKERY },
      { storage: adapter, catalog: BAKERY_ITEMS, locks: noopLocks },
    )
    assert.ok(result.ok, `${templateId} activation failed: ${result.ok ? '' : result.error}`)
    const draft = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE, adapter).draft
    assert.equal(draft.summary, expected.summary, `${templateId} summary drifted from the pre-trade baseline`)
    assert.deepEqual(draft.selectedSkus, expected.selectedSkus, `${templateId} selectedSkus drifted from the pre-trade baseline`)
    assert.deepEqual(draft.merchandising.map((row) => row.collection), expected.collections, `${templateId} collection labels drifted`)
    assert.ok(draft.merchandising.every((row) => row.note === expected.note), `${templateId} notes drifted from the pre-trade baseline`)
    // Not just the wording: resolving the trade must not fabricate a Shop workspace as a side
    // effect on a device that never had one -- see the commerceRaw guard in
    // activateLocalEcommerceWorkingSample.
    assert.ok(!storage.has(COMMERCE_KEY), `${templateId} activation must not create a Shop workspace as a side effect`)
  }
})

test('provisioning a bakery Ecommerce storefront twice does not raise "Existing Ecommerce edits were preserved"', async () => {
  const state = bakeryWorkspace()
  const { adapter } = memoryStorageAdapter(new Map([[COMMERCE_KEY, JSON.stringify(state)]]))
  const { activateLocalEcommerceWorkingSample } = await import(
    '../showroom/src/products/ecommerce/local-merchandising-import.ts'
  )
  const activate = (capturedAt) => activateLocalEcommerceWorkingSample(
    { templateId: 'social-storefront', businessName: 'Golden Bakery', capturedAt },
    { storage: adapter, catalog: state.items, locks: noopLocks },
  )
  const first = await activate(CAPTURED_AT_BAKERY)
  assert.ok(first.ok && first.status === 'installed', `first bakery provisioning failed: ${first.ok ? first.status : first.error}`)
  const second = await activate('2026-08-18T02:05:00.000Z')
  assert.ok(second.ok, `re-provisioning a bakery storefront must not fail: ${second.ok ? '' : second.error}`)
  assert.equal(second.status, 'current', 're-provisioning an unchanged bakery storefront must be a no-op replay, not a fresh install')
})

test('a storefront installed before the Shop trade was recognizable is still matched once it resolves to bakery', async () => {
  const { storage, adapter } = memoryStorageAdapter(new Map([[COMMERCE_KEY, JSON.stringify(generalGoodsWorkspace())]]))
  const { activateLocalEcommerceWorkingSample } = await import(
    '../showroom/src/products/ecommerce/local-merchandising-import.ts'
  )
  const { LOCAL_STOREFRONT_DRAFT_SCOPE, readStorefrontDraft } = await import(
    '../showroom/src/products/ecommerce/storefront-draft.ts'
  )
  // First provisioning: Shop is 'general-goods', which is not a ShopBusinessTemplateId, so the
  // trade resolves to null and the storefront is built from the generic wording.
  const first = await activateLocalEcommerceWorkingSample(
    { templateId: 'social-storefront', businessName: 'Golden Bakery', capturedAt: CAPTURED_AT_BAKERY },
    { storage: adapter, catalog: BAKERY_ITEMS, locks: noopLocks },
  )
  assert.ok(first.ok && first.status === 'installed', `initial no-trade provisioning failed: ${first.ok ? first.status : first.error}`)
  const firstDraft = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE, adapter).draft
  assert.ok(firstDraft.merchandising.some((row) => row.collection === 'Featured today'), 'the first provisioning must have used the generic collection wording')

  // The owner's Shop is now recognized as a bakery, in the SAME storage. commerceWorkingSampleSkus
  // is unaffected by the swap (both workspaces carry the identical BAKERY_ITEMS as their working
  // sample), so this isolates the trade-resolution change from any preferredSkus change.
  storage.set(COMMERCE_KEY, JSON.stringify(bakeryWorkspace()))
  const second = await activateLocalEcommerceWorkingSample(
    { templateId: 'social-storefront', businessName: 'Golden Bakery', capturedAt: '2026-08-18T02:05:00.000Z' },
    { storage: adapter, catalog: BAKERY_ITEMS, locks: noopLocks },
  )
  // matchesWorkingSample must try the {trade, null} pair: the draft on disk was built under the
  // null plan, but the trade now resolves to bakery, so re-provisioning must recognize the
  // installed draft as this device's own working sample and refresh it to the bakery copy --
  // not refuse with "Existing Ecommerce edits were preserved".
  assert.ok(second.ok, `re-provisioning after the trade became determinable must not be refused: ${second.ok ? '' : second.error}`)
  assert.equal(second.status, 'installed', 'the bakery copy differs from the generic copy, so this must be a real update, not a no-op replay')
  const secondDraft = readStorefrontDraft(LOCAL_STOREFRONT_DRAFT_SCOPE, adapter).draft
  assert.ok(secondDraft.merchandising.some((row) => row.collection === 'Fresh today'), 'the second provisioning must have switched to the bakery collection wording')
})

// --- TEMPLATE-EXPANSION.md queue item 6: Ecommerce per-trade fulfilment and payment mix --------
//
// guided-sample-order.ts's buildGuidedSampleOrderRequest now takes the resolved trade and looks up
// its guidedOrder mix (ecommerce-trade-storefront.ts) instead of hardcoding pickup/pay_on_pickup.
// These tests prove the three acceptance points from TEMPLATE-EXPANSION.md section (e), item 6:
//   1. the hardware storefront's seeded request is delivery/cash_on_delivery, carries a real
//      delivery address, and still stops at pending_shop_review (buildEcommerceCheckoutQuote
//      rejects a delivery fulfilment with no address, so reaching pending_shop_review at all is
//      proof the address was supplied and accepted, not just that the fields read back correctly);
//   2. isGuidedSampleBuyingState is still true after provisioning, for both bakery (pickup) and
//      hardware (delivery);
//   3. bakery -- and a workspace with no resolvable trade -- reproduce today's exact
//      pickup/pay_on_pickup/no-address request, byte for byte, proving the fallback default in
//      guided-sample-order.ts (not just the explicit bakery guidedOrder entry) still lands on the
//      pre-item-6 shape.

// Mirrors the real hardware template's catalog (business-templates.ts) closely enough to exercise
// the same trade-preferred ranking bakery already proved: GLOVES-WORK's onHand (90) would otherwise
// out-rank every preferred hardware SKU under the plain onHand sort.
const HARDWARE_ITEMS = [
  { sku: 'CEMENT-50KG', name: 'Cement 50kg bag', onHand: 40, reorderAt: 15, price: 16500 },
  { sku: 'REBAR-10MM', name: 'Steel rebar 10mm 12m', onHand: 60, reorderAt: 20, price: 9500 },
  { sku: 'NAIL-2IN-KG', name: 'Common nails 2 inch per kg', onHand: 25, reorderAt: 8, price: 4500 },
  { sku: 'PAINT-4L-WHT', name: 'Emulsion paint 4L white', onHand: 12, reorderAt: 4, price: 34000 },
  { sku: 'BRUSH-3IN', name: 'Paint brush 3 inch', onHand: 20, reorderAt: 6, price: 3000 },
  { sku: 'PVC-PIPE-1IN', name: 'PVC pipe 1 inch 4m', onHand: 35, reorderAt: 12, price: 6000 },
  { sku: 'HAMMER-CLAW', name: 'Claw hammer', onHand: 10, reorderAt: 4, price: 9500 },
  { sku: 'GLOVES-WORK', name: 'Work gloves', onHand: 90, reorderAt: 10, price: 2500 },
]

// sampleId 'hardware' is a real ShopBusinessTemplateId, so readLocalShopBusinessTemplateId
// resolves it the same way bakeryWorkspace() resolves 'bakery' above.
function hardwareWorkspace() {
  const installed = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
    sampleId: 'hardware',
    sampleName: 'Hardware & construction supply',
    items: HARDWARE_ITEMS,
    capturedAt: CAPTURED_AT_BAKERY,
  })
  assert.ok(installed, 'the hardware working sample must install')
  return installed
}

async function seedGuidedRequest(adapter) {
  const { ecommerceBuyingStateStorageKey, validateEcommerceBuyingState } = await import(
    '../showroom/src/products/ecommerce/ecommerce-buying-lifecycle.ts'
  )
  const raw = adapter.getItem(ecommerceBuyingStateStorageKey('ecommerce:local'))
  assert.ok(raw, 'a guided sample request must be seeded')
  const buying = await validateEcommerceBuyingState(JSON.parse(raw), 'ecommerce:local')
  assert.equal(buying.requests.length, 1)
  return buying
}

test('a hardware Ecommerce guided request is delivery/cash_on_delivery, carries a real delivery address, and still stops at pending_shop_review', async () => {
  const state = hardwareWorkspace()
  const { adapter } = memoryStorageAdapter(new Map([[COMMERCE_KEY, JSON.stringify(state)]]))
  const { activateLocalEcommerceWorkingSample } = await import(
    '../showroom/src/products/ecommerce/local-merchandising-import.ts'
  )
  const { isGuidedSampleBuyingState } = await import(
    '../showroom/src/products/ecommerce/guided-sample-order.ts'
  )
  const result = await activateLocalEcommerceWorkingSample(
    { templateId: 'social-storefront', businessName: 'Golden Hardware', capturedAt: CAPTURED_AT_BAKERY },
    { storage: adapter, catalog: state.items, locks: noopLocks },
  )
  assert.ok(result.ok, `hardware activation failed: ${result.ok ? '' : result.error}`)
  const buying = await seedGuidedRequest(adapter)
  const [request] = buying.requests
  // Reaching pending_shop_review at all is the proof: buildEcommerceCheckoutQuote throws for a
  // delivery fulfilment with no address, and buildGuidedSampleOrderRequest swallows that throw and
  // returns null (no request seeded) rather than surfacing it -- so an empty/missing address would
  // show up here as "no guided request was seeded", not as a validation error to catch directly.
  assert.equal(request.state, 'pending_shop_review')
  assert.equal(request.fulfilment, 'delivery')
  assert.equal(request.quote.payment.adapter, 'cash_on_delivery')
  assert.ok(request.deliveryAddress, 'a delivery request must carry a delivery address')
  assert.equal(request.deliveryAddress.line1, 'No. 42, Bogyoke Aung San Road')
  assert.equal(request.deliveryAddress.township, 'Botahtaung')
  assert.equal(request.deliveryAddress.city, 'Yangon')
  assert.ok(isGuidedSampleBuyingState(buying))
})

test('isGuidedSampleBuyingState is true after provisioning for both bakery (pickup) and hardware (delivery)', async () => {
  const { activateLocalEcommerceWorkingSample } = await import(
    '../showroom/src/products/ecommerce/local-merchandising-import.ts'
  )
  const { isGuidedSampleBuyingState } = await import(
    '../showroom/src/products/ecommerce/guided-sample-order.ts'
  )
  for (const [trade, businessName, state] of [
    ['bakery', 'Golden Bakery', bakeryWorkspace()],
    ['hardware', 'Golden Hardware', hardwareWorkspace()],
  ]) {
    const { adapter } = memoryStorageAdapter(new Map([[COMMERCE_KEY, JSON.stringify(state)]]))
    const result = await activateLocalEcommerceWorkingSample(
      { templateId: 'social-storefront', businessName, capturedAt: CAPTURED_AT_BAKERY },
      { storage: adapter, catalog: state.items, locks: noopLocks },
    )
    assert.ok(result.ok, `${trade} activation failed: ${result.ok ? '' : result.error}`)
    const buying = await seedGuidedRequest(adapter)
    assert.ok(isGuidedSampleBuyingState(buying), `${trade} guided request must still read as a guided sample`)
  }
})

test('a bakery guided request reproduces the exact pre-item-6 pickup/pay_on_pickup/no-address shape', async () => {
  const state = bakeryWorkspace()
  const { adapter } = memoryStorageAdapter(new Map([[COMMERCE_KEY, JSON.stringify(state)]]))
  const { activateLocalEcommerceWorkingSample } = await import(
    '../showroom/src/products/ecommerce/local-merchandising-import.ts'
  )
  const result = await activateLocalEcommerceWorkingSample(
    { templateId: 'social-storefront', businessName: 'Golden Bakery', capturedAt: CAPTURED_AT_BAKERY },
    { storage: adapter, catalog: state.items, locks: noopLocks },
  )
  assert.ok(result.ok, `bakery activation failed: ${result.ok ? '' : result.error}`)
  const buying = await seedGuidedRequest(adapter)
  const [request] = buying.requests
  assert.equal(request.fulfilment, 'pickup')
  assert.equal(request.quote.payment.adapter, 'pay_on_pickup')
  assert.equal(request.deliveryAddress, null)
})

test('with no resolvable Shop trade, the guided request reproduces the exact pre-item-6 pickup/pay_on_pickup/no-address shape', async () => {
  const { adapter } = memoryStorageAdapter()
  const { activateLocalEcommerceWorkingSample } = await import(
    '../showroom/src/products/ecommerce/local-merchandising-import.ts'
  )
  const result = await activateLocalEcommerceWorkingSample(
    { templateId: 'social-storefront', businessName: 'Golden Bakery', capturedAt: CAPTURED_AT_BAKERY },
    { storage: adapter, catalog: BAKERY_ITEMS, locks: noopLocks },
  )
  assert.ok(result.ok, `no-trade activation failed: ${result.ok ? '' : result.error}`)
  const buying = await seedGuidedRequest(adapter)
  const [request] = buying.requests
  assert.equal(request.fulfilment, 'pickup')
  assert.equal(request.quote.payment.adapter, 'pay_on_pickup')
  assert.equal(request.deliveryAddress, null)
})
