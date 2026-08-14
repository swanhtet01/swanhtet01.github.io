// Contract guard for the storefront selection reconciliation.
//
// A shop picks which catalog items appear on its public storefront, and that choice is saved
// separately from the catalog itself. When the two drift -- a product is deleted, renamed, or
// its SKU changes -- the storefront must stop offering the item AND say that it did.
//
// Silently dropping it is the dangerous half. A shopkeeper who is never told would keep
// believing the item is listed; a customer request for it would simply never arrive. So the
// reconciliation returns a PARTITION: every saved SKU comes back in exactly one of the two
// lists, nothing is lost and nothing is invented.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      reconcileStorefrontSelection, storefrontDraftStorageKey, legacyStorefrontDraftStorageKey,
      STOREFRONT_DRAFT_KEY_PREFIX,
    } from './storefront-draft.ts'`,
    resolveDir: 'showroom/src/products/ecommerce',
    sourcefile: 'showroom/src/products/ecommerce/storefront-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  reconcileStorefrontSelection, storefrontDraftStorageKey, legacyStorefrontDraftStorageKey,
  STOREFRONT_DRAFT_KEY_PREFIX,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}
function rejects(run, label) {
  checks += 1
  assert.throws(run, undefined, label)
}

// --- the partition invariant --------------------------------------------------
const saved = ['SM-1001', 'SM-1002', 'SM-1003']
const catalog = ['SM-1001', 'SM-1003', 'SM-9999']

const result = reconcileStorefrontSelection(saved, catalog)
check(result.selectedSkus.length === 2, 'the two SKUs still in the catalog are kept')
check(result.selectedSkus.includes('SM-1001') && result.selectedSkus.includes('SM-1003'), 'and they are the right two')
check(result.missingSkus.length === 1, 'the one that left the catalog is reported')
check(result.missingSkus[0] === 'SM-1002', 'by name, so the shopkeeper can see what stopped being listed')

check(
  result.selectedSkus.length + result.missingSkus.length === saved.length,
  'every saved SKU lands in exactly one list -- the result is a PARTITION, nothing is dropped',
)
check(
  [...result.selectedSkus, ...result.missingSkus].every((sku) => saved.includes(sku)),
  'and nothing is invented that was not in the saved selection',
)
check(
  !result.selectedSkus.some((sku) => result.missingSkus.includes(sku)),
  'the two lists do not overlap',
)

// A catalog item the shop never selected must not be added to the storefront by reconciling.
check(
  !result.selectedSkus.includes('SM-9999'),
  'a catalog SKU that was never selected is NOT silently added to the storefront',
)

// --- the boundary cases -------------------------------------------------------
const allGone = reconcileStorefrontSelection(['SM-1001'], ['SM-2002'])
check(allGone.selectedSkus.length === 0, 'when nothing survives, the selection empties')
check(allGone.missingSkus.length === 1, 'and every removal is still reported')

const allKept = reconcileStorefrontSelection(['SM-1001'], ['SM-1001', 'SM-1002'])
check(allKept.selectedSkus.length === 1, 'when everything survives, the selection is unchanged')
check(allKept.missingSkus.length === 0, 'and nothing is reported missing')

// A storefront selection is bounded at 1..8 items, so an empty or oversized saved selection
// is not a state the product can reach -- it is refused rather than reconciled. I asserted
// the opposite first; this is what the contract actually says.
rejects(() => reconcileStorefrontSelection([], ['SM-1001']), 'an empty saved selection is refused, not reconciled to empty')
rejects(
  () => reconcileStorefrontSelection(Array.from({ length: 9 }, (_, i) => `SM-${1000 + i}`), ['SM-1000']),
  'a saved selection beyond the supported size is refused',
)

// --- the authoritative catalog has to be trustworthy -------------------------
rejects(() => reconcileStorefrontSelection(saved, 'not an array'), 'a non-array catalog is refused')
rejects(
  () => reconcileStorefrontSelection(saved, ['SM-1001', 'SM-1001']),
  'a catalog with duplicate SKUs is refused -- it cannot be authoritative if it contradicts itself',
)
rejects(
  () => reconcileStorefrontSelection(saved, Array.from({ length: 101 }, (_, index) => `SM-${index}`)),
  'a catalog beyond the supported size is refused rather than truncated',
)
rejects(() => reconcileStorefrontSelection(saved, ['']), 'a blank catalog SKU is refused')

// --- storage keys are scoped per workspace -----------------------------------
// Two shops on one device must not share a storefront draft.
const shopA = storefrontDraftStorageKey('shop-a')
const shopB = storefrontDraftStorageKey('shop-b')
check(shopA !== shopB, 'two workspaces get different storefront draft keys')
check(shopA.startsWith(STOREFRONT_DRAFT_KEY_PREFIX), 'and both sit under the registered v2 prefix')
check(shopB.startsWith(STOREFRONT_DRAFT_KEY_PREFIX), 'so the workspace registry recognises them for backup and reset')
check(
  legacyStorefrontDraftStorageKey('shop-a') !== shopA,
  'the legacy v1 key is distinct from the v2 key, so a migration cannot read its own output',
)

// A scope containing characters that would break a key must not silently collide.
const awkward = storefrontDraftStorageKey('shop/a b')
check(awkward !== storefrontDraftStorageKey('shop/a-b'), 'scopes that differ produce different keys even when awkward')
check(!/[\s]/.test(awkward), 'and the resulting key carries no raw whitespace')

console.log(`storefront reconciliation contract: ${checks} checks passed`)
