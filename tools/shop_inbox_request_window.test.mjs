import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const source = await readFile(new URL('../showroom/src/core/CoreApp.tsx', import.meta.url), 'utf8')
const start = source.indexOf('export function shopInboxRequestWindow')
const end = source.indexOf('\nfunction ', start)
assert.ok(start >= 0 && end > start, 'shop inbox request window helper must be extractable')
const helper = source.slice(start, end).replace('export function', 'function').replace(/<T extends \{ id: string \}>/, '').replace('requests: readonly T[]', 'requests').replace('requestedId: string | null', 'requestedId')
const shopInboxRequestWindow = Function(`${helper}; return shopInboxRequestWindow`)()

const requests = Array.from({ length: 25 }, (_, index) => ({ id: `request-${index + 1}` }))

test('keeps the normal newest request window when no target is requested', () => {
  assert.deepEqual(shopInboxRequestWindow(requests, null).map((request) => request.id), requests.slice(0, 20).map((request) => request.id))
})

test('keeps an already visible target without reordering the inbox', () => {
  assert.deepEqual(shopInboxRequestWindow(requests, 'request-4').map((request) => request.id), requests.slice(0, 20).map((request) => request.id))
})

test('includes an off-window target while preserving the twenty-card bound', () => {
  const visible = shopInboxRequestWindow(requests, 'request-25')
  assert.equal(visible.length, 20)
  assert.equal(visible[0].id, 'request-25')
  assert.equal(new Set(visible.map((request) => request.id)).size, 20)
})

test('rejects an invalid limit', () => {
  assert.throws(() => shopInboxRequestWindow(requests, null, 0), /positive safe integer/)
})

test('retains an off-window target until the order composer closes', () => {
  assert.match(source, /const \[focusedEcommerceRequestId, setFocusedEcommerceRequestId\] = useState<string \| null>\(null\)/)
  assert.match(source, /const activeEcommerceInboxRequestId = requestedRequestId \?\? focusedEcommerceRequestId/)
  assert.match(source, /shopInboxRequestWindow\(pendingStorefrontRequests, activeEcommerceInboxRequestId\)/)
  assert.match(source, /setFocusedEcommerceRequestId\(requestedStorefrontRequestIsWaiting \? requestedRequestId : null\)/)
  assert.match(source, /onClose=\{\(\) => \{\s*setFocusedEcommerceRequestId\(null\)/)
})
