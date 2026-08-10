// Contract guard for the Shop business templates -- the "pick your shop type and start
// selling" path. Eight bilingual Myanmar templates ship today, and a customer meets one
// of them in the first minute of using the product. A template with a duplicate SKU, a
// zero price, or a sample sale referencing an item that is not in its own catalog would
// break that first minute, and nothing checked them.
//
// The runtime (core/product-onboarding-runtime.ts) pushes each template's catalog through
// createClientImportPreview -- the same validation a customer's own CSV gets -- and throws
// if it does not come back clean. These checks cover the template DATA those imports are
// generated from.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { shopBusinessTemplates, shopBusinessTemplate, shopBusinessTemplateCatalogCsv } from './business-templates.ts'
      export { createClientImportPreview } from '../../core/client-onboarding.ts'
    `,
    resolveDir: 'showroom/src/products/shop',
    sourcefile: 'showroom/src/products/shop/templates-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { shopBusinessTemplates, shopBusinessTemplate, shopBusinessTemplateCatalogCsv, createClientImportPreview } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

check(shopBusinessTemplates.length >= 7, `at least the seven shipped templates are present, got ${shopBusinessTemplates.length}`)
check(
  new Set(shopBusinessTemplates.map((template) => template.id)).size === shopBusinessTemplates.length,
  'template ids are unique, so selecting one cannot be ambiguous',
)

const MYANMAR = /[က-႟ꩠ-ꩿꧠ-꧿]/

for (const template of shopBusinessTemplates) {
  const where = `template "${template.id}"`

  // The picker shows "English · Myanmar". A missing or Latin-only Myanmar name silently
  // degrades the bilingual promise for the shopkeeper actually reading the screen.
  check(Boolean(template.name?.en?.trim()), `${where} has an English name`)
  check(MYANMAR.test(template.name?.my ?? ''), `${where} has a genuinely Myanmar-script name, not a Latin placeholder`)

  check(shopBusinessTemplate(template.id) === template, `${where} is retrievable by its own id`)

  // --- catalog ---------------------------------------------------------------
  check(template.catalog.length > 0, `${where} ships a non-empty catalog`)
  const skus = template.catalog.map((item) => item.sku)
  check(new Set(skus).size === skus.length, `${where} has no duplicate SKUs -- a duplicate makes stock ambiguous at the counter`)

  for (const item of template.catalog) {
    const what = `${where} item ${item.sku}`
    // Deliberately permissive about the alphabet -- real SKUs carry decimals and slashes
    // (WIRE-2.5MM is 2.5mm wire, not a typo). What matters is that the code survives a
    // CSV round trip and a barcode scan: no whitespace, quotes, commas, or control chars.
    check(item.sku === item.sku.trim() && item.sku.length > 0, `${what} SKU is non-empty and untrimmed of surprises`)
    check(!/[\s",\r\n]/.test(item.sku), `${what} SKU survives a CSV round trip (no whitespace, quotes, or commas)`)
    check(item.sku === item.sku.toUpperCase(), `${what} SKU is uppercase, so scanning is case-stable`)
    check(Boolean(item.name?.trim()), `${what} has a name`)
    check(Number.isSafeInteger(item.priceMmk) && item.priceMmk > 0, `${what} has a positive whole-MMK price`)
    check(Number.isSafeInteger(item.costMmk) && item.costMmk >= 0, `${what} has a non-negative whole-MMK cost`)
    // Selling below cost on every unit of a starter catalog is a data error, not a strategy.
    check(item.priceMmk >= item.costMmk, `${what} is not priced below its own cost (${item.priceMmk} < ${item.costMmk})`)
    check(Number.isSafeInteger(item.openingStock) && item.openingStock >= 0, `${what} has non-negative opening stock`)
    check(Number.isSafeInteger(item.reorderAt) && item.reorderAt >= 0, `${what} has a non-negative reorder point`)
  }

  // Every template opens with EXACTLY ONE item at or below its reorder point. All seven
  // do this, which makes it a deliberate demonstration of the low-stock alert rather than
  // a data slip -- the shopkeeper sees the feature working on their first screen. Pinned
  // in both directions: a template that loses its demo item shows a dead feature, and one
  // that gains a second buries the counter in warnings before anything has been sold.
  const lowStock = template.catalog.filter((item) => item.openingStock <= item.reorderAt)
  check(
    lowStock.length === 1,
    `${where} opens with exactly one item below its reorder point, got ${lowStock.length}${lowStock.length ? ` (${lowStock.map((item) => item.sku).join(', ')})` : ''}`,
  )

  // --- sample transactions reference the catalog they ship with ---------------
  const catalogSkus = new Set(skus)
  for (const sale of template.counterSales) {
    for (const line of sale.lines) {
      check(catalogSkus.has(line.sku), `${where} counter sale references ${line.sku}, which is in its own catalog`)
      check(Number.isSafeInteger(line.quantity) && line.quantity > 0, `${where} counter sale line for ${line.sku} has a positive quantity`)
    }
  }
  for (const line of template.pendingOrder.lines) {
    check(catalogSkus.has(line.sku), `${where} pending order references ${line.sku}, which is in its own catalog`)
    check(Number.isSafeInteger(line.quantity) && line.quantity > 0, `${where} pending order line for ${line.sku} has a positive quantity`)
  }

  // Every sample sale must be sellable from opening stock, or the seeded workspace
  // contradicts itself the moment it loads.
  const demand = new Map()
  for (const sale of template.counterSales) {
    for (const line of sale.lines) demand.set(line.sku, (demand.get(line.sku) ?? 0) + line.quantity)
  }
  for (const line of template.pendingOrder.lines) {
    demand.set(line.sku, (demand.get(line.sku) ?? 0) + line.quantity)
  }
  for (const [sku, wanted] of demand) {
    const item = template.catalog.find((candidate) => candidate.sku === sku)
    check(item.openingStock >= wanted, `${where} opens with enough ${sku} to cover its own samples (${item.openingStock} < ${wanted})`)
  }
}

// --- every template must survive the REAL provisioning path ------------------
// core/product-onboarding-runtime.ts does not install a template's catalog directly.
// It renders the template to CSV and pushes it through createClientImportPreview --
// the same validator a shopkeeper's own spreadsheet goes through -- and throws if any
// row comes back less than 'ready'. Well-formed data is not sufficient: a name holding
// a comma or an unrecognised unit passes every check above and still fails here, which
// is exactly the failure a customer would hit in their first minute.
for (const template of shopBusinessTemplates) {
  const csv = shopBusinessTemplateCatalogCsv(template.id)
  const preview = await createClientImportPreview(
    csv,
    'commerce',
    undefined,
    `sample-${template.id}.csv`,
    template.workflowTemplateId,
  )
  const notReady = preview.rows.filter((row) => row.status !== 'ready')
  check(
    preview.readyForStaging,
    `template "${template.id}" CSV is ready for staging (issues: ${JSON.stringify(preview.fileIssues ?? []).slice(0, 160)})`,
  )
  check(
    notReady.length === 0,
    `template "${template.id}" has every row importable, ${notReady.length} were not (${notReady.slice(0, 3).map((row) => JSON.stringify(row.issues ?? row.status)).join('; ').slice(0, 200)})`,
  )
  check(
    preview.rows.length === template.catalog.length,
    `template "${template.id}" round-trips every catalog item through CSV (${preview.rows.length} of ${template.catalog.length})`,
  )
  // The prices that come back out are what the counter will actually charge.
  for (const row of preview.rows) {
    const source = template.catalog.find((item) => item.sku === row.values.sku)
    check(Boolean(source), `template "${template.id}" CSV row ${row.values.sku} corresponds to a catalog item`)
    check(
      Number(row.values.price) === source.priceMmk,
      `template "${template.id}" item ${row.values.sku} keeps its price through the CSV round trip`,
    )
    check(
      Number(row.values.onHand) === source.openingStock,
      `template "${template.id}" item ${row.values.sku} keeps its opening stock through the CSV round trip`,
    )
  }
}

// --- the generated CSV must quote its one free-text column -------------------
// item_name was interpolated raw. No shipped name contains a comma, so this was
// latent rather than broken -- but a name like "Front brake pad set, ceramic" would
// have split into two columns and failed the entire template's provisioning. Asserting
// the quoting directly, so the protection does not depend on nobody ever adding a comma.
for (const template of shopBusinessTemplates) {
  const [header, ...rows] = shopBusinessTemplateCatalogCsv(template.id).trim().split('\r\n')
  check(header === 'sku,item_name,opening_stock,reorder_at,price_mmk', `template "${template.id}" CSV header is the expected contract`)
  for (const row of rows) {
    check(
      /^[^,]+,"(?:[^"]|"")*",\d+,\d+,\d+$/.test(row),
      `template "${template.id}" CSV row quotes its item name: ${row.slice(0, 70)}`,
    )
  }
}

console.log(`shop business templates: ${checks} checks passed across ${shopBusinessTemplates.length} templates`)
