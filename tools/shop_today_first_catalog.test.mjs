import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { prepareManagedFirstCatalog } from '../showroom/src/core/shop-managed-first-catalog.ts'
import { confirmedBurmese } from '../showroom/src/core/i18n-actions.ts'
import { createShopCatalogImportPreview, SHOP_CATALOG_IMPORT_TEMPLATE, summarizeShopCatalogImportReview } from '../showroom/src/core/shop-catalog-import.ts'
import { shopCustomerReceiptText } from '../showroom/src/core/shop-customer-receipt.ts'
import {
  COMMERCE_ORDER_CALCULATION_SCHEMA,
  advanceCommerceOrder,
  commerceOrderAcknowledgementReader,
  createCommerceCatalogBaseline,
  createEmptyCommerce,
  commerceItemBarcodeConflicts,
  findCommerceItemByScanCode,
  reconcileCommercePayment,
  reserveCommerceOrder,
  updateCommerceItem,
  validateCommerceState,
} from '../showroom/src/core/commerce-workspace.ts'

const root = resolve(import.meta.dirname, '..')
const [core, today, onboarding] = await Promise.all([
  readFile(resolve(root, 'showroom', 'src', 'core', 'CoreApp.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'ShopToday.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'ClientDataOnboarding.tsx'), 'utf8'),
])

test('an empty Shop dashboard offers a direct first-product path and a separate CSV import', () => {
  assert.ok(today.includes("bi('No products to sell yet')"))
  assert.ok(today.includes("bi('Add one item to start, or import a catalog.')"))
  assert.ok(today.includes("bi('Add first product')"))
  assert.ok(today.includes("bi('Import a CSV')"))
  assert.match(today, /to="\/shop\/\?tab=inventory#shop-catalog-create"[\s\S]*?to="\/shop\/\?tab=inventory#shop-catalog-import"/)
  assert.match(core, /id="shop-catalog-create"/)
  assert.match(core, /commerceLocation\.hash === '#shop-catalog-create'[\s\S]*?setCatalogCreateOpen\(true\)/)
})

test('approved Burmese Shop empty-state copy renders beside the English labels', () => {
  const approved = new Map([
    ['No products to sell yet', 'ရောင်းရန်ပစ္စည်း မရှိသေးပါ'],
    ['Add one item to start, or import a catalog.', 'စတင်ရန် ပစ္စည်းတစ်ခု ထည့်ပါ၊ သို့မဟုတ် စာရင်းကို တင်သွင်းပါ။'],
    ['Add first product', 'ပထမဆုံးပစ္စည်း ထည့်ရန်'],
    ['Import a CSV', 'CSV ဖိုင် တင်သွင်းရန်'],
  ])
  for (const [english, burmese] of approved) assert.equal(confirmedBurmese(english), burmese)
})

test('catalog import keeps unchanged items out of the write and disables a no-op import', () => {
  const mixed = summarizeShopCatalogImportReview(3, [
    { kind: 'new' },
    { kind: 'unchanged' },
    { kind: 'possible_match' },
  ])
  assert.equal(mixed.readyRowCount, 2)
  assert.equal(mixed.unchangedRowCount, 1)
  assert.equal(mixed.blockingRowCount, 0)
  assert.equal(mixed.unchangedOnly, false)

  const unchangedOnly = summarizeShopCatalogImportReview(2, [
    { kind: 'unchanged' },
    { kind: 'unchanged' },
  ])
  assert.equal(unchangedOnly.readyRowCount, 0)
  assert.equal(unchangedOnly.unchangedRowCount, 2)
  assert.equal(unchangedOnly.unchangedOnly, true)

  const conflict = summarizeShopCatalogImportReview(2, [
    { kind: 'new' },
    { kind: 'conflict' },
  ])
  assert.equal(conflict.blockingRowCount, 1)
  assert.equal(conflict.unchangedOnly, false)

  assert.match(onboarding, /&& catalogReadyRowCount > 0\s*&& importContextReady/)
  assert.match(onboarding, /Everything in this file already matches your Shop catalog\./)
  assert.match(onboarding, /exact matches will stay unchanged\. Approve adding only the new items/)
})

test('Shop catalog import maps Burmese categories, preserves leading-zero barcodes, and never overwrites existing categories', async () => {
  const csv = 'SKU,Barcode,Item name,Category,Opening stock,Reorder at,Price (MMK)\r\nTEA-01,00012345,လက်ဖက်ရည်,သောက်စရာ,10,3,2500\r\n'
  const preview = await createShopCatalogImportPreview(csv, [])
  assert.equal(preview.mapping.category, 'Category')
  assert.equal(preview.rows[0].item?.category, 'သောက်စရာ')
  assert.equal(preview.rows[0].item?.barcode, '00012345')
  assert.match(SHOP_CATALOG_IMPORT_TEMPLATE.split('\r\n')[0], /category/i)

  const burmeseHeaders = await createShopCatalogImportPreview(
    'ပစ္စည်းကုဒ်,ဘားကုဒ်,ပစ္စည်းအမည်,အမျိုးအစား,လက်ကျန်,အနည်းဆုံးလက်ကျန်,စျေးနှုန်း\nTEA-02,00098765,လက်ဖက်စိမ်း,အဖျော်ယမကာ,8,2,1800\n',
    [],
  )
  assert.equal(burmeseHeaders.rows[0].item?.category, 'အဖျော်ယမကာ')
  assert.equal(burmeseHeaders.rows[0].item?.barcode, '00098765')

  const existing = { sku: 'TEA-01', barcode: '00012345', name: 'လက်ဖက်ရည်', category: 'သောက်စရာ', onHand: 10, reorderAt: 3, price: 2500 }
  const blankCategory = await createShopCatalogImportPreview(
    'SKU,Barcode,Item name,Category,Opening stock,Reorder at,Price (MMK)\r\nTEA-01,00012345,လက်ဖက်ရည်,,10,3,2500\r\n',
    [existing],
  )
  assert.equal(blankCategory.rows[0].status, 'already_exists')

  const changedCategory = await createShopCatalogImportPreview(csv.replace('သောက်စရာ', 'အစားအသောက်'), [existing])
  assert.equal(changedCategory.rows[0].status, 'conflict')
  assert.ok(changedCategory.rows[0].issues.some((issue) => issue.message.includes('category')))
})

test('Shop barcode identity stays separate from SKU, preserves leading zeroes, and fails closed on ambiguity', () => {
  const product = { sku: 'TEA-01', name: 'Tea', onHand: 4, reorderAt: 1, price: 2500 }
  const state = validateCommerceState({ ...createEmptyCommerce(), items: [{ ...product, barcode: '00012345' }] })
  assert.equal(findCommerceItemByScanCode(state.items, '00012345')?.sku, 'TEA-01')
  assert.equal(findCommerceItemByScanCode(state.items, ' tea-01 ')?.sku, 'TEA-01')
  assert.equal(commerceItemBarcodeConflicts(state.items, 'OTHER', '00012345'), true)
  assert.throws(() => validateCommerceState({ ...state, items: [{ ...product, barcode: '00012345' }, { ...product, sku: 'TEA-02', barcode: '00012345' }] }))
  assert.throws(() => validateCommerceState({ ...state, items: [{ ...product, barcode: '00012345' }, { ...product, sku: '00012345' }] }))
  const ambiguous = validateCommerceState({
    ...createEmptyCommerce(),
    items: [{ ...product, sku: 'tea-01' }, { ...product, sku: 'TEA-01' }],
  })
  assert.equal(findCommerceItemByScanCode(ambiguous.items, 'TEA-01'), null)
  assert.match(core, /function addScannedValue[\s\S]*resolveCommerceItemByScanCode\(items, normalizedQuery\)/)
  assert.match(core, /resolution\.kind === 'ambiguous'[\s\S]*Correct the duplicate product codes/)
  assert.match(core, /resolution\.kind === 'not_found'[\s\S]*unmatchedBarcodeForCreation\(value, source\)/)
  assert.match(core, /function selectStockCountBarcode[\s\S]*findCommerceItemByScanCode\(commerce\.items, code\)/)
  assert.match(core, /placeholder=\{uiText\('Search products or scan barcode'\)\}/)
  assert.match(core, /name="product-barcode"/)
  assert.match(core, /label>SKU \/ item code \(optional\)/)
})

test('adding or removing a barcode is an idempotent, auditable catalog update', () => {
  const state = validateCommerceState({
    ...createEmptyCommerce(),
    items: [{ sku: 'TEA-01', name: 'Tea', onHand: 4, reorderAt: 1, price: 2500 }],
  })
  const proof = {
    actionId: 'SYNTHETIC-BARCODE-UPDATE',
    capturedAt: '2026-10-16T00:00:00.000Z',
    actor: 'synthetic-operator',
    reason: 'Assign the supplier barcode to the item.',
    evidenceReference: 'Synthetic regression fixture.',
  }
  const update = {
    sku: 'TEA-01',
    expectedPrice: 2500,
    nextPrice: 2500,
    expectedReorderAt: 1,
    nextReorderAt: 1,
    expectedBarcode: null,
    nextBarcode: '00012345',
  }
  const updated = updateCommerceItem(state, update, proof)
  assert.ok(updated)
  assert.equal(updated.items[0].barcode, '00012345')
  assert.equal(findCommerceItemByScanCode(updated.items, '00012345')?.sku, 'TEA-01')
  assert.equal(updateCommerceItem(updated, update, proof), updated)
  assert.equal(updateCommerceItem(updated, { ...update, nextBarcode: null }, { ...proof, actionId: 'SYNTHETIC-BARCODE-REMOVE' })?.items[0].barcode, undefined)
})

test('Burmese product names are editable, versioned, replay-safe, and retained as order display data', () => {
  const state = validateCommerceState({
    ...createEmptyCommerce(),
    items: [{ sku: 'TEA-01', name: 'Green tea', onHand: 4, reorderAt: 1, price: 2500 }],
  })
  const proof = {
    actionId: 'SYNTHETIC-BURMESE-NAME-UPDATE',
    capturedAt: '2026-10-16T00:00:00.000Z',
    actor: 'synthetic-operator',
    reason: 'Add the owner-provided Myanmar display name.',
    evidenceReference: 'Synthetic regression fixture.',
  }
  const update = {
    sku: 'TEA-01',
    expectedPrice: 2500,
    nextPrice: 2500,
    expectedReorderAt: 1,
    nextReorderAt: 1,
    expectedNameMy: null,
    nextNameMy: 'လက်ဖက်ရည်',
  }
  const updated = updateCommerceItem(state, update, proof)
  assert.ok(updated)
  assert.equal(updated.items[0].name, 'Green tea')
  assert.equal(updated.items[0].nameMy, 'လက်ဖက်ရည်')
  assert.equal(updated.catalogChanges?.[0].previousNameMy, null)
  assert.equal(updated.catalogChanges?.[0].nextNameMy, 'လက်ဖက်ရည်')
  assert.equal(updateCommerceItem(updated, update, proof), updated)
  assert.equal(updateCommerceItem(state, { ...update, expectedNameMy: 'wrong' }, { ...proof, actionId: 'SYNTHETIC-BURMESE-STALE' }), null)
  assert.equal(updateCommerceItem(state, { ...update, expectedNameMy: undefined }, { ...proof, actionId: 'SYNTHETIC-BURMESE-MALFORMED' }), null)

  const renamed = updateCommerceItem(updated, {
    ...update,
    expectedNameMy: 'လက်ဖက်ရည်',
    nextNameMy: 'လက်ဖက်စိမ်း',
  }, { ...proof, actionId: 'SYNTHETIC-BURMESE-RENAME', capturedAt: '2026-10-16T00:00:01.000Z' })
  assert.ok(renamed)
  assert.equal(validateCommerceState(renamed).items[0].nameMy, 'လက်ဖက်စိမ်း')
  assert.equal(renamed.catalogChanges?.[0].previousNameMy, 'လက်ဖက်ရည်')
  assert.equal(renamed.catalogChanges?.[1].nextNameMy, 'လက်ဖက်ရည်')
  assert.match(core, /Burmese name \(optional\)[\s\S]*catalogEditDraft\.nameMy/)
  assert.match(core, /name: item\.name, \.\.\.\(item\.nameMy \? \{ nameMy: item\.nameMy \} : \{\}\)/)
})

test('customer receipts show the owner-entered Myanmar name next to the stable English name', () => {
  const receipt = shopCustomerReceiptText({
    orderId: 'ORD-SYNTHETIC-MY',
    createdAt: '2026-10-16T00:00:00.000Z',
    channel: 'Walk-in',
    customer: 'Guest',
    lines: [{ sku: 'TEA-01', name: 'Green tea', nameMy: 'လက်ဖက်ရည်', quantity: 1, lineTotalMmk: 2500 }],
    promotion: { discountMmk: 0 },
    tax: { taxMmk: 0 },
    delivery: null,
    totalMmk: 2500,
    payment: { method: 'Cash', status: 'reconciled' },
  }, { nameMyanmar: 'ဆိုင်', nameEnglish: 'Shop', phone: '', addressMyanmar: '', addressEnglish: '' })
  assert.match(receipt, /လက်ဖက်ရည် · Green tea  ×1  2,500 MMK/)
})

test('first product setup keeps required data minimal and continues to Counter after review', () => {
  assert.match(core, /name="product-name"[\s\S]*?required value=\{itemDraft\.name\}/)
  assert.match(core, /Current stock[\s\S]*?required step="1" type="number" value=\{itemDraft\.onHand\}/)
  assert.match(core, /Price \(MMK\)[\s\S]*?required step="1" type="number" value=\{itemDraft\.price\}/)
  assert.match(core, /const itemSku = suppliedSku \|\| `SM-\$\{commandUuid\(\)\.slice\(0, 8\)/)
  assert.match(core, /if \(isFirstProduct\) navigate\('\/shop\/\?tab=counter'\)/)
  assert.doesNotMatch(core, /name="product-code"[^>]*required/)
  assert.match(core, /id="shop-catalog-import"/)
  assert.match(core, /Import a CSV/)
})

test('managed first-product setup requires name, opening stock, and price and records honest provenance', () => {
  const start = core.indexOf('const catalogForm = ')
  const end = core.indexOf('</form>', start)
  const form = core.slice(start, end)
  assert.ok(start >= 0 && end > start)
  const field = (label) => {
    const fieldStart = form.indexOf(label)
    const fieldEnd = form.indexOf('</label>', fieldStart)
    return fieldStart >= 0 && fieldEnd > fieldStart ? form.slice(fieldStart, fieldEnd) : ''
  }
  assert.match(field('SKU / item code (optional)'), /<input/)
  assert.doesNotMatch(field('SKU / item code (optional)'), /required/)
  assert.match(field('Product name'), /required/)
  assert.match(field('Price (MMK)'), /required/)
  assert.match(field('Opening stock'), /required/)
  assert.doesNotMatch(field('Low-stock alert at'), /required/)
  assert.doesNotMatch(field('Opening balance note (optional)'), /required/)
  assert.doesNotMatch(field('Evidence reference (optional)'), /required/)
  assert.match(form, /Opening balance note \(optional\)/)
  assert.match(form, /Evidence reference \(optional\)/)
  assert.match(form, /owner-entered and not independently verified/)
  assert.match(core, /prepareManagedFirstCatalog\(catalogDraft, \(\) => commandUuid\(\)\)/)
  assert.match(core, /current\.items\.length \|\| current\.orders\.length \|\| current\.movements\.length \|\| current\.closes\.length \|\| commerceWebsiteIntakes\(current\)\.length \? null/)

  const prepared = prepareManagedFirstCatalog({
    sku: '', name: 'Tea', onHand: '12', reorderAt: '', price: '2500', reason: '', evidenceReference: '',
  }, () => 'abcdef12-0000-4000-8000-000000000000')
  assert.equal(prepared.ok, true)
  if (!prepared.ok) return
  assert.deepEqual(prepared.product, { sku: 'SM-ABCDEF12', name: 'Tea', onHand: 12, reorderAt: 0, price: 2500 })
  assert.equal(prepared.reason, 'Owner-entered opening stock during first-product setup.')
  assert.equal(prepared.evidenceReference, 'Owner-entered at setup; no external count record supplied.')
})

test('managed first-product setup preserves supplied codes and rejects missing or unsafe essentials', () => {
  const base = { sku: ' tea-1 ', name: 'Tea', onHand: '12', reorderAt: '3', price: '2500', reason: 'Counted by owner', evidenceReference: 'Opening sheet 1' }
  const prepared = prepareManagedFirstCatalog(base, () => { throw new Error('manual SKU must not generate a replacement') })
  assert.equal(prepared.ok, true)
  if (prepared.ok) {
    assert.deepEqual(prepared.product, { sku: 'TEA-1', name: 'Tea', onHand: 12, reorderAt: 3, price: 2500 })
    assert.equal(prepared.reason, 'Counted by owner')
    assert.equal(prepared.evidenceReference, 'Opening sheet 1')
  }

  for (const invalid of [
    { ...base, name: '' },
    { ...base, onHand: '' },
    { ...base, onHand: '1.5' },
    { ...base, reorderAt: '-1' },
    { ...base, price: '0' },
    { ...base, price: '2500.5' },
  ]) {
    assert.equal(prepareManagedFirstCatalog(invalid, () => 'abcdef12').ok, false)
  }
  assert.equal(prepareManagedFirstCatalog({ ...base, sku: '' }, () => 'short').ok, false)
})

test('a managed first product can complete a counter sale and leave a receipt-ready order with reduced stock', () => {
  const actor = 'synthetic-managed-owner'
  const prepared = prepareManagedFirstCatalog({
    sku: '', name: 'Tea', nameMy: 'လက်ဖက်ရည်', onHand: '12', reorderAt: '2', price: '2500', reason: '', evidenceReference: '',
  }, () => 'abcdef12-0000-4000-8000-000000000000')
  assert.equal(prepared.ok, true)
  if (!prepared.ok) return

  const setupProof = {
    actionId: 'SYNTHETIC-SETUP',
    capturedAt: '2026-10-11T06:00:00.000Z',
    actor,
    reason: prepared.reason,
    evidenceReference: prepared.evidenceReference,
  }
  let state = validateCommerceState({
    ...createEmptyCommerce(),
    items: [prepared.product],
    catalogBaselines: [createCommerceCatalogBaseline({ sku: prepared.product.sku, price: prepared.product.price, reorderAt: prepared.product.reorderAt }, setupProof)],
  })
  const orderId = 'ORD-SYNTHETIC-1'
  const order = {
    id: orderId,
    owner: actor,
    createdAt: '2026-10-11T06:01:00.000Z',
    customer: 'Guest',
    channel: 'Walk-in',
    item: prepared.product.name,
    itemSku: prepared.product.sku,
    quantity: 1,
    payment: 'Cash',
    paymentStatus: 'pending',
    refundStatus: 'none',
    fulfilment: 'pickup',
    fulfilmentReference: `Counter ${orderId}`,
    promisedAt: '2026-10-11T06:31:00.000Z',
    lines: [{ sku: prepared.product.sku, name: prepared.product.name, nameMy: prepared.product.nameMy, quantity: 1, unitPriceMmk: prepared.product.price }],
    calculation: { schema: COMMERCE_ORDER_CALCULATION_SCHEMA, currency: 'MMK', catalogRevision: 0, subtotalMmk: prepared.product.price, taxMode: 'not_configured', taxMmk: 0, totalMmk: prepared.product.price },
    total: prepared.product.price,
    status: 'confirmed',
  }
  const reviewProof = {
    actionId: 'SYNTHETIC-COUNTER-REVIEW',
    capturedAt: '2026-10-11T06:02:00.000Z',
    actor,
    reason: 'Cash received and the customer took the order.',
    evidenceReference: `Counter order ${orderId}`,
  }

  state = reserveCommerceOrder(state, order, reviewProof)
  assert.ok(state)
  state = reconcileCommercePayment(state, orderId, { ...reviewProof, actionId: 'SYNTHETIC-COUNTER-PAYMENT', capturedAt: '2026-10-11T06:03:00.000Z' })
  assert.ok(state)
  for (const [index, expectedStatus] of ['confirmed', 'preparing', 'ready'].entries()) {
    state = advanceCommerceOrder(state, orderId, expectedStatus, {
      ...reviewProof,
      actionId: `SYNTHETIC-COUNTER-ADVANCE-${expectedStatus.toUpperCase()}`,
      capturedAt: `2026-10-11T06:0${4 + index}:00.000Z`,
    }, 'managed-server')
    assert.ok(state)
  }

  const completed = state.orders.find((candidate) => candidate.id === orderId)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.paymentStatus, 'reconciled')
  assert.equal(completed.total, 2500)
  assert.equal(completed.lines[0].nameMy, 'လက်ဖက်ရည်')
  assert.equal(commerceOrderAcknowledgementReader(state)(orderId)?.lines[0].nameMy, 'လက်ဖက်ရည်')
  assert.equal(state.items.find((item) => item.sku === prepared.product.sku).onHand, 11)
  assert.match(core, /if \(completesSale\) \{\s*setReceiptAck\(null\)\s*setCounterReceiptOrderId\(order\.id\)/)
})

test('the empty catalog state does not show a duplicate generic products link', () => {
  assert.match(today, /\{commerce\.items\.length \? <footer><Link to="\/shop\/\?tab=inventory">\{uiText\('View products'\)\}/)
})
