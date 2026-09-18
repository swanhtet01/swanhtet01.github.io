import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const React = require('react')
const ts = require('typescript')
const { renderToStaticMarkup } = require('react-dom/server')
const manifest = JSON.parse(readFileSync(new URL('../site-manifest.json', import.meta.url), 'utf8'))
const source = readFileSync(new URL('../showroom/src/products/AssistedDeliveryScope.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
const module = { exports: {} }
let selectedTemplate = ''
vm.runInNewContext(compiled + '\nexports.deliverySetupLink = deliverySetupLink; exports.deliveryTemplates = deliveryTemplates;', { exports: module.exports, URLSearchParams, require: name => name.endsWith('.css') ? {} : name === '../core/product-setup' ? { templatesFor: product => manifest.customerProducts.find(item => item.id === product).templates } : name === 'react' ? { ...React, useState: () => [selectedTemplate, value => { selectedTemplate = value }] } : require(name) })
const { AssistedDeliveryScope, deliverySetupLink, deliveryTemplates } = module.exports
for (const product of ['website', 'ecommerce']) {
  test(`${product}: all canonical templates bind exact request and prefilled goal`, () => {
    const templates = manifest.customerProducts.find(item => item.id === product).templates
    assert.deepEqual(deliveryTemplates(product), templates)
    for (const template of templates) {
      selectedTemplate = template.id
      const html = renderToStaticMarkup(React.createElement(AssistedDeliveryScope, { product }))
      const href = html.match(/<a [^>]*href="([^"]+)"/)?.[1].replaceAll('&amp;', '&')
      assert.equal(href, deliverySetupLink(product, template.id))
      assert.ok(html.includes('Useful starting material:'))
      assert.ok(html.includes('rel="noopener noreferrer"'))
      const url = new URL(deliverySetupLink(product, template.id))
      assert.equal(url.origin, 'https://supermega.dev')
      assert.equal(url.pathname, '/contact/')
      assert.equal(url.searchParams.get('product'), product)
      assert.equal(url.searchParams.get('template'), template.id)
      const goal = new URLSearchParams(url.hash.slice(1)).get('goal')
      assert.ok(goal.includes(template.outcome))
      assert.ok(goal.includes('separate approval'))
      assert.ok(goal.length <= 4000)
    }
    selectedTemplate = ''
  })
  test(`${product}: no automatic selection, submission or workspace mutation`, () => {
    const html = renderToStaticMarkup(React.createElement(AssistedDeliveryScope, { product }))
    assert.ok(html.includes('Help me choose'))
    assert.ok(html.includes('Nothing is sent until you submit it'))
    assert.equal((html.match(/<a /g) ?? []).length, 1)
    assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage|emitMetric|sendBeacon/)
    const invalid = new URL(deliverySetupLink(product, '../../unknown'))
    assert.equal(invalid.searchParams.has('template'), false)
    assert.equal(invalid.hash, '')
  })
  test(`${product}: request action is visible before optional collapsed setup choices`, () => {
    selectedTemplate = ''
    const html = renderToStaticMarkup(React.createElement(AssistedDeliveryScope, { product }))
    assert.match(html, /<details class="assisted-delivery-options"><summary>Choose a starting point · optional<\/summary>/)
    assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/)
    assert.ok(html.indexOf('<a ') < html.indexOf('<details'))
    assert.ok(html.indexOf('<select') > html.indexOf('assisted-delivery-options'))
    for (const template of deliveryTemplates(product)) {
      selectedTemplate = template.id
      const selected = renderToStaticMarkup(React.createElement(AssistedDeliveryScope, { product }))
      assert.ok(selected.includes(`Starting point: ${template.name}`))
      assert.ok(selected.includes(`template=${template.id}`))
    }
    selectedTemplate = ''
  })
}
test('existing contact form consumes both handoff fields', () => {
  assert.match(source, /import \{ templatesFor \} from '\.\.\/core\/product-setup'/)
  assert.doesNotMatch(source, /import.*site-manifest/)
  const contact = readFileSync(new URL('./create_public_vercel_output.mjs', import.meta.url), 'utf8')
  const start = contact.indexOf("  var requestedTemplate=query.get('template')")
  const end = contact.indexOf('  var claimInput=', start)
  assert.ok(start >= 0 && end > start)
  const prefill = contact.slice(start, end)
  for (const productId of ['website', 'ecommerce']) {
    for (const template of deliveryTemplates(productId)) {
      const url = new URL(deliverySetupLink(productId, template.id))
      const fields = { template: { value: '' }, goal: { value: '' }, company: { value: '' }, product: { value: productId }, requestedProduct: productId,
        query: url.searchParams, handoff: new URLSearchParams(url.hash.slice(1)) }
      vm.runInNewContext(prefill, fields)
      assert.equal(fields.template.value, template.id)
      assert.equal(fields.goal.value, fields.handoff.get('goal'))
      assert.equal(fields.company.value, '', 'no business identity is invented')
    }
  }
})
test('assisted scope overrides compact-grid named placements without changing other states', () => {
  const css = readFileSync(new URL('../showroom/src/products/assisted-delivery-scope.css', import.meta.url), 'utf8')
  assert.match(css, /:has\(> \.assisted-delivery-scope\) \{ grid-template-columns: minmax\(0, 1fr\); grid-template-areas: none/)
  assert.match(css, /> :is\(\.core-eyebrow, h2, p, details, section, div\) \{ grid-area: auto/)
  assert.ok(css.includes('min-height: 2.75rem'))
  assert.ok(css.includes('.website-today:has(.assisted-delivery-scope) { grid-template-columns: minmax(0, 1fr); }'))
  assert.doesNotMatch(css, /!important/)
})
