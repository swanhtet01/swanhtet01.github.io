import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  acceptedReceiptLabelTarget,
  cappedShopBarcodeLabelCopies,
  catalogProductLabelTarget,
  isPrintableShopBarcode,
  MAX_SHOP_BARCODE_LABELS_PER_PRINT,
} from '../showroom/src/core/shop-barcode-labels.ts'

assert.equal(MAX_SHOP_BARCODE_LABELS_PER_PRINT, 50)
assert.equal(isPrintableShopBarcode('8934567110943'), true)
assert.equal(isPrintableShopBarcode('SKU-88219'), true)
assert.equal(isPrintableShopBarcode('အချိုရည်'), false)
assert.equal(isPrintableShopBarcode(' CODE '), false)
assert.equal(isPrintableShopBarcode('x'.repeat(81)), false)

assert.equal(cappedShopBarcodeLabelCopies(10, 3), 3)
assert.equal(cappedShopBarcodeLabelCopies(10, 500), 10)
assert.equal(cappedShopBarcodeLabelCopies(100, 500), 50)
assert.equal(cappedShopBarcodeLabelCopies(10, 1.5), 1)
assert.equal(cappedShopBarcodeLabelCopies(0, 1), 0)

const receipt = acceptedReceiptLabelTarget({
  id: 'receipt-1', purchaseOrderId: 'PO-12', sku: 'SM-DRINK-01', itemName: 'Drinking water', acceptedQuantity: 80,
})
assert.equal(receipt?.maxCopies, 50)
assert.equal(receipt?.initialCopies, 50)
assert.equal(receipt?.code, 'SM-DRINK-01')
assert.equal(receipt?.detail, 'PO-12')
assert.equal(acceptedReceiptLabelTarget({
  id: 'receipt-2', purchaseOrderId: 'PO-12', sku: 'SM-DRINK-01', itemName: 'Drinking water', acceptedQuantity: 0,
}), null)

const product = catalogProductLabelTarget({ sku: 'SKU-88219', barcode: '8934567110943', itemName: 'Everyday tee' })
assert.equal(product?.code, '8934567110943')
assert.equal(product?.detail, 'SKU-88219')
assert.equal(product?.maxCopies, 50)
assert.equal(product?.initialCopies, 1)
assert.match(product?.description ?? '', /saved barcode/)

const skuFallback = catalogProductLabelTarget({ sku: 'SKU-88219', itemName: 'Everyday tee' })
assert.equal(skuFallback?.code, 'SKU-88219')
assert.equal(catalogProductLabelTarget({ sku: ' ', itemName: 'No code' }), null)

const printComponent = await readFile(new URL('../showroom/src/core/ShopBarcodeLabels.tsx', import.meta.url), 'utf8')
assert.match(printComponent, /\.shop-barcode-label-print-host\s*\*\s*\{\s*visibility:\s*visible\s*!important;\s*\}/)

console.log('Shop barcode label checks passed')
