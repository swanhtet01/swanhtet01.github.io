import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import './ecommerce_request_feedback.test.mjs'

const source = await readFile(new URL('../showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx', import.meta.url), 'utf8')

test('a submitted request waits for the rendered receipt before moving focus', () => {
  assert.match(source, /const focusRequestReceipt = useCallback\(\(receipt: HTMLElement \| null\) =>/)
  assert.match(source, /if \(!receipt\) return/)
  assert.match(source, /receipt\.querySelector\('p'\)\?\.scrollIntoView\(\{ block: 'center' \}\)/)
  assert.match(source, /receipt\.focus\(\{ preventScroll: true \}\)/)
  assert.match(source, /ref=\{focusRequestReceipt\} tabIndex=\{-1\}/)
})

test('the browser-local truth boundary is the element brought into view', () => {
  assert.match(source, /<p>\{managedDeliveryConfirmed/)
  assert.match(source, /This browser demo retained the request\./)
  assert.match(source, /Shop still confirms stock, promise, payment, and delivery\./)
  assert.doesNotMatch(source, /requestReceiptRef/)
})

test('the receipt badge distinguishes browser retention from managed submission', () => {
  assert.match(source, /\{managedDeliveryConfirmed \? 'Request sent to Shop' : 'Request saved on this device'\}/)
  assert.doesNotMatch(source, />Request sent<\/span>/)
})

test('expired and changed requests retain a read-only receipt with honest delivery boundaries', async () => {
  const require = createRequire(new URL('../showroom/package.json', import.meta.url))
  const ts = require('typescript')
  const component = await readFile(new URL('../showroom/src/products/ecommerce/SavedRequestReceipt.tsx', import.meta.url), 'utf8')
  const js = ts.transpileModule(component, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}, jsx = (type, props) => ({ type, props })
  runInNewContext(js, { exports, require: name => { assert.equal(name, 'react/jsx-runtime'); return { jsx, jsxs: jsx } } })
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : []
  const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : typeof tree === 'string' ? tree : ''
  for (const expired of [true, false]) for (const delivery of ['confirmed', 'unverified', 'local']) {
    const tree = exports.SavedRequestReceipt({ reference: 'ECR-SYNTHETIC', total: '18,500 MMK', expiresAt: '2026-09-16T12:00:00Z', expired, delivery })
    const visible = text(tree)
    assert.equal(tree.props['data-current'], 'false')
    assert.equal(tree.props.tabIndex, -1)
    assert.match(visible, expired ? /quote expired/ : /checkout changed/)
    assert.match(visible, /ECR-SYNTHETIC/)
    assert.match(visible, /18,500 MMK/)
    assert.match(visible, /has not been deleted/)
    assert.match(visible, /not a confirmed order/)
    assert.match(visible, /cannot confirm the old quote/)
    assert.match(visible, delivery === 'confirmed' ? /Company Shop received/ : delivery === 'unverified' ? /delivery is not verified/ : /browser demo retained/)
    assert.equal(nodes(tree).some(n => ['button', 'form', 'a', 'input'].includes(n.type) || n.props?.dangerouslySetInnerHTML), false)
  }
  assert.match(source, /!latestRequestOrder \? <SavedRequestReceipt/)
  assert.match(source, /expired=\{Date\.parse\(latestRequest\.quote\.expiresAt\) <= quoteClock\}/)
})

test('View receipt focuses the retained receipt before falling back to checkout recovery', async () => {
  const require = createRequire(new URL('../showroom/package.json', import.meta.url))
  const ts = require('typescript')
  const product = await readFile(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
  const start = product.indexOf('  function focusCurrentRequestReceipt()')
  const end = product.indexOf('\n  function prepareCustomerFollowUpDraft()', start)
  assert.ok(start >= 0 && end > start)
  const js = ts.transpileModule(product.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  for (const available of ['current', 'retained', 'none']) {
    let focused = 0, scrolled = 0, recovered = 0
    class Details { open = false }
    const workspace = new Details(), receipt = { focus() { focused++ }, scrollIntoView() { scrolled++ } }
    const run = runInNewContext(`${js}; focusCurrentRequestReceipt`, {
      document: { querySelector: selector => available === 'none' ? null : selector.includes(available === 'current' ? '"true"' : '"false"') ? receipt : null,
        getElementById: () => workspace }, HTMLDetailsElement: Details,
      requestAnimationFrame: fn => fn(), prepareQuoteRecovery: () => { recovered++ },
    })
    run()
    assert.equal(recovered, available === 'none' ? 1 : 0)
    assert.equal(workspace.open, available !== 'none')
    assert.equal(focused, available === 'none' ? 0 : 2)
    assert.equal(scrolled, available === 'none' ? 0 : 1)
  }
})

test('retained receipts use a wrapping single column and readable evidence text', async () => {
  const css = await readFile(new URL('../showroom/src/products/ecommerce/ecommerce-product.css', import.meta.url), 'utf8')
  const block = css.slice(css.indexOf('/* A retained receipt is evidence'), css.indexOf('/* A retained receipt is evidence') + 760)
  assert.match(block, /grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(block, /font-size: \.875rem/)
  assert.match(block, /white-space: normal/)
  assert.match(block, /overflow-wrap: anywhere/)
})
