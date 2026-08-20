// Guard: a real shop must be able to turn location stock on.
//
// Two defects found by walking the journey in a browser rather than by reading code. Both
// made the inventory foundation -- locations, lots, available-to-promise, transfers, and the
// Plant material loop that depends on it -- unreachable for every business the product
// actually onboards. Neither threw anything a test would have noticed, because the demo seed
// they were developed against is the one catalog small enough and sorted enough to slip past
// both.
//
//   1. The setup screen refused any shop with more than EIGHT stocked catalog items. Eight is
//      the LOCATION limit; the contract allows a thousand stock units. All seven business
//      templates seed well over eight, so the old UI bound rejected real client catalogs.
//
//   2. validateCommerceState passed itemSkus -- built in CATALOG order -- to
//      projectShopInventory, which requires canonical order. So once a foundation existed,
//      validating the workspace threw for any catalog whose SKUs were not already
//      alphabetical. Confirming setup could never succeed on a real catalog.
//
// The second is the one to keep in mind: alphabetical-by-accident is the only case that
// worked, so a fixture built by sorting its own SKUs would pass while the product stayed
// broken. This file deliberately uses a catalog in NON-alphabetical order.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export {
        createSeedCommerce, validateCommerceState, installCommerceWorkingSampleCatalog,
      } from './commerce-workspace.ts'
      export { buildSharedMasterDataRegistry } from './shared-master-data.ts'
      export {
        SHOP_INVENTORY_MAX_STOCK_UNITS, applyShopInventoryImport, buildShopInventoryImportPackage,
        createEmptyShopInventoryState, shopInventoryEvidenceDigest,
      } from './shop-inventory-foundation.ts'
      export {
        shopBusinessTemplates, shopBusinessTemplateCommerceItems,
      } from '../products/shop/business-templates.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/inventory-setup-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createSeedCommerce, validateCommerceState, installCommerceWorkingSampleCatalog,
  buildSharedMasterDataRegistry,
  SHOP_INVENTORY_MAX_STOCK_UNITS, applyShopInventoryImport, buildShopInventoryImportPackage,
  createEmptyShopInventoryState, shopInventoryEvidenceDigest,
  shopBusinessTemplates, shopBusinessTemplateCommerceItems,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCOPE = 'demo'
const ACTOR = 'Swan Htet'
const CAPTURED_AT = '2026-07-25T08:00:00.000Z'

// --- defect 1: the setup bound must fit the shops the product ships -----------
// Asserted against the templates themselves, so adding a bigger template fails here rather
// than silently locking that trade out of location stock.
let widest = 0
for (const template of shopBusinessTemplates) {
  const stocked = shopBusinessTemplateCommerceItems(template.id)
    .filter((item) => Number.isSafeInteger(item.onHand) && item.onHand > 0)
  widest = Math.max(widest, stocked.length)
  check(
    stocked.length <= SHOP_INVENTORY_MAX_STOCK_UNITS,
    `${template.id}: its ${stocked.length} stocked items fit the setup bound of ${SHOP_INVENTORY_MAX_STOCK_UNITS}`,
  )
}
check(widest > 8, `the widest template stocks ${widest} items -- more than the 8 the screen used to allow, so this guard is not vacuous`)

// A selected client template replaces the generic demo catalog. The setup bound must clear the
// exact client catalog without quietly carrying unrelated SM-* products into the new workspace.
const template = shopBusinessTemplates.find((candidate) => candidate.id === 'auto-parts')
const installed = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
  sampleId: template.id,
  sampleName: template.name.en,
  items: shopBusinessTemplateCommerceItems(template.id),
  capturedAt: CAPTURED_AT,
})
check(Boolean(installed), 'a business template catalog installs onto the seed')
const stockItems = installed.items.filter((item) => Number.isSafeInteger(item.onHand) && item.onHand > 0)
check(
  installed.items.length === shopBusinessTemplateCommerceItems(template.id).length
    && !installed.items.some((item) => item.sku.startsWith('SM-')),
  `a real device contains exactly the selected ${template.name.en} catalog with no generic demo products`,
)
check(
  stockItems.length <= SHOP_INVENTORY_MAX_STOCK_UNITS,
  `and still fits the setup bound of ${SHOP_INVENTORY_MAX_STOCK_UNITS}`,
)

// --- defect 2: the catalog is NOT in alphabetical order -----------------------
const skus = installed.items.map((item) => item.sku)
const sortedSkus = [...skus].sort()
check(
  skus.some((sku, index) => sku !== sortedSkus[index]),
  'the installed catalog is NOT already alphabetical -- which is exactly the case that used to fail',
)

// --- setting up locations the way the screen does -----------------------------
const clients = [{ id: 'CLI-DEFAULT-001', name: 'Walk-in customer' }]
const vendors = [{ id: 'VEN-OPENING-001', name: 'Opening stock source' }]
const locations = [
  { id: 'LOC-BRANCH', name: 'Branch' },
  { id: 'LOC-MAIN', name: 'Main store' },
]
const stockUnits = stockItems.map((item, index) => ({
  id: `LOT-OPENING-${String(index + 1).padStart(3, '0')}`,
  sku: item.sku,
  tracking: 'lot',
  trackingCode: `OPENING-${String(index + 1).padStart(3, '0')}`,
}))
const openings = stockItems.map((item, index) => ({
  stockUnitId: stockUnits[index].id,
  locationId: 'LOC-MAIN',
  vendorId: 'VEN-OPENING-001',
  quantity: item.onHand,
}))

const importPackage = buildShopInventoryImportPackage({
  importId: 'IMP-5C7D9E1F-2A3B-4C5D-8E9F-0A1B2C3D4E5F',
  sourceDigest: shopInventoryEvidenceDigest({
    scope: SCOPE,
    catalog: stockItems.map(({ sku, onHand }) => ({ sku, onHand })),
    clients, vendors, locations,
  }),
  catalogSkus: sortedSkus,
  clients, vendors, locations, stockUnits, openings,
})
check(Boolean(importPackage), 'the opening import package builds for a full template catalog')
check(
  importPackage.stockUnits.length === stockItems.length,
  `covering every stocked item (${importPackage.stockUnits.length})`,
)

const proof = {
  actionId: 'ACT-6D8E0F2A-3B4C-4D5E-9F0A-1B2C3D4E5F6A',
  capturedAt: CAPTURED_AT,
  actor: ACTOR,
  reason: 'Reviewed the two-location opening import',
  evidenceReference: 'SHOP-INVENTORY-OPENING-1',
}
const result = applyShopInventoryImport(
  createEmptyShopInventoryState(), importPackage, proof, sortedSkus, createEmptyShopInventoryState().headDigest,
)
check(Boolean(result?.state), 'the import applies to an empty inventory state')

// --- the property that was broken --------------------------------------------
// The workspace has to survive validation with the foundation attached AND a catalog whose
// SKUs are in their own order. This is the assertion that fails if the sort at the
// projectShopInventory call site is removed.
const withFoundation = { ...installed, inventoryFoundation: result.state }
let validated = null
let failure = ''
try {
  validated = validateCommerceState(withFoundation)
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
}
check(
  validated !== null,
  `THE SEAM HOLDS: a workspace with location stock and a real, unsorted catalog validates -- ${failure}`,
)
check(
  Boolean(validated.inventoryFoundation),
  'and the foundation survives validation rather than being dropped',
)
check(
  validated.items.length === installed.items.length,
  'with the catalog intact',
)

// --- the raised bound is real, not aspirational -------------------------------
// The screen's limit went from 8 to SHOP_INVENTORY_MAX_STOCK_UNITS. Raising a number is easy;
// what matters is whether setup still works up there, or whether the wall just moved.
//
// Measured across sizes with a deliberately non-alphabetical catalog: 18 items -> 5KB state in
// 14ms, 200 -> 39KB in 31ms, 500 -> 95KB in 62ms, 1000 -> 190KB in 164ms. No cliff, and 190KB
// sits far inside a browser storage budget. One over the bound is refused cleanly with
// "catalog_skus must contain between 1 and 1000 items." rather than crashing.
//
// 200 is asserted here rather than 1000: it is already an order of magnitude past any shop the
// product ships, and keeps this file cheap enough to sit in app:verify.
const BULK = 200
const bulkItems = Array.from({ length: BULK }, (_, index) => ({
  sku: `BULK-${String(BULK - index).padStart(5, '0')}`,
  onHand: 10 + (index % 5),
}))
const bulkSkus = bulkItems.map((item) => item.sku).sort()
check(
  bulkItems.map((item) => item.sku).some((sku, index) => sku !== bulkSkus[index]),
  'the bulk fixture is NOT alphabetical either, so it exercises the ordering path too',
)
const bulkUnits = bulkItems.map((item, index) => ({
  id: `LOT-BULK-${String(index + 1).padStart(5, '0')}`,
  sku: item.sku,
  tracking: 'lot',
  trackingCode: `BULK-${String(index + 1).padStart(5, '0')}`,
})).sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
const bulkOpenings = bulkUnits.map((unit) => ({
  stockUnitId: unit.id,
  locationId: 'LOC-MAIN',
  vendorId: 'VEN-OPENING-001',
  quantity: bulkItems.find((item) => item.sku === unit.sku).onHand,
}))
let bulkPackage = null
let bulkFailure = ''
try {
  bulkPackage = buildShopInventoryImportPackage({
    importId: 'IMP-7E9F1A3B-4C5D-4E6F-8A9B-0C1D2E3F4A5B',
    sourceDigest: shopInventoryEvidenceDigest({ scope: SCOPE, catalog: bulkItems, clients, vendors, locations }),
    catalogSkus: bulkSkus,
    clients, vendors, locations,
    stockUnits: bulkUnits,
    openings: bulkOpenings,
  })
} catch (error) {
  bulkFailure = error instanceof Error ? error.message : String(error)
}
check(bulkPackage !== null, `a ${BULK}-item opening import builds -- ${bulkFailure}`)
check(
  bulkPackage.stockUnits.length === BULK,
  `covering all ${BULK} items, got ${bulkPackage?.stockUnits.length}`,
)
check(
  BULK <= SHOP_INVENTORY_MAX_STOCK_UNITS,
  `and ${BULK} is inside the declared bound of ${SHOP_INVENTORY_MAX_STOCK_UNITS}`,
)

// --- every OTHER caller that hands a catalog to the projection ----------------
// One unsorted call site is a bug; two is a class. After fixing the first, every caller was
// audited and shared-master-data.ts had the same defect -- it built the catalog straight from
// item order and handed it to projectShopInventory on the next line. It threw for exactly the
// same reason on exactly the same real catalog.
//
// Asserted here rather than in its own file because this is the same defect, and the fixture
// that exposes it -- a real catalog with a foundation, in its own order -- is already built
// above.
let registry = null
let registryFailure = ''
try {
  registry = buildSharedMasterDataRegistry({ allowedProducts: ['commerce'], commerce: withFoundation })
} catch (error) {
  registryFailure = error instanceof Error ? error.message : String(error)
}
check(
  registry !== null,
  `the shared master-data registry builds from the same unsorted catalog -- ${registryFailure}`,
)
check(
  registry.records.length > 0,
  `and produces records rather than an empty registry, got ${registry?.records.length}`,
)

// Sorting the catalog first must ALSO work -- otherwise the fix would just have moved the
// failure to the other ordering.
const sortedCatalog = { ...withFoundation, items: [...installed.items].sort((left, right) => (
  left.sku < right.sku ? -1 : left.sku > right.sku ? 1 : 0
)) }
let sortedOk = true
try { validateCommerceState(sortedCatalog) } catch { sortedOk = false }
check(sortedOk, 'an already-alphabetical catalog validates too, so the fix works for both orderings')

console.log(`shop inventory setup reachability contract: ${checks} checks passed`)
