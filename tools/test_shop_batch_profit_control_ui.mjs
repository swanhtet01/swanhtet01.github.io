import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  SHOP_BATCH_PROFIT_CONTROL_CONTRACT,
  SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256,
  projectNoBatchProfitControl,
} from '../showroom/src/core/shop-batch-profit-control.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const today = readFileSync(`${root}/showroom/src/core/ShopToday.tsx`, 'utf8')
const css = readFileSync(`${root}/showroom/src/core/core-app.css`, 'utf8')
const firstUseSource = readFileSync(`${root}/showroom/src/core/shop-batch-profit-control-first-use.tsx`, 'utf8')
const packageJson = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'))
const panelStart = today.indexOf('export function ShopBatchProfitControlPanel')
const start = today.indexOf('return <section aria-label={panelAriaLabel}', panelStart)
const end = today.indexOf('export function ShopToday', start)

let checks = 0
const check = (condition, message) => {
  checks += 1
  assert.ok(condition, message)
}

check(start >= 0 && end > start, 'Batch Profit Control must be a bounded Shop Today section')
const section = today.slice(start, end)
const noBatch = projectNoBatchProfitControl()

assert.equal(noBatch.contract, SHOP_BATCH_PROFIT_CONTROL_CONTRACT); checks += 1
assert.equal(noBatch.contractSourceSha256, SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256); checks += 1
assert.equal(noBatch.state, 'no_batch'); checks += 1
assert.equal(noBatch.estimatePreview, null); checks += 1
assert.deepEqual(noBatch.priorities, []); checks += 1
assert.deepEqual(noBatch.evidenceStatus.withheldReasonCodes, ['no_batch']); checks += 1
check(Object.values(noBatch.authority).every((value) => value === false), 'No-batch authority must stay all false')

check(today.includes('batchProfitControl = projectNoBatchProfitControl()'), 'Shop Today must default through the accepted no-batch projector')
check(today.includes('batchProfitControl?: ShopBatchProfitControlView'), 'A future source-owned projection may be supplied without inventing UI state')
check(today.includes("panelAriaLabel = 'Shop Batch Profit Control'"), 'The primary Batch panel retains its exact accessible label')
check(today.includes("panelId = 'shop-batch-profit-control'"), 'The primary Batch panel retains its exact route anchor')
check(today.includes('batchProfitControl.contract === SHOP_BATCH_PROFIT_CONTROL_CONTRACT'), 'UI must bind the exact projection contract')
check(today.includes('batchProfitControl.contractSourceSha256 === SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256'), 'UI must bind the accepted R&D contract digest')
check(today.includes('Object.values(batchProfitControl.authority).every((value) => value === false)'), 'UI must fail closed if any authority flag is true')
check(section.includes('role="alert"') && section.includes('Batch projection blocked.'), 'Contract or authority mismatch must render a blocking alert')
const boundHeaderStart = section.indexOf('{batchProjectionBound ? <>')
const blockedHeaderCopy = 'Accepted Batch Profit Control binding did not verify. No evidence, estimate, priority, or authority is inferred.'
const blockedHeaderStart = section.indexOf(`</> : '${blockedHeaderCopy}'}`)
check(boundHeaderStart >= 0 && blockedHeaderStart > boundHeaderStart, 'Projection-derived header copy must be inside the verified binding branch')
check(section.slice(boundHeaderStart, blockedHeaderStart).includes('batchProfitControl.truthBoundary.boundary'), 'Only a verified projection may expose its truth-boundary copy')
check(section.includes(": 'blocked'}>{batchProjectionBound ? batchStateLabels[batchProfitControl.state] : 'Blocked'}</b>"), 'An unbound projection must show only the blocked state')

for (const [state, label] of Object.entries({
  no_batch: 'No batch selected',
  collecting_batch_evidence: 'Collecting evidence',
  review_adjustments: 'Review adjustments',
  batch_margin_at_risk: 'Margin at risk',
  batch_controlled: 'Controlled',
})) {
  check(today.includes(`${state}: '${label}'`), `State ${state} must have exact owner-facing copy`)
}

for (const label of [
  'Canonical revision lineage',
  'Whole-line batch allocation',
  'Production-cost estimate coverage',
  'Retained completed sales',
  'Packaging and delivery review',
  'Adjustments and unit reconciliation',
]) check(section.includes(label), `Evidence gate must be visible: ${label}`)

for (const label of [
  'Completed sold value',
  'Total batch cost estimate',
  'Batch contribution estimate',
  'Estimated break-even sold value',
  'Estimated margin at risk',
  'Batch disposition',
]) check(section.includes(label), `Batch output must use exact estimate-safe label: ${label}`)

check(section.includes('batchProfitControl.truthBoundary.boundary'), 'The engine truth boundary must render verbatim')
check(today.includes('Synthetic calculation only — never evidence'), 'Synthetic classification must remain permanent and explicit')
check(today.includes('Retained local operating evidence — not pilot, customer, or commercial proof'), 'Local operating evidence must not become commercial proof')
check(section.includes('Decision estimates withheld.'), 'No-batch state must withhold every decision estimate')
check(section.includes('Unknown is never replaced with zero'), 'Incomplete break-even must not false-green to zero')
check(section.includes('No ranking while decision evidence is incomplete'), 'Incomplete evidence must not expose priorities')
check(section.includes('Rate unavailable — no sold value'), 'Zero-sale contribution rate must remain unavailable')
check(section.includes('<strong>Next:</strong>') && section.includes('<strong>Closed when:</strong>'), 'Every rendered priority must retain action and objective closure')
check(section.includes('payment, stock, supplier, accounting, customer, hosted, provider, model, or production action'), 'The complete no-write boundary must remain visible')

for (const forbidden of ['<button', '<Link', 'onClick=', 'localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest']) {
  check(!section.includes(forbidden), `Batch projection surface must remain read-only: ${forbidden}`)
}

check(css.includes('.shop-batch-evidence { display: grid; grid-template-columns: repeat(3,minmax(0,1fr));'), 'Desktop evidence layout must use bounded columns')
check(css.includes('.shop-batch-priorities { display: grid; grid-template-columns: repeat(2,minmax(0,1fr));'), 'Desktop priorities must use bounded columns')
check(css.includes('.shop-batch-evidence { grid-template-columns: 1fr; }'), 'Mobile evidence must stack to one column')
check(css.includes('.shop-batch-priorities { grid-template-columns: 1fr; }'), 'Mobile priorities must stack to one column')
check(css.includes('overflow-wrap: anywhere'), 'Long safe IDs and labels must not force horizontal overflow')

check(today.includes("import type { ShopBakeryBatchDemoResult } from './shop-bakery-demo-loader'"), 'Batch demo keeps only a type-level static loader dependency')
check(today.includes("const { loadShopBakeryBatchProfitDemo } = await import('./shop-bakery-demo-loader')"), 'Batch demo implementation loads only after the explicit action')
check(!today.includes("import { loadShopBakeryBatchProfitDemo } from './shop-bakery-demo-loader'"), 'Batch demo has no eager value import')
check(today.includes("const [bakeryBatchDemo, setBakeryBatchDemo] = useState<ShopBakeryBatchDemoState>({ status: 'idle' })"), 'Batch demo begins inert')
check(today.includes("if (attempt === bakeryBatchDemoAttempt.current) setBakeryBatchDemo({ status: 'ready', result })"), 'Batch demo ignores stale asynchronous completion')
check(today.includes('<ShopBatchProfitControlPanel batchProfitControl={activeBatchProfitControl} />'), 'current or exactly revalidated local Batch view renders through the guarded authoritative panel')
check(today.includes("{bakeryBatchDemo.status === 'ready' ? <ShopBatchProfitControlPanel"), 'synthetic projection renders only after exact loader success')
check(today.includes('batchProfitControl={bakeryBatchDemo.result.projection}'), 'successful synthetic result is passed through the existing guarded projection panel')
check(today.includes('panelId="shop-batch-profit-control-synthetic-demo"'), 'synthetic view uses a distinct DOM anchor')
check(today.includes('Synthetic local Batch calculation only — never baseline, pilot, customer, commercial, or accounting proof.'), 'synthetic Batch classification is permanent before load')
check(today.includes('never replaces, merges with, or writes to your current Shop workspace'), 'synthetic Batch action visibly refuses workspace mutation')
check(today.includes('The current Shop Batch panel above remains authoritative and unchanged.'), 'current Batch view remains visibly authoritative')
check(today.includes('Batch demo binding check failed closed.'), 'binding failure exposes no synthetic projection')

check(today.includes("await import('./shop-batch-profit-control-first-use')"), 'real local Batch workflow is loaded only after the explicit action')
check(!today.includes("import { ShopBatchProfitControlFirstUse } from './shop-batch-profit-control-first-use'"), 'real local Batch workflow has no eager value import')
check(today.includes('setLocalBatchProjection(null)\n    setBatchFirstUse({ status: \'loading\' })'), 'reopening the local workflow clears any prior projection before asynchronous validation')
check(today.includes('Existing Batch records and the current Shop workspace are never overwritten.'), 'launcher states the no-overwrite boundary')
check(today.includes('Not pilot, customer, commercial, or accounting proof.'), 'launcher permanently excludes commercial evidence claims')
check(firstUseSource.includes("SHOP_BATCH_FIRST_USE_STORAGE_KEY = 'supermega.shop.batch-profit-control.local-workspace.v1'"), 'local Batch storage must be explicitly versioned')
check(firstUseSource.includes('projectShopBatchProfitControl(structuredClone(input)'), 'local Batch workflow must project through the accepted engine')
check(!firstUseSource.includes('estimatedBreakEvenSoldValueMmk:'), 'local Batch workflow must not implement a second decision-arithmetic projector')
check(firstUseSource.includes('if (currentCommerceEvidence) for (const record of store.records) await validateCurrentCommerceSource(record, currentCommerceEvidence)'), 'every stored Batch source snapshot must be current before any projection or append')
for (const forbidden of ['fetch(', 'XMLHttpRequest', 'indexedDB', 'saveCommerce', 'mutateCommerce', 'sessionStorage']) {
  check(!firstUseSource.includes(forbidden), `local Batch workflow must not gain a network/workspace write primitive: ${forbidden}`)
}
for (const expected of [
  '.shop-batch-first-use-form input[type="checkbox"] { width: 2.75rem; height: 2.75rem;',
  'min-inline-size: 2.75rem; min-block-size: 2.75rem;',
  '.shop-batch-first-use-lines, .shop-batch-first-use-items { grid-template-columns: 1fr; }',
]) check(css.includes(expected), `local Batch workflow must retain its mobile/touch contract: ${expected}`)

assert.equal(
  packageJson.scripts['shop:batch-profit-control:verify'],
  'node tools/test_shop_batch_profit_control.mjs && node tools/test_shop_batch_profit_control_ui.mjs',
)
checks += 1

const showroomRequire = createRequire(new URL('../showroom/package.json', import.meta.url))
const [{ createServer }, react, { renderToStaticMarkup }] = await Promise.all([
  import(pathToFileURL(showroomRequire.resolve('vite')).href),
  import(pathToFileURL(showroomRequire.resolve('react')).href),
  import(pathToFileURL(showroomRequire.resolve('react-dom/server')).href),
])
const createElement = react.createElement ?? react.default.createElement
const vite = await createServer({
  appType: 'custom',
  configFile: `${root}/showroom/vite.config.ts`,
  configLoader: 'runner',
  logLevel: 'silent',
  root: `${root}/showroom`,
  server: { hmr: false, middlewareMode: true },
})

try {
  const { ShopBatchProfitControlPanel } = await vite.ssrLoadModule('/src/core/ShopToday.tsx')
  const firstUse = await vite.ssrLoadModule('/src/core/shop-batch-profit-control-first-use.tsx')
  const allFalseAuthority = {
    paymentWrite: false,
    stockWrite: false,
    supplierWrite: false,
    accountingWrite: false,
    customerWrite: false,
    hostedWrite: false,
    providerWrite: false,
    modelUsed: false,
  }
  const untrustedProjection = {
    contract: SHOP_BATCH_PROFIT_CONTROL_CONTRACT,
    contractSourceSha256: SHOP_BATCH_PROFIT_CONTROL_RND_CONTRACT_SHA256,
    state: 'batch_controlled',
    batchIdentity: { batchId: 'UNTRUSTED-BATCH-ID' },
    evidenceStatus: { withheldReasonCodes: [], profitStatus: 'available' },
    totals: { totalCompletedSaleValueMmk: 987654321 },
    estimatePreview: { batchContributionEstimateMmk: 987654321 },
    priorities: [{ sku: 'UNTRUSTED-PRIORITY-SKU' }],
    truthBoundary: {
      costLabel: 'UNTRUSTED COST CONTENT',
      classification: 'retained_non_sample_local_operating_evidence_not_pilot_customer_or_commercial_proof',
      boundary: 'UNTRUSTED TRUTH CONTENT',
    },
    authority: allFalseAuthority,
  }
  const renderProjection = (projection) => renderToStaticMarkup(createElement(ShopBatchProfitControlPanel, { batchProfitControl: projection }))
  const assertBlockedProjection = (markup, reason) => {
    check(markup.includes('Accepted Batch Profit Control binding did not verify.'), `${reason} must show neutral binding copy`)
    check(markup.includes('<b data-state="blocked">Blocked</b>'), `${reason} must show only a blocked state`)
    check(markup.includes('Batch projection blocked.'), `${reason} must show the blocking alert`)
    for (const forbidden of ['Controlled', 'UNTRUSTED COST CONTENT', 'UNTRUSTED TRUTH CONTENT', 'UNTRUSTED-BATCH-ID', 'UNTRUSTED-PRIORITY-SKU', '987,654,321', 'Retained local operating evidence', 'Completed sold value']) {
      check(!markup.includes(forbidden), `${reason} must not expose supplied projection content: ${forbidden}`)
    }
  }

  assertBlockedProjection(renderProjection({ ...untrustedProjection, contractSourceSha256: '0'.repeat(64) }), 'digest mismatch')
  for (const authorityKey of Object.keys(allFalseAuthority)) {
    assertBlockedProjection(renderProjection({
      ...untrustedProjection,
      authority: { ...allFalseAuthority, [authorityKey]: true },
    }), `true authority ${authorityKey}`)
  }

  const { loadShopBakeryBatchProfitDemo } = await vite.ssrLoadModule('/src/core/shop-bakery-demo-loader.ts')
  const syntheticBatchDemo = await loadShopBakeryBatchProfitDemo()
  const syntheticMarkup = renderToStaticMarkup(createElement(ShopBatchProfitControlPanel, {
    batchProfitControl: syntheticBatchDemo.projection,
    panelAriaLabel: 'Verified synthetic bakery Batch Profit Control projection',
    panelId: 'shop-batch-profit-control-synthetic-demo',
  }))
  for (const expected of [
    'aria-label="Verified synthetic bakery Batch Profit Control projection"',
    'id="shop-batch-profit-control-synthetic-demo"',
    '<b data-state="batch_margin_at_risk">Margin at risk</b>',
    'Synthetic calculation only — never evidence',
    'Operating decision status: withheld',
    '63,000 MMK',
    '77,550 MMK',
    '-14,550 MMK',
    '24,000 MMK',
    'BAK-CROISSANT',
    'BAK-MILK-BREAD',
    'BAK-TEA-BUN',
    'never counts as baseline, pilot, customer, or commercial proof',
  ]) check(syntheticMarkup.includes(expected), `verified synthetic Batch render must include: ${expected}`)
  check(!syntheticMarkup.includes('Batch projection blocked.'), 'exact synthetic projection must pass the guarded renderer')

  const retainedCommerce = {
    schema: 'supermega.commerce.workspace.v2',
    items: [{ sku: 'BAK-BREAD', name: 'Daily Bread', onHand: 10, reorderAt: 2, price: 3_000 }],
    movements: [],
    closes: [],
    orders: [{
      id: 'ORDER-OWNER-001',
      createdAt: '2026-08-30T01:00:00.000Z',
      customer: 'PRIVATE CUSTOMER MUST NOT PERSIST',
      channel: 'counter',
      item: 'Daily Bread',
      quantity: 2,
      payment: 'cash',
      paymentStatus: 'reconciled',
      refundStatus: 'none',
      paymentReconciledAt: '2026-08-30T02:00:00.000Z',
      paymentReconciliationActionId: 'PAY-OWNER-001',
      lines: [{ sku: 'BAK-BREAD', name: 'Daily Bread', quantity: 2, unitPriceMmk: 3_000 }],
      completion: { actionId: 'COMPLETE-OWNER-001', capturedAt: '2026-08-30T02:05:00.000Z', actor: 'Shop owner', reason: 'Local counter close', evidenceReference: 'LOCAL-SALE-001' },
      total: 6_000,
      status: 'completed',
    }],
  }
  const evidence = await firstUse.deriveShopBatchEligibleSaleLines(retainedCommerce)
  assert.equal(evidence.lines.length, 1); checks += 1
  assert.deepEqual(evidence.blocked, { incompleteEvidence: 0, invalidAdjustments: 0, missingLines: 0, sampleOrSynthetic: 0 }); checks += 1
  const line = evidence.lines[0]
  const draft = {
    batchId: 'OWNER-BATCH-001',
    businessDate: '2026-08-30',
    selectedLineDigests: [line.selectionId],
    itemInputs: {
      'BAK-BREAD': { producedUnits: 2, leftoverUnits: 0, wastedUnits: 0, remakeUnits: 0, preorderUnits: 0, reviewedUnitCostEstimateMmk: 2_000, ownerReviewed: true },
    },
    packagingCostMmk: 200,
    deliveryCostMmk: 0,
    otherReviewedBatchCostMmk: 0,
    otherReviewedBatchCostReason: 'none',
    overheadOwnerReviewed: true,
  }
  class MemoryStorage {
    value = null
    getItem(key) { assert.equal(key, firstUse.SHOP_BATCH_FIRST_USE_STORAGE_KEY); return this.value }
    setItem(key, value) { assert.equal(key, firstUse.SHOP_BATCH_FIRST_USE_STORAGE_KEY); this.value = value }
  }
  const storage = new MemoryStorage()
  const commerceBeforeSave = structuredClone(retainedCommerce)
  const saved = await firstUse.saveShopBatchProfitControlLocalReview(retainedCommerce, draft, storage, '2026-08-30T03:00:00.000Z')
  assert.equal(saved.recordCount, 1); checks += 1
  assert.equal(saved.projection.batchIdentity.batchId, 'OWNER-BATCH-001'); checks += 1
  assert.equal(saved.projection.truthBoundary.classification, 'retained_non_sample_local_operating_evidence_not_pilot_customer_or_commercial_proof'); checks += 1
  assert.equal(saved.projection.estimatePreview.batchContributionEstimateMmk, 1_800); checks += 1
  check(Object.values(saved.projection.authority).every((value) => value === false), 'real local Batch projection must retain all-false authority')
  check(!storage.value.includes('PRIVATE CUSTOMER MUST NOT PERSIST'), 'local Batch receipt must not persist customer identity')
  assert.deepEqual(retainedCommerce, commerceBeforeSave); checks += 1
  const loaded = await firstUse.loadShopBatchProfitControlLocalReview(retainedCommerce, storage)
  assert.equal(loaded.recordCount, 1); checks += 1
  assert.deepEqual(loaded.projection, saved.projection); checks += 1

  const beforeRejectedSave = storage.value
  await assert.rejects(
    firstUse.saveShopBatchProfitControlLocalReview(retainedCommerce, { ...draft, batchId: 'OWNER-BATCH-002' }, storage, '2026-08-30T03:05:00.000Z'),
    /shop_batch_first_use_duplicate_line_reuse/,
  ); checks += 1
  assert.equal(storage.value, beforeRejectedSave); checks += 1

  await assert.rejects(
    firstUse.saveShopBatchProfitControlLocalReview(retainedCommerce, { ...draft, batchId: 'OWNER-BATCH-003', itemInputs: {} }, new MemoryStorage(), '2026-08-30T03:05:00.000Z'),
    /shop_batch_first_use_cost_coverage_incomplete/,
  ); checks += 1

  const staleCommerce = structuredClone(retainedCommerce)
  staleCommerce.orders[0].lines[0].unitPriceMmk = 3_001
  staleCommerce.orders[0].total = 6_002
  await assert.rejects(firstUse.loadShopBatchProfitControlLocalReview(staleCommerce, storage), /shop_batch_first_use_source_snapshot_stale/); checks += 1
  const changedDuringSaveStorage = new MemoryStorage()
  await assert.rejects(
    firstUse.saveShopBatchProfitControlLocalReview(retainedCommerce, draft, changedDuringSaveStorage, '2026-08-30T03:00:00.000Z', () => staleCommerce),
    /shop_batch_first_use_source_snapshot_stale/,
  ); checks += 1
  assert.equal(changedDuringSaveStorage.value, null); checks += 1

  const adjustedCommerce = structuredClone(retainedCommerce)
  adjustedCommerce.orders[0].returns = [{ actionId: 'RETURN-001', createdAt: '2026-08-30T02:06:00.000Z', actor: 'Shop owner', reason: 'Reviewed return', evidenceReference: 'RETURN-EVIDENCE-001', sku: 'BAK-BREAD', quantity: 1, disposition: 'restock' }]
  const adjustedEvidence = await firstUse.deriveShopBatchEligibleSaleLines(adjustedCommerce)
  assert.equal(adjustedEvidence.lines.length, 0); checks += 1
  assert.equal(adjustedEvidence.blocked.invalidAdjustments, 1); checks += 1
  await assert.rejects(
    firstUse.saveShopBatchProfitControlLocalReview(adjustedCommerce, { ...draft, batchId: 'OWNER-BATCH-004' }, new MemoryStorage(), '2026-08-30T03:05:00.000Z'),
    /shop_batch_first_use_sale_allocation_missing/,
  ); checks += 1

  const malformedPromotionCommerce = structuredClone(retainedCommerce)
  malformedPromotionCommerce.orders[0].promotionDecision = {
    schema: 'supermega.commerce.promotion-decision.v1',
    status: 'approved',
    code: 'OWNER-REVIEW',
    policyRevision: 1,
    policyActionId: 'PROMO-001',
    discountBasisPoints: 100,
    grossSubtotalMmk: 6_000,
    discountMmk: 100,
    netSubtotalMmk: 6_000,
    reviewedAt: '2026-08-30T02:01:00.000Z',
    reason: 'approved',
  }
  const malformedPromotionEvidence = await firstUse.deriveShopBatchEligibleSaleLines(malformedPromotionCommerce)
  assert.equal(malformedPromotionEvidence.lines.length, 0); checks += 1
  assert.equal(malformedPromotionEvidence.blocked.invalidAdjustments, 1); checks += 1

  const mixedDiscountCommerce = structuredClone(retainedCommerce)
  mixedDiscountCommerce.orders[0].lines = [
    { sku: 'BAK-ZERO', name: 'Zero-value Bun', quantity: 1, unitPriceMmk: 1 },
    { sku: 'BAK-ONE', name: 'Retained-value Loaf', quantity: 1, unitPriceMmk: 999 },
  ]
  mixedDiscountCommerce.orders[0].total = 1
  mixedDiscountCommerce.orders[0].promotionDecision = {
    schema: 'supermega.commerce.promotion-decision.v1',
    status: 'approved',
    code: 'OWNER-REVIEW',
    policyRevision: 1,
    policyActionId: 'PROMO-002',
    discountBasisPoints: 9_990,
    grossSubtotalMmk: 1_000,
    discountMmk: 999,
    netSubtotalMmk: 1,
    reviewedAt: '2026-08-30T02:01:00.000Z',
    reason: 'approved',
  }
  const mixedDiscountEvidence = await firstUse.deriveShopBatchEligibleSaleLines(mixedDiscountCommerce)
  assert.deepEqual(mixedDiscountEvidence.lines.map((candidate) => candidate.netValueMmk).sort((left, right) => left - right), [0, 1]); checks += 1
  const mixedDiscountProjection = await firstUse.saveShopBatchProfitControlLocalReview(mixedDiscountCommerce, {
    ...draft,
    batchId: 'OWNER-BATCH-DISCOUNT',
    selectedLineDigests: mixedDiscountEvidence.lines.map((candidate) => candidate.selectionId),
    itemInputs: {
      'BAK-ZERO': { producedUnits: 1, leftoverUnits: 0, wastedUnits: 0, remakeUnits: 0, preorderUnits: 0, reviewedUnitCostEstimateMmk: 1, ownerReviewed: true },
      'BAK-ONE': { producedUnits: 1, leftoverUnits: 0, wastedUnits: 0, remakeUnits: 0, preorderUnits: 0, reviewedUnitCostEstimateMmk: 1, ownerReviewed: true },
    },
    packagingCostMmk: 0,
  }, new MemoryStorage(), '2026-08-30T03:05:00.000Z')
  assert.equal(mixedDiscountProjection.projection.priorities[0].sku, 'BAK-ZERO'); checks += 1
  assert.equal(mixedDiscountProjection.projection.priorities[0].contributionEstimateBasisPoints, null); checks += 1

  const ambiguousCommerce = structuredClone(retainedCommerce)
  ambiguousCommerce.orders.push(structuredClone(ambiguousCommerce.orders[0]))
  await assert.rejects(firstUse.deriveShopBatchEligibleSaleLines(ambiguousCommerce), /shop_batch_first_use_sale_allocation_ambiguous/); checks += 1

  const failedStorage = new MemoryStorage()
  failedStorage.setItem = () => { throw new Error('quota') }
  await assert.rejects(
    firstUse.saveShopBatchProfitControlLocalReview(retainedCommerce, draft, failedStorage, '2026-08-30T03:00:00.000Z'),
    /shop_batch_first_use_storage_write_failed/,
  ); checks += 1
  assert.equal(failedStorage.value, null); checks += 1

  const secondCommerce = structuredClone(retainedCommerce)
  secondCommerce.orders.push({
    ...structuredClone(secondCommerce.orders[0]),
    id: 'ORDER-OWNER-002',
    paymentReconciliationActionId: 'PAY-OWNER-002',
    completion: { ...structuredClone(secondCommerce.orders[0].completion), actionId: 'COMPLETE-OWNER-002', evidenceReference: 'LOCAL-SALE-002' },
  })
  const secondEvidence = await firstUse.deriveShopBatchEligibleSaleLines(secondCommerce)
  const secondLine = secondEvidence.lines.find((candidate) => candidate.selectionId !== line.selectionId)
  assert.ok(secondLine); checks += 1
  const appended = await firstUse.saveShopBatchProfitControlLocalReview(secondCommerce, {
    ...draft,
    batchId: 'OWNER-BATCH-002',
    selectedLineDigests: [secondLine.selectionId],
  }, storage, '2026-08-30T03:10:00.000Z')
  assert.equal(appended.recordCount, 2); checks += 1
  assert.equal(appended.projection.evidenceStatus.crossBatchReuseAbsent, true); checks += 1

  const stalePriorCommerce = structuredClone(secondCommerce)
  stalePriorCommerce.orders.find((order) => order.id === 'ORDER-OWNER-001').lines[0].unitPriceMmk = 3_001
  stalePriorCommerce.orders.find((order) => order.id === 'ORDER-OWNER-001').total = 6_002
  await assert.rejects(firstUse.loadShopBatchProfitControlLocalReview(stalePriorCommerce, storage), /shop_batch_first_use_source_snapshot_stale/); checks += 1

  const sampleCommerce = structuredClone(retainedCommerce)
  sampleCommerce.orders[0].completion.actionId = 'SETUP-SAMPLE-COMPLETE'
  const sampleEvidence = await firstUse.deriveShopBatchEligibleSaleLines(sampleCommerce)
  assert.equal(sampleEvidence.lines.length, 0); checks += 1
  assert.equal(sampleEvidence.blocked.sampleOrSynthetic, 1); checks += 1

  const incompleteCommerce = structuredClone(retainedCommerce)
  delete incompleteCommerce.orders[0].paymentReconciledAt
  const incompleteEvidence = await firstUse.deriveShopBatchEligibleSaleLines(incompleteCommerce)
  assert.equal(incompleteEvidence.lines.length, 0); checks += 1
  assert.equal(incompleteEvidence.blocked.incompleteEvidence, 1); checks += 1

  const tamperedStorage = new MemoryStorage()
  tamperedStorage.value = storage.value.replace('OWNER-BATCH-002', 'OWNER-BATCH-009')
  await assert.rejects(firstUse.loadShopBatchProfitControlLocalReview(secondCommerce, tamperedStorage)); checks += 1
} finally {
  await vite.close()
}

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega.shop.batch_profit_control.ui_contract.v1',
  checks,
  defaultState: noBatch.state,
  authorityAllFalse: true,
}))
