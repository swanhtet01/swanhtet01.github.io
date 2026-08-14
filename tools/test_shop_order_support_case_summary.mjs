// Shop order support case summary: ordersWithSupportCases, totalCases, openCases, resolvedCases, byCategory.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderSupportCaseSummary } from './shop-order-support-case-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-support-case-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderSupportCaseSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function sc({ caseId = 'SC-1', category = 'other', status = 'open' } = {}) {
  return {
    caseId, sourceIntentId: 'INT-1', sourceRequestId: 'REQ-1',
    customerRequestedAt: '2026-01-01T00:00:00Z', category,
    customerDescription: 'test', status,
    opening: { actionId: 'ACT-1', capturedAt: '2026-01-01T00:00:00Z', actor: 'alice', reason: 'test', evidenceReference: 'ref-1' },
    externalMessageSent: false, refundStarted: false,
  }
}

function order({ supportCases = undefined, id = 'ORD-1' } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 1000, status: 'confirmed',
    ...(supportCases !== undefined ? { supportCases } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. No orders → all defaults
{
  const r = projectShopOrderSupportCaseSummary(state([]))
  check(r.ordersWithSupportCases === 0, 'empty: ordersWithSupportCases 0')
  check(r.totalCases === 0, 'empty: totalCases 0')
  check(r.openCases === 0, 'empty: openCases 0')
  check(r.resolvedCases === 0, 'empty: resolvedCases 0')
  check(r.byCategory.other === 0, 'empty: byCategory.other 0')
}

// 2. Orders without supportCases
{
  const r = projectShopOrderSupportCaseSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2' }),
  ]))
  check(r.ordersWithSupportCases === 0, 'no-cases: ordersWithSupportCases 0')
  check(r.totalCases === 0, 'no-cases: totalCases 0')
}

// 3. Single order with 1 open case
{
  const r = projectShopOrderSupportCaseSummary(state([
    order({ id: 'ORD-1', supportCases: [sc({ category: 'delivery_issue', status: 'open' })] }),
  ]))
  check(r.ordersWithSupportCases === 1, 'one-open: ordersWithSupportCases 1')
  check(r.totalCases === 1, 'one-open: totalCases 1')
  check(r.openCases === 1, 'one-open: openCases 1')
  check(r.resolvedCases === 0, 'one-open: resolvedCases 0')
  check(r.byCategory.delivery_issue === 1, 'one-open: byCategory.delivery_issue 1')
}

// 4. Resolved case
{
  const r = projectShopOrderSupportCaseSummary(state([
    order({ id: 'ORD-1', supportCases: [sc({ category: 'payment_question', status: 'resolved' })] }),
  ]))
  check(r.openCases === 0, 'resolved: openCases 0')
  check(r.resolvedCases === 1, 'resolved: resolvedCases 1')
  check(r.byCategory.payment_question === 1, 'resolved: byCategory.payment_question 1')
}

// 5. Multiple categories
{
  const r = projectShopOrderSupportCaseSummary(state([
    order({ id: 'ORD-1', supportCases: [
      sc({ caseId: 'SC-1', category: 'order_status', status: 'open' }),
      sc({ caseId: 'SC-2', category: 'item_issue', status: 'resolved' }),
    ]}),
  ]))
  check(r.totalCases === 2, 'multi-cat: totalCases 2')
  check(r.byCategory.order_status === 1, 'multi-cat: order_status 1')
  check(r.byCategory.item_issue === 1, 'multi-cat: item_issue 1')
  check(r.openCases === 1, 'multi-cat: openCases 1')
  check(r.resolvedCases === 1, 'multi-cat: resolvedCases 1')
}

// 6. Mixed orders: with and without support cases
{
  const r = projectShopOrderSupportCaseSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', supportCases: [sc({ category: 'other' })] }),
    order({ id: 'ORD-3' }),
  ]))
  check(r.ordersWithSupportCases === 1, 'mixed: ordersWithSupportCases 1')
  check(r.byCategory.other === 1, 'mixed: byCategory.other 1')
}

// 7. Two orders both with cases
{
  const r = projectShopOrderSupportCaseSummary(state([
    order({ id: 'ORD-1', supportCases: [sc({ caseId: 'SC-1', category: 'delivery_issue' })] }),
    order({ id: 'ORD-2', supportCases: [sc({ caseId: 'SC-2', category: 'delivery_issue', status: 'resolved' })] }),
  ]))
  check(r.ordersWithSupportCases === 2, '2orders: ordersWithSupportCases 2')
  check(r.totalCases === 2, '2orders: totalCases 2')
  check(r.byCategory.delivery_issue === 2, '2orders: delivery_issue 2')
}

console.log(JSON.stringify({ ok: true, checks }))
