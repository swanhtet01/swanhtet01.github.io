// Guards the EAN-13 barcode core. Run: node --test connectors/_barcode-core.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ean13CheckDigit, generateEan13, validateEan13, selfTest } from './_barcode-core.mjs'

test('canonical EAN-13 check digit (590123412345 -> 7)', () => {
  assert.equal(ean13CheckDigit('590123412345'), '7')
})

test('generate produces a valid 13-digit barcode', () => {
  const code = generateEan13('590123412345')
  assert.equal(code, '5901234123457')
  assert.equal(code.length, 13)
  assert.equal(validateEan13(code), true)
})

test('validate rejects a wrong check digit and non-13-length', () => {
  assert.equal(validateEan13('5901234123450'), false) // wrong check
  assert.equal(validateEan13('59012341234'), false) // too short
  assert.equal(validateEan13('not-a-barcode'), false)
})

test('generate is round-trippable for arbitrary numeric input', () => {
  for (const n of ['1', '42', '8851234567890', '000000000001']) {
    assert.equal(validateEan13(generateEan13(n)), true)
  }
})

test('selfTest passes (used by the connector health probe)', () => {
  assert.equal(selfTest().ok, true)
})
