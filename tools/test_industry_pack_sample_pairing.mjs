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
      export { clientImportTemplate } from './client-onboarding.ts'
      export { shopIndustryPacks } from './shop-service-scheduling.ts'
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

const { clientImportTemplate, shopIndustryPacks } =
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

console.log(`industry pack sample pairing contract: ${checks} checks passed`)
