import assert from 'node:assert/strict'
import test from 'node:test'

import { photoLedgerSha256 } from './public_native_shop_gallery.mjs'

test('photo ledger receipt is stable across LF and CRLF checkouts', () => {
  const lf = Buffer.from('{\n  "schema": "example",\n  "items": []\n}\n', 'utf8')
  const crlf = Buffer.from('{\r\n  "schema": "example",\r\n  "items": []\r\n}\r\n', 'utf8')

  assert.equal(photoLedgerSha256(lf), photoLedgerSha256(crlf))
})

test('photo ledger receipt still rejects substantive text changes', () => {
  const original = Buffer.from('{\n  "schema": "example",\n  "items": []\n}\n', 'utf8')
  const changed = Buffer.from('{\n  "schema": "changed",\n  "items": []\n}\n', 'utf8')

  assert.notEqual(photoLedgerSha256(original), photoLedgerSha256(changed))
})

test('photo ledger receipt rejects invalid UTF-8 instead of replacing bytes', () => {
  assert.throws(
    () => photoLedgerSha256(Buffer.from([0xff])),
    /native_shop_gallery_photo_ledger_utf8_invalid/,
  )
})
