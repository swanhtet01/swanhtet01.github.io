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
test('phone catalog remains readable with a retained Desktop preview selection', () => {
  const css = readFileSync(new URL('../showroom/src/products/ecommerce/ecommerce-product.css', import.meta.url), 'utf8')
  const block = css.slice(css.indexOf('/* A retained Desktop preview selection'), css.indexOf('/* ============================================================================', css.indexOf('/* A retained Desktop preview selection')))
  assert.match(block, /@media \(max-width: 47\.5rem\)/)
  assert.match(block, /\.ecommerce-preview-frame \.storefront-preview \.storefront-grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/)
  assert.match(block, /grid-template-columns: 4rem minmax\(0, 1fr\)/)
  for (const [index, tag] of ['small', 'strong', 'span', 'b'].entries()) {
    assert.ok(block.includes(`article:not(:has(> .storefront-product-photo)) > ${tag} { grid-column: 2; grid-row: ${index + 1}; }`))
  }
  assert.ok(block.includes('> .storefront-request-button { grid-column: 1 / -1; grid-row: 5; }'))
})
test('local entry consistently names a sample request in source and acceptance contracts', () => {
  for (const path of ['../showroom/src/products/ecommerce/EcommerceProduct.tsx', './verify_app_build.mjs', './verify_app_release_live.mjs', './verify_exact_app_preview.mjs']) {
    const text = readFileSync(new URL(path, import.meta.url), 'utf8')
    if (path !== './verify_exact_app_preview.mjs') assert.ok(text.includes("'Try one sample request'"), path)
    else assert.ok(text.includes("'Let SuperMega prepare your catalog', 'Request catalog setup'"), path)
    assert.ok(text.includes("'Try sample request'"), path)
    assert.doesNotMatch(text, /'Try one customer order'|'Start sample order'/)
  }
})
test('assisted catalog setup stays available in both local views and preserves the draft tab', () => {
  const product = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
  const expression = product.match(/const showAssistedCatalogSetup = ([\s\S]*?)\n\s*const assistedCatalogEntry/)?.[1]
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
  assert.match(product, /: ecommerceTodayHeadline\}/)
})

test('fresh assisted entry yields to retained work, carts, attention and editor state', () => {
  const product = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
  const expression = product.match(/const assistedCatalogEntry = ([\s\S]*?)\n\s*return \(/)?.[1]
  assert.ok(expression)
  const ready = { showAssistedCatalogSetup: true, workspaceView: 'preview', savedDraft: null, ecommerceTodayAction: 'Try sample request', ecommerceTodayState: 'ready', ecommerceTodayCartUnits: 0 }
  assert.equal(vm.runInNewContext(expression, ready), true)
  for (const blocked of [{ showAssistedCatalogSetup: false }, { workspaceView: 'setup' }, { savedDraft: { revision: 1 } }, { ecommerceTodayAction: 'Review checkout' }, { ecommerceTodayAction: 'View request receipt' }, { ecommerceTodayAction: 'Fix order import' }, { ecommerceTodayState: 'attention' }, { ecommerceTodayState: 'setup' }, { ecommerceTodayCartUnits: 1 }]) {
    assert.equal(vm.runInNewContext(expression, { ...ready, ...blocked }), false)
  }
  assert.ok(product.includes('{!assistedCatalogEntry ? <label className="ecommerce-workspace-switch">'))
  assert.ok(product.includes('Let SuperMega prepare your catalog'))
  assert.ok(product.includes('Requesting setup does not publish a store or activate orders, payments or stock.'))
  const action = product.slice(product.indexOf('{assistedCatalogEntry ? <div className="form-actions ecommerce-service-actions">'), product.indexOf('{ecommerceTodayGuided ? ('))
  assert.match(action, /<a className="core-button primary"[^>]+>Request catalog setup/)
  assert.match(action, /<button className="core-button secondary" onClick=\{runOrderAutopilot\} type="button">Try sample request/)
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
