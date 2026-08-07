import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const modulePath = resolve(root, 'showroom', 'src', 'products', 'shop', 'business-templates.ts')
const moduleHref = pathToFileURL(modulePath).href
const model = await import(moduleHref)

const expectedTemplateIds = ['mini-mart', 'pharmacy', 'phone-electronics', 'fashion', 'hardware', 'tea-coffee', 'auto-parts']

test('registry carries exactly the 7 supported Myanmar business types', () => {
  assert.deepEqual(model.shopBusinessTemplates.map((template) => template.id), expectedTemplateIds)
  assert.equal(new Set(model.shopBusinessTemplates.map((template) => template.id)).size, 7)
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
    for (const item of template.catalog) {
      const stored = installed.items.find((candidate) => candidate.sku === item.sku)
      assert.ok(stored, `${template.id} missing ${item.sku}`)
      assert.equal(stored.onHand, item.openingStock)
      assert.equal(stored.reorderAt, item.reorderAt)
      assert.equal(stored.price, item.priceMmk)
    }
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
