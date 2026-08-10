// Guard: detecting a shop's trade must stay silent whenever it is not certain.
//
// The website setup screen opens on the trade this device's Shop was set up as, so the owner
// is not asked a question they already answered. The cost of that convenience is that a WRONG
// detection silently rewrites a business's public wording -- a hardware supplier opening on
// pharmacy copy, with no error anywhere to say why.
//
// So the contract is deliberately lopsided: return the trade only when it is unambiguous, and
// return null for everything else. Falling back to the picker is a small cost. Guessing is
// not. Every case below is a way the answer can be uncertain in the field.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { readLocalShopBusinessTemplateId } from './product-onboarding-runtime.ts'
      export {
        createSeedCommerce, installCommerceWorkingSampleCatalog, commerceWorkingSampleCatalogId,
      } from './commerce-workspace.ts'
      export {
        shopBusinessTemplates, shopBusinessTemplateCommerceItems,
      } from '../products/shop/business-templates.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/trade-detection-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  readLocalShopBusinessTemplateId, createSeedCommerce, installCommerceWorkingSampleCatalog,
  commerceWorkingSampleCatalogId, shopBusinessTemplates, shopBusinessTemplateCommerceItems,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// The key the workspace persists under. Read from the module's own behaviour rather than
// hardcoded, so renaming the key cannot make this file quietly test nothing.
const CAPTURED_AT = '2026-07-25T08:00:00.000Z'

function fakeStore(entries = {}) {
  const map = new Map(Object.entries(entries))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value) },
    removeItem: (key) => { map.delete(key) },
    map,
  }
}

// Install a business template's catalog the way onboarding does, then discover which key the
// workspace writes to by writing through a recording store.
function storeWithTemplate(templateId) {
  const template = shopBusinessTemplates.find((candidate) => candidate.id === templateId)
  const installed = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
    sampleId: template.id,
    sampleName: template.name.en,
    items: shopBusinessTemplateCommerceItems(template.id),
    capturedAt: CAPTURED_AT,
  })
  assert.ok(installed, `${templateId}: the template catalog installs`)
  return installed
}

// Discover the storage key by capturing what loadCommerceWorkspace reads.
const probe = { reads: [], getItem(key) { this.reads.push(key); return null }, setItem() {}, removeItem() {} }
readLocalShopBusinessTemplateId(probe)
check(probe.reads.length > 0, 'detection reads from the store it is given rather than from a global')
const COMMERCE_KEY = probe.reads[0]
check(
  typeof COMMERCE_KEY === 'string' && COMMERCE_KEY.length > 0,
  `and the key it reads is discoverable, got ${JSON.stringify(COMMERCE_KEY)}`,
)

// --- the certain case ----------------------------------------------------------
// Every trade must round-trip: install it, detect it, get the same id back.
for (const template of shopBusinessTemplates) {
  const state = storeWithTemplate(template.id)
  check(
    commerceWorkingSampleCatalogId(state) === template.id,
    `${template.id}: the installed catalog records the trade`,
  )
  const store = fakeStore({ [COMMERCE_KEY]: JSON.stringify(state) })
  check(
    readLocalShopBusinessTemplateId(store) === template.id,
    `THE SEAM HOLDS for ${template.id}: the website screen can tell what trade the Shop is`,
  )
}

// --- every way the answer can be uncertain ------------------------------------
check(
  readLocalShopBusinessTemplateId(fakeStore()) === null,
  'a device with no Shop data yet detects nothing -- a new owner is asked, not guessed at',
)

check(
  readLocalShopBusinessTemplateId(fakeStore({ [COMMERCE_KEY]: JSON.stringify(createSeedCommerce()) })) === null,
  'the plain demo seed detects nothing -- it is not a trade the owner chose',
)

check(
  readLocalShopBusinessTemplateId(fakeStore({ [COMMERCE_KEY]: '{not valid json' })) === null,
  'malformed stored data detects nothing rather than throwing into the setup screen',
)

check(
  readLocalShopBusinessTemplateId(fakeStore({ [COMMERCE_KEY]: JSON.stringify({ schema: 'wrong' }) })) === null,
  'data that is valid JSON but not a commerce workspace detects nothing',
)

check(
  readLocalShopBusinessTemplateId(fakeStore({ [COMMERCE_KEY]: 'null' })) === null,
  'a stored null detects nothing',
)

// A store that throws on read is a real browser condition: storage disabled, quota errors,
// or a cross-origin frame. The setup screen must still open.
const hostileStore = {
  getItem() { throw new Error('storage is blocked') },
  setItem() { throw new Error('storage is blocked') },
  removeItem() { throw new Error('storage is blocked') },
}
check(
  readLocalShopBusinessTemplateId(hostileStore) === null,
  'a store that throws on every read detects nothing instead of breaking the screen',
)

// --- two samples installed is ambiguous, and must stay ambiguous --------------
// An owner who tried one template and then another has two sets of baselines. There is no
// right answer, so there must be no answer.
const first = storeWithTemplate('pharmacy')
const both = installCommerceWorkingSampleCatalog(first, {
  sampleId: 'hardware',
  sampleName: 'Hardware & construction supply',
  items: shopBusinessTemplateCommerceItems('hardware'),
  capturedAt: '2026-07-26T08:00:00.000Z',
})
if (both && commerceWorkingSampleCatalogId(both) === null) {
  check(
    readLocalShopBusinessTemplateId(fakeStore({ [COMMERCE_KEY]: JSON.stringify(both) })) === null,
    'a device carrying two installed samples detects nothing -- there is no right answer, so none is given',
  )
} else {
  // This is the branch that actually runs today, and it is worth stating plainly rather than
  // leaving as a silent fallback: installing a second sample REPLACES the first outright, so
  // the workspace never holds two. Verified by running it -- the second install returns a
  // state whose only sample id is the second one.
  //
  // That makes the ambiguous case unreachable, which is a stronger guarantee than handling
  // it would be. The branch above stays because it is the behaviour we want if replacement
  // ever becomes accumulation.
  check(
    commerceWorkingSampleCatalogId(both) === 'hardware',
    'installing a second sample replaces the first rather than accumulating, so the ambiguous state cannot arise',
  )
  check(
    readLocalShopBusinessTemplateId(fakeStore({ [COMMERCE_KEY]: JSON.stringify(both) })) === 'hardware',
    'and detection follows the replacement -- an owner who switched trade gets the trade they switched to',
  )
}

// --- detection never returns a trade Shop does not offer ----------------------
// The first version of this check hand-edited the stored action ids and asserted null. It
// passed, but for the wrong reason: the edited state failed validateCommerceState and was
// rejected before the trade lookup was ever reached, so the lookup itself was untested.
// Found by deleting the lookup and watching this file stay green.
//
// So the fixture is now built the legitimate way -- the workspace itself will happily record
// a sample id that is not one of Shop's trades, which is exactly the state that must not be
// trusted downstream.
const notATrade = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
  sampleId: 'crypto-exchange',
  sampleName: 'Not a Shop trade',
  items: shopBusinessTemplateCommerceItems('fashion'),
  capturedAt: CAPTURED_AT,
})
check(Boolean(notATrade), 'the workspace accepts a working sample whose id is not a Shop trade')
check(
  commerceWorkingSampleCatalogId(notATrade) === 'crypto-exchange',
  'and records that id verbatim -- so the state below is genuinely reachable, not contrived',
)
check(
  readLocalShopBusinessTemplateId(fakeStore({ [COMMERCE_KEY]: JSON.stringify(notATrade) })) === null,
  'but detection refuses it -- only a trade Shop actually offers is ever returned',
)

// --- two guards that are redundant today, recorded rather than dressed up -----
// Mutation testing showed that deleting either the `snapshot.error` early return or the
// surrounding try/catch leaves this file green, and it is more useful to say why than to
// invent a fixture that pretends otherwise:
//
//   - loadCommerceWorkspace already returns an EMPTY commerce state on every failure path,
//     and an empty state has no working-sample id, so the error check cannot change the
//     answer. It would start mattering the moment a failure path returned partial data.
//   - loadCommerceWorkspace catches its own storage exceptions, and both functions called
//     after it are total. So the try/catch has nothing left to catch -- it defends against a
//     future where one of them throws.
//
// Both stay: they are free, and each becomes load-bearing under a plausible change. What is
// not acceptable is a comment claiming they are tested when they are not.

console.log(`website trade detection contract: ${checks} checks passed`)
