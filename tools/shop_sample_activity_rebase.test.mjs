import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const moduleUrl = `${pathToFileURL(resolve(root, 'showroom', 'src', 'products', 'shop', 'business-templates.ts')).href}?shop-sample-activity-rebase-test`
const { rebaseWorkingSampleActivity, shopBusinessTemplates } = await import(moduleUrl)

const authored = {
  counterSales: [
    { id: 'sale-1', recordedAt: '2026-08-03T02:35:00.000Z', payment: 'Cash', lines: [{ sku: 'A', quantity: 1 }] },
    { id: 'sale-2', recordedAt: '2026-08-03T08:45:00.000Z', payment: 'KBZPay', lines: [{ sku: 'B', quantity: 2 }] },
  ],
  pendingOrder: {
    customerName: 'Daw Hla',
    requestedAt: '2026-08-03T05:00:00.000Z',
    promisedFor: '2026-08-05T03:30:00.000Z',
    lines: [{ sku: 'A', quantity: 3 }],
  },
}

test('the newest sale lands at provisioning time', () => {
  const provisionedAt = '2026-12-01T09:00:00.000Z'
  const rebased = rebaseWorkingSampleActivity(authored, provisionedAt)
  assert.equal(rebased.counterSales[1].recordedAt, provisionedAt)
})

test('every authored interval is preserved exactly', () => {
  const rebased = rebaseWorkingSampleActivity(authored, '2026-12-01T09:00:00.000Z')
  const gap = (left, right) => Date.parse(right) - Date.parse(left)
  assert.equal(
    gap(rebased.counterSales[0].recordedAt, rebased.counterSales[1].recordedAt),
    gap(authored.counterSales[0].recordedAt, authored.counterSales[1].recordedAt),
  )
  assert.equal(
    gap(rebased.pendingOrder.requestedAt, rebased.pendingOrder.promisedFor),
    gap(authored.pendingOrder.requestedAt, authored.pendingOrder.promisedFor),
  )
})

test('the promise lands ahead of provisioning rather than overdue', () => {
  const provisionedAt = '2026-12-01T09:00:00.000Z'
  const rebased = rebaseWorkingSampleActivity(authored, provisionedAt)
  assert.ok(Date.parse(rebased.pendingOrder.promisedFor) > Date.parse(provisionedAt))
})

test('no sale is recorded in the future', () => {
  const provisionedAt = '2026-12-01T09:00:00.000Z'
  const rebased = rebaseWorkingSampleActivity(authored, provisionedAt)
  for (const sale of rebased.counterSales) {
    assert.ok(Date.parse(sale.recordedAt) <= Date.parse(provisionedAt))
  }
})

test('fields other than the timestamps are carried through untouched', () => {
  const rebased = rebaseWorkingSampleActivity(authored, '2026-12-01T09:00:00.000Z')
  assert.equal(rebased.counterSales[0].payment, 'Cash')
  assert.deepEqual(rebased.counterSales[1].lines, authored.counterSales[1].lines)
  assert.equal(rebased.pendingOrder.customerName, 'Daw Hla')
})

test('the authored template is not mutated', () => {
  const before = JSON.stringify(authored)
  rebaseWorkingSampleActivity(authored, '2026-12-01T09:00:00.000Z')
  assert.equal(JSON.stringify(authored), before)
})

test('an unparseable provisioning instant returns the authored activity unchanged', () => {
  assert.equal(rebaseWorkingSampleActivity(authored, 'not-a-date'), authored)
})

test('every shipped template rebases to current activity', () => {
  const provisionedAt = '2027-03-04T11:00:00.000Z'
  for (const template of shopBusinessTemplates) {
    const rebased = rebaseWorkingSampleActivity(template, provisionedAt)
    const newest = Math.max(...rebased.counterSales.map((sale) => Date.parse(sale.recordedAt)))
    assert.equal(newest, Date.parse(provisionedAt), `${template.id} newest sale`)
    assert.ok(
      Date.parse(rebased.pendingOrder.promisedFor) > Date.parse(provisionedAt),
      `${template.id} promise is ahead of provisioning`,
    )
  }
})

// A request instant that survives the rebase into the FUTURE is refused by every accountable
// transition until the clock catches up -- the owner presses the primary button and nothing
// happens. Templates are authored by hand, so this is clamped rather than trusted; fashion
// shipped 20 minutes past its newest sale and silently refused for its first 20 minutes.
test('no shipped template dates its sample activity into the future', () => {
  const provisionedAt = '2027-03-04T11:00:00.000Z'
  const provisioned = Date.parse(provisionedAt)
  for (const template of shopBusinessTemplates) {
    const activity = rebaseWorkingSampleActivity(template, provisionedAt)
    for (const sale of activity.counterSales) {
      assert.ok(Date.parse(sale.recordedAt) <= provisioned, `${template.id} ${sale.id} is recorded in the future`)
    }
    assert.ok(
      Date.parse(activity.pendingOrder.requestedAt) <= provisioned,
      `${template.id} pending order is requested in the future, so its payment action refuses until the clock catches up`,
    )
  }
})
