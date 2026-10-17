import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { calculateShopMmkCashTotal, isShopCashSettlementMethod, SHOP_MMK_CASH_DENOMINATIONS } from '../showroom/src/core/shop-mmk-cash-count.ts'

assert.deepEqual(SHOP_MMK_CASH_DENOMINATIONS, [20_000, 10_000, 5_000, 2_000, 1_000, 500])
assert.deepEqual(calculateShopMmkCashTotal({}, ''), { status: 'incomplete', reason: 'Enter at least one count.' })
assert.deepEqual(calculateShopMmkCashTotal({ 20_000: '2', 10_000: '1', 2_000: '2', 500: '3' }, '300'), { status: 'ready', totalMmk: 55_800 })
assert.deepEqual(calculateShopMmkCashTotal({ 1_000: '0' }, ''), { status: 'ready', totalMmk: 0 })
for (const invalid of ['-1', '1.5', '1e3', '1,000', '1000000000']) {
  assert.equal(calculateShopMmkCashTotal({ 1_000: invalid }, '').status, 'invalid', `reject ${invalid}`)
}
assert.equal(calculateShopMmkCashTotal({}, '2.50').status, 'invalid')
assert.equal(isShopCashSettlementMethod('Cash'), true)
assert.equal(isShopCashSettlementMethod('cash on delivery'), true)
assert.equal(isShopCashSettlementMethod('KBZPay'), false)

const core = await readFile(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')
const component = await readFile(new URL('../showroom/src/core/ShopMmkCashCount.tsx', import.meta.url), 'utf8')
assert.match(core, /isShopCashSettlementMethod\(line\.paymentMethod\)\s*\? <ShopMmkCashCount/)
assert.match(core, /countedMmk: String\(totalMmk\)/)
assert.match(component, /<details className="compact-disclosure shop-mmk-cash-count">/)
assert.match(component, /disabled=\{disabled \|\| result\.status !== 'ready'\}/)
assert.match(component, /Use calculated total/)
console.log('PASS MMK note counts validate, total correctly, and populate only the cash-settlement draft')
