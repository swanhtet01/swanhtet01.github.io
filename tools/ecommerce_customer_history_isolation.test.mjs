import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(
  new URL('../showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx', import.meta.url),
  'utf8',
)
const start = source.indexOf('  const customerOrderTimeline =')
const end = source.indexOf('  const returnDraftEntry =', start)
assert.ok(start >= 0 && end > start)
const projection = source.slice(start, end)

function entry({
  id,
  name,
  phone,
  reference = '',
  schema = 'supermega.ecommerce.order_request.v2',
  stage = 'completed',
}) {
  return {
    request: {
      id,
      schema,
      customerReference: reference,
      customerProfile: schema === 'supermega.ecommerce.order_request.v2' ? { name, phone } : null,
    },
    stage,
    order: stage === 'completed'
      ? { id: `order-${id}`, status: 'completed', completion: { completedAt: '2026-10-24T00:00:00Z' } }
      : { id: `order-${id}`, status: 'confirmed' },
  }
}

function project({ name = 'Alice', phone = '09123456', entries }) {
  return runInNewContext(
    `${projection}\n;({ customerOrderTimeline, completedCustomerOrders, activeCustomerOrders })`,
    {
      customerName: name,
      customerPhone: phone,
      trackedCustomerReference: `${name} · ${phone}`,
      combinedOrderTimeline: entries,
      replacementRequestIds: new Set(),
    },
  )
}

test('v2 customer history requires the exact name and phone pair', () => {
  const exact = entry({ id: 'exact', name: 'Alice', phone: '09123456' })
  const sharedPhone = entry({ id: 'shared-phone', name: 'Bob', phone: '09123456' })
  const sharedName = entry({ id: 'shared-name', name: 'Alice', phone: '09999999' })
  const activeExact = entry({ id: 'active-exact', name: 'Alice', phone: '09123456', stage: 'confirmed' })
  const result = project({ entries: [exact, sharedPhone, sharedName, activeExact] })

  assert.deepEqual(result.customerOrderTimeline.map(item => item.request.id), ['exact', 'active-exact'])
  assert.deepEqual(result.completedCustomerOrders.map(item => item.request.id), ['exact'])
  assert.deepEqual(result.activeCustomerOrders.map(item => item.request.id), ['active-exact'])
})

test('legacy history still requires the exact combined customer reference', () => {
  const exact = entry({ id: 'legacy-exact', schema: 'supermega.ecommerce.order_request.v1', reference: 'Alice · 09123456' })
  const wrongName = entry({ id: 'legacy-wrong-name', schema: 'supermega.ecommerce.order_request.v1', reference: 'Bob · 09123456' })
  const wrongPhone = entry({ id: 'legacy-wrong-phone', schema: 'supermega.ecommerce.order_request.v1', reference: 'Alice · 09999999' })
  const result = project({ entries: [exact, wrongName, wrongPhone] })

  assert.deepEqual(result.customerOrderTimeline.map(item => item.request.id), ['legacy-exact'])
  assert.deepEqual(result.completedCustomerOrders.map(item => item.request.id), ['legacy-exact'])
})

test('excluded contact orders cannot enter active or completed help collections', () => {
  const otherCustomer = entry({ id: 'other-customer', name: 'Bob', phone: '09123456' })
  const result = project({ entries: [otherCustomer] })

  assert.equal(result.customerOrderTimeline.length, 0)
  assert.equal(result.completedCustomerOrders.length, 0)
  assert.equal(result.activeCustomerOrders.length, 0)
})
