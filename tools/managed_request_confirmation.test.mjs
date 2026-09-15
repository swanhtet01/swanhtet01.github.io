import test from 'node:test'
import assert from 'node:assert/strict'
import { confirmManagedRequest, managedRequestWasConfirmed } from '../showroom/src/products/ecommerce/managed-request-confirmation.ts'

const request = { id: 'synthetic', scope: 'local-test', totalMmk: 100 }
test('denied submission and recovered local content cannot assert delivery', async () => {
  let confirmation = ''
  await assert.rejects(async () => { confirmation = await confirmManagedRequest(request, async () => { throw new Error('denied') }) })
  assert.equal(managedRequestWasConfirmed(request, confirmation), false)
  assert.equal(managedRequestWasConfirmed(JSON.parse(JSON.stringify(request)), ''), false)
})
test('successful submission binds exact content, but does not survive a new session by inference', async () => {
  const confirmation = await confirmManagedRequest(request, async () => {})
  assert.equal(managedRequestWasConfirmed(request, confirmation), true)
  assert.equal(managedRequestWasConfirmed({ ...request, totalMmk: 200 }, confirmation), false)
  assert.equal(managedRequestWasConfirmed({ ...request, scope: 'another' }, confirmation), false)
  assert.equal(managedRequestWasConfirmed(request, ''), false)
})
