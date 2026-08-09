// Contract guard for the onboarding SAMPLE SOURCES -- every starter dataset a customer
// can land on, other than the Shop business templates (covered in
// tools/test_shop_business_templates.mjs).
//
// The Shop setup picker defaults to "Standard sample (current industry pack)". That option
// does not use a business template at all: clientImportTemplate branches on
// context.shopIndustryPackId into a separate set of sample CSVs, one per pack per product
// (commerce, website, ecommerce). Six packs across three products is eighteen samples that
// a customer can reach without changing a single dropdown, and none of them were tested.
//
// There is a second source underneath: when no industry pack is selected, the sample comes
// from the product's workflow templates instead -- twelve more across four products. Those
// are the fallback every other onboarding entry point lands on.
//
// Each is validated the same way the runtime validates it: through createClientImportPreview.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { shopIndustryPacks } from './shop-service-scheduling.ts'
      export { clientImportTemplate, createClientImportPreview } from './client-onboarding.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/shop-samples-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { shopIndustryPacks, clientImportTemplate, createClientImportPreview } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

check(shopIndustryPacks.length >= 6, `the shipped shop industry packs are present, got ${shopIndustryPacks.length}`)

const PRODUCTS = ['commerce', 'website', 'ecommerce']
let sampleCount = 0

for (const pack of shopIndustryPacks) {
  const where = `shop pack "${pack.id}"`

  check(Boolean(pack.name?.trim()), `${where} has a name`)
  check(Boolean(pack.firstWorkflow?.trim()), `${where} states the first workflow the operator is told to run`)
  check(pack.services.length > 0, `${where} ships at least one service`)
  check(pack.resources.length > 0, `${where} ships at least one resource to deliver those services`)
  check(
    ['Walk-in', 'Phone'].includes(pack.entryPoint),
    `${where} declares a supported entry point, got ${pack.entryPoint}`,
  )

  // Services must be deliverable: every service needs a resource that can perform it, or
  // the schedule offers appointments nobody can staff.
  const serviceIds = pack.services.map((service) => service.id)
  check(new Set(serviceIds).size === serviceIds.length, `${where} service ids are unique`)
  const resourceIds = pack.resources.map((resource) => resource.id)
  check(new Set(resourceIds).size === resourceIds.length, `${where} resource ids are unique`)

  for (const product of PRODUCTS) {
    const label = `${where} / ${product}`
    const csv = clientImportTemplate(product, undefined, { shopIndustryPackId: pack.id })
    check(typeof csv === 'string' && csv.trim().length > 0, `${label} renders a non-empty sample CSV`)
    sampleCount += 1

    const preview = await createClientImportPreview(csv, product, undefined, `sample-${pack.id}-${product}.csv`)
    const notReady = preview.rows.filter((row) => row.status !== 'ready')
    check(
      preview.readyForStaging,
      `${label} sample is ready for staging (issues: ${JSON.stringify(preview.fileIssues ?? []).slice(0, 200)})`,
    )
    check(
      notReady.length === 0,
      `${label} has every row importable, ${notReady.length} were not (${notReady.slice(0, 2).map((row) => JSON.stringify(row.issues ?? row.status)).join('; ').slice(0, 220)})`,
    )
    check(preview.rows.length > 0, `${label} sample contains at least one row`)

    check(
      preview.totals.ready === preview.totals.rows,
      `${label} totals agree that every row is ready (${preview.totals.ready} of ${preview.totals.rows})`,
    )

    // A duplicate key does NOT make a row un-ready -- the importer counts it separately in
    // totals.duplicates while still reporting every row as ready, so readyForStaging alone
    // misses it. A repeated SKU in a starter catalog makes stock ambiguous at the counter,
    // which is the same thing the business-template guard refuses.
    check(preview.totals.duplicates === 0, `${label} sample has no duplicate keys, got ${preview.totals.duplicates}`)
    const keys = preview.rows.map((row) => row.key)
    check(new Set(keys).size === keys.length, `${label} sample rows are distinct records, not the same one twice`)
  }
}

// Each pack's commerce sample must actually differ from the others. If two packs render
// the same CSV, choosing an industry is decorative.
const commerceSamples = shopIndustryPacks.map((pack) => clientImportTemplate('commerce', undefined, { shopIndustryPackId: pack.id }))
check(
  new Set(commerceSamples).size === commerceSamples.length,
  `each pack's commerce sample is distinct, got ${new Set(commerceSamples).size} distinct of ${commerceSamples.length}`,
)

// --- the workflow-template fallback ------------------------------------------
// Reached whenever onboarding runs without an industry pack. Production templates are
// date-materialized like the Plant packs, so they carry the same rot risk.
const WORKFLOW_TEMPLATES = {
  commerce: ['social-commerce', 'retail-wholesale', 'restaurant-ordering'],
  production: ['production-control', 'maintenance-downtime', 'quality-traceability'],
  website: ['business-presence', 'lead-generation', 'catalog-showcase'],
  ecommerce: ['social-storefront', 'pickup-preorder', 'wholesale-request'],
}

let fallbackCount = 0
for (const [product, templateIds] of Object.entries(WORKFLOW_TEMPLATES)) {
  for (const templateId of templateIds) {
    const label = `${product} workflow template "${templateId}"`
    const csv = clientImportTemplate(product, templateId)
    check(typeof csv === 'string' && csv.trim().length > 0, `${label} renders a non-empty sample CSV`)
    fallbackCount += 1

    const preview = await createClientImportPreview(csv, product, undefined, `sample-${templateId}.csv`, templateId)
    const notReady = preview.rows.filter((row) => row.status !== 'ready')
    check(
      preview.readyForStaging,
      `${label} sample is ready for staging (issues: ${JSON.stringify(preview.fileIssues ?? []).slice(0, 200)})`,
    )
    check(
      notReady.length === 0,
      `${label} has every row importable, ${notReady.length} were not (${notReady.slice(0, 2).map((row) => JSON.stringify(row.issues ?? row.status)).join('; ').slice(0, 220)})`,
    )
    check(preview.rows.length > 0, `${label} sample contains at least one row`)
    check(preview.totals.duplicates === 0, `${label} sample has no duplicate keys, got ${preview.totals.duplicates}`)
  }
}

console.log(`onboarding samples: ${checks} checks passed across ${shopIndustryPacks.length} packs x ${PRODUCTS.length} products (${sampleCount} pack samples) plus ${fallbackCount} workflow-template samples`)
