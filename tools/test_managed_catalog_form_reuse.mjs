import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const require = createRequire(new URL('../showroom/package.json', import.meta.url))
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('CoreApp.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let initializer
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'catalogForm') initializer = node.initializer.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
assert.ok(initializer)
const compiled = ts.transpileModule(`module.exports = function(context) {
  const { catalogDraft, setCatalogDraft, initializeManagedCatalog, catalogBusy, catalogError,
    commerceStorageError, managedIdentity, BarcodeScanButton, Link } = context;
  return (${initializer});
}`, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const sandbox = { module: { exports: {} }, require }
sandbox.exports = sandbox.module.exports
runInNewContext(compiled, sandbox)

function fixture(overrides = {}) {
  let draft = { sku: 'TEST', name: 'Test item', onHand: '0', reorderAt: '2', price: '100', reason: 'Reviewed count', evidenceReference: 'Count sheet' }
  const submitted = []
  function BarcodeScanButton() { return React.createElement('button', { type: 'button' }, 'Scan') }
  function Link({ to, children, ...props }) { return React.createElement('a', { ...props, href: to }, children) }
  const element = sandbox.module.exports({ catalogDraft: draft, setCatalogDraft: update => { draft = update(draft) },
    initializeManagedCatalog: event => submitted.push(event), catalogBusy: false, catalogError: '', commerceStorageError: '',
    managedIdentity: { email: 'operator@example.invalid' }, BarcodeScanButton, Link, ...overrides })
  const nodes = []
  function walk(node) {
    if (!React.isValidElement(node)) return
    nodes.push(node)
    React.Children.forEach(node.props.children, walk)
  }
  walk(element)
  return { element, nodes, submitted, draft: () => draft, markup: () => renderToStaticMarkup(element) }
}

test('managed first-product setup keeps one form inside the unprovisioned boundary', () => {
  assert.equal((source.match(/const catalogForm =/g) || []).length, 1)
  assert.ok(source.includes('if (unprovisioned) {\n      const catalogForm') || source.includes('if (unprovisioned) {\r\n      const catalogForm'))
  assert.ok(source.includes('<h2>Add your first product</h2>'))
  assert.match(source, /\{catalogForm\}\s*\{managedTemplate \? <details/)
  assert.equal((source.match(/<form className="core-form compact-form shop-first-product-form" onSubmit=\{\(formEvent\) => void initializeManagedCatalog\(formEvent\)\}/g) || []).length, 1)
})

test('first-product setup requires only core fields and preserves exact updates and barcode scanning', () => {
  const f = fixture()
  const inputs = f.nodes.filter(node => node.type === 'input')
  assert.equal(inputs.length, 7)
  assert.deepEqual(inputs.map(node => Boolean(node.props.required)), [false, true, true, true, false, false, false])
  const fields = ['sku', 'name', 'price', 'onHand', 'reorderAt', 'reason', 'evidenceReference']
  inputs.forEach((node, index) => node.props.onChange({ target: { value: `changed-${index}` } }))
  fields.forEach((key, index) => assert.equal(f.draft()[key], `changed-${index}`))
  assert.equal(inputs[0].props.maxLength, 80)
  assert.equal(inputs[2].props.min, '1')
  assert.equal(inputs[3].props.min, '0')
  assert.equal(inputs[4].props.min, '0')
  assert.ok(inputs.slice(2, 5).every(node => node.props.step === '1' && node.props.type === 'number'))
  f.nodes.find(node => node.props.onDetected).props.onDetected('SCANNED')
  assert.equal(f.draft().sku, 'SCANNED')
  const event = { preventDefault() {} }
  f.element.props.onSubmit(event)
  assert.equal(f.submitted[0], event)
  assert.match(f.markup(), /Workspace settings/)
})

test('busy state and error precedence stay visible', () => {
  const busy = fixture({ catalogBusy: true, catalogError: 'Review failed', commerceStorageError: 'Storage failed' })
  assert.equal(busy.nodes.find(node => node.props.type === 'submit').props.disabled, true)
  assert.match(busy.markup(), /Saving…/)
  assert.match(busy.markup(), /Review failed/)
  assert.doesNotMatch(busy.markup(), /Storage failed/)
  assert.match(fixture({ commerceStorageError: 'Storage failed' }).markup(), /Storage failed/)
  assert.match(fixture().markup(), /Blank notes are recorded as owner-entered and not independently verified/)
})
