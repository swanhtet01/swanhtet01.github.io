// Guard: a storefront leads with what the shop actually sells.
//
// Bookable services became catalog items so they could be CHARGED for at the counter -- an
// appointment reaches no order, so a service that is not a catalog item cannot be paid for at all.
// They carry openingStock 999 to mean "always available", not deep stock on a shelf.
//
// The Ecommerce working sample ranks by onHand, so those 999s won every slot: a tea shop's
// storefront led with "Catering consultation 30 min" and "Preorder collection 15 min" instead of
// tea. Measured across all 8 trades before the fix, 2 of 4 featured rows were service SKUs.
//
// The fix demotes services BEHIND real goods rather than excluding them, because a spa sells
// nothing but time and must still get a storefront. Both halves are asserted here -- excluding
// services outright would pass a naive "no services featured" check while breaking every service
// business, which is the same defect class this session has been clearing all day.
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { shopBusinessTemplates, shopBusinessTemplateCommerceItems, isShopServiceSku } from '../products/shop/business-templates.ts'
      export { createSeedCommerce, installCommerceWorkingSampleCatalog } from './commerce-workspace.ts'
      export { activateLocalEcommerceWorkingSample } from '../products/ecommerce/local-merchandising-import.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/storefront-rank-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  shopBusinessTemplates, shopBusinessTemplateCommerceItems, isShopServiceSku,
  createSeedCommerce, installCommerceWorkingSampleCatalog, activateLocalEcommerceWorkingSample,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function stubStorage() {
  const map = new Map()
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size },
  }
}
const locks = { request: async (name, _options, run) => run({ name }) }

async function storefrontSkus(catalog, businessName) {
  const storage = stubStorage()
  const result = await activateLocalEcommerceWorkingSample(
    { templateId: 'social-storefront', businessName, capturedAt: '2026-08-11T03:05:00.000Z' },
    { storage, locks, catalog },
  )
  if (!result?.ok) return { ok: false, error: result?.error ?? 'no result', skus: [] }
  const raw = [...storage.map.entries()].find(([key]) => key.includes('storefront_draft'))?.[1] ?? ''
  return { ok: true, error: '', skus: [...new Set([...String(raw).matchAll(/"sku":"([^"]+)"/g)].map((m) => m[1]))] }
}

// --- a trade that stocks goods must feature the goods ------------------------------
for (const template of shopBusinessTemplates) {
  const installed = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
    sampleId: template.id,
    sampleName: template.name.en,
    items: shopBusinessTemplateCommerceItems(template.id),
    capturedAt: '2026-08-11T03:00:00.000Z',
  })
  check(Boolean(installed), `${template.id}: its catalog installs`)

  const { ok, error, skus } = await storefrontSkus(installed.items, template.name.en)
  check(ok, `${template.id}: a storefront opens from its catalog -- ${error}`)
  check(skus.length > 0, `${template.id}: the storefront carries rows`)

  const services = skus.filter((sku) => isShopServiceSku(sku))
  check(
    services.length === 0,
    `${template.id}: STOCKS REAL GOODS BUT ITS STOREFRONT FEATURES BOOKABLE TIME -- ${services.join(', ')}. onHand 999 on a service means "always available", not best seller.`,
  )
}

// --- a business that sells only time must still get a storefront --------------------
// This is the half that stops the fix above from being "hide all services".
const servicesOnly = [
  { sku: 'SPA-SVC-MASSAGE', name: 'Traditional Myanmar massage 60 min', price: 45_000, onHand: 999, variant: 'Standard' },
  { sku: 'SPA-SVC-FACIAL', name: 'Facial treatment 45 min', price: 38_000, onHand: 999, variant: 'Standard' },
  { sku: 'SPA-SVC-STEAM', name: 'Herbal steam 30 min', price: 18_000, onHand: 999, variant: 'Standard' },
]
const spa = await storefrontSkus(servicesOnly, 'Sol Luxury Spa')
check(spa.ok, `a spa that sells only treatments still opens a storefront -- ${spa.error}`)
check(
  spa.skus.length > 0 && spa.skus.every((sku) => isShopServiceSku(sku)),
  `the spa storefront lists its treatments, got ${spa.skus.join(', ') || '(none)'}`,
)

console.log(`storefront merchandising rank contract: ${checks} checks passed`)
