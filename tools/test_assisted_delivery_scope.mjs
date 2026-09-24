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
vm.runInNewContext(compiled, { exports: module.exports, require: name => name.endsWith('.css') || name === './business-brief-draft' ? {} : require(name) })
const { AssistedDeliveryScope } = module.exports
for (const product of ['website', 'ecommerce']) {
  test(`${product}: one business-brief entry without implementation choices`, () => {
    const html = renderToStaticMarkup(React.createElement(AssistedDeliveryScope, { product }))
    assert.equal((html.match(/<a /g) ?? []).length, 1)
    assert.ok(html.includes(`href="/${product}/"`))
    assert.doesNotMatch(html, /<select|<button|<ol|target=|workspace=|template=/)
    assert.match(html, /<details><summary>Before we start<\/summary>/)
    assert.ok(html.includes('Publishing needs your approval.'))
    assert.ok(html.includes('scope, price and timing'))
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
