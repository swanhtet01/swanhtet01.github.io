import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { prepareManagedFirstCatalog } from '../showroom/src/core/shop-managed-first-catalog.ts'

const root = resolve(import.meta.dirname, '..')
const [core, today] = await Promise.all([
  readFile(resolve(root, 'showroom', 'src', 'core', 'CoreApp.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'ShopToday.tsx'), 'utf8'),
])

test('an empty Shop dashboard offers a direct first-product path and a separate CSV import', () => {
  assert.match(today, /No products to sell yet[\s\S]*?to="\/shop\/\?tab=inventory#shop-catalog-create"[\s\S]*?Add first product[\s\S]*?to="\/shop\/\?tab=inventory#shop-catalog-import"[\s\S]*?Import a CSV/)
  assert.match(core, /id="shop-catalog-create"/)
  assert.match(core, /commerceLocation\.hash === '#shop-catalog-create'[\s\S]*?setCatalogCreateOpen\(true\)/)
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

test('the empty catalog state does not show a duplicate generic products link', () => {
  assert.match(today, /\{commerce\.items\.length \? <footer><Link to="\/shop\/\?tab=inventory">View products/)
})
