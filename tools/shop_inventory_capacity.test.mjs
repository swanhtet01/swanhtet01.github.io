import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_SHOP_INVENTORY_STOCK_UNITS,
  buildShopInventoryImportPackage,
  shopInventoryEvidenceDigest,
} from '../showroom/src/core/shop-inventory-foundation.ts'
import { shopBusinessTemplates } from '../showroom/src/products/shop/business-templates.ts'

const SCOPE = 'commerce:local'

function openingPackageFor(itemCount) {
  const catalog = Array.from({ length: itemCount }, (_, index) => ({
    sku: `SKU-${String(index + 1).padStart(4, '0')}`,
    onHand: index + 1,
  }))
  const clients = [{ id: 'CLI-DEFAULT-001', name: 'Walk-in' }]
  const vendors = [{ id: 'VEN-OPENING-001', name: 'Opening vendor' }]
  const locations = [
    { id: 'LOC-BRANCH', name: 'Branch' },
    { id: 'LOC-MAIN', name: 'Main store' },
  ]
  const stockUnits = catalog.map((item, index) => ({
    id: `LOT-OPENING-${String(index + 1).padStart(4, '0')}`,
    sku: item.sku,
    tracking: 'lot',
    trackingCode: `OPENING-${String(index + 1).padStart(4, '0')}`,
  }))
  return buildShopInventoryImportPackage({
    importId: 'IMP-0000000000000001',
    sourceDigest: shopInventoryEvidenceDigest({ scope: SCOPE, catalog, clients, vendors, locations }),
    catalogSkus: catalog.map((item) => item.sku).sort(),
    clients,
    vendors,
    locations,
    stockUnits,
    openings: catalog.map((item, index) => ({
      stockUnitId: stockUnits[index].id,
      locationId: 'LOC-MAIN',
      vendorId: 'VEN-OPENING-001',
      quantity: item.onHand,
    })),
  })
}

test('a real business-template catalog fits the opening import', () => {
  // Every shipped template exceeds the old hard cap of 8, which made location
  // setup impossible to complete after the app's own provisioning.
  const largest = Math.max(...shopBusinessTemplates.map((template) => template.catalog.length))
  assert.ok(largest > 8, `templates should exceed the old cap, largest is ${largest}`)
  const seedCatalogItems = 5
  const packaged = openingPackageFor(largest + seedCatalogItems)
  assert.equal(packaged.stockUnits.length, largest + seedCatalogItems)
  assert.equal(packaged.openings.length, largest + seedCatalogItems)
})

test('the opening import accepts the engine capacity and refuses beyond it', () => {
  assert.equal(MAX_SHOP_INVENTORY_STOCK_UNITS, 1_000)
  assert.doesNotThrow(() => openingPackageFor(MAX_SHOP_INVENTORY_STOCK_UNITS))
  // Beyond capacity the engine still refuses (the catalog bound trips first).
  assert.throws(() => openingPackageFor(MAX_SHOP_INVENTORY_STOCK_UNITS + 1), /between 1 and 1000/)
})
