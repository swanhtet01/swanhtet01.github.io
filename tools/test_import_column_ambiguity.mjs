import test from 'node:test'
import assert from 'node:assert/strict'
import { createClientImportPreview } from '../showroom/src/core/client-onboarding.ts'
import { classifyShopCatalogImportRows, SHOP_CATALOG_IMPORT_MAX_ROWS } from '../showroom/src/core/shop-catalog-import.ts'

test('CSV preview blocks text that decoded as a replacement character and keeps Burmese UTF-8 intact', async () => {
  const prefix = new TextEncoder().encode('sku,name,stock,reorder_at,price\nTEST-1,')
  const suffix = new TextEncoder().encode(',5,1,1000')
  const bytes = new Uint8Array(prefix.length + 1 + suffix.length)
  bytes.set(prefix)
  bytes[prefix.length] = 0xff
  bytes.set(suffix, prefix.length + 1)
  const incorrectlyDecoded = new TextDecoder('utf-8').decode(bytes)
  assert.ok(incorrectlyDecoded.includes('\uFFFD'))
  await assert.rejects(createClientImportPreview(incorrectlyDecoded, 'commerce'), /could not be decoded as UTF-8/)

  const burmese = await createClientImportPreview('sku,name,stock,reorder_at,price\nTEA-1,လက်ဖက်ရည်,5,1,1000', 'commerce')
  assert.equal(burmese.rows[0].status, 'ready')
  assert.equal(burmese.rows[0].values.name, 'လက်ဖက်ရည်')
})

test('competing stock aliases cannot silently choose a business quantity', async () => {
  const csv = 'sku,name,stock,quantity,reorder_at,price\nTEST-1,Synthetic item,5,50,1,1000'
  const preview = await createClientImportPreview(csv, 'commerce')
  assert.equal(preview.mapping.onHand, '')
  assert.equal(preview.suggestions.find(item => item.field === 'onHand').basis, 'ambiguous')
  assert.notEqual(preview.rows[0].status, 'ready')
  const selected = await createClientImportPreview(csv, 'commerce', { ...preview.mapping, onHand: 'quantity' })
  assert.equal(selected.rows[0].status, 'ready')
  assert.equal(selected.rows[0].values.onHand, '50')
})

test('one stock alias still maps automatically', async () => {
  const preview = await createClientImportPreview('sku,name,stock,reorder_at,price\nTEST-1,Synthetic item,5,1,1000', 'commerce')
  assert.equal(preview.mapping.onHand, 'stock')
  assert.equal(preview.rows[0].status, 'ready')
})

test('local Shop import preview blocks rows beyond the catalog capacity', async () => {
  const preview = await createClientImportPreview(
    'sku,name,stock,reorder_at,price\nNEW-1,New tea,1,0,1000\nNEW-2,New coffee,2,1,2000',
    'commerce',
  )
  const fullCatalog = Array.from({ length: SHOP_CATALOG_IMPORT_MAX_ROWS }, (_, index) => ({
    sku: `EXISTING-${index + 1}`,
    name: `Existing item ${index + 1}`,
    onHand: 1,
    reorderAt: 0,
    price: 100,
  }))
  const rows = classifyShopCatalogImportRows(preview, fullCatalog)

  assert.equal(rows.length, 2)
  assert.ok(rows.every(row => row.status === 'invalid'))
  assert.ok(rows.every(row => row.issues.some(issue => issue.code === 'catalog_capacity')))

  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../showroom/src/core/ClientDataOnboarding.tsx', import.meta.url), 'utf8')
  assert.match(source, /classifyShopCatalogImportRows\(preview, catalog\.state\.items\)/)
  assert.match(source, /localActivationAvailable && !catalogHasBlockingIssues && importContextReady && targetImportReady/)
  assert.match(source, /Remove excess new rows and upload the file again/)
})

test('canonical field wins over aliases regardless of column order', async () => {
  for (const [headers, values] of [['stock,onHand', '50,5'], ['onHand,stock', '5,50']]) {
    const preview = await createClientImportPreview(`sku,name,${headers},reorder_at,price\nTEST-1,Synthetic item,${values},1,1000`, 'commerce')
    assert.equal(preview.mapping.onHand, 'onHand')
    assert.equal(preview.rows[0].values.onHand, '5')
  }
})

// The row-review comparison must agree with the final atomic import rule.
test('catalog comparison names changed fields without changing either item', async () => {
  const { commerceCatalogImportDifferences } = await import('../showroom/src/core/commerce-workspace.ts')
  const existing = Object.freeze({ sku: 'CHECK-1', name: 'Existing item', onHand: 5, reorderAt: 1, price: 1000 })
  assert.deepEqual(commerceCatalogImportDifferences(existing, { ...existing }), [])
  for (const [field, value] of [['name', 'Changed item'], ['variant', 'Large'], ['onHand', 6], ['reorderAt', 2], ['price', 1200]]) {
    assert.deepEqual(commerceCatalogImportDifferences(existing, Object.freeze({ ...existing, [field]: value })), [field])
  }
  assert.deepEqual(commerceCatalogImportDifferences(existing, { ...existing, price: 1200, onHand: 6 }), ['onHand', 'price'])
})

test('reviewed Shop import flags stale stock and duplicate SKUs before any write', async () => {
  const { commerceCatalogImportDifferences, createEmptyCommerce, importCommerceCatalog } = await import('../showroom/src/core/commerce-workspace.ts')
  const existing = { sku: 'CHECK-1', name: 'Existing item', onHand: 5, reorderAt: 1, price: 1000 }
  const stale = await createClientImportPreview(
    'sku,item_name,opening_stock,reorder_at,price_mmk\nCHECK-1,Existing item,4,1,1000\n',
    'commerce',
  )
  const staleItem = { sku: stale.rows[0].values.sku, name: stale.rows[0].values.name, onHand: Number(stale.rows[0].values.onHand), reorderAt: Number(stale.rows[0].values.reorderAt), price: Number(stale.rows[0].values.price) }
  assert.deepEqual(commerceCatalogImportDifferences(existing, staleItem), ['onHand'])

  const duplicates = await createClientImportPreview(
    'sku,item_name,opening_stock,reorder_at,price_mmk\nDUP-1,First,1,0,100\nDUP-1,Second,2,1,200\n',
    'commerce',
  )
  assert.equal(duplicates.totals.duplicates, 2)
  assert.equal(duplicates.readyForStaging, false)
  assert.ok(duplicates.rows.every(row => row.status === 'duplicate'))

  const context = { sourceDigest: `sha256:${'b'.repeat(64)}`, capturedAt: '2026-09-27T00:00:00.000Z', actor: 'Synthetic tester' }
  const seeded = importCommerceCatalog(createEmptyCommerce(), { ...context, items: [existing] })
  assert.ok(seeded)
  const before = JSON.stringify(seeded.state)
  assert.equal(importCommerceCatalog(seeded.state, { ...context, items: [{ ...existing, onHand: 4 }] }), null)
  assert.equal(JSON.stringify(seeded.state), before)
})

test('catalog import rejects a mixed conflicting batch without mutating existing state', async () => {
  const { createEmptyCommerce, importCommerceCatalog } = await import('../showroom/src/core/commerce-workspace.ts')
  const item = { sku: 'CHECK-1', name: 'Existing item', onHand: 5, reorderAt: 1, price: 1000 }
  const context = { sourceDigest: `sha256:${'a'.repeat(64)}`, capturedAt: '2026-09-27T00:00:00.000Z', actor: 'Synthetic tester' }
  const first = importCommerceCatalog(createEmptyCommerce(), { ...context, items: [item] })
  assert.ok(first)
  const before = JSON.stringify(first.state)
  const unchanged = importCommerceCatalog(first.state, { ...context, items: [{ ...item }] })
  assert.equal(unchanged.alreadyPresent, 1)
  assert.equal(unchanged.created, 0)
  assert.equal(importCommerceCatalog(first.state, { ...context, items: [{ ...item, sku: 'CHECK-2' }, { ...item, price: 1200 }] }), null)
  assert.equal(JSON.stringify(first.state), before)
})

test('managed importer never falls through to local controls while identity is absent', async () => {
  const { createRequire } = await import('node:module')
  const { readFileSync } = await import('node:fs')
  const { runInNewContext } = await import('node:vm')
  const require = createRequire(new URL('../showroom/package.json', import.meta.url))
  const ts = require('typescript'), React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const source = readFileSync(new URL('../showroom/src/core/ProductSystemNavigator.tsx', import.meta.url), 'utf8')
  const component = source.slice(source.indexOf('export function ProductDataImport('), source.indexOf('function WorkflowLink('))
  assert.ok(component.includes('useManagedIdentity(managed)'))
  const compiled = ts.transpileModule(component, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const identity = { userId: 'synthetic-user', workspaceId: 'synthetic-workspace' }
  for (const scenario of [
    { managed: true, identity: null, settled: false, expected: 'Loading your account...', importer: false },
    { managed: true, identity: null, settled: true, expected: 'Login to import data.', importer: false },
    { managed: true, identity, settled: true, expected: 'Import controls', importer: true },
    { managed: false, identity: null, settled: true, expected: 'Import controls', importer: true },
  ]) {
    const exports = {}, seen = []
    runInNewContext(compiled, { exports, require,
      useSetupWorkspace: () => [{ product: 'commerce', templateId: 'retail', workspace: 'Synthetic shop', owner: 'Tester' }],
      useManagedIdentity: enabled => { assert.equal(enabled, scenario.managed); return [scenario.identity, () => {}, scenario.settled] },
      useState: value => [typeof value === 'function' ? value() : value],
      readCurrentShopIndustryPackId: () => 'retail', readPlantIndustryPackId: () => 'general',
      productDetails: { commerce: { label: 'Shop' } }, productContracts: { commerce: { slug: 'shop' } },
      templateFor: () => ({ id: 'retail' }), shopIndustryPack: () => ({ workflowTemplateId: 'retail' }),
      Suspense: React.Suspense, Link: props => React.createElement('a', { href: props.to }, props.children),
      ClientDataOnboarding: props => { seen.push(props); return React.createElement('div', null, 'Import controls') },
    })
    const html = renderToStaticMarkup(React.createElement(exports.ProductDataImport, { product: 'commerce', managed: scenario.managed }))
    assert.ok(html.includes(scenario.expected), html)
    assert.equal(seen.length, scenario.importer ? 1 : 0)
    if (seen.length) assert.equal(seen[0].managedIdentity, scenario.identity)
    if (scenario.managed && scenario.settled && !scenario.identity) assert.ok(html.includes('/login?product=shop'))
  }
})

test('settings data import waits for managed identity before exposing local controls', async () => {
  const { createRequire } = await import('node:module')
  const { readFileSync } = await import('node:fs')
  const { runInNewContext } = await import('node:vm')
  const require = createRequire(new URL('../showroom/package.json', import.meta.url))
  const ts = require('typescript'), React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const source = readFileSync(new URL('../showroom/src/core/SettingsPage.tsx', import.meta.url), 'utf8')
  const line = source.split('\n').find(line => line.includes('id="client-data-setup"'))
  assert.ok(line)
  const compiled = ts.transpileModule(`export function DataPanel() { return <>${line.trim()}</> }`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const identity = { userId: 'synthetic', workspaceId: 'synthetic' }
  for (const [status, managedIdentity, managedIdentitySettled, expected] of [
    ['enterprise', null, false, 'Loading your account...'],
    ['enterprise', null, true, 'Login to import data'],
    ['enterprise', identity, true, 'Import controls'],
    ['isolated_demo', null, true, 'Import controls'],
  ]) {
    const exports = {}, seen = []
    runInNewContext(compiled, { exports, require, runtime: { status }, managedIdentity, managedIdentitySettled,
      demoBlueprint: {}, demoDataSetupOpen: true, selectedProduct: { name: 'Shop', slug: 'shop' },
      setup: { product: 'commerce', owner: 'Tester', workspace: 'Synthetic' }, selectedTemplate: { id: 'retail' },
      shopIndustryPackId: 'retail', plantIndustryPackId: 'general', recordDemoProductProgress: () => {},
      Suspense: React.Suspense, Link: props => React.createElement('a', { href: props.to }, props.children),
      ClientDataOnboarding: props => { seen.push(props); return React.createElement('div', null, 'Import controls') },
    })
    const html = renderToStaticMarkup(React.createElement(exports.DataPanel))
    assert.ok(html.includes(expected), html)
    assert.equal(seen.length, expected === 'Import controls' ? 1 : 0)
    if (seen.length) assert.equal(seen[0].managedIdentity, managedIdentity)
    if (expected === 'Login to import data') assert.ok(html.includes('/login?product=shop'))
  }
})

test('managed next steps does not send an existing workspace to local setup', async () => {
  const { createRequire } = await import('node:module')
  const { readFileSync } = await import('node:fs')
  const { runInNewContext } = await import('node:vm')
  const require = createRequire(new URL('../showroom/package.json', import.meta.url))
  const ts = require('typescript'), React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const source = readFileSync(new URL('../showroom/src/core/ProductSystemNavigator.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source.slice(source.indexOf('export function ProductSystemNavigator(')), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const product of ['commerce', 'website', 'ecommerce', 'production']) {
    for (const managed of [false, true]) {
      const exports = {}
      runInNewContext(compiled, { exports, require, useState: () => [false, () => {}], useMemo: fn => fn(),
        productDetails: { [product]: { label: 'Product', primaryPath: '/product/', dataTitle: 'Import data', dataAction: 'Upload' } },
        productCapabilityCatalog: () => [], clientSetupPath: () => '/settings/?product=example',
        Link: props => React.createElement('a', { href: props.to }, props.children),
      })
      const html = renderToStaticMarkup(React.createElement(exports.ProductSystemNavigator, { product, managed }))
      if (managed) {
        assert.ok(!html.includes('/settings/'), html)
        assert.ok(!html.includes('Request Product setup'), html)
        assert.ok(!html.includes('sample'), html)
        assert.ok(html.includes('Choose a workflow or import your data.'), html)
      } else {
        assert.ok(html.includes(product === 'production' ? '/settings/' : 'supermega.dev/contact/'), html)
      }
    }
  }
})
