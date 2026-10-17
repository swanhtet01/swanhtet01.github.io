import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const require = createRequire(new URL('../showroom/package.json', import.meta.url))
test('launcher presents Commerce without claiming a delivered Shop order', () => {
  const shell = readFileSync(new URL('../showroom/src/core/CoreShell.tsx', import.meta.url), 'utf8')
  assert.ok(shell.includes("['Commerce', 'A product catalog and customer requests.', 'Commerce', '/ecommerce/']"))
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
test('local entry uses an honest order-request flow without sample language', () => {
  for (const path of ['../showroom/src/products/ecommerce/EcommerceProduct.tsx']) {
    const text = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.doesNotMatch(text, /sample request|browser demo/i, path)
  }
  const product = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
  assert.ok(product.includes("'Open customer ordering'"))
})
test('sample catalog opens one customer preview instead of a dead-end setup page', () => {
  const product = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
  assert.ok(product.includes("const workspaceView = sampleCatalogPreview ? 'preview' : ecommerceWorkspaceView"))
  assert.doesNotMatch(product, /if \(!catalogHydrating && sampleCatalogPreview\)\s*\{\s*return/)
  assert.ok(product.includes("sampleCatalogPreview ? 'Sample customer view'"))
  assert.ok(product.includes("sampleCatalogPreview ? 'STORE PREVIEW' : 'BROWSE & BUY'"))
  assert.ok(product.includes("sampleCatalogPreview ? 'Example product'"))
  assert.match(product, /Requests stay on this device until Shop review/)
})

test('sample preview hides order and editing controls while guiding product setup', () => {
  const product = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
  assert.ok(product.includes('{!sampleCatalogPreview ? <nav aria-label="Commerce workspace"'))
  assert.ok(product.includes('{!sampleCatalogPreview ? <section className="core-panel ecommerce-setup"'))
  assert.ok(product.includes("sampleCatalogPreview ? 'Add your products' : 'Edit store'"))
  assert.ok(product.includes("!sampleCatalogPreview && managedIdentity && managedCanWrite && publicStatus === 'ready'"))
  assert.ok(product.includes("sampleCatalogPreview ? 'Example only. This preview cannot accept orders.'"))
  assert.ok(product.includes("const buyingReady = storefrontBuyingReady({"))
})

test('orders use one real-record operating desk instead of a duplicate status hero', () => {
  const product = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
  const desk = readFileSync(new URL('../showroom/src/products/ecommerce/CommerceOrderDesk.tsx', import.meta.url), 'utf8')
  assert.equal(product.match(/<CommerceOrderDesk/g)?.length, 1)
  assert.doesNotMatch(product, /className="ecommerce-today"/)
  for (const binding of [
    'headline={ecommerceTodayHeadline}',
    'summary={ecommerceTodaySummary}',
    'primaryActionLabel={ecommerceTodayAction}',
    'statusRows={ecommerceTodayMetrics}',
    'onPrimaryAction={runOrderAutopilot}',
  ]) assert.ok(product.includes(binding), binding)
  assert.ok(desk.includes('aria-label="Commerce operating status"'))
  assert.ok(desk.includes('const activeExceptions = EXCEPTIONS.filter'))
  assert.ok(desk.includes('Ready for the next customer.'))
  assert.ok(desk.includes('order{activeOrderCount === 1 ? \' is\' : \'s are\'} in fulfilment.'))
  assert.doesNotMatch(desk, /disabled=\{!count\}|No action needed/)
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
  assert.equal(vm.runInNewContext(label, { quoteBusy: false, onRecordManagedRequest: undefined }), 'Save request locally')
  assert.equal(vm.runInNewContext(label, { quoteBusy: true, onRecordManagedRequest: undefined }), 'Saving locally...')
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
  assert.ok(harness.includes("submit?.textContent.trim() !== 'Save request locally'"))
})

test('stale quote guidance does not invent a cart edit or an accepted order', () => {
  let stale
  function find(node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop => prop.name?.text === 'className' && prop.initializer?.text === 'ecommerce-stale-quote')) stale = node
    ts.forEachChild(node, find)
  }
  find(ast)
  assert.ok(stale)
  const strong = stale.children.find(child => ts.isJsxElement(child) && child.openingElement.tagName.getText(ast) === 'strong')
  const title = strong.children.find(child => ts.isJsxExpression(child)).expression.getText(ast)
  assert.equal(vm.runInNewContext(title, { latestRequestOrder: null }), 'Review a new total')
  assert.equal(vm.runInNewContext(title, { latestRequestOrder: { id: 'fixture-order' } }), 'Order confirmed in Shop')
  assert.doesNotMatch(stale.getText(ast), /Cart changed|cannot continue with this cart/)
  assert.match(stale.getText(ast), /Choose a product above to start another order/)
  assert.match(stale.getText(ast), /Review the current items and details before requesting a new total/)
})

test('confirmed orders collapse the empty checkout form into a clear status', () => {
  assert.ok(source.includes("latestRequestOrder ? 'Order confirmed' : latestRequest ? 'Request saved' : 'Empty'"))
  assert.ok(source.includes('{cart.length ? <form aria-busy={quoteBusy}'))
  assert.ok(source.includes("latestRequest && !latestRequestOrder"))
  assert.doesNotMatch(source, /latestRequest \? 'Recovered' : 'Empty'/)
})

test('only recorded orders use the Reorder label; saved quotes invite a fresh review', () => {
  let reorderButton
  function find(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'button'
      && node.openingElement.attributes.properties.some(prop => prop.name?.text === 'onClick' && prop.initializer?.getText(ast) === '{() => reorder(entry)}')) reorderButton = node
    ts.forEachChild(node, find)
  }
  find(ast)
  assert.ok(reorderButton)
  const expression = reorderButton.children.find(child => ts.isJsxExpression(child)).expression.getText(ast)
  for (const order of [null, undefined]) assert.equal(vm.runInNewContext(expression, { entry: { order } }), 'Review items again')
  assert.equal(vm.runInNewContext(expression, { entry: { order: { id: 'fixture-order' } } }), 'Reorder')
})

test('build gate requires truthful recovered-quote copy and rejects retired claims', () => {
  const verifier = readFileSync(new URL('./verify_app_build.mjs', import.meta.url), 'utf8')
  const start = verifier.indexOf('  || !ecommerceBuyingUiSource.includes("latestRequestOrder ? \'Order confirmed in Shop\' : \'Review a new total\'")')
  const end = verifier.indexOf("  || !ecommerceBuyingUiSource.includes('{latestRequest ?", start)
  assert.ok(start >= 0 && end > start, 'exact recovered-quote gate must exist')
  const predicate = 'false ' + verifier.slice(start, end)
  const rejects = (ecommerceBuyingUiSource) => vm.runInNewContext(predicate, { ecommerceBuyingUiSource })
  assert.equal(rejects(source), false)
  for (const marker of ['Order confirmed in Shop', 'Choose a product above to start another order', 'Review a new total', 'Review the current items and details', 'Review items again']) {
    assert.equal(rejects(source.replaceAll(marker, 'missing-copy')), true, marker)
  }
  for (const retired of ['Cart changed — review a new total', 'cannot continue with this cart']) {
    assert.equal(rejects(source + retired), true, retired)
  }
})
