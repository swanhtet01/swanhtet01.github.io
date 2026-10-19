import test from 'node:test'
import assert from 'node:assert/strict'
import { addShopVariantColumnToClientImportPreview, createShopCatalogImportPreview, shopCatalogImportErrorsCsv } from '../showroom/src/core/shop-catalog-import.ts'
import { buildClientImportStagingPackage, createClientImportPreview } from '../showroom/src/core/client-onboarding.ts'
import { assertManagedShopImportState } from '../showroom/src/core/managed-trial.ts'
import { reviewCatalogMappingProposal } from '../showroom/src/core/catalog-mapping-proposal.ts'

const csv = 'sku,name,stock,reorder_at,amount\nSYN-1,Synthetic item,5,1,1200'
test('company Shop onboarding stages and verifies a detected variant', async () => {
  const source = [
    'sku,item_name,category,opening_stock,reorder_at,price_mmk,color',
    'QA-TEA-001,Myanmar milk tea,Beverages,5,2,2500,Black',
    'QA-TEA-002,Mohinga,Meals,4,1,1800,',
  ].join('\n')
  const base = await createClientImportPreview(source, 'commerce', undefined, 'synthetic-shop.csv', 'retail-wholesale')
  const detected = await addShopVariantColumnToClientImportPreview(base)
  assert.equal(detected.variantHeader, 'color')
  const staging = buildClientImportStagingPackage(detected.preview, {
    workflowTemplateId: 'retail-wholesale',
    workspace: 'Synthetic QA Cafe',
    owner: 'Synthetic QA Owner',
  })
  assert.equal(staging.mapping.variant, 'color')
  assert.equal(staging.rows[0].values.variant, 'Black')
  assert.equal(staging.rows[1].values.variant, '')
  assert.equal(staging.rows[0].values.category, 'Beverages')
  assert.equal(staging.rows[1].values.category, 'Meals')
  const savedState = {
    schema: 'supermega.commerce.workspace.v2',
    items: [
      { sku: 'QA-TEA-001', name: 'Myanmar milk tea', category: 'Beverages', variant: 'Black', onHand: 5, reorderAt: 2, price: 2500 },
      { sku: 'QA-TEA-002', name: 'Mohinga', category: 'Meals', onHand: 4, reorderAt: 1, price: 1800 },
    ],
    orders: [],
    movements: [],
    closes: [],
  }
  assert.equal(assertManagedShopImportState(savedState, staging), savedState)
  const changedCategory = structuredClone(savedState)
  changedCategory.items[0].category = 'Other category'
  assert.throws(() => assertManagedShopImportState(changedCategory, staging), /does not match the checked rows/)
})
async function proposalFor(source = csv) {
  const base = await createShopCatalogImportPreview(source, [])
  const mapping = { ...base.mapping, barcode: '' }
  if (!mapping.price && base.headers.includes('amount')) mapping.price = 'amount'
  return { sourceDigest: base.sourceDigest, mapping }
}
test('mapping suggestion preserves exact values and grants no write authority', async () => {
  const result = await reviewCatalogMappingProposal(csv, [], await proposalFor())
  assert.equal(result.status, 'review_required')
  assert.equal(result.importAuthorized, false)
  assert.deepEqual(result.preview.rows[0].item, { sku: 'SYN-1', name: 'Synthetic item', onHand: 5, reorderAt: 1, price: 1200 })
})

test('AI mapping can propose an optional barcode column while preserving leading zeroes', async () => {
  const source = 'sku,item_name,opening_stock,reorder_at,price_mmk,code_value\nWATER-1,Drinking water,24,6,800,0000123456789'
  const base = await createShopCatalogImportPreview(source, [])
  assert.equal(base.mapping.barcode, '')
  const result = await reviewCatalogMappingProposal(source, [], {
    sourceDigest: base.sourceDigest,
    mapping: { ...base.mapping, barcode: 'code_value' },
  })
  assert.equal(result.status, 'review_required')
  assert.equal(result.importAuthorized, false)
  assert.equal(result.preview.mapping.barcode, 'code_value')
  assert.equal(result.preview.rows[0].item.barcode, '0000123456789')
})

test('barcode proposal remains optional and cannot reuse another source column', async () => {
  const source = 'sku,item_name,opening_stock,reorder_at,price_mmk\nWATER-1,Drinking water,24,6,800'
  const proposal = await proposalFor(source)
  const accepted = await reviewCatalogMappingProposal(source, [], proposal)
  assert.equal(accepted.status, 'review_required')
  assert.equal(accepted.preview.rows[0].item.barcode, undefined)
  assert.equal((await reviewCatalogMappingProposal(source, [], {
    ...proposal,
    mapping: { ...proposal.mapping, barcode: 'sku' },
  })).reason, 'reused_source_header')
})

test('older AI mapping proposals without the optional category remain reviewable', async () => {
  const proposal = await proposalFor()
  delete proposal.mapping.category
  const result = await reviewCatalogMappingProposal(csv, [], proposal)
  assert.equal(result.status, 'review_required')
  assert.equal(result.importAuthorized, false)
  assert.equal(result.preview.mapping.category, '')
  assert.equal(result.preview.rows[0].item.category, undefined)
})
test('stale source and added values are rejected', async () => {
  const p = await proposalFor()
  assert.equal((await reviewCatalogMappingProposal(csv.replace('1200', '1300'), [], p)).reason, 'source_changed')
  assert.equal((await reviewCatalogMappingProposal(csv, [], { ...p, values: { price: 1 } })).reason, 'unexpected_proposal_field')
})

test('existing stock count mismatches are explicit and remain blocked before import', async () => {
  const existing = [{ sku: 'SYN-1', name: 'Synthetic item', onHand: 3, reorderAt: 1, price: 1200 }]
  const proposal = await proposalFor()
  const preview = await createShopCatalogImportPreview(csv, existing, proposal.mapping)
  assert.equal(preview.rows[0].status, 'conflict')
  assert.equal(preview.totals.ready, 0)
  assert.equal(preview.totals.conflicts, 1)
  assert.deepEqual(preview.rows[0].issues.map(({ code, field }) => ({ code, field })), [
    { code: 'existing_stock_count_mismatch', field: 'onHand' },
  ])
  assert.match(preview.rows[0].issues[0].message, /currently has 3 on hand; this file says 5/)
  const repairCsv = shopCatalogImportErrorsCsv(preview)
  assert.match(repairCsv, /existing_stock_count_mismatch/)
  assert.match(repairCsv, /currently has 3 on hand; this file says 5/)
  assert.equal((await reviewCatalogMappingProposal(csv, existing, proposal)).reason, 'import_validation_failed')
})

test('catalog differences and stock count mismatches show independent review reasons', async () => {
  const existing = [{ sku: 'SYN-1', name: 'Older name', onHand: 3, reorderAt: 0, price: 900 }]
  const preview = await createShopCatalogImportPreview(csv, existing, (await proposalFor()).mapping)
  assert.equal(preview.rows[0].status, 'conflict')
  assert.deepEqual(preview.rows[0].issues.map(({ code, field }) => ({ code, field })), [
    { code: 'existing_stock_count_mismatch', field: 'onHand' },
    { code: 'existing_sku_conflict', field: 'sku' },
  ])
  assert.match(preview.rows[0].issues[1].message, /item name, reorder level, price/)
})

test('Shop review preserves an omitted variant and reports the exact stock discrepancy', async () => {
  const { commerceCatalogImportReview } = await import('../showroom/src/core/shop-catalog-import.ts')
  const existing = { sku: 'CAFE-1', name: 'မြန်မာ လက်ဖက်ရည်', variant: 'Large', onHand: 12, reorderAt: 3, price: 1800 }
  const review = commerceCatalogImportReview(existing, {
    sku: existing.sku,
    name: existing.name,
    onHand: 9,
    reorderAt: existing.reorderAt,
    price: existing.price,
  })
  assert.equal(review.conflict, true)
  assert.match(review.message, /Shop has 12 on hand; file says 9/)
  assert.doesNotMatch(review.message, /variant/)
  const changed = commerceCatalogImportReview(existing, {
    ...existing,
    name: 'Green tea',
    variant: 'Small',
    reorderAt: 5,
    price: 2100,
  })
  assert.equal(changed.conflict, true)
  assert.match(changed.message, /name \(Shop: "မြန်မာ လက်ဖက်ရည်"; file: "Green tea"\)/)
  assert.match(changed.message, /variant \(Shop: "Large"; file: "Small"\)/)
  assert.match(changed.message, /reorder level \(Shop: 3; file: 5\)/)
  assert.match(changed.message, /price \(Shop: 1800; file: 2100\)/)
  const unchanged = commerceCatalogImportReview(existing, { ...existing, variant: undefined })
  assert.equal(unchanged.conflict, false)
  assert.match(unchanged.message, /saved variant is preserved/)
  const blank = commerceCatalogImportReview(existing, { ...existing, variant: '' })
  assert.equal(blank.conflict, false)
  assert.match(blank.message, /saved variant is preserved/)
  const noVariant = { sku: 'CAFE-2', name: 'Green tea', onHand: 8, reorderAt: 2, price: 1500 }
  const blankWithoutSavedVariant = commerceCatalogImportReview(noVariant, { ...noVariant, variant: '' })
  assert.equal(blankWithoutSavedVariant.conflict, false)
  assert.match(blankWithoutSavedVariant.message, /Already current/)
})

test('Shop catalog preview detects variant and barcode changes and includes optional barcode setup', async () => {
  const [{ createShopCatalogImportPreview }, { createClientImportPreview }] = await Promise.all([
    import('../showroom/src/core/shop-catalog-import.ts'),
    import('../showroom/src/core/client-onboarding.ts'),
  ])
  const existing = { sku: 'CAFE-1', barcode: '0000123456789', name: 'မြန်မာ လက်ဖက်ရည်', variant: 'Large', onHand: 12, reorderAt: 3, price: 1800 }
  const source =
    'sku,item_name,variant,opening_stock,reorder_at,price_mmk\nCAFE-1,မြန်မာ လက်ဖက်ရည်,Small,12,3,1800'
  const preview = await createShopCatalogImportPreview(source, [existing])
  const genericPreview = await createClientImportPreview(source, 'commerce')
  assert.equal(genericPreview.fields.length, 7)
  assert.equal(preview.rows[0].item.variant, 'Small')
  assert.equal(preview.rows[0].status, 'conflict')
  assert.match(preview.rows[0].issues.map((issue) => issue.message).join(' '), /variant/)
  const changedBarcode = await createShopCatalogImportPreview(source, [{ ...existing, barcode: '0000987654321' }])
  assert.notEqual(changedBarcode.catalogDigest, preview.catalogDigest)
})

test('Shop catalog preview blocks barcodes and item codes already assigned to another product', async () => {
  const { createShopCatalogImportPreview } = await import('../showroom/src/core/shop-catalog-import.ts')
  const existing = { sku: 'EXISTING-1', barcode: '0000123456789', name: 'Existing tea', onHand: 12, reorderAt: 3, price: 1800 }
  const barcodeCollision = await createShopCatalogImportPreview(
    'sku,barcode,item_name,opening_stock,reorder_at,price_mmk\nNEW-1,0000123456789,New coffee,4,1,2500',
    [existing],
  )
  assert.equal(barcodeCollision.rows[0].status, 'conflict')
  assert.ok(barcodeCollision.rows[0].issues.some(issue => issue.code === 'catalog_scan_code_conflict' && issue.field === 'barcode'))

  const itemCodeCollision = await createShopCatalogImportPreview(
    'sku,item_name,opening_stock,reorder_at,price_mmk\n0000123456789,New coffee,4,1,2500',
    [existing],
  )
  assert.equal(itemCodeCollision.rows[0].status, 'conflict')
  assert.ok(itemCodeCollision.rows[0].issues.some(issue => issue.code === 'catalog_scan_code_conflict' && issue.field === 'sku'))
})

test('Shop onboarding maps barcode headers as text and blocks scan-code collisions', async () => {
  const barcode = '0000123456789'
  const preview = await createClientImportPreview(
    `sku,item_name,ean,opening_stock,reorder_at,price_mmk\nWATER-1,Drinking water,${barcode},24,6,800`,
    'commerce',
  )
  assert.equal(preview.mapping.barcode, 'ean')
  assert.equal(preview.rows[0].values.barcode, barcode)
  assert.equal(preview.fields.find((field) => field.id === 'barcode')?.required, false)
  const staging = buildClientImportStagingPackage(preview, {
    workflowTemplateId: preview.workflowTemplateId,
    workspace: 'Synthetic Myanmar shop',
    owner: 'Synthetic reviewer',
  })
  assert.equal(staging.mapping.barcode, 'ean')
  assert.equal(staging.rows[0].values.barcode, barcode)

  const duplicate = await createClientImportPreview(
    'sku,item_name,barcode,opening_stock,reorder_at,price_mmk\nWATER-1,Drinking water,0000123456789,24,6,800\nSOAP-1,Soap,0000123456789,8,2,1300',
    'commerce',
  )
  assert.equal(duplicate.readyForStaging, false)
  assert.equal(duplicate.rows.every((row) => row.status === 'invalid'), true)
  assert.equal(duplicate.rows.every((row) => row.issues.some((issue) => issue.field === 'barcode')), true)

  const skuCollision = await createClientImportPreview(
    'sku,item_name,barcode,opening_stock,reorder_at,price_mmk\nWATER-1,Drinking water,SOAP-1,24,6,800\nSOAP-1,Soap,,8,2,1300',
    'commerce',
  )
  assert.equal(skuCollision.readyForStaging, false)
  assert.equal(skuCollision.rows[0].issues.some((issue) => issue.field === 'barcode'), true)

  const sameCodeDifferentCase = await createClientImportPreview(
    'sku,item_name,barcode,opening_stock,reorder_at,price_mmk\nABC1,Tea,abc1,4,1,1000',
    'commerce',
  )
  assert.equal(sameCodeDifferentCase.readyForStaging, true)
  assert.equal(sameCodeDifferentCase.rows[0].status, 'ready')
})

test('standalone Shop catalog import preserves optional variants and blocks a changed existing variant', async () => {
  const existing = { sku: 'CAFE-1', name: 'Myanmar tea', variant: 'Large', onHand: 12, reorderAt: 3, price: 1800 }
  const source = 'sku,item_name,variant,opening_stock,reorder_at,price_mmk\nCAFE-1,Myanmar tea,Small,12,3,1800'
  const preview = await createShopCatalogImportPreview(source, [existing])
  assert.equal(preview.rows[0].status, 'conflict')
  assert.deepEqual(preview.rows[0].issues.map(({ code, field }) => ({ code, field })), [
    { code: 'existing_sku_conflict', field: 'sku' },
  ])
  assert.match(preview.rows[0].issues[0].message, /variant/)
  assert.equal((await reviewCatalogMappingProposal(source, [existing], {
    sourceDigest: preview.sourceDigest,
    mapping: preview.mapping,
  })).reason, 'import_validation_failed')
})

test('Shop variant columns must be unambiguous and safe', async () => {
  const { createShopCatalogImportPreview } = await import('../showroom/src/core/shop-catalog-import.ts')
  const ambiguous = 'sku,item_name,variant,size,opening_stock,reorder_at,price_mmk\nCAFE-1,Tea,Large,Small,12,3,1800'
  await assert.rejects(() => createShopCatalogImportPreview(ambiguous, []), /Choose one variant column.*variant, size/)
  const selected = await createShopCatalogImportPreview(ambiguous, [], undefined, 'catalog.csv', 'size')
  assert.equal(selected.variantHeader, 'size')
  assert.equal(selected.rows[0].item.variant, 'Small')
  const optedOut = await createShopCatalogImportPreview(ambiguous, [], undefined, 'catalog.csv', '')
  assert.equal(optedOut.variantHeader, '')
  assert.equal(optedOut.rows[0].item.variant, undefined)
  assert.equal(optedOut.rows[0].status, 'ready')
  const unsafe = await createShopCatalogImportPreview(
    'sku,item_name,size,opening_stock,reorder_at,price_mmk\nCAFE-1,Tea,=1+1,12,3,1800',
    [],
  )
  assert.equal(unsafe.rows[0].status, 'invalid')
  assert.equal(unsafe.rows[0].item, null)
  assert.equal(unsafe.rows[0].issues[0].field, 'variant')
})

test('model mapping review returns a human choice requirement for ambiguous variant columns', async () => {
  const source = 'sku,item_name,variant,size,opening_stock,reorder_at,price_mmk\nCAFE-1,Tea,Large,Small,12,3,1800'
  const selected = await createShopCatalogImportPreview(source, [], undefined, 'catalog.csv', 'size')
  const result = await reviewCatalogMappingProposal(source, [], {
    sourceDigest: selected.sourceDigest,
    mapping: selected.mapping,
  })
  assert.equal(result.reason, 'human_choice_required')
  assert.equal(result.importAuthorized, undefined)
})

test('Shop detects common English and Burmese color variant headers', async () => {
  const { createShopCatalogImportPreview } = await import('../showroom/src/core/shop-catalog-import.ts')
  const english = await createShopCatalogImportPreview(
    'sku,item_name,color,opening_stock,reorder_at,price_mmk\nCAFE-1,Tea,Red,12,3,1800',
    [],
  )
  const burmese = await createShopCatalogImportPreview(
    'sku,item_name,အရောင်,opening_stock,reorder_at,price_mmk\nCAFE-1,Tea,အနီ,12,3,1800',
    [],
  )
  assert.equal(english.rows[0].item.variant, 'Red')
  assert.equal(burmese.rows[0].item.variant, 'အနီ')
})

test('Shop preview retains detected option values for row-by-row review', async () => {
  const [{ createClientImportPreview }, { addShopVariantColumnToClientImportPreview }] = await Promise.all([
    import('../showroom/src/core/client-onboarding.ts'),
    import('../showroom/src/core/shop-catalog-import.ts'),
  ])
  const source = 'sku,item_name,option,opening_stock,reorder_at,price_mmk\nCAFE-1,Tea,Large,12,3,1800'
  const basePreview = await createClientImportPreview(source, 'commerce')
  const { preview, variantHeader } = await addShopVariantColumnToClientImportPreview(basePreview)
  assert.equal(variantHeader, 'option')
  assert.equal(preview.mapping.variant, 'option')
  assert.equal(preview.rows[0].values.variant, 'Large')
})

test('Shop variant mapping can be changed or excluded before staging', async () => {
  const [{ createClientImportPreview }, { addShopVariantColumnToClientImportPreview }] = await Promise.all([
    import('../showroom/src/core/client-onboarding.ts'),
    import('../showroom/src/core/shop-catalog-import.ts'),
  ])
  const source = 'sku,item_name,option,opening_stock,reorder_at,price_mmk\nCAFE-1,Tea,Large,12,3,1800'
  const base = await createClientImportPreview(source, 'commerce')
  const detected = await addShopVariantColumnToClientImportPreview(base)
  assert.equal(detected.variantHeader, 'option')
  assert.equal(detected.preview.rows[0].values.variant, 'Large')
  const omitted = await addShopVariantColumnToClientImportPreview(base, '')
  assert.equal(omitted.preview.mapping.variant, '')
  assert.equal(omitted.preview.rows[0].values.variant, '')
  assert.equal(omitted.preview.readyForStaging, true)
  const omittedStage = buildClientImportStagingPackage(omitted.preview, {
    workflowTemplateId: omitted.preview.workflowTemplateId,
    workspace: 'Synthetic QA Cafe',
    owner: 'Synthetic QA Owner',
  })
  assert.equal(omittedStage.mapping.variant, '')
  assert.equal(omittedStage.rows[0].values.variant, '')
  const duplicate = await addShopVariantColumnToClientImportPreview(base, 'item_name')
  assert.equal(duplicate.preview.readyForStaging, false)
  assert.equal(duplicate.preview.rows[0].status, 'invalid')

  const ambiguous = await createClientImportPreview(
    'sku,item_name,option,size,opening_stock,reorder_at,price_mmk\nCAFE-2,Tea,Standard,Large,12,3,1800',
    'commerce',
  )
  const unresolved = await addShopVariantColumnToClientImportPreview(ambiguous)
  assert.equal(unresolved.variantHeader, '')
  assert.equal(unresolved.variantChoiceRequired, true)
  assert.equal(unresolved.preview.readyForStaging, false)
  assert.equal(Object.prototype.hasOwnProperty.call(unresolved.preview.mapping, 'variant'), false)
  assert.equal(unresolved.preview.fileIssues[0].code, 'variant_choice_required')
  assert.match(unresolved.preview.fileIssues[0].message, /option, size/)
  const changedOtherColumn = await createClientImportPreview(
    'sku,item_name,option,size,opening_stock,reorder_at,price_mmk\nCAFE-2,Tea,Standard,Large,12,3,1800',
    'commerce',
    { ...ambiguous.mapping, name: 'item_name' },
  )
  const stillUnresolved = await addShopVariantColumnToClientImportPreview(changedOtherColumn)
  assert.equal(stillUnresolved.variantChoiceRequired, true)
  assert.equal(stillUnresolved.preview.readyForStaging, false)
  const selected = await addShopVariantColumnToClientImportPreview(ambiguous, 'size')
  assert.equal(selected.variantHeader, 'size')
  assert.equal(selected.variantChoiceRequired, false)
  assert.equal(selected.preview.rows[0].values.variant, 'Large')
  const selectedStage = buildClientImportStagingPackage(selected.preview, {
    workflowTemplateId: selected.preview.workflowTemplateId,
    workspace: 'Synthetic QA Cafe',
    owner: 'Synthetic QA Owner',
  })
  assert.equal(selectedStage.mapping.variant, 'size')
  assert.equal(selectedStage.rows[0].values.variant, 'Large')
  const explicitlyOmitted = await addShopVariantColumnToClientImportPreview(ambiguous, '')
  assert.equal(explicitlyOmitted.variantChoiceRequired, false)
  assert.equal(explicitlyOmitted.preview.mapping.variant, '')
  assert.equal(explicitlyOmitted.preview.readyForStaging, true)
})

test('local Shop replay preserves imported categories, variants and barcodes', async () => {
  const [{ createClientImportPreview, buildClientImportStagingPackage }, commerce, importer, shopImport] = await Promise.all([
    import('../showroom/src/core/client-onboarding.ts'),
    import('../showroom/src/core/commerce-workspace.ts'),
    import('../showroom/src/core/local-client-import.ts'),
    import('../showroom/src/core/shop-catalog-import.ts'),
  ])
  const sourceDigest = `sha256:${'a'.repeat(64)}`
  const existing = { sku: 'CAFE-1', name: 'မြန်မာ လက်ဖက်ရည်', variant: 'Large', barcode: '0000123456789', onHand: 12, reorderAt: 3, price: 1800 }
  const seed = commerce.importCommerceCatalog(commerce.createEmptyCommerce(), {
    items: [existing],
    sourceDigest,
    capturedAt: '2026-10-13T00:00:00.000Z',
    actor: 'Synthetic reviewer',
  })
  assert.ok(seed)

  const storageValues = new Map([[commerce.COMMERCE_KEY, JSON.stringify(seed.state)]])
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key) => storageValues.get(key) ?? null,
        setItem: (key, value) => storageValues.set(key, value),
        removeItem: (key) => storageValues.delete(key),
      },
    })
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { locks: { request: async (_name, _options, callback) => callback() } },
    })
    const preview = await createClientImportPreview(
      'sku,item_name,opening_stock,reorder_at,price_mmk\nCAFE-1,မြန်မာ လက်ဖက်ရည်,12,3,1800',
      'commerce',
    )
    assert.equal(preview.rows[0].values.name, 'မြန်မာ လက်ဖက်ရည်')
    const stagingPackage = buildClientImportStagingPackage(preview, {
      workflowTemplateId: preview.workflowTemplateId,
      workspace: 'Synthetic cafe',
      owner: 'Synthetic reviewer',
    })
    const result = await importer.activateLocalStagingPackage(stagingPackage)
    assert.equal(result.created, 0)
    assert.equal(result.alreadyPresent, 1)
    const savedItem = JSON.parse(storageValues.get(commerce.COMMERCE_KEY)).items[0]
    assert.equal(savedItem.name, 'မြန်မာ လက်ဖက်ရည်')
    assert.equal(savedItem.variant, 'Large')
    assert.equal(savedItem.barcode, '0000123456789')

    const rawVariantPreview = await createClientImportPreview(
      'sku,item_name,ean,size,category,opening_stock,reorder_at,price_mmk\nCAFE-2,လက်ဖက်စိမ်း,0000987654321,Small,အဖျော်ယမကာ,8,2,2200',
      'commerce',
    )
    const { preview: variantPreview, variantHeader } = await shopImport.addShopVariantColumnToClientImportPreview(rawVariantPreview)
    assert.equal(rawVariantPreview.fields.length, 7)
    assert.equal(variantHeader, 'size')
    assert.equal(rawVariantPreview.mapping.barcode, 'ean')
    assert.equal(rawVariantPreview.rows[0].values.barcode, '0000987654321')
    assert.equal(variantPreview.mapping.variant, 'size')
    assert.equal(variantPreview.rows[0].values.variant, 'Small')
    const variantPackage = buildClientImportStagingPackage(variantPreview, {
      workflowTemplateId: variantPreview.workflowTemplateId,
      workspace: 'Synthetic cafe',
      owner: 'Synthetic reviewer',
    })
    const variantResult = await importer.activateLocalStagingPackage(variantPackage)
    assert.equal(variantResult.created, 1)
    const savedVariant = JSON.parse(storageValues.get(commerce.COMMERCE_KEY)).items.find((item) => item.sku === 'CAFE-2')
    assert.equal(savedVariant.variant, 'Small')
    assert.equal(savedVariant.barcode, '0000987654321')
    assert.equal(savedVariant.category, 'အဖျော်ယမကာ')

    const beforeConflict = storageValues.get(commerce.COMMERCE_KEY)
    const conflictPreview = await createClientImportPreview(
      'sku,item_name,opening_stock,reorder_at,price_mmk\nCAFE-1,မြန်မာ လက်ဖက်ရည် အသစ်,12,3,1800',
      'commerce',
    )
    const conflictPackage = buildClientImportStagingPackage(conflictPreview, {
      workflowTemplateId: conflictPreview.workflowTemplateId,
      workspace: 'Synthetic cafe',
      owner: 'Synthetic reviewer',
    })
    await assert.rejects(() => importer.activateLocalStagingPackage(conflictPackage), /Nothing was written/)
    assert.equal(storageValues.get(commerce.COMMERCE_KEY), beforeConflict)
  } finally {
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
    else delete globalThis.localStorage
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else delete globalThis.navigator
  }
})
test('model cannot resolve competing quantity columns', async () => {
  const source = csv.replace('stock,reorder_at', 'stock,quantity,reorder_at').replace(',5,1,', ',5,50,1,')
  assert.equal((await reviewCatalogMappingProposal(source, [], await proposalFor(source))).reason, 'human_choice_required')
})
test('mapped foreign currency still fails deterministic validation', async () => {
  const source = csv.replace('amount', 'price_usd')
  const p = await proposalFor(source); p.mapping.price = 'price_usd'
  assert.equal((await reviewCatalogMappingProposal(source, [], p)).reason, 'import_validation_failed')
})

test('evaluation refuses incomplete or duplicated case coverage and preserves evidence limits', async () => {
  const { evaluateCatalogMappings } = await import('./evaluate_catalog_mapping.mjs')
  const corpus = { cases: [{ id: 'mapping', csv, ready: 1, values: { price: '1200', onHand: '5' } }] }
  await assert.rejects(evaluateCatalogMappings(corpus, []), /exact_case_coverage/)
  const row = { id: 'mapping', proposal: await proposalFor() }
  await assert.rejects(evaluateCatalogMappings(corpus, [row, row]), /exact_case_coverage/)
  const result = await evaluateCatalogMappings(corpus, [row])
  assert.equal(result.technicalPass, true)
  assert.equal(result.adoptionApproved, false)
  assert.equal(result.operatorTimeSavings, null)
  assert.equal(result.importExecuted, false)
  const rejected = await evaluateCatalogMappings(corpus, [{ id: 'mapping', proposal: null }])
  assert.equal(rejected.technicalPass, false)
})


test('cafe spreadsheet headings map automatically without changing values', async () => {
  const source = 'Item code,Menu item,Stock on hand,Reorder level,Selling price MMK\nCAFE-1,Espresso,12,3,3500'
  const result = await createShopCatalogImportPreview(source, [])
  assert.equal(result.totals.ready, 1)
  assert.deepEqual(result.rows[0].item, { sku: 'CAFE-1', name: 'Espresso', onHand: 12, reorderAt: 3, price: 3500 })
  assert.equal(result.mapping.name, 'Menu item')
  assert.equal(result.mapping.price, 'Selling price MMK')
})

test('competing cafe price columns still need an explicit choice', async () => {
  const source = 'Item code,Item,Stock on hand,Reorder level,Selling price MMK,Unit price MMK\nCAFE-1,Espresso,12,3,3500,3000'
  const result = await createShopCatalogImportPreview(source, [])
  assert.equal(result.mapping.price, '')
  assert.equal(result.suggestions.find(row => row.field === 'price').basis, 'ambiguous')
  assert.equal(result.totals.ready, 0)
})

test('recognized cafe headings do not bypass declared foreign currency', async () => {
  const source = 'Item code,Menu item,Stock on hand,Reorder level,Selling price MMK,Currency\nCAFE-1,Espresso,12,3,3500,THB'
  const result = await createShopCatalogImportPreview(source, [])
  assert.equal(result.totals.ready, 0)
  assert.ok(result.rows[0].issues.some(issue => issue.code === 'unsupported_currency'))
})


test('invalid model output cannot earn a correct-rejection score', async () => {
  const { evaluateCatalogMappings } = await import('./evaluate_catalog_mapping.mjs')
  const source = csv.replace('1200', '12.50')
  const scenario = { id: 'fractional', csv: source, ready: 0, expectedRejection: 'import_validation_failed' }
  for (const proposal of [null, {}, { ...(await proposalFor(source)), sourceDigest: 'stale' }]) {
    const result = await evaluateCatalogMappings({ cases: [scenario] }, [{ id: scenario.id, proposal }])
    assert.equal(result.technicalPass, false)
  }
  const valid = await evaluateCatalogMappings({ cases: [scenario] }, [{ id: scenario.id, proposal: await proposalFor(source) }])
  assert.equal(valid.technicalPass, true)
  assert.equal(valid.adoptionApproved, false)
  await assert.rejects(evaluateCatalogMappings({ cases: [{ ...scenario, expectedRejection: undefined }] }, [{ id: scenario.id, proposal: null }]), /expected_rejection_required/)
})


test('reference proposals satisfy every fixed corpus expectation', async () => {
  const { readFile } = await import('node:fs/promises')
  const { evaluateCatalogMappings } = await import('./evaluate_catalog_mapping.mjs')
  const corpus = JSON.parse(await readFile(new URL('./catalog_mapping_corpus.json', import.meta.url), 'utf8'))
  const responses = []
  for (const scenario of corpus.cases) {
    const baseline = await createShopCatalogImportPreview(scenario.csv, [])
    const mapping = { ...baseline.mapping }
    // Deliberately choose a competing source for this negative fixture. The
    // guard must still insist on human choice, not trust the proposed mapping.
    if (scenario.ambiguous) mapping[scenario.ambiguous] = 'stock'
    responses.push({ id: scenario.id, proposal: { sourceDigest: baseline.sourceDigest, mapping } })
  }
  const result = await evaluateCatalogMappings(corpus, responses)
  assert.equal(result.technicalPass, true, JSON.stringify(result.results))
  assert.equal(result.results.length, corpus.cases.length)
  assert.equal(result.modelCalled, false)
  assert.equal(result.adoptionApproved, false)
  const malformed = await evaluateCatalogMappings(corpus, responses.map(row => ({ ...row, proposal: null })))
  assert.equal(malformed.results.filter(row => row.expectationMet).length, 0)
})


test('batch evaluation checks row count and later-row values', async () => {
  const { evaluateCatalogMappings } = await import('./evaluate_catalog_mapping.mjs')
  const source = csv + '\nSYN-2,Second item,8,2,2400'
  const response = [{ id: 'batch', proposal: await proposalFor(source) }]
  const scenario = { id: 'batch', csv: source, ready: 2, valuesByRow: [{ price: '1200' }, { price: '2400', onHand: '8' }] }
  assert.equal((await evaluateCatalogMappings({ cases: [scenario] }, response)).technicalPass, true)
  assert.equal((await evaluateCatalogMappings({ cases: [{ ...scenario, valuesByRow: [{ price: '1200' }, { price: '1' }] }] }, response)).technicalPass, false)
  assert.equal((await evaluateCatalogMappings({ cases: [{ ...scenario, ready: 1 }] }, response)).technicalPass, false)
  await assert.rejects(evaluateCatalogMappings({ cases: [{ ...scenario, valuesByRow: undefined }] }, response), /batch_expectations_required/)
})
