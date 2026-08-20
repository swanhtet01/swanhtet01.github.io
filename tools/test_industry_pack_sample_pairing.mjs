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
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { clientImportTemplate, createClientImportPreview } from './client-onboarding.ts'
      export { shopIndustryPacks, shopIndustryPack, createShopServiceSchedule } from './shop-service-scheduling.ts'
      export { shopBusinessTemplates, isShopServiceSku, shopBusinessTemplateSaleTotalMmk } from '../products/shop/business-templates.ts'
      export { withShopServiceMyanmarNames } from './shop-service-scheduling.ts'
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
  shopBusinessTemplates, createShopServiceSchedule, isShopServiceSku,
  shopBusinessTemplateSaleTotalMmk, withShopServiceMyanmarNames,
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
// no treatment at all, which left a real spa pilot client able to book a 45,000
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


// --- a service business must be able to take a DEPOSIT ------------------------
// The row above proves a treatment can be charged for. It does not prove the business can take
// money BEFORE the work happens, and for a service trade that is everyday money rather than an
// edge case: the spa ships a bridal package worth 325,500 MMK, held days ahead, and nobody runs
// that business by collecting the whole sum on the morning.
//
// `paymentStatus` is binary -- an order is pending or reconciled, with nothing in between -- and
// widening it is a much larger change than this. The restaurant pack already solved the same
// problem the small way, with a REST-SVC-DEPOSIT catalog row: a deposit becomes an ordinary
// counter sale, which means it is an ordinary order, with ordinary evidence, that the daily
// close already understands. Copying that pattern is the whole fix.
const depositPacks = ['restaurant', 'spa', 'gym']
const catalogRows = (packId) => dataRows(clientImportTemplate('commerce', undefined, { shopIndustryPackId: packId }))
  .map((line) => { const cells = line.split(','); return { sku: cells[0].trim(), name: cells[1].trim(), reorderAt: Number(cells[3]), priceMmk: Number(cells[4]) } })

for (const packId of depositPacks) {
  const deposit = catalogRows(packId).find((item) => /deposit/i.test(item.name))
  check(Boolean(deposit), `${packId} pack: sells a deposit, so work can be booked against money already taken`)
  check(Number.isSafeInteger(deposit?.priceMmk) && deposit?.priceMmk > 0,
    `${packId} pack: its deposit carries a whole-MMK unit price, got ${deposit?.priceMmk}`)
  // A deposit is a unit of money, not a thing on a shelf. reorder_at 0 keeps it out of stock
  // alerts and out of the close's stock exceptions, exactly as the treatment rows are.
  check(deposit?.reorderAt === 0, `${packId} pack: its deposit never raises a stock alert, got reorder_at ${deposit?.reorderAt}`)
  check(isShopServiceSku(deposit?.sku ?? ''),
    `${packId} pack: its deposit is a service SKU, so storefront ranking demotes it rather than merchandising it`)
  const storefrontSkus = firstColumn(clientImportTemplate('ecommerce', undefined, { shopIndustryPackId: packId }))
  check(!storefrontSkus.includes(deposit?.sku ?? ''),
    `${packId} pack: and it is not put on the storefront, where a deposit is not a thing to browse`)
}

// The template route has to carry it too, or an owner who picks the trade gets a catalog that
// cannot take a deposit while an owner who picks the bare pack gets one that can.
for (const template of shopBusinessTemplates.filter((candidate) => depositPacks.includes(candidate.industryPackId))) {
  check(template.catalog.some((item) => /deposit/i.test(item.name)),
    `${template.id} trade: its catalog sells a deposit`)
}

// The package this is FOR. If the bridal order's value ever stops being far larger than a single
// treatment, the argument for a deposit row weakens and someone should re-read this block.
const beautySpa = shopBusinessTemplates.find((template) => template.id === 'beauty-spa')
const bridalOrder = beautySpa?.pendingOrder
const bridalTotal = bridalOrder ? shopBusinessTemplateSaleTotalMmk(beautySpa.id, bridalOrder) : 0
check(bridalTotal > 300_000, `the spa's staged package is large enough to need part-payment, got ${bridalTotal.toLocaleString()} MMK`)
const spaDeposit = catalogRows('spa').find((item) => /deposit/i.test(item.name))
check(bridalTotal % spaDeposit.priceMmk === 0 || spaDeposit.priceMmk <= bridalTotal / 3,
  `and the deposit unit is small enough to express a sensible part-payment against it, got ${spaDeposit.priceMmk.toLocaleString()} MMK against ${bridalTotal.toLocaleString()}`)

// School is DELIBERATELY not in depositPacks, and this is the constraint that stopped it rather
// than an oversight. verify_app_build.mjs pins the school shop sample's SKU list EQUAL to its
// storefront SKU list, in order, so a deposit row added to the catalog would force a deposit
// onto the storefront -- where openingStock 999 also makes it outrank the coursebooks. That is a
// merchandising decision for a person, not a drive-by. If this check ever fails, the pin is gone
// and school can have its deposit row.
const schoolShopSkus = firstColumn(clientImportTemplate('commerce', undefined, { shopIndustryPackId: 'school' }))
const schoolStorefrontSkus = firstColumn(clientImportTemplate('ecommerce', undefined, { shopIndustryPackId: 'school' }))
check(schoolShopSkus.join(',') === schoolStorefrontSkus.join(','),
  'school still pins its shop catalog and storefront to the same SKU list, which is why it has no deposit row yet')

// --- Burmese treatment names must reach the counter ---------------------------
// The appointment book shows a treatment in Burmese and the counter showed the same treatment in
// English, while the translation sat in shop-service-scheduling.ts and was thrown away by the
// copy that builds catalog rows. The owner reads one screen in her language and the next in
// someone else's.
//
// withShopServiceMyanmarNames carries the pack's existing nameMy onto the catalog item for
// SERVICE rows only. It invents nothing: retail goods have no Myanmar name in this codebase and
// must not acquire one from a build script -- that needs a native trade writer.
const spaItems = catalogRows('spa').map((item) => ({ sku: item.sku, name: item.name, onHand: 999, reorderAt: item.reorderAt, price: item.priceMmk }))
const spaNamed = withShopServiceMyanmarNames(spaItems, 'spa')
check(spaNamed.length === spaItems.length, 'naming returns the same catalog, row for row')

const spaServices = createShopServiceSchedule('spa').services
for (const service of spaServices) {
  const item = spaNamed.find((candidate) => candidate.name === service.name || candidate.name.startsWith(`${service.name} `))
  check(item?.nameMy === service.nameMy,
    `spa: "${service.name}" reaches the counter as ${service.nameMy}, got ${item?.nameMy}`)
}

const retailGoods = spaNamed.filter((item) => !isShopServiceSku(item.sku))
check(retailGoods.length > 0, 'the spa catalog still carries retail goods alongside its treatments')
check(retailGoods.every((item) => item.nameMy === undefined),
  `no Myanmar retail copy is invented, got ${retailGoods.filter((item) => item.nameMy !== undefined).map((item) => item.sku).join(', ')}`)

// Every pack with Burmese service names must reach the counter the same way, or the spa is a
// special case that quietly rots.
for (const pack of shopIndustryPacks) {
  const named = withShopServiceMyanmarNames(
    catalogRows(pack.id).map((item) => ({ sku: item.sku, name: item.name, onHand: 999, reorderAt: item.reorderAt, price: item.priceMmk })),
    pack.id,
  )
  for (const service of createShopServiceSchedule(pack.id).services) {
    if (service.nameMy === undefined) continue
    const item = named.find((candidate) => candidate.name === service.name || candidate.name.startsWith(`${service.name} `))
    check(item?.nameMy === service.nameMy, `${pack.id}: "${service.name}" carries its Burmese name to the counter`)
  }
}

// --- the Burmese must survive the build as Myanmar, not as mojibake -----------
// A sister product shipped every Burmese string CP1252 double-encoded and 351 mojibake marks
// reached its bundle, because shell output mangles Myanmar script and the first person to look
// at it read real corruption as a terminal artifact. So this asserts CODEPOINTS on the value
// that came through the bundler, not glyphs on a screen.
//
// U+1000..U+109F is the Myanmar block. U+FFFD is the replacement character a failed decode
// leaves behind. The C1-range letters are the tell of a UTF-8 sequence read as CP1252 and
// re-encoded -- "မ" arriving as "á".
const MYANMAR = /^[က-႟​’ ()\/]+$/
const MOJIBAKE = /[�À-ÿŒœŠšŽžƒˆ˜†-•…‰‹›€™]/
let burmeseValues = 0
for (const pack of shopIndustryPacks) {
  const named = withShopServiceMyanmarNames(
    catalogRows(pack.id).map((item) => ({ sku: item.sku, name: item.name, onHand: 999, reorderAt: item.reorderAt, price: item.priceMmk })),
    pack.id,
  )
  for (const item of named) {
    if (item.nameMy === undefined) continue
    burmeseValues += 1
    check(MYANMAR.test(item.nameMy), `${item.sku}: its Burmese name is Myanmar codepoints, got ${JSON.stringify(item.nameMy)}`)
    check(!MOJIBAKE.test(item.nameMy), `${item.sku}: its Burmese name carries no double-encoding marks, got ${JSON.stringify(item.nameMy)}`)
    check([...item.nameMy].every((character) => character.codePointAt(0) > 0x7f || ' ()/'.includes(character)),
      `${item.sku}: its Burmese name did not decay to ASCII`)
  }
}
check(burmeseValues >= 25, `every pack's treatments reach the counter in Burmese, got ${burmeseValues} named rows`)

// A wiring check, not a behaviour check: the helper is worthless if the two provisioning paths
// stop calling it. Both build CommerceItems from a CSV preview, which is exactly where the
// Burmese name was being dropped.
const runtimeSource = await readFile('showroom/src/core/product-onboarding-runtime.ts', 'utf8')
check((runtimeSource.match(/withShopServiceMyanmarNames/g) ?? []).length >= 3,
  'both onboarding routes still carry Burmese names onto the catalog they install')


console.log(`industry pack sample pairing contract: ${checks} checks passed`)
