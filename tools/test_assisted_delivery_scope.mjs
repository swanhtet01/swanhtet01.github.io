import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const React = require('react')
const ts = require('typescript')
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../showroom/src/products/AssistedDeliveryScope.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
const module = { exports: {} }
vm.runInNewContext(compiled, { exports: module.exports, require: name => name.endsWith('.css') ? {} : name === './business-brief-draft' ? { emptyBusinessBrief: () => ({ company: '', description: '', reference: '' }) } : require(name) })
const { AssistedDeliveryScope } = module.exports
for (const product of ['website', 'ecommerce']) {
  test(`${product}: one business-brief entry without implementation choices`, () => {
    const html = renderToStaticMarkup(React.createElement(AssistedDeliveryScope, { product }))
    assert.equal((html.match(/<a /g) ?? []).length, 1)
    assert.ok(html.includes(`href="/${product}/${product === 'ecommerce' ? '?setup=1' : ''}"`))
    assert.doesNotMatch(html, /<select|<button|<ol|target=|workspace=|template=/)
    assert.doesNotMatch(html, /Before we start|Publishing needs|scope, price|<details/ )
  })
}

test('assisted scope overrides compact-grid named placements without changing other states', () => {
  const css = readFileSync(new URL('../showroom/src/products/assisted-delivery-scope.css', import.meta.url), 'utf8')
  assert.match(css, /:has\(> \.assisted-delivery-scope\) \{ grid-template-columns: minmax\(0, 1fr\); grid-template-areas: none/)
  assert.match(css, /> :is\(\.core-eyebrow, h2, p, details, section, div\) \{ grid-area: auto/)
  assert.ok(css.includes('min-height: 2.75rem'))
  assert.ok(css.includes('.website-today:has(.assisted-delivery-scope) { grid-template-columns: minmax(0, 1fr); }'))
  assert.doesNotMatch(css, /!important/)
})

for (const product of ['website', 'ecommerce']) {
  test(`${product}: intake has one primary action and only two required business fields`, () => {
    const html = renderToStaticMarkup(React.createElement(module.exports.BusinessBrief, { product, onOpenWorkspace: () => {} }))
    assert.equal((html.match(/<button /g) ?? []).length, 1)
    assert.equal((html.match(/required=""/g) ?? []).length, 2)
    assert.match(html, />Continue<\/button>/)
    assert.doesNotMatch(html, /Open preview|Create preview/)
    assert.match(html, /Existing page or catalog/)
  })
}

for (const [product, label, heading] of [
  ['website', 'Sites', 'Your business, online.'],
  ['ecommerce', 'Commerce', 'Your products, ready to browse.'],
]) {
  test(`${product}: business brief identifies the current product`, () => {
    const html = renderToStaticMarkup(React.createElement(module.exports.BusinessBrief, { product, onOpenWorkspace() {} }))
    assert.ok(html.includes(`class="business-brief-kicker">${label}</span>`))
    assert.ok(html.includes(heading))
    assert.ok(html.includes('Business name'))
    assert.ok(html.includes('Continue'))
  })
}
