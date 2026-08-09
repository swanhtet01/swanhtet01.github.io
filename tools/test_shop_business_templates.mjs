// Contract guard for the Shop business templates -- the "pick your shop type and start
// selling" path. Seven bilingual Myanmar templates ship today, and a customer meets one
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
      export { shopBusinessTemplates, shopBusinessTemplate } from './business-templates.ts'
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

const { shopBusinessTemplates, shopBusinessTemplate } = await import(
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

console.log(`shop business templates: ${checks} checks passed across ${shopBusinessTemplates.length} templates`)
