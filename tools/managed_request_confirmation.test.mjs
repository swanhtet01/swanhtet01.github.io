import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { confirmManagedRequest, managedRequestWasConfirmed } from '../showroom/src/products/ecommerce/managed-request-confirmation.ts'

const request = { id: 'synthetic', scope: 'local-test', totalMmk: 100 }
test('denied submission and recovered local content cannot assert delivery', async () => {
  let confirmation = ''
  await assert.rejects(async () => { confirmation = await confirmManagedRequest(request, async () => { throw new Error('denied') }) })
  assert.equal(managedRequestWasConfirmed(request, confirmation), false)
  assert.equal(managedRequestWasConfirmed(JSON.parse(JSON.stringify(request)), ''), false)
})

test('parent status uses confirmed delivery, not just a signed-in identity', () => {
  const parent = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceProduct.tsx', import.meta.url), 'utf8')
  const child = readFileSync(new URL('../showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx', import.meta.url), 'utf8')
  assert.match(parent, /Boolean\(managedIdentity && customerRequestDeliveryConfirmed\)/)
  assert.match(parent, /onDeliveryConfirmationChange=\{setCustomerRequestDeliveryConfirmed\}/)
  assert.match(parent, /Request saved — verify Shop delivery/)
  assert.match(child, /onDeliveryConfirmationChange\?\.\(managedDeliveryConfirmed\)/)
  assert.match(child, /return \(\) => onDeliveryConfirmationChange\?\.\(false\)/)
})
test('successful submission binds exact content, but does not survive a new session by inference', async () => {
  const confirmation = await confirmManagedRequest(request, async () => {})
  assert.equal(managedRequestWasConfirmed(request, confirmation), true)
  assert.equal(managedRequestWasConfirmed({ ...request, totalMmk: 200 }, confirmation), false)
  assert.equal(managedRequestWasConfirmed({ ...request, scope: 'another' }, confirmation), false)
  assert.equal(managedRequestWasConfirmed(request, ''), false)
})
