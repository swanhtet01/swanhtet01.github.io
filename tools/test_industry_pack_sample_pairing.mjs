// Guard: each industry pack's storefront sample must reference its own shop catalog.
//
// Onboarding installs a PAIR for the chosen shop industry pack: a Shop catalog sample and an
// Ecommerce merchandising sample. The Ecommerce side lists SKUs, and the product's own stated
// boundary is "Every SKU must match the current Shop catalog before a storefront draft can be
// approved." So if the two CSVs drift -- someone renames a SKU in one and not the other -- that
// industry's storefront cannot be approved, and nothing says so until an owner tries.
//
// Nothing checked this pairing. It is cheap to check and silent when it breaks, which is the
// worst combination.
//
// Scope note, so this is not read as more than it is: the GENERIC downloadable templates
// (social-storefront, pickup-preorder, wholesale-request) are deliberately excluded. Those are
// blank-ish files an owner fills with their own data, and their illustrative SKUs -- COFFEE-250,
// MENU-MOHINGA -- intentionally match no shipped catalog. Only the industry-pack pairing that
// onboarding actually installs is asserted here.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { clientImportTemplate, createClientImportPreview } from './client-onboarding.ts'
      export { shopIndustryPacks, shopIndustryPack, createShopServiceSchedule } from './shop-service-scheduling.ts'
      export { shopBusinessTemplates } from '../products/shop/business-templates.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/pack-pairing-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  clientImportTemplate, createClientImportPreview, shopIndustryPacks, shopIndustryPack,
  shopBusinessTemplates, createShopServiceSchedule,
} =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const dataRows = (csv) => csv.split(/\r?\n/).slice(1).filter(Boolean)
const firstColumn = (csv) => dataRows(csv).map((line) => line.split(',')[0].trim()).filter(Boolean)

check(shopIndustryPacks.length >= 6, `Shop ships at least six industry packs, got ${shopIndustryPacks.length}`)

for (const pack of shopIndustryPacks) {
  const shopCsv = clientImportTemplate('commerce', undefined, { shopIndustryPackId: pack.id })
  const ecommerceCsv = clientImportTemplate('ecommerce', undefined, { shopIndustryPackId: pack.id })

  check(Boolean(shopCsv) && Boolean(ecommerceCsv), `${pack.id}: ships both a catalog and a storefront sample`)

  const catalogSkus = new Set(firstColumn(shopCsv))
  const storefrontSkus = firstColumn(ecommerceCsv)

  check(catalogSkus.size > 0, `${pack.id}: its catalog sample carries at least one SKU`)
  check(storefrontSkus.length > 0, `${pack.id}: its storefront sample carries at least one SKU`)

  const missing = storefrontSkus.filter((sku) => !catalogSkus.has(sku))
  check(
    missing.length === 0,
    `${pack.id}: THE PAIR HOLDS -- every storefront SKU is in its own catalog, missing ${missing.join(', ')}`,
  )

  // The samples must actually be about this industry rather than a shared placeholder set,
  // otherwise the pairing could hold while every pack sold the same two things.
  check(
    storefrontSkus.every((sku) => /^[A-Z0-9][A-Z0-9-]*$/.test(sku)),
    `${pack.id}: its storefront SKUs are canonical identifiers, got ${storefrontSkus.join(', ')}`,
  )
}

// If two packs shipped identical catalogs the pairing above would still pass while the packs
// were indistinguishable -- the same failure the Plant pack guard protects against.
const catalogSignatures = shopIndustryPacks.map((pack) => (
  firstColumn(clientImportTemplate('commerce', undefined, { shopIndustryPackId: pack.id })).sort().join('|')
))
check(
  new Set(catalogSignatures).size === shopIndustryPacks.length,
  `each industry pack ships its own catalog -- ${new Set(catalogSignatures).size} distinct across ${shopIndustryPacks.length} packs`,
)

// --- every trade template must point at things that exist ---------------------
// A business template names an industryPackId and a workflowTemplateId. Either one pointing
// at something that does not resolve breaks onboarding for that trade only, which is the kind
// of failure that ships because six other trades still work.
const packIds = new Set(shopIndustryPacks.map((pack) => pack.id))
for (const template of shopBusinessTemplates) {
  check(
    packIds.has(template.industryPackId),
    `${template.id}: its industry pack ${template.industryPackId} exists`,
  )
  let resolved = true
  try { shopIndustryPack(template.industryPackId) } catch { resolved = false }
  check(resolved, `${template.id}: and resolves through shopIndustryPack()`)

  let workflowResolved = true
  try { clientImportTemplate('commerce', template.workflowTemplateId) } catch { workflowResolved = false }
  check(workflowResolved, `${template.id}: its workflow template ${template.workflowTemplateId} resolves to a catalog CSV`)
}

// Packs with no trade template are NOT a failure -- restaurant, spa, gym and school are
// reached through the generic industry-pack sample instead. What would be a failure is that
// fallback not importing, because then those owners have no path at all.
const orphanPacks = shopIndustryPacks.filter((pack) => (
  !shopBusinessTemplates.some((template) => template.industryPackId === pack.id)
))
for (const pack of orphanPacks) {
  const csv = clientImportTemplate('commerce', undefined, { shopIndustryPackId: pack.id })
  check(
    dataRows(csv).length > 0,
    `${pack.id}: has no trade template, so its fallback catalog sample must carry rows`,
  )
}

// --- a service business must be able to CHARGE for its service ----------------
// The appointment book records WHEN a treatment happens. It reaches no order, no daily close and
// no accounting handoff -- shop-service-scheduling.ts has zero references to commerce and
// commerce-workspace.ts has zero references to bookings, and expectedRevenueMmk is a display
// projection rather than a ledger entry. So the ONLY way a spa, gym or school takes money today
// is the counter, and that means every service it books must also exist as a catalog item at the
// same price.
//
// This is not hypothetical. The spa catalog briefly shipped massage oil and compress balls with
// no treatment at all, which left a real named client -- Sol Luxury Spa -- able to book a 45,000
// MMK massage and unable to charge for it.
//
// Matching on PRICE ALONE is not enough, and that is a correction to an earlier version of this
// guard: the fashion trade passed it while stocking no service at all, purely because a t-shirt
// happened to cost 15,000 MMK -- the same as "Personal shopping". A coincidence read as coverage.
// So each service must have its OWN catalog line: name matching the service and price equal to
// it. Both halves matter -- the name proves a dedicated item exists, the price proves the counter
// and the appointment book quote the same number.
const dedicatedItem = (catalog, service) => catalog.find((item) => (
  item.name === service.name || item.name.startsWith(`${service.name} `)
))

// Both onboarding routes are covered. An owner who picks only an industry pack gets the pack
// sample; an owner who picks a trade gets that template's catalog instead. A service chargeable
// on one route and not the other is the same defect, just harder to see.
for (const pack of shopIndustryPacks) {
  const catalog = dataRows(clientImportTemplate('commerce', undefined, { shopIndustryPackId: pack.id }))
    .map((line) => { const cells = line.split(','); return { name: cells[1].trim(), priceMmk: Number(cells[4]) } })
  for (const service of createShopServiceSchedule(pack.id).services) {
    const item = dedicatedItem(catalog, service)
    check(
      Boolean(item),
      `${pack.id} pack: "${service.name}" is bookable at ${service.priceMmk.toLocaleString()} MMK but no catalog item sells it -- it cannot be charged for`,
    )
    check(
      item?.priceMmk === service.priceMmk,
      `${pack.id} pack: "${service.name}" is booked at ${service.priceMmk.toLocaleString()} MMK but sold at ${item?.priceMmk?.toLocaleString()} -- the counter and the appointment book disagree`,
    )
  }
}

for (const template of shopBusinessTemplates) {
  for (const service of createShopServiceSchedule(template.industryPackId).services) {
    const item = dedicatedItem(template.catalog, service)
    check(
      Boolean(item),
      `${template.id} trade: "${service.name}" is bookable at ${service.priceMmk.toLocaleString()} MMK but the template catalog cannot sell it`,
    )
    check(
      item?.priceMmk === service.priceMmk,
      `${template.id} trade: "${service.name}" is booked at ${service.priceMmk.toLocaleString()} MMK but sold at ${item?.priceMmk?.toLocaleString()} -- the counter and the appointment book disagree`,
    )
  }
}

// --- the samples must survive the real import gate -----------------------------
// Everything above reads the sample CSVs as text. That would still pass if a row were malformed
// in a way the importer rejects -- a stray comma in a name, a column count that drifted -- and
// the owner would be stopped at the very first step with a file the product itself shipped.
// readyForStaging is precisely what buildClientImportStagingPackage demands before it will build
// anything, so it is the honest gate to assert.
for (const pack of shopIndustryPacks) {
  for (const [product, kind] of [['commerce', 'catalog'], ['ecommerce', 'storefront']]) {
    const csv = clientImportTemplate(product, undefined, { shopIndustryPackId: pack.id })
    let preview = null
    let failure = ''
    try { preview = await createClientImportPreview(csv, product, undefined, `${pack.id}-${kind}.csv`) }
    catch (error) { failure = error instanceof Error ? error.message : String(error) }
    check(Boolean(preview), `${pack.id}: its ${kind} sample previews without throwing${failure ? ` -- ${failure}` : ''}`)
    const unready = (preview?.rows ?? []).filter((row) => row.status !== 'ready')
    check(
      Boolean(preview?.readyForStaging) && unready.length === 0,
      `${pack.id}: its ${kind} sample is importable as shipped -- ${unready.map((row) => `${row.key}:${row.status}`).join(', ') || 'readyForStaging=false'}`,
    )
  }
}

console.log(`industry pack sample pairing contract: ${checks} checks passed`)
