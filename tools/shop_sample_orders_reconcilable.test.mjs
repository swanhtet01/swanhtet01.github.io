// Day-one invariant for the Shop trade templates.
//
// A new owner's first screen is the order queue their chosen template installed. Every order in
// that queue that the app offers a payment action on must actually accept that action when the
// owner presses it, using a proof stamped from the clock in front of them -- which is the only
// kind a real till produces. A sample order that renders a primary "Reconcile payment" button and
// then refuses is worse than no sample at all: commerceOrderNeedsAction keeps it in the queue
// forever and cancelCommerceOrder will not release a completed order either.
//
// This asserts the invariant against all ten templates at once, so a template added later cannot
// reintroduce the defect by copying the wrong order shape.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const load = (...segments) => import(pathToFileURL(resolve(root, ...segments)).href)

const templates = await load('showroom', 'src', 'products', 'shop', 'business-templates.ts')
const commerce = await load('showroom', 'src', 'core', 'commerce-workspace.ts')

const SAMPLE_ORDER_PREFIX = 'SETUP-SAMPLE-'

// A provisioning instant well clear of the authored template timestamps, so the rebase does real
// work rather than accidentally reproducing the authored values.
const PROVISIONED_AT = '2027-03-04T11:00:00.000Z'

function installTemplate(template, provisionedAt = PROVISIONED_AT) {
  const withCatalog = commerce.installCommerceWorkingSampleCatalog(commerce.createSeedCommerce(), {
    sampleId: template.id,
    sampleName: template.name.en,
    items: templates.shopBusinessTemplateCommerceItems(template.id),
    capturedAt: provisionedAt,
  })
  assert.ok(withCatalog, `${template.id} catalog must install`)
  const activity = templates.rebaseWorkingSampleActivity(template, provisionedAt)
  const withActivity = commerce.installCommerceWorkingSampleActivity(withCatalog, {
    sampleId: template.id,
    sampleName: template.name.en,
    counterSales: activity.counterSales,
    pendingOrder: activity.pendingOrder,
  })
  assert.ok(withActivity !== null, `${template.id} activity must install`)
  return withActivity
}

// The proof a real till produces: stamped now, not backdated to suit the stored record.
function presentClockProof(order, capturedAt) {
  return {
    actionId: `ACT-TILL-${order.id}`,
    capturedAt,
    actor: 'Counter operator',
    reason: 'Counted the cash drawer against this sale.',
    evidenceReference: `TILL-${order.id}`,
  }
}

test('every order a template installs is reconcilable with a present-clock proof', () => {
  // The owner opens the workspace after provisioning, not at the same instant.
  const atTheTill = new Date(Date.parse(PROVISIONED_AT) + 40 * 60 * 1000).toISOString()
  for (const template of templates.shopBusinessTemplates) {
    const state = installTemplate(template)
    const sampleOrders = state.orders.filter((order) => order.id.startsWith(SAMPLE_ORDER_PREFIX))
    assert.ok(sampleOrders.length, `${template.id} installed no sample orders`)
    for (const order of sampleOrders) {
      if (order.paymentStatus !== 'pending' || order.status === 'cancelled') continue
      const proof = presentClockProof(order, atTheTill)
      let result
      assert.doesNotThrow(
        () => { result = commerce.reconcileCommercePayment(state, order.id, proof) },
        `${template.id} ${order.id}: reconciling with a present-clock proof threw`,
      )
      assert.ok(
        result !== null,
        `${template.id} ${order.id}: reconciling with a present-clock proof refused`,
      )
      const reconciled = result.orders.find((candidate) => candidate.id === order.id)
      assert.equal(reconciled.paymentStatus, 'reconciled', `${template.id} ${order.id}`)
    }
  }
})

test('no sample order is left needing an action the app cannot complete', () => {
  const atTheTill = new Date(Date.parse(PROVISIONED_AT) + 40 * 60 * 1000).toISOString()
  for (const template of templates.shopBusinessTemplates) {
    const state = installTemplate(template)
    for (const order of state.orders.filter((candidate) => candidate.id.startsWith(SAMPLE_ORDER_PREFIX))) {
      if (!commerce.commerceOrderNeedsAction(order)) continue
      // Whatever the queue asks the owner to do, at least one accountable transition must accept
      // it. A queued order that neither reconciles nor cancels is unclearable by any button.
      const reconciles = (() => {
        try { return commerce.reconcileCommercePayment(state, order.id, presentClockProof(order, atTheTill)) !== null }
        catch { return false }
      })()
      const cancels = (() => {
        try {
          return commerce.cancelCommerceOrder(state, order.id, {
            ...presentClockProof(order, atTheTill),
            actionId: `ACT-CANCEL-${order.id}`,
            reason: 'Customer did not collect.',
          }) !== null
        } catch { return false }
      })()
      const advances = order.status !== 'completed' && order.status !== 'cancelled'
      assert.ok(
        reconciles || cancels || advances,
        `${template.id} ${order.id} (${order.status}/${order.paymentStatus}) is stuck: it cannot be reconciled, cancelled, or advanced`,
      )
    }
  }
})

test('completed sample sales carry settled takings, so the first daily close is not empty', () => {
  for (const template of templates.shopBusinessTemplates) {
    const state = installTemplate(template)
    const completed = state.orders.filter((order) => order.id.startsWith(SAMPLE_ORDER_PREFIX) && order.status === 'completed')
    assert.equal(completed.length, template.counterSales.length, `${template.id} completed sale count`)
    for (const order of completed) {
      assert.equal(
        order.paymentStatus,
        'reconciled',
        `${template.id} ${order.id}: a handed-over counter sale must be recorded as paid`,
      )
      assert.ok(order.paymentReconciledAt, `${template.id} ${order.id} needs a reconciliation instant`)
      assert.ok(
        Date.parse(order.paymentReconciledAt) <= Date.parse(order.completion.capturedAt),
        `${template.id} ${order.id}: payment must be taken at or before the handover`,
      )
      assert.ok(
        Date.parse(order.createdAt) <= Date.parse(order.paymentReconciledAt),
        `${template.id} ${order.id}: payment cannot precede the sale`,
      )
    }
  }
})

test('no template dates its sample activity into the future', () => {
  for (const template of templates.shopBusinessTemplates) {
    const activity = templates.rebaseWorkingSampleActivity(template, PROVISIONED_AT)
    const provisioned = Date.parse(PROVISIONED_AT)
    for (const sale of activity.counterSales) {
      assert.ok(Date.parse(sale.recordedAt) <= provisioned, `${template.id} ${sale.id} is recorded in the future`)
    }
    assert.ok(
      Date.parse(activity.pendingOrder.requestedAt) <= provisioned,
      `${template.id} pending order is requested in the future, so its payment action refuses until the clock catches up`,
    )
  }
})
