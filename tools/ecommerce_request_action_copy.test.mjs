import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
test('launcher promises a local request, not a delivered Shop order', () => {
  const shell = readFileSync(new URL('../showroom/src/core/CoreShell.tsx', import.meta.url), 'utf8')
  assert.ok(shell.includes("['Ecommerce', 'Storefront to Shop handoff.', 'Save a sample request on this device', '/ecommerce/']"))
  assert.ok(!shell.includes('Send a sample order to Shop'))
})
const ts = require('typescript')
test('assisted catalog setup stays available in both local views and preserves the draft tab', () => {
  const product = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
  const expression = product.match(/const showAssistedCatalogSetup = ([\s\S]*?)\n\s*return \(/)?.[1]
  assert.ok(expression)
  const ready = { catalogHydrating: false, managedIdentity: null, catalog: { source: 'sample' }, draftIssue: '', draftBusy: false, workspaceView: 'preview' }
  assert.equal(vm.runInNewContext(expression, ready), true)
  assert.equal(vm.runInNewContext(expression, {...ready,workspaceView:'setup'}), true)
  for (const workspaceView of ['preview','setup']) {
    for (const blocked of [{catalogHydrating:true}, {managedIdentity:{}}, {catalog:{source:'unavailable'}}, {draftIssue:'read failed'}, {draftBusy:true}]) {
      assert.equal(vm.runInNewContext(expression, {...ready,workspaceView,...blocked}), false)
    }
  }
  assert.match(product, /product=ecommerce&source=ecommerce-preview" target="_blank" rel="noopener noreferrer"/)
  assert.match(product, /sample requests are not live orders/)
  assert.match(product, /\{ecommerceTodayHeadline\}/)
})
const source = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('buying.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let action
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop => prop.name?.text === 'data-request-mode')) action = node
  ts.forEachChild(node, visit)
}
visit(ast)
assert.ok(action, 'actual request submit action exists')
const label = action.children.find(child => ts.isJsxExpression(child))?.expression.getText(ast)
const mode = action.openingElement.attributes.properties.find(prop => prop.name?.text === 'data-request-mode').initializer.expression.getText(ast)
test('local request action promises only a device save, including its busy label', () => {
  assert.equal(vm.runInNewContext(label, { quoteBusy: false, onRecordManagedRequest: undefined }), 'Save request on this device')
  assert.equal(vm.runInNewContext(label, { quoteBusy: true, onRecordManagedRequest: undefined }), 'Saving on this device...')
  assert.equal(vm.runInNewContext(mode, { onRecordManagedRequest: undefined }), 'local')
})
test('managed request action still names a send without claiming delivery completion', () => {
  const onRecordManagedRequest = () => {}
  assert.equal(vm.runInNewContext(label, { quoteBusy: false, onRecordManagedRequest }), 'Send order request')
  assert.equal(vm.runInNewContext(label, { quoteBusy: true, onRecordManagedRequest }), 'Sending...')
  assert.equal(vm.runInNewContext(mode, { onRecordManagedRequest }), 'managed')
})
test('rendered local proof rejects the old send claim rather than accepting either label', () => {
  const harness = readFileSync(new URL('./verify_app_entry_rendered.mjs', import.meta.url), 'utf8')
  assert.ok(harness.includes('button[data-request-mode="local"]'))
  assert.ok(harness.includes("submit?.textContent.trim() !== 'Save request on this device'"))
})
