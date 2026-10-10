import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const [core, today] = await Promise.all([
  readFile(resolve(root, 'showroom', 'src', 'core', 'CoreApp.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'ShopToday.tsx'), 'utf8'),
])

test('an empty Shop catalog links directly to its first-use setup', () => {
  assert.match(today, /No products yet[\s\S]*?to="\/shop\/\?tab=today#shop-catalog-import"[\s\S]*?Set up your catalog/)
  assert.match(core, /id="shop-catalog-import"/)
  assert.match(core, /Bring your existing products into Shop/)
})

test('the empty catalog state does not show a duplicate generic products link', () => {
  assert.match(today, /\{commerce\.items\.length \? <footer><Link to="\/shop\/\?tab=inventory">View products/)
})
