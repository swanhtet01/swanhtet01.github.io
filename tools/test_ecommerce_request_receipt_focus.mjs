import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx', import.meta.url), 'utf8')

test('a submitted request waits for the rendered receipt before moving focus', () => {
  assert.match(source, /const focusRequestReceipt = useCallback\(\(receipt: HTMLElement \| null\) =>/)
  assert.match(source, /if \(!receipt\) return/)
  assert.match(source, /receipt\.querySelector\('p'\)\?\.scrollIntoView\(\{ block: 'center' \}\)/)
  assert.match(source, /receipt\.focus\(\{ preventScroll: true \}\)/)
  assert.match(source, /ref=\{focusRequestReceipt\} tabIndex=\{-1\}/)
})

test('the browser-local truth boundary is the element brought into view', () => {
  assert.match(source, /<p>\{onRecordManagedRequest/)
  assert.match(source, /This browser demo retained the request\./)
  assert.match(source, /Shop still confirms stock, promise, payment, and delivery\./)
  assert.doesNotMatch(source, /requestReceiptRef/)
})
