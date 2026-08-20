// Shop onboarding must not tell a signed-in (managed) owner that a trade template installed.
//
// The defect this file locks out, measured end to end in
// hq/research/MANAGED-TEMPLATE-PROVISIONING.md: ProductOnboardingPage.startGuidedWorkspace ran
// the Shop provisioners for EVERY caller, managed or not. They succeeded -- disposition
// 'installed', zero fetch calls, one key written -- against window.localStorage, which a managed
// Shop never reads. The company workspace stayed at version 0 and rendered
// 'managed-unprovisioned', so the owner was told her spa/bakery/pharmacy catalog was ready and it
// was not. Uniform across all ten trade templates.
//
// The tell was an asymmetry inside one function: the ecommerce branch consults `managedIdentity`
// before running its local activator, the commerce branch never asked. Both branches must now
// agree, so this file asserts the guard on BOTH -- fixing one while the other regresses is the
// same bug again.
//
// Three things are checked, in the order they matter:
//
//   1. The commerce provisioning block in ProductOnboardingPage.tsx is guarded by
//      `managedIdentity`, and so is the ecommerce block. Source contract, because the decision
//      lives in a React event handler and this repo carries no DOM test environment; the branch
//      is located by the provisioner call it contains, never by line number.
//   2. The copy a managed owner is shown instead makes no installation claim, and does point at
//      the real next step. Driven against the exported strings, not a transcription of them.
//   3. The browser-local (signed-out) lane is COMPLETELY unchanged: every shipped trade template
//      still installs its full catalog and its sample activity through the real provisioner and
//      the real write boundary. This is the thing most likely to break silently while making the
//      managed lane honest, so it is executed, not reasoned about.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// ============================================================================================
// 1. The guard, in the source of the screen that makes the decision.
// ============================================================================================

const PAGE_PATH = 'showroom/src/core/ProductOnboardingPage.tsx'
const pageLines = readFileSync(PAGE_PATH, 'utf8').split('\n')

// Locate a product branch by the provisioner call it wraps, then walk up to the nearest
// `if (product === ...)` line. Line numbers in this file drift constantly; the call does not.
function enclosingProductBranch(callNeedle) {
  const callIndex = pageLines.findIndex((line) => line.includes(callNeedle))
  assert.ok(callIndex >= 0, `${PAGE_PATH} still calls ${callNeedle}`)
  for (let index = callIndex; index >= 0; index -= 1) {
    if (/^\s*if \(product === '/.test(pageLines[index])) {
      return { line: pageLines[index].trim(), lineNumber: index + 1, callLineNumber: callIndex + 1 }
    }
  }
  assert.fail(`${callNeedle} is not inside an "if (product === ...)" branch in ${PAGE_PATH}`)
}

const commerceBranch = enclosingProductBranch('provisionLocalShopIndustryPack(')
check(
  commerceBranch.line.includes("product === 'commerce'"),
  `the Shop provisioners sit in the commerce branch, got: ${commerceBranch.line}`,
)
check(
  /!\s*managedIdentity/.test(commerceBranch.line),
  'the commerce branch must consult managedIdentity before running the browser-local Shop provisioners -- '
  + 'they write to window.localStorage, which a managed Shop never reads, so running them for a signed-in '
  + `owner reports a template as installed when it was not. Got: ${commerceBranch.line}`,
)

// The trade-template provisioner is the one that carries the spa/bakery/pharmacy catalog. It must
// be inside the SAME guarded branch, not a second unguarded call somewhere below it.
const templateBranch = enclosingProductBranch('provisionLocalShopBusinessTemplateSample(')
check(
  templateBranch.lineNumber === commerceBranch.lineNumber,
  'the trade-template provisioner shares the guarded commerce branch, not a branch of its own '
  + `(template branch at line ${templateBranch.lineNumber}, commerce branch at line ${commerceBranch.lineNumber})`,
)

// The pattern the commerce branch is mirroring. If this ever loses its guard the asymmetry is
// simply pointing the other way.
const ecommerceBranch = enclosingProductBranch('activateLocalEcommerceWorkingSample(')
check(
  ecommerceBranch.line.includes("product === 'ecommerce'") && /!\s*managedIdentity/.test(ecommerceBranch.line),
  `the ecommerce branch keeps its managedIdentity guard. Got: ${ecommerceBranch.line}`,
)

// ============================================================================================
// 2. What the managed owner is told instead.
// ============================================================================================

const bundle = await build({
  stdin: {
    contents: `
      export {
        MANAGED_SHOP_ONBOARDING_HINT, MANAGED_SHOP_ONBOARDING_INTRO,
        MANAGED_SHOP_ONBOARDING_JOURNEY,
        managedShopOnboardingNotice, provisionLocalShopBusinessTemplateSample,
        readLocalShopBusinessTemplateId,
      } from './product-onboarding-runtime.ts'
      export { shopBusinessTemplates } from '../products/shop/business-templates.ts'
      export {
        commerceWorkingSampleCatalogId, createSeedCommerce, validateCommerceState,
      } from './commerce-workspace.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/managed-onboarding-honesty-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  MANAGED_SHOP_ONBOARDING_HINT, MANAGED_SHOP_ONBOARDING_INTRO,
  MANAGED_SHOP_ONBOARDING_JOURNEY,
  managedShopOnboardingNotice, provisionLocalShopBusinessTemplateSample,
  readLocalShopBusinessTemplateId,
  shopBusinessTemplates,
  commerceWorkingSampleCatalogId, createSeedCommerce, validateCommerceState,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

check(typeof managedShopOnboardingNotice === 'function', 'the managed Shop onboarding notice is exported from the onboarding runtime')
check(typeof MANAGED_SHOP_ONBOARDING_HINT === 'string' && MANAGED_SHOP_ONBOARDING_HINT.trim().length > 0, 'the managed submit hint is exported')
check(typeof MANAGED_SHOP_ONBOARDING_INTRO === 'string' && MANAGED_SHOP_ONBOARDING_INTRO.trim().length > 0, 'the managed intro copy is exported')

// Every claim of a completed install, in the wordings this product actually uses. A managed owner
// must not read any of them, because none of them are true for her.
const INSTALL_CLAIMS = [
  /\binstalled\b/i,
  /\bcatalog is ready\b/i,
  /\bstarter data (is|was|has been) (added|installed|loaded)\b/i,
  /\bsample records (are|were|have been) (added|created|installed)\b/i,
  /\bwe (will )?add(ed)? realistic sample records\b/i,
  /\byour catalog and stock are ready\b/i,
]

check(MANAGED_SHOP_ONBOARDING_JOURNEY && typeof MANAGED_SHOP_ONBOARDING_JOURNEY === 'object', 'the managed Shop journey copy is exported')

for (const [label, copy] of [
  ['the managed notice', managedShopOnboardingNotice('Spa and beauty')],
  ['the managed submit hint', MANAGED_SHOP_ONBOARDING_HINT],
  ['the managed intro copy', MANAGED_SHOP_ONBOARDING_INTRO],
  ['the managed journey outcome', MANAGED_SHOP_ONBOARDING_JOURNEY.outcome],
  ['the managed journey detail', MANAGED_SHOP_ONBOARDING_JOURNEY.detail],
  ['the managed journey action label', MANAGED_SHOP_ONBOARDING_JOURNEY.actionLabel],
]) {
  check(typeof copy === 'string' && copy.trim().length > 0, `${label} is a non-empty string`)
  for (const claim of INSTALL_CLAIMS) {
    check(!claim.test(copy), `${label} makes no installation claim (${claim}), got: ${copy}`)
  }
}

const spaNotice = managedShopOnboardingNotice('Spa and beauty')
check(spaNotice.includes('Spa and beauty'), 'the managed notice names the business type the owner just picked, so the choice is not silently dropped')
check(/first real item/i.test(spaNotice), 'the managed notice points at the real next step (adding the first real item), so it is not a dead end')
check(/nothing was added|no sample records|do not get sample records/i.test(spaNotice), 'the managed notice states plainly that nothing was added')
check(/Open Shop/i.test(spaNotice), 'the managed notice names the destination, matching the "Open my Shop" button the owner sees next')
check(/first real item/i.test(MANAGED_SHOP_ONBOARDING_HINT), 'the submit hint says what the tap will actually do, BEFORE the owner taps it')

// The loudest promise on the page is the "First useful result" panel and the submit button, both
// rendered before the owner taps anything. For a company account the browser-local wording -- a
// sample sale on a catalog that is "ready" -- is false in every clause, so the managed journey
// must replace all three fields and must not smuggle the old claim back in.
check(
  !/sample sale/i.test(MANAGED_SHOP_ONBOARDING_JOURNEY.outcome)
  && /first real item/i.test(MANAGED_SHOP_ONBOARDING_JOURNEY.outcome),
  `the managed first useful result is the real one, got: ${MANAGED_SHOP_ONBOARDING_JOURNEY.outcome}`,
)
check(
  !/catalog and stock are ready|tap an item/i.test(MANAGED_SHOP_ONBOARDING_JOURNEY.detail),
  `the managed journey detail does not promise a catalog to tap, got: ${MANAGED_SHOP_ONBOARDING_JOURNEY.detail}`,
)
check(
  !/start selling\b/i.test(MANAGED_SHOP_ONBOARDING_JOURNEY.actionLabel),
  `the managed action label does not promise selling before an item exists, got: ${MANAGED_SHOP_ONBOARDING_JOURNEY.actionLabel}`,
)
check(
  !('firstTaskPath' in MANAGED_SHOP_ONBOARDING_JOURNEY),
  'the managed journey does not redirect the owner elsewhere -- Shop returns its "Create the real catalog" '
  + 'boundary for a managed account on any tab, so the existing first-task path already lands her there',
)

// The notice must be built from the argument, not be a fixed string that happens to mention a spa.
check(
  managedShopOnboardingNotice('Bakery').includes('Bakery') && !managedShopOnboardingNotice('Bakery').includes('Spa and beauty'),
  'the managed notice is built from the business type it is given',
)

// ============================================================================================
// 3. The browser-local lane is untouched. Executed through the real provisioner.
// ============================================================================================

function fakeStore(entries = {}) {
  const map = new Map(Object.entries(entries))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value) },
    removeItem: (key) => { map.delete(key) },
    map,
  }
}

// Discover the Commerce storage key by probing a real read rather than hardcoding it, the same
// way tools/test_plant_business_templates.mjs does.
const probe = { reads: [], getItem(key) { this.reads.push(key); return null }, setItem() {}, removeItem() {} }
readLocalShopBusinessTemplateId(probe)
check(probe.reads.length > 0, 'trade detection reads from the store it is given')
const COMMERCE_KEY = probe.reads[0]

const fetchCalls = []
globalThis.fetch = async (...args) => {
  fetchCalls.push(args[0])
  throw new Error('the browser-local onboarding lane must not make network calls')
}
Object.defineProperty(globalThis, 'navigator', {
  value: { locks: { request: async (_name, _options, callback) => callback() } },
  configurable: true,
})

check(shopBusinessTemplates.length === 10, `all ten shipped trade templates are present, got ${shopBusinessTemplates.length}`)

// loadCommerceWorkspace() seeds the demo seed on empty storage before the template lands on top of
// it, so the installed catalog is the seed PLUS the template -- measured at 20 items for a 15-item
// template in hq/research/MANAGED-TEMPLATE-PROVISIONING.md. Derived here rather than hardcoded so
// this stays a statement about the lane, not about today's seed size.
const SEED_ITEMS = createSeedCommerce().items.length
check(SEED_ITEMS > 0, `the demo seed still carries items, got ${SEED_ITEMS}`)

for (const template of shopBusinessTemplates) {
  const store = fakeStore()
  globalThis.window = { localStorage: store }
  globalThis.localStorage = store

  const disposition = await provisionLocalShopBusinessTemplateSample(template.id)
  check(disposition === 'installed', `${template.id}: a signed-out install still reports 'installed', got '${disposition}'`)

  const written = store.map.get(COMMERCE_KEY)
  check(typeof written === 'string' && written.length > 0, `${template.id}: the browser-local Shop workspace was written`)
  const stored = JSON.parse(written)
  const state = stored.state ?? stored

  check(
    commerceWorkingSampleCatalogId(state) === template.id,
    `${template.id}: the installed catalog is stamped with this trade, got '${commerceWorkingSampleCatalogId(state)}'`,
  )
  check(
    state.items.length === SEED_ITEMS + template.catalog.length,
    `${template.id}: the FULL template catalog landed -- expected ${SEED_ITEMS} seed + ${template.catalog.length} template `
    + `= ${SEED_ITEMS + template.catalog.length} items, got ${state.items.length}`,
  )
  for (const catalogItem of template.catalog) {
    const item = state.items.find((candidate) => candidate.sku === catalogItem.sku)
    check(Boolean(item), `${template.id}: catalog item ${catalogItem.sku} landed`)
    check(item.name === catalogItem.name, `${template.id}: ${catalogItem.sku} kept its name`)
    check(item.price === catalogItem.priceMmk, `${template.id}: ${catalogItem.sku} kept its price`)
    check(item.reorderAt === catalogItem.reorderAt, `${template.id}: ${catalogItem.sku} kept its reorder level`)

    // Opening stock is evidenced as a movement, not written straight onto the item -- and the
    // sample sales then reserve against it, so onHand is opening MINUS what the sample sold.
    // Both halves are asserted, because a regression that dropped the sales would still leave the
    // opening movement looking right.
    const movements = state.movements.filter((movement) => movement.sku === catalogItem.sku)
    const opening = movements.filter((movement) => movement.kind === 'opening')
    check(opening.length === 1, `${template.id}: ${catalogItem.sku} has exactly one opening movement, got ${opening.length}`)
    check(
      opening[0].quantityDelta === catalogItem.openingStock,
      `${template.id}: ${catalogItem.sku} opening movement is the template's opening stock -- expected `
      + `${catalogItem.openingStock}, got ${opening[0].quantityDelta}`,
    )
    const expectedOnHand = movements.reduce((total, movement) => total + movement.quantityDelta, 0)
    check(
      item.onHand === expectedOnHand,
      `${template.id}: ${catalogItem.sku} onHand reconciles to its own movements -- expected ${expectedOnHand}, got ${item.onHand}`,
    )
  }
  // The sample activity is what turns a price list into a business the owner can see working.
  check(state.orders.length > 0, `${template.id}: the sample activity still lands (orders), got ${state.orders.length}`)
  check(
    state.movements.length >= template.catalog.length,
    `${template.id}: every template item still carries its opening stock movement -- expected at least `
    + `${template.catalog.length}, got ${state.movements.length}`,
  )
  check(Boolean(validateCommerceState(state)), `${template.id}: the installed workspace is a valid commerce state`)
}

check(fetchCalls.length === 0, `the browser-local lane made no network calls, got ${fetchCalls.length}: ${JSON.stringify(fetchCalls)}`)

console.log(`managed shop onboarding honesty: ${checks} checks passed across ${shopBusinessTemplates.length} trade templates`)
