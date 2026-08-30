// Guard: every shop the product ships can take a sale and close its books.
//
// Thirteen commerce guards build their fixture from createSeedCommerce() alone -- five items,
// alphabetical, tiny. That is the exact catalog shape that hid two real defects: the inventory
// setup bound (8 items) and the unsorted-catalog projection failure. Both were invisible to
// every seed-based test and broke every real shop.
//
// So this runs the money journey a design partner does on day one -- reserve, prepare, ready,
// reconcile, complete, close, hand off to accounting -- against every business template
// catalog exactly as it is installed, in catalog order rather than alphabetical.
//
// The result today is that all seven pass, which is worth pinning rather than assuming: it
// says the seed-based fixtures elsewhere are not hiding a dependency on catalog shape in the
// money path. If a future change makes any behaviour depend on catalog size or ordering, this
// is the file that says so, and it names the trade that broke.
//
// WHAT THIS FILE DOES NOT OWN, stated so its check count is not mistaken for coverage it does
// not have. Almost every individual rule it touches is owned by a more precise guard: the
// order write boundary by test_commerce_order_integrity.mjs, close eligibility by
// test_order_to_close_journey.mjs, double-entry balance by
// test_commerce_accounting_balance.mjs. Mutating those rules fails those files first.
//
// Its own contribution is BREADTH: the same journey against seven real installed catalogs
// instead of one small alphabetical seed. That is a regression guard for a defect class that
// does not exist today and did exist twice this week -- so there is no mutation that only this
// file catches, and inventing one would misrepresent what it is for.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export {
        createSeedCommerce, installCommerceWorkingSampleCatalog, validateCommerceState,
        reserveCommerceOrder, advanceCommerceOrder, reconcileCommercePayment,
        commerceCloseExpectation, saveCommerceClose, commerceAccountingHandoff,
        commerceDailyCloseExport,
      } from './commerce-workspace.ts'
      export {
        shopBusinessTemplates, shopBusinessTemplateCommerceItems,
      } from '../products/shop/business-templates.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/every-trade-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createSeedCommerce, installCommerceWorkingSampleCatalog, validateCommerceState,
  reserveCommerceOrder, advanceCommerceOrder, reconcileCommercePayment,
  commerceCloseExpectation, saveCommerceClose, commerceAccountingHandoff, commerceDailyCloseExport,
  shopBusinessTemplates, shopBusinessTemplateCommerceItems,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const OPERATOR = 'Swan Htet'
const QUANTITY = 2
const at = (hour) => `2026-07-24T${String(hour).padStart(2, '0')}:00:00.000Z`
const proof = (suffix, hour) => ({
  actionId: `ACT-TRADE-${suffix}`,
  capturedAt: at(hour),
  actor: OPERATOR,
  reason: `Money journey step ${suffix}`,
  evidenceReference: `TRADE-${suffix}`,
})

check(shopBusinessTemplates.length >= 7, `the product ships at least seven trades, got ${shopBusinessTemplates.length}`)

let widestCatalog = 0
let anyUnsorted = false

for (const template of shopBusinessTemplates) {
  const trade = template.id

  // Installed the way onboarding installs it: the trade catalog ON TOP of the demo seed, which
  // is why a real device carries more items than the template alone.
  const installed = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
    sampleId: template.id,
    sampleName: template.name.en,
    items: shopBusinessTemplateCommerceItems(template.id),
    capturedAt: at(8),
  })
  check(Boolean(installed), `${trade}: its catalog installs onto the seed`)
  widestCatalog = Math.max(widestCatalog, installed.items.length)

  const skus = installed.items.map((item) => item.sku)
  if (skus.some((sku, index) => sku !== [...skus].sort()[index])) anyUnsorted = true

  let state = null
  try {
    state = validateCommerceState(installed)
  } catch (error) {
    check(false, `${trade}: the installed workspace validates -- ${error instanceof Error ? error.message : error}`)
  }
  check(Boolean(state), `${trade}: the installed workspace validates`)

  const item = state.items.find((candidate) => candidate.onHand > QUANTITY + 1)
  check(Boolean(item), `${trade}: it stocks something sellable`)

  const orderId = `ORD-TRADE-${trade.toUpperCase()}`
  const orderOf = (value) => value.orders.find((candidate) => candidate.id === orderId)

  let next = reserveCommerceOrder(state, {
    id: orderId, createdAt: at(9), customer: 'Ma Thida', owner: OPERATOR, channel: 'Counter',
    item: item.name, itemSku: item.sku, quantity: QUANTITY, payment: 'KBZPay',
    paymentStatus: 'pending', refundStatus: 'none', fulfilment: 'pickup',
    fulfilmentReference: `Counter handoff ${trade}`, promisedAt: at(18),
    total: item.price * QUANTITY, status: 'confirmed',
    lines: [{ sku: item.sku, name: item.name, variant: item.variant, quantity: QUANTITY, unitPriceMmk: item.price }],
  }, proof(`${trade}-RESERVE`, 9))
  check(next !== null, `${trade}: a counter sale reserves`)
  check(
    next.items.find((candidate) => candidate.sku === item.sku).onHand === item.onHand - QUANTITY,
    `${trade}: stock falls by the quantity sold`,
  )

  next = advanceCommerceOrder(next, orderId, 'confirmed', proof(`${trade}-PREP`, 10))
  next = advanceCommerceOrder(next, orderId, 'preparing', proof(`${trade}-READY`, 11))
  next = reconcileCommercePayment(next, orderId, proof(`${trade}-RECONCILE`, 12))
  next = advanceCommerceOrder(next, orderId, 'ready', proof(`${trade}-COMPLETE`, 13))
  check(next !== null, `${trade}: the sale completes and reconciles`)

  const completed = orderOf(next)
  check(
    completed.total === item.price * QUANTITY && completed.total === completed.calculation.totalMmk,
    `${trade}: the stored total is the catalog price (${item.price} x ${QUANTITY}) and matches its calculation`,
  )

  const expectation = commerceCloseExpectation(next, at(14))
  check(Boolean(expectation), `${trade}: a close expectation computes`)
  check(
    expectation.orderIds.includes(orderId),
    `${trade}: the new sale is eligible for today's close`,
  )

  const closeId = 'CLOSE-1A2B3C4D-5E6F-4A7B-8C9D-0E1F2A3B4C5D'
  const closed = saveCommerceClose(next, closeId, {
    actionId: 'ACT-9F8E7D6C-5B4A-4938-8271-605F4E3D2C1B',
    capturedAt: at(14),
    actor: OPERATOR,
    reason: 'End of trading day',
    evidenceReference: `TRADE-CLOSE-${trade}`,
  }, expectation)
  check(Boolean(closed), `${trade}: the day closes`)

  const exported = commerceDailyCloseExport(closed, closeId)
  check(Boolean(exported), `${trade}: the close exports an accounting artifact`)
  check(
    exported.totalMmk === expectation.total,
    `${trade}: the artifact total matches the reviewed expectation (${expectation.total})`,
  )

  const handoff = commerceAccountingHandoff(closed, closeId)
  check(Boolean(handoff), `${trade}: the accounting handoff is produced`)
  const debits = handoff.entries.filter((entry) => entry.side === 'debit')
  const credits = handoff.entries.filter((entry) => entry.side === 'credit')
  const sum = (entries) => entries.reduce((running, entry) => running + entry.amountMmk, 0)
  check(
    sum(debits) === sum(credits),
    `${trade}: THE BOOKS BALANCE -- debits ${sum(debits)} equal credits ${sum(credits)}`,
  )
  check(
    sum(credits) === expectation.total,
    `${trade}: and the credit side equals the day's takings`,
  )
}

// These two guard the guard: if the installed catalogs ever became small or alphabetical, this
// file would still pass while proving nothing about real shops -- which is precisely how the
// seed-based fixtures missed the defects that motivated it.
check(widestCatalog > 8, `the catalogs exercised here are bigger than the old 8-item bound, widest is ${widestCatalog}`)
check(anyUnsorted, 'and at least one is NOT alphabetical, so canonical-order defects are reachable here')

console.log(`every-trade money journey contract: ${checks} checks passed`)
