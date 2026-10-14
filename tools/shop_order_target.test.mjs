import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

import { shopOrderLink, shopOrderTargetId } from '../showroom/src/core/shop-order-target.ts'

const root = resolve(import.meta.dirname, '..')
const [today, core] = await Promise.all([
  readFile(resolve(root, 'showroom', 'src', 'core', 'ShopToday.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'CoreApp.tsx'), 'utf8'),
])

test('Today links to the same order target rendered and focused in the Orders tab', () => {
  const orderId = 'order_123-abc'
  const targetId = 'shop-order-order_123-abc'

  assert.equal(shopOrderTargetId(orderId), targetId)
  assert.equal(shopOrderLink(orderId), `/shop/?tab=orders#${targetId}`)
  assert.match(today, /activeOrders\.map\(\(order\) => <Link key=\{order\.id\} to=\{shopOrderLink\(order\.id\)\}>/)
  assert.match(core, /const targetId = shopOrderTargetId\(order\.id\)/)
  assert.match(core, /id=\{targetId\} key=\{order\.id\} tabIndex=\{-1\}/)
  assert.match(core, /if \(tab === 'orders' && commerceLocation\.hash\.startsWith\('#shop-order-'\)\)[\s\S]*?target\?\.scrollIntoView\([\s\S]*?target\?\.focus\(\{ preventScroll: true \}\)/)
})
