import assert from 'node:assert/strict'
import test from 'node:test'

import { unmatchedBarcodeForCreation } from '../showroom/src/core/shop-unmatched-scan.ts'

test('keeps exact camera-scanned codes, including leading zeroes', () => {
  assert.equal(unmatchedBarcodeForCreation('  000123456789  ', 'camera'), '000123456789')
  assert.equal(unmatchedBarcodeForCreation('AB-001/XY', 'camera'), 'AB-001/XY')
})

test('offers keyboard-wedge creation for code-like input but not ordinary search words', () => {
  assert.equal(unmatchedBarcodeForCreation('SKU-001', 'keyboard'), 'SKU-001')
  assert.equal(unmatchedBarcodeForCreation('notebook', 'keyboard'), null)
  assert.equal(unmatchedBarcodeForCreation('mug 1234', 'keyboard'), null)
})

test('rejects empty, unsafe, malformed, and overlong scanner values', () => {
  assert.equal(unmatchedBarcodeForCreation('  ', 'camera'), null)
  assert.equal(unmatchedBarcodeForCreation('1234\n5678', 'camera'), null)
  assert.equal(unmatchedBarcodeForCreation('ABC?1234', 'camera'), null)
  assert.equal(unmatchedBarcodeForCreation('1'.repeat(81), 'camera'), null)
})
