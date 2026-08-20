import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const modulePath = resolve(root, 'showroom', 'src', 'products', 'shop', 'business-templates.ts')
const moduleHref = pathToFileURL(modulePath).href
const model = await import(moduleHref)

const expectedTemplateIds = ['mini-mart', 'pharmacy', 'phone-electronics', 'fashion', 'hardware', 'tea-coffee', 'auto-parts', 'restaurant', 'beauty-spa', 'bakery']

test('registry carries exactly the 10 supported Myanmar business types', () => {
  assert.deepEqual(model.shopBusinessTemplates.map((template) => template.id), expectedTemplateIds)
  assert.equal(new Set(model.shopBusinessTemplates.map((template) => template.id)).size, 10)
  assert.doesNotThrow(() => model.validateShopBusinessTemplates())
  for (const template of model.shopBusinessTemplates) {
    assert.ok(template.name.en.trim().length > 0, `${template.id} needs an English name`)
    assert.ok(template.name.my.trim().length > 0, `${template.id} needs a Myanmar name`)
    assert.ok(['retail', 'cafe', 'restaurant', 'spa', 'gym', 'school'].includes(template.industryPackId))
    assert.ok(['retail-wholesale', 'restaurant-ordering', 'social-commerce'].includes(template.workflowTemplateId))
  }
})

test('every catalog is realistic: 12-20 items, unique SKUs, whole positive MMK, cost below price', () => {
  for (const template of model.shopBusinessTemplates) {
    assert.ok(template.catalog.length >= 12 && template.catalog.length <= 20, `${template.id} catalog size ${template.catalog.length}`)
    const skus = new Set(template.catalog.map((item) => item.sku))
    assert.equal(skus.size, template.catalog.length, `${template.id} repeats a SKU`)
    for (const item of template.catalog) {
      assert.match(item.sku, /^[A-Z0-9][A-Z0-9._/-]{0,79}$/, `${template.id} ${item.sku}`)
      assert.ok(Number.isSafeInteger(item.costMmk) && item.costMmk >= 1, `${item.sku} cost`)
      assert.ok(Number.isSafeInteger(item.priceMmk) && item.priceMmk >= 1, `${item.sku} price`)
      assert.ok(item.costMmk < item.priceMmk, `${item.sku} must price above cost`)
      assert.ok(Number.isSafeInteger(item.openingStock) && item.openingStock >= 0, `${item.sku} opening stock`)
      assert.ok(Number.isSafeInteger(item.reorderAt) && item.reorderAt >= 0, `${item.sku} reorder level`)
    }
  }
})

test('units come from the app commerce unit set', async () => {
  const commerceSource = await readFile(resolve(root, 'showroom', 'src', 'core', 'commerce-workspace.ts'), 'utf8')
  const unionMatch = commerceSource.match(/export type CommerceProductionMaterialUnit = ([^\n]+)/)
  assert.ok(unionMatch, 'commerce unit union missing')
  const appUnits = new Set([...unionMatch[1].matchAll(/'([a-z]+)'/g)].map((match) => match[1]))
  assert.deepEqual(new Set(model.shopBusinessTemplateUnits), appUnits, 'registry unit list drifted from the app unit set')
  for (const template of model.shopBusinessTemplates) {
    for (const item of template.catalog) {
      assert.ok(appUnits.has(item.unit), `${template.id} ${item.sku} unit ${item.unit} is not an app unit`)
    }
  }
})

test('each template stages one low-stock situation, 2-3 counter sales, and one pending order', () => {
  for (const template of model.shopBusinessTemplates) {
    const lowStock = model.shopBusinessTemplateLowStockItems(template.id)
    assert.equal(lowStock.length, 1, `${template.id} low-stock situations: ${lowStock.length}`)
    assert.ok(template.counterSales.length >= 2 && template.counterSales.length <= 3, `${template.id} sales`)
    const skus = new Set(template.catalog.map((item) => item.sku))
    for (const sale of template.counterSales) {
      assert.ok(['Cash', 'KBZPay', 'WavePay'].includes(sale.payment), `${sale.id} payment`)
      assert.equal(new Date(Date.parse(sale.recordedAt)).toISOString(), sale.recordedAt, `${sale.id} timestamp`)
      for (const line of sale.lines) {
        assert.ok(skus.has(line.sku), `${sale.id} unknown SKU ${line.sku}`)
        assert.ok(Number.isSafeInteger(line.quantity) && line.quantity >= 1, `${sale.id} quantity`)
      }
      assert.ok(model.shopBusinessTemplateSaleTotalMmk(template.id, sale) >= 1, `${sale.id} total`)
    }
    const order = template.pendingOrder
    assert.equal(order.status, 'pending')
    assert.ok(order.customerName.trim() && order.contact.trim() && order.note.trim(), `${order.id} details`)
    assert.equal(new Date(Date.parse(order.requestedAt)).toISOString(), order.requestedAt)
    assert.equal(new Date(Date.parse(order.promisedFor)).toISOString(), order.promisedFor)
    assert.ok(Date.parse(order.promisedFor) > Date.parse(order.requestedAt), `${order.id} promise ordering`)
    for (const line of order.lines) {
      assert.ok(skus.has(line.sku), `${order.id} unknown SKU ${line.sku}`)
      assert.ok(Number.isSafeInteger(line.quantity) && line.quantity >= 1, `${order.id} quantity`)
    }
  }
})

test('registry output is deterministic', async () => {
  const source = await readFile(modulePath, 'utf8')
  for (const banned of ['Date.now', 'Math.random', 'new Date()', 'crypto.randomUUID', 'performance.now']) {
    assert.ok(!source.includes(banned), `module must not use ${banned}`)
  }
  const reimported = await import(`${moduleHref}?determinism=${Date.now()}`)
  assert.equal(JSON.stringify(reimported.shopBusinessTemplates), JSON.stringify(model.shopBusinessTemplates))
  for (const template of model.shopBusinessTemplates) {
    assert.equal(model.shopBusinessTemplateCatalogCsv(template.id), reimported.shopBusinessTemplateCatalogCsv(template.id))
    assert.equal(JSON.stringify(model.shopBusinessTemplateCommerceItems(template.id)), JSON.stringify(reimported.shopBusinessTemplateCommerceItems(template.id)))
  }
})

test('catalog CSV passes the accountable Shop import checks', async () => {
  const onboarding = await import(pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'client-onboarding.ts')).href)
  for (const template of model.shopBusinessTemplates) {
    const preview = await onboarding.createClientImportPreview(
      model.shopBusinessTemplateCatalogCsv(template.id),
      'commerce',
      undefined,
      `sample-${template.id}.csv`,
      template.workflowTemplateId,
    )
    assert.ok(preview.readyForStaging, `${template.id} CSV not ready for staging`)
    assert.equal(preview.totals.rows, template.catalog.length, `${template.id} row count`)
    assert.ok(preview.rows.every((row) => row.status === 'ready'), `${template.id} has non-ready rows`)
  }
})

test('catalog installs into a fresh commerce workspace as a working sample', async () => {
  const commerce = await import(pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'commerce-workspace.ts')).href)
  for (const template of model.shopBusinessTemplates) {
    const seed = commerce.createSeedCommerce()
    const installed = commerce.installCommerceWorkingSampleCatalog(seed, {
      sampleId: template.id,
      sampleName: template.name.en,
      items: model.shopBusinessTemplateCommerceItems(template.id),
      capturedAt: '2026-08-03T09:00:00.000Z',
    })
    assert.ok(installed, `${template.id} did not install`)
    assert.equal(commerce.commerceWorkingSampleCatalogId(installed), template.id)
    assert.equal(installed.items.length, template.catalog.length, `${template.id} must not retain generic seed products`)
    assert.ok(!installed.items.some((item) => item.sku.startsWith('SM-')), `${template.id} retained a generic seed SKU`)
    assert.ok(!installed.orders.some((order) => /^ORD-10(?:39|41|42)$/.test(order.id)), `${template.id} retained generic seed orders`)
    assert.equal(installed.purchaseOrders.length, 0, `${template.id} retained the generic procurement example`)
    for (const item of template.catalog) {
      const stored = installed.items.find((candidate) => candidate.sku === item.sku)
      assert.ok(stored, `${template.id} missing ${item.sku}`)
      assert.equal(stored.onHand, item.openingStock)
      assert.equal(stored.reorderAt, item.reorderAt)
      assert.equal(stored.price, item.priceMmk)
    }
  }
})

test('working sample activity installs counterSales and pendingOrder for every business template', async () => {
  const commerce = await import(pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'commerce-workspace.ts')).href)
  for (const template of model.shopBusinessTemplates) {
    const withCatalog = commerce.installCommerceWorkingSampleCatalog(commerce.createSeedCommerce(), {
      sampleId: template.id,
      sampleName: template.name.en,
      items: model.shopBusinessTemplateCommerceItems(template.id),
      capturedAt: '2026-08-03T09:00:00.000Z',
    })
    assert.ok(withCatalog, `${template.id} catalog must install before activity`)

    const withActivity = commerce.installCommerceWorkingSampleActivity(withCatalog, {
      sampleId: template.id,
      sampleName: template.name.en,
      counterSales: template.counterSales,
      pendingOrder: template.pendingOrder,
    })
    assert.ok(withActivity !== null, `${template.id} activity install must succeed`)

    const sampleOrders = withActivity.orders.filter((o) => o.id.startsWith('SETUP-SAMPLE-'))
    assert.equal(sampleOrders.length, template.counterSales.length + 1, `${template.id} must have ${template.counterSales.length + 1} sample orders`)
    assert.equal(
      sampleOrders.filter((o) => o.status === 'completed').length,
      template.counterSales.length,
      `${template.id} counter sales must all be completed`,
    )
    assert.ok(sampleOrders.some((o) => o.status === 'confirmed'), `${template.id} must have a confirmed pending order`)

    // Idempotent replay: calling again with the same data returns non-null.
    assert.ok(
      commerce.installCommerceWorkingSampleActivity(withActivity, {
        sampleId: template.id,
        sampleName: template.name.en,
        counterSales: template.counterSales,
        pendingOrder: template.pendingOrder,
      }) !== null,
      `${template.id} idempotent activity replay must return current state`,
    )
  }
})

test('deep links select templates and unknown values fall back safely', () => {
  assert.equal(model.shopBusinessTemplateFromQuery('pharmacy'), 'pharmacy')
  assert.equal(model.shopBusinessTemplateFromQuery(' PHARMACY '), 'pharmacy')
  assert.equal(model.shopBusinessTemplateFromQuery('tea-coffee'), 'tea-coffee')
  assert.equal(model.shopBusinessTemplateFromQuery('unknown-type'), null)
  assert.equal(model.shopBusinessTemplateFromQuery(''), null)
  assert.equal(model.shopBusinessTemplateFromQuery(null), null)
  assert.equal(model.shopBusinessTemplateSetupPath('pharmacy'), '/settings/?product=shop&template=pharmacy')
  assert.throws(() => model.shopBusinessTemplate('unknown'))
})

// ---------------------------------------------------------------------------
// Day-one invariant: what a template installs must be ACTIONABLE, not just present.
//
// The tests above prove the sample activity installs. These prove the owner can actually
// clear it. A new owner's first screen is the order queue their chosen template installed;
// every order there that the app offers a payment action on must accept that action when
// pressed, using a proof stamped from the clock in front of them -- the only kind a real
// till produces. A sample order that renders a primary "Reconcile payment" button and then
// refuses is worse than no sample at all: commerceOrderNeedsAction keeps it in the queue
// forever, and cancelCommerceOrder will not release a completed order either.
//
// Asserted against all ten templates at once, so a template added later cannot reintroduce
// the defect by copying the wrong order shape.
// ---------------------------------------------------------------------------

const commerceModel = await import(pathToFileURL(resolve(root, 'showroom', 'src', 'core', 'commerce-workspace.ts')).href)

const SAMPLE_ORDER_PREFIX = 'SETUP-SAMPLE-'
// A provisioning instant well clear of the authored template timestamps, so the rebase does
// real work rather than accidentally reproducing the authored values.
const SAMPLE_PROVISIONED_AT = '2027-03-04T11:00:00.000Z'

function installTemplateActivity(template, provisionedAt = SAMPLE_PROVISIONED_AT) {
  const withCatalog = commerceModel.installCommerceWorkingSampleCatalog(commerceModel.createSeedCommerce(), {
    sampleId: template.id,
    sampleName: template.name.en,
    items: model.shopBusinessTemplateCommerceItems(template.id),
    capturedAt: provisionedAt,
  })
  assert.ok(withCatalog, `${template.id} catalog must install`)
  const activity = model.rebaseWorkingSampleActivity(template, provisionedAt)
  const withActivity = commerceModel.installCommerceWorkingSampleActivity(withCatalog, {
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
  const atTheTill = new Date(Date.parse(SAMPLE_PROVISIONED_AT) + 40 * 60 * 1000).toISOString()
  for (const template of model.shopBusinessTemplates) {
    const state = installTemplateActivity(template)
    const sampleOrders = state.orders.filter((order) => order.id.startsWith(SAMPLE_ORDER_PREFIX))
    assert.ok(sampleOrders.length, `${template.id} installed no sample orders`)
    for (const order of sampleOrders) {
      if (order.paymentStatus !== 'pending' || order.status === 'cancelled') continue
      const proof = presentClockProof(order, atTheTill)
      let result
      assert.doesNotThrow(
        () => { result = commerceModel.reconcileCommercePayment(state, order.id, proof) },
        `${template.id} ${order.id}: reconciling with a present-clock proof threw`,
      )
      assert.ok(result !== null, `${template.id} ${order.id}: reconciling with a present-clock proof refused`)
      assert.equal(result.orders.find((candidate) => candidate.id === order.id).paymentStatus, 'reconciled', `${template.id} ${order.id}`)
    }
  }
})

test('no sample order is left needing an action the app cannot complete', () => {
  const atTheTill = new Date(Date.parse(SAMPLE_PROVISIONED_AT) + 40 * 60 * 1000).toISOString()
  for (const template of model.shopBusinessTemplates) {
    const state = installTemplateActivity(template)
    for (const order of state.orders.filter((candidate) => candidate.id.startsWith(SAMPLE_ORDER_PREFIX))) {
      if (!commerceModel.commerceOrderNeedsAction(order)) continue
      // Whatever the queue asks the owner to do, at least one accountable transition must
      // accept it. A queued order that neither reconciles nor cancels is unclearable by any button.
      const reconciles = (() => {
        try { return commerceModel.reconcileCommercePayment(state, order.id, presentClockProof(order, atTheTill)) !== null }
        catch { return false }
      })()
      const cancels = (() => {
        try {
          return commerceModel.cancelCommerceOrder(state, order.id, {
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
  for (const template of model.shopBusinessTemplates) {
    const state = installTemplateActivity(template)
    const completed = state.orders.filter((order) => order.id.startsWith(SAMPLE_ORDER_PREFIX) && order.status === 'completed')
    assert.equal(completed.length, template.counterSales.length, `${template.id} completed sale count`)
    for (const order of completed) {
      assert.equal(order.paymentStatus, 'reconciled', `${template.id} ${order.id}: a handed-over counter sale must be recorded as paid`)
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

// Exercised against the shape workspaces provisioned before this fix still carry: an order
// completed with payment left pending, whose completion instant is already in the past.
// reconcileCommercePayment used to hand that straight to validateCommerceState, which threw
// out of the transition and surfaced a raw validator string in the owner's confirm dialog.
test('reconciling a completed order with a later proof refuses safely instead of throwing', () => {
  const template = model.shopBusinessTemplate('beauty-spa')
  const state = installTemplateActivity(template)
  const legacy = JSON.parse(JSON.stringify(state))
  const target = legacy.orders.find((order) => order.id.endsWith('-SALE-1'))
  target.paymentStatus = 'pending'
  for (const field of [
    'paymentReconciledAt',
    'paymentReconciliationActionId',
    'paymentReconciledBy',
    'paymentReconciliationReason',
    'paymentEvidenceReference',
  ]) delete target[field]
  const stuck = commerceModel.validateCommerceState(legacy)

  const afterCompletion = new Date(Date.parse(target.completion.capturedAt) + 60 * 1000).toISOString()
  let result
  assert.doesNotThrow(
    () => { result = commerceModel.reconcileCommercePayment(stuck, target.id, presentClockProof(target, afterCompletion)) },
    'a proof stamped after completion must be refused, not thrown on',
  )
  assert.equal(result, null, 'a proof stamped after completion must refuse')

  // The guard is a chronology guard, not a blanket ban: a proof at or before the completion
  // instant is still a valid reconciliation and must be accepted.
  const accepted = commerceModel.reconcileCommercePayment(stuck, target.id, presentClockProof(target, target.completion.capturedAt))
  assert.ok(accepted !== null, 'a proof at the completion instant must still reconcile')
  assert.equal(accepted.orders.find((order) => order.id === target.id).paymentStatus, 'reconciled')
})

test('an order still open for payment reconciles with a present-clock proof', () => {
  // Guarding on completion must not touch the ordinary pay-later path, where there is no
  // completion proof yet and the till stamps now.
  const state = installTemplateActivity(model.shopBusinessTemplate('beauty-spa'))
  const pending = state.orders.find((order) => order.id.endsWith('-ORDER'))
  assert.equal(pending.paymentStatus, 'pending')
  assert.equal(pending.completion, undefined)
  const later = new Date(Date.parse(SAMPLE_PROVISIONED_AT) + 3 * 60 * 60 * 1000).toISOString()
  const result = commerceModel.reconcileCommercePayment(state, pending.id, presentClockProof(pending, later))
  assert.ok(result !== null, 'an uncompleted order must accept a present-clock payment proof')
  assert.equal(result.orders.find((order) => order.id === pending.id).paymentStatus, 'reconciled')
})
