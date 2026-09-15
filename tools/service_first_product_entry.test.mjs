import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const source = await read('showroom/src/core/CoreShell.tsx')
const entry = source.slice(source.indexOf('export function ProductHomePage()'))
const message = 'We set it up. You approve the result and run your business.'

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
