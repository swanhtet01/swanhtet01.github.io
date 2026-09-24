import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { validateStorefrontPreview, STOREFRONT_PREVIEW_SCHEMA } from '../showroom/src/products/ecommerce/storefront-model.ts'
import { COMMERCE_WORKSPACE_SCHEMA } from '../showroom/src/core/commerce-workspace.ts'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../showroom/src/products/ecommerce/PreparedCatalog.tsx', import.meta.url), 'utf8')
const compiled = require('typescript').transpileModule(source, { compilerOptions: { module: 1, jsx: 4, target: 9 } }).outputText
const exports = {}
vm.runInNewContext(compiled, { exports, Intl, require: name => name.endsWith('.css') ? {} : name === './storefront-model' ? { validateStorefrontPreview } : require(name) })
const preview = () => ({ schema: STOREFRONT_PREVIEW_SCHEMA, mode: 'browser-local-preview', sourceCatalogSchema: COMMERCE_WORKSPACE_SCHEMA,
  storeName: 'ဆိုင်', summary: 'Prepared <catalog>', currency: 'MMK', items: [
    { sku: 'A', name: '<script>item</script>', variant: 'Large', unitPriceMmk: 12500, availability: 'available' },
    { sku: 'B', name: 'Tea', variant: null, unitPriceMmk: 500, availability: 'sold_out' },
  ] })
const render = value => renderToStaticMarkup(React.createElement(exports.PreparedCatalog, { preview: value }))
test('prepared catalog shows exact product facts as inert escaped content', () => {
  const input = preview(), before = structuredClone(input), html = render(input)
  for (const text of ['ဆိုင်', 'Prepared &lt;catalog&gt;', '&lt;script&gt;item&lt;/script&gt;', 'Large', '12,500 MMK', '500 MMK', 'Available', 'Sold out']) assert.ok(html.includes(text), text)
  assert.doesNotMatch(html, /<(?:a|button|input|form|img|script|iframe)\b/)
  assert.deepEqual(input, before)
})
test('malformed catalogs cannot render as customer-ready products', () => {
  for (const mutate of [p => p.currency = 'USD', p => p.items[0].unitPriceMmk = -1, p => p.items = [], p => p.items[0].privateCost = 1]) {
    const p = preview(); mutate(p); assert.throws(() => render(p))
  }
})
