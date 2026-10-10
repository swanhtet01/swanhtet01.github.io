import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

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

test('the empty catalog state does not show a duplicate generic products link', () => {
  assert.match(today, /\{commerce\.items\.length \? <footer><Link to="\/shop\/\?tab=inventory">View products/)
})
