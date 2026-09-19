import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const source = await read('showroom/src/core/CoreShell.tsx')
const entry = source.slice(source.indexOf('export function ProductHomePage()'))
const message = 'We set it up. You approve the result and run your business.'

test('next steps routes active local products to assisted setup and preserves managed and Plant behavior', async () => {
  const navigator = await read('showroom/src/core/ProductSystemNavigator.tsx')
  const expression = navigator.match(/const assistedSetupProduct = ([\s\S]*?)\n  const capabilities/)?.[1]
  assert.ok(expression)
  for (const [product, expected] of [['commerce', 'shop'], ['website', 'website'], ['ecommerce', 'ecommerce'], ['production', null]]) {
    assert.equal(vm.runInNewContext(expression, {product, managed: false}), expected)
    assert.equal(vm.runInNewContext(expression, {product, managed: true}), null)
  }
  assert.ok(navigator.includes('product=${assistedSetupProduct}&source=product-next-steps'))
  assert.ok(navigator.includes('target="_blank" rel="noopener noreferrer"'))
  assert.ok(navigator.includes('to={clientSetupPath(product)}'))
  assert.ok(navigator.includes('<ProductDataImport details={details} managed={managed} product={product} />'))
})

test('both shell headers offer setup help without changing login or signup routes', () => {
  assert.equal(source.split('href={assistedSetupHref}').length - 1, 2)
  assert.equal(source.split('>Setup help</a>').length - 1, 2)
  assert.ok(source.includes("const showAssistedSetupLink = !accountEntryRoute && !routeProduct && !setupRoute && portalAccess.status !== 'ready'"))
  assert.ok(source.includes('to={companyLoginPath}'))
  assert.ok(!source.includes('>Free trial</Link>'))
  assert.ok(source.includes('https://supermega.dev/contact/?product=guide&source=assisted-app-header'))
})

test('new visitors get assisted setup, without silently activating or replacing workspaces', () => {
  assert.ok(entry.includes(message))
  assert.match(entry, /!managedPortal && productSetups && !anyStarted \? \(\s*<section aria-label="Setup by SuperMega"/)
  assert.match(entry, /href="https:\/\/supermega.dev\/contact\/\?product=guide&amp;source=assisted-app-entry"/)
  assert.ok(entry.includes('The sample workspaces below are optional. They are not a live customer setup.'))
  assert.ok(entry.includes('Your saved work stays here.'))
  assert.ok(!entry.includes('Working samples. Add data when ready.'))
  assert.ok(!entry.includes("to={clientSetupPath('commerce')}"))
})

test('existing routes and assigned-product filters remain available', () => {
  assert.ok(entry.includes('managedProductIsVisible(portalAccess.products, PRODUCT_SETUP_KEY[name])'))
  assert.ok(entry.includes('managedProductIsVisible(portalAccess.products, setupKey)'))
  assert.ok(entry.includes('Continue saved workspace: {workspaceName}'))
  assert.ok(entry.includes('aria-label={`Open ${name}`}'))
  assert.ok(entry.includes('to={path}'))
  assert.ok(entry.includes('if (!managedPortal && !productSetups)'))
})

test('all three source-owned release consumers pin the current positioning', async () => {
  for (const path of ['tools/verify_app_build.mjs','tools/verify_app_release_live.mjs','tools/prepare_release_integration_batch.mjs']) {
    const consumer = await read(path)
    assert.ok(consumer.includes(message), path)
    assert.ok(!consumer.includes('Working samples. Add data when ready.'), path)
  }
})

test('build verifier retains accepted scroll layout and brief-bound v2 preparation guards', async () => {
  const verifier = await read('tools/verify_app_build.mjs')
  const css = await read('showroom/src/core/core-app.css')
  const preparation = await read('tools/prepare_client_demo.mjs')
  const layout = '.product-home-screen { max-width: 980px; height: auto; min-height: 100%; max-height: 100%; overflow-y: auto; justify-content: flex-start;'
  assert.ok(css.includes(layout))
  assert.ok(verifier.includes(layout))
  assert.ok(!verifier.includes('.product-home-screen { max-width: 980px; justify-content: center;'))
  for (const pin of [
    "CLIENT_CONTACT_INTAKE_REVIEW_CONTRACT = 'supermega.client_contact_intake_review.v2'",
    "CLIENT_CONTACT_PROFILE_SCHEMA = 'supermega.client_contact_profile.v1'",
    'requestDigest: sha256(JSON.stringify(contact))',
    "if (review.requestDigest !== sha256(JSON.stringify(contact))) fail('client_contact_review_request_changed')",
    'if (contactBound) await verifyContactClientWorkspace(directoryRealPath)',
  ]) {
    assert.ok(preparation.includes(pin), pin)
    assert.ok(verifier.includes(pin), pin)
  }
  assert.ok(!verifier.includes("CLIENT_CONTACT_INTAKE_REVIEW_CONTRACT = 'supermega.client_contact_intake_review.v1'"))
})
