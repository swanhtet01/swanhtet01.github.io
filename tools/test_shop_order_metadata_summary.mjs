// Shop order metadata summary: ordersWithOwner, uniqueOwners, ordersWithFulfilment, uniqueFulfilmentMethods, ordersLinkedToEcommerce.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopOrderMetadataSummary } from './shop-order-metadata-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-order-metadata-summary-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopOrderMetadataSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

function order({ id = 'ORD-1', owner = undefined, fulfilment = undefined, sourceRecordId = undefined } = {}) {
  return {
    id, createdAt: '2026-01-01T00:00:00Z', customer: 'cust-1', channel: 'counter',
    item: 'item-1', quantity: 1, payment: 'cash',
    paymentStatus: 'pending', refundStatus: 'none', total: 10000, status: 'confirmed',
    ...(owner !== undefined ? { owner } : {}),
    ...(fulfilment !== undefined ? { fulfilment } : {}),
    ...(sourceRecordId !== undefined ? { sourceRecordId } : {}),
  }
}

function state(orders = []) {
  return { schema: SCHEMA, items: [], orders, movements: [], closes: [] }
}

// 1. Empty state → all zero
{
  const r = projectShopOrderMetadataSummary(state([]))
  check(r.ordersWithOwner === 0, 'empty: ordersWithOwner 0')
  check(r.uniqueOwners === 0, 'empty: uniqueOwners 0')
  check(r.ordersWithFulfilment === 0, 'empty: ordersWithFulfilment 0')
  check(r.uniqueFulfilmentMethods === 0, 'empty: uniqueFulfilmentMethods 0')
  check(r.ordersLinkedToEcommerce === 0, 'empty: ordersLinkedToEcommerce 0')
}

// 2. Orders with no metadata fields
{
  const r = projectShopOrderMetadataSummary(state([order({ id: 'ORD-1' }), order({ id: 'ORD-2' })]))
  check(r.ordersWithOwner === 0, 'no-meta: ordersWithOwner 0')
  check(r.ordersLinkedToEcommerce === 0, 'no-meta: ordersLinkedToEcommerce 0')
}

// 3. Single order with owner
{
  const r = projectShopOrderMetadataSummary(state([
    order({ id: 'ORD-1', owner: 'alice' }),
  ]))
  check(r.ordersWithOwner === 1, 'owner: ordersWithOwner 1')
  check(r.uniqueOwners === 1, 'owner: uniqueOwners 1')
}

// 4. Two orders, same owner → dedup
{
  const r = projectShopOrderMetadataSummary(state([
    order({ id: 'ORD-1', owner: 'alice' }),
    order({ id: 'ORD-2', owner: 'alice' }),
  ]))
  check(r.uniqueOwners === 1, 'same-owner: uniqueOwners 1 (dedup)')
}

// 5. Two orders, different owners
{
  const r = projectShopOrderMetadataSummary(state([
    order({ id: 'ORD-1', owner: 'alice' }),
    order({ id: 'ORD-2', owner: 'bob' }),
  ]))
  check(r.ordersWithOwner === 2, 'diff-owners: ordersWithOwner 2')
  check(r.uniqueOwners === 2, 'diff-owners: uniqueOwners 2')
}

// 6. Single order with fulfilment
{
  const r = projectShopOrderMetadataSummary(state([
    order({ id: 'ORD-1', fulfilment: 'store-pickup' }),
  ]))
  check(r.ordersWithFulfilment === 1, 'fulfilment: ordersWithFulfilment 1')
  check(r.uniqueFulfilmentMethods === 1, 'fulfilment: uniqueFulfilmentMethods 1')
}

// 7. Two orders, different fulfilment methods
{
  const r = projectShopOrderMetadataSummary(state([
    order({ id: 'ORD-1', fulfilment: 'store-pickup' }),
    order({ id: 'ORD-2', fulfilment: 'home-delivery' }),
  ]))
  check(r.ordersWithFulfilment === 2, 'diff-ful: ordersWithFulfilment 2')
  check(r.uniqueFulfilmentMethods === 2, 'diff-ful: uniqueFulfilmentMethods 2')
}

// 8. Single order with sourceRecordId
{
  const r = projectShopOrderMetadataSummary(state([
    order({ id: 'ORD-1', sourceRecordId: 'ECO-001' }),
  ]))
  check(r.ordersLinkedToEcommerce === 1, 'ecom-link: ordersLinkedToEcommerce 1')
}

// 9. Full order: owner + fulfilment + sourceRecordId
{
  const r = projectShopOrderMetadataSummary(state([
    order({ id: 'ORD-1', owner: 'carol', fulfilment: 'express', sourceRecordId: 'ECO-999' }),
  ]))
  check(r.ordersWithOwner === 1, 'full: ordersWithOwner 1')
  check(r.ordersWithFulfilment === 1, 'full: ordersWithFulfilment 1')
  check(r.ordersLinkedToEcommerce === 1, 'full: ordersLinkedToEcommerce 1')
}

// 10. Mixed (one with owner, one without)
{
  const r = projectShopOrderMetadataSummary(state([
    order({ id: 'ORD-1' }),
    order({ id: 'ORD-2', owner: 'alice', sourceRecordId: 'ECO-001' }),
  ]))
  check(r.ordersWithOwner === 1, 'mixed: ordersWithOwner 1')
  check(r.ordersLinkedToEcommerce === 1, 'mixed: ordersLinkedToEcommerce 1')
}

console.log(JSON.stringify({ ok: true, checks }))
