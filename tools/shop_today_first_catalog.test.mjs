import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { prepareManagedFirstCatalog } from '../showroom/src/core/shop-managed-first-catalog.ts'
import { confirmedBurmese } from '../showroom/src/core/i18n-actions.ts'
import { summarizeShopCatalogImportReview } from '../showroom/src/core/shop-catalog-import.ts'
import {
  advanceCommerceOrder,
  createCommerceCatalogBaseline,
  createEmptyCommerce,
  reconcileCommercePayment,
  reserveCommerceOrder,
  validateCommerceState,
} from '../showroom/src/core/commerce-workspace.ts'

const root = resolve(import.meta.dirname, '..')
const [core, today, onboarding, ecommerce, renderedBrowser] = await Promise.all([
  readFile(resolve(root, 'showroom', 'src', 'core', 'CoreApp.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'ShopToday.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'ClientDataOnboarding.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'products', 'ecommerce', 'EcommerceProduct.tsx'), 'utf8'),
  readFile(resolve(root, 'tools', 'verify_app_entry_rendered.mjs'), 'utf8'),
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

test('empty Commerce first-product copy stays aligned with its rendered-page contract', () => {
  const phrases = [
    'Add your first product',
    'Shop and Commerce share one catalog. Start with one item, or import a CSV if you already have a list.',
    'Add first product',
    'Import a CSV',
  ]
  assert.ok(ecommerce.includes('<h1>Add your first product</h1>'))
  assert.ok(ecommerce.includes('to="/shop/?tab=inventory#shop-catalog-create"'))
  assert.ok(ecommerce.includes('to="/shop/?tab=inventory#shop-catalog-import"'))
  for (const phrase of phrases) {
    assert.ok(ecommerce.includes(phrase), `Ecommerce source omits: ${phrase}`)
    assert.ok(renderedBrowser.includes(`'${phrase}'`), `Rendered browser contract omits: ${phrase}`)
  }
})

test('the empty Shop inventory keeps its first-product and CSV import targets mounted', () => {
  const inventoryStart = core.indexOf("if (tab === 'inventory') return")
  const inventoryEnd = core.indexOf('  return null', inventoryStart)
  const inventoryBranch = core.slice(inventoryStart, inventoryEnd)
  assert.ok(inventoryStart >= 0 && inventoryEnd > inventoryStart)
  assert.ok(inventoryBranch.includes('{shopCatalogOnboarding}'))
  assert.ok(inventoryBranch.includes('{commerceReturnLink}'))
  assert.ok(inventoryBranch.includes('{catalogCreatePanel}'))
  assert.equal(inventoryBranch.split('{shopCatalogOnboarding}').length - 1, 1)
  assert.ok(core.includes('catalogImportVisible ? <div id="shop-catalog-import-panel">'))
  assert.match(core, /onToggle=\{\(event\) => \{[\s\S]*?const target = event\.currentTarget[\s\S]*?const open = target\.open[\s\S]*?if \(open && commerceLocation\.hash === '#shop-catalog-create'\) window\.setTimeout\(\(\) => target\.querySelector<HTMLInputElement>\('input\[name="product-name"\]'\)\?\.focus\(\{ preventScroll: true \}\), 50\)/)
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
  assert.match(field('Barcode or product code (optional)'), /<input/)
  assert.doesNotMatch(field('Barcode or product code (optional)'), /required/)
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
    sku: '', name: 'Tea', onHand: '12', reorderAt: '2', price: '2500', reason: '', evidenceReference: '',
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
    lines: [{ sku: prepared.product.sku, name: prepared.product.name, quantity: 1, unitPriceMmk: prepared.product.price }],
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
  assert.equal(state.items.find((item) => item.sku === prepared.product.sku).onHand, 11)
  assert.match(core, /if \(completesSale\) \{\s*setReceiptAck\(null\)\s*setCounterReceiptOrderId\(order\.id\)/)
})

test('the empty catalog state does not show a duplicate generic products link', () => {
  assert.match(today, /\{commerce\.items\.length \? <footer><Link to="\/shop\/\?tab=inventory">View products/)
})
