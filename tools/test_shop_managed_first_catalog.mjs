import assert from 'node:assert/strict'
import test from 'node:test'

import { prepareManagedFirstCatalog } from '../showroom/src/core/shop-managed-first-catalog.ts'

const validDraft = {
  sku: '',
  name: 'Rice 5 kg',
  onHand: '12',
  reorderAt: '3',
  price: '7500',
  reason: '',
  evidenceReference: '',
}

test('first-product setup keeps a scanned barcode as text, including leading zeros', () => {
  const result = prepareManagedFirstCatalog({ ...validDraft, barcode: '0001234567890' }, () => 'ab12cd34-0000-0000-0000-000000000000')

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.product.barcode, '0001234567890')
  assert.equal(result.product.sku, 'SM-AB12CD34')
})

test('first-product setup omits an empty barcode for older callers', () => {
  const result = prepareManagedFirstCatalog(validDraft, () => 'ab12cd34-0000-0000-0000-000000000000')

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal('barcode' in result.product, false)
})

test('first-product setup preserves an owner-entered Burmese name beside the stable English name', () => {
  const result = prepareManagedFirstCatalog({ ...validDraft, nameMy: ' ဆန် ၅ ကီလို ' }, () => 'ab12cd34-0000-0000-0000-000000000000')

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.product.name, 'Rice 5 kg')
  assert.equal(result.product.nameMy, 'ဆန် ၅ ကီလို')
})

test('first-product setup accepts a missing Burmese name and rejects malformed optional names', () => {
  const withoutMyanmar = prepareManagedFirstCatalog(validDraft, () => 'ab12cd34-0000-0000-0000-000000000000')
  assert.equal(withoutMyanmar.ok, true)
  if (withoutMyanmar.ok) assert.equal('nameMy' in withoutMyanmar.product, false)

  for (const nameMy of ['က'.repeat(181), 'က\u0000']) {
    const result = prepareManagedFirstCatalog({ ...validDraft, nameMy }, () => 'ab12cd34-0000-0000-0000-000000000000')
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /Burmese product name/u)
  }
})

test('first-product setup rejects invalid scanned barcode text', () => {
  for (const barcode of ['x'.repeat(81), '123\u0000']) {
    const result = prepareManagedFirstCatalog({ ...validDraft, barcode }, () => 'ab12cd34-0000-0000-0000-000000000000')
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /Barcode must be 80 characters or fewer/u)
  }
})
