// Plant business template registry + provisioning wiring guard.
//
// TEMPLATE-EXPANSION.md queue item 3: a device whose Shop was set up on the bakery trade must
// get a Plant workspace whose jobs, floor, and opening issue are the bakery's own, instead of
// the generic "Batch Alpha / Mixer 01 / Temperature drift" seed every other pack still uses.
// The binding to Shop is by exact string equality (shop-production-demand.ts's
// jobMatchesProduct), so this file asserts that pairing directly against the Shop bakery
// catalog rather than trusting that the registry's own validator caught a drift.
//
// It also proves the write actually reaches storage through the real app write boundary
// (provisionLocalPlantWorkingSample -> mutateProductionWorkingSample), not just through the
// pure installProductionWorkingSampleJobs constructor plant_production_demo.test.mjs already
// covers. That distinction mattered here: installProductionWorkingSampleJobs's machines/issue
// parameters were unreachable through the real write boundary until this change (see the fix
// to productionWorkingSampleTransitionIsExact in production-workspace.ts) because the
// boundary's own "is this transition exactly a sample install" recompute silently dropped them
// and forced every candidate back onto the generic seed floor.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export {
        PLANT_BUSINESS_TEMPLATE_SCHEMA, plantBusinessTemplates, plantBusinessTemplate,
        plantBusinessTemplateForShopTemplateId, plantBusinessTemplateJobs,
        validatePlantBusinessTemplates,
      } from '../products/plant/business-templates.ts'
      export {
        shopBusinessTemplates, shopBusinessTemplate,
      } from '../products/shop/business-templates.ts'
      export {
        createSeedCommerce, installCommerceWorkingSampleCatalog, commerceWorkingSampleCatalogId,
      } from './commerce-workspace.ts'
      export {
        createSeedProduction, validateProductionState, isGuidedSampleProduction,
        productionWorkingSamplePackId, PRODUCTION_KEY,
      } from './production-workspace.ts'
      export { plantIndustryPack } from './plant-industry-packs.ts'
      export {
        provisionLocalPlantWorkingSample, readLocalShopBusinessTemplateId,
      } from './product-onboarding-runtime.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/plant-business-template-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  PLANT_BUSINESS_TEMPLATE_SCHEMA, plantBusinessTemplates, plantBusinessTemplate,
  plantBusinessTemplateForShopTemplateId, plantBusinessTemplateJobs, validatePlantBusinessTemplates,
  shopBusinessTemplates, shopBusinessTemplate,
  createSeedCommerce, installCommerceWorkingSampleCatalog, commerceWorkingSampleCatalogId,
  createSeedProduction, validateProductionState, isGuidedSampleProduction,
  productionWorkingSamplePackId, PRODUCTION_KEY,
  plantIndustryPack,
  provisionLocalPlantWorkingSample, readLocalShopBusinessTemplateId,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

// ============================================================================================
// Registry shape and the cross-product binding, checked independently of the module's own
// validator -- this file must fail if the registry drifts even if validatePlantBusinessTemplates
// itself somehow stopped checking it.
// ============================================================================================

check(validatePlantBusinessTemplates() === plantBusinessTemplates, 'validatePlantBusinessTemplates returns the live registry')
check(plantBusinessTemplates.length === 1, 'v1 ships exactly one Plant business template')
check(plantBusinessTemplates[0].id === 'bakery', 'the one template is bakery')
check(plantBusinessTemplates[0].schema === PLANT_BUSINESS_TEMPLATE_SCHEMA, 'the template carries the declared schema')
check(plantBusinessTemplate('bakery') === plantBusinessTemplates[0], 'plantBusinessTemplate looks up by id')
assert.throws(() => plantBusinessTemplate('fashion'), 'an id with no Plant template yet must throw, not guess')

const bakery = plantBusinessTemplate('bakery')
const shopBakery = shopBusinessTemplate('bakery')
check(bakery.shopTemplateId === 'bakery', 'the Plant template declares which Shop trade it belongs to')

check(bakery.jobs.length === 2, 'the minimum coherent kit is 2 jobs')
check(new Set(bakery.jobs.map((job) => job.line)).size === 2, 'the 2 jobs run on 2 distinct lines')
for (const job of bakery.jobs) {
  const catalogItem = shopBakery.catalog.find((item) => item.sku === job.shopSku)
  check(Boolean(catalogItem), `${job.jobCode}: shopSku ${job.shopSku} is a real item in the bakery Shop catalog`)
  check(
    catalogItem?.name === job.product,
    `${job.jobCode}: product "${job.product}" must be byte-for-byte the Shop catalog name "${catalogItem?.name}" -- `
    + 'shop-production-demand.ts links a Shop SKU to a Plant job by this exact string equality',
  )
}

check(bakery.machines.length === 3, 'the minimum coherent kit is 3 machines')
check(bakery.machines.filter((machine) => machine.state === 'attention').length === 1, 'exactly one machine needs attention')
check(new Set(bakery.machines.map((machine) => machine.id)).size === 3, 'machine ids are unique')
check(
  bakery.machines.every((machine) => !['Mixer 01', 'Press 02', 'Finishing 01'].includes(machine.name)),
  'the bakery floor replaces the generic mixer/press/finishing names, not just relabels them',
)

check(Boolean(bakery.openingIssue.area.trim()) && Boolean(bakery.openingIssue.summary.trim()), 'the opening issue has real text')
check(
  bakery.openingIssue.summary !== 'Temperature drift requires supervisor review',
  'the opening issue replaces the generic seed placeholder',
)

check(bakery.plan === undefined, 'v1 does not populate a BOM/routing plan -- isGuidedSampleProduction stays true only while orderPortfolio/orderExecution/equipmentMaster are unset')

// ---- plantBusinessTemplateForShopTemplateId: selection, and refusal to guess -----------------
check(plantBusinessTemplateForShopTemplateId('bakery') === bakery, 'bakery Shop resolves to the bakery Plant template')
for (const template of shopBusinessTemplates) {
  if (template.id === 'bakery') continue
  check(plantBusinessTemplateForShopTemplateId(template.id) === null, `${template.id} has no Plant template yet -- must resolve to null, not a guess`)
}
check(plantBusinessTemplateForShopTemplateId(null) === null, 'no Shop trade resolves to null')
check(plantBusinessTemplateForShopTemplateId(undefined) === null, 'an undefined Shop trade resolves to null')
check(plantBusinessTemplateForShopTemplateId('not-a-real-trade') === null, 'an unrecognised id resolves to null, not a throw')

// ---- plantBusinessTemplateJobs: materialization against a caller-supplied instant ------------
const CAPTURED_AT = '2026-08-18T10:00:00.000Z'
const materialized = plantBusinessTemplateJobs(bakery, CAPTURED_AT, '  Thiri Bakery Owner  ')
check(materialized.length === bakery.jobs.length, 'one ProductionJob per template job')
materialized.forEach((job, index) => {
  const source = bakery.jobs[index]
  check(job.id === source.jobCode, 'ProductionJob.id is the template jobCode')
  check(job.output === 0, 'a freshly materialized job always opens at zero output -- registerProductionJob refuses anything else')
  check(job.owner === 'Thiri Bakery Owner', 'the owner is trimmed, matching the caller-supplied owner')
  check(
    job.dueAt === new Date(Date.parse(CAPTURED_AT) + source.dueInDays * 24 * 60 * 60 * 1000).toISOString(),
    `${job.id}: dueAt is materialized as capturedAt + dueInDays, never a literal date`,
  )
})
assert.throws(() => plantBusinessTemplateJobs(bakery, 'not-a-date', 'Owner'), 'an invalid capturedAt must throw rather than silently materialize NaN dates')

// ============================================================================================
// Integration: provisionLocalPlantWorkingSample actually reaching storage through the real
// app write boundary, for a bakery Shop, a non-bakery Shop, and no Shop at all.
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

// provisionLocalPlantWorkingSample and readLocalShopBusinessTemplateId (called with no storage
// argument, exactly as the real onboarding screen calls them) read window.localStorage /
// globalThis.localStorage and globalThis.navigator.locks. This is the same seam
// test_website_trade_detection.mjs discovers by probing reads; here the store is shared across
// Commerce and Production, mirroring one real browser's localStorage.
function installGlobals(store) {
  globalThis.window = globalThis.window ?? {}
  globalThis.localStorage = store
  // Node's own `navigator` global is a read-only accessor (Node 21+), so it cannot be
  // reassigned the way `localStorage` can -- it has to be redefined.
  Object.defineProperty(globalThis, 'navigator', {
    value: { locks: { request: async (_name, _options, callback) => callback() } },
    configurable: true,
  })
}

// Discover the Commerce storage key the same way the trade-detection test does, rather than
// hardcoding it.
{
  const probe = { reads: [], getItem(key) { this.reads.push(key); return null }, setItem() {}, removeItem() {} }
  readLocalShopBusinessTemplateId(probe)
  check(probe.reads.length > 0, 'trade detection reads from the store it is given')
}
const probeAgain = { reads: [], getItem(key) { this.reads.push(key); return null }, setItem() {}, removeItem() {} }
readLocalShopBusinessTemplateId(probeAgain)
const COMMERCE_KEY = probeAgain.reads[0]

function storeWithShopTemplate(templateId) {
  const template = shopBusinessTemplates.find((candidate) => candidate.id === templateId)
  const items = template.catalog.map((item) => ({ sku: item.sku, name: item.name, onHand: item.openingStock, reorderAt: item.reorderAt, price: item.priceMmk }))
  const installed = installCommerceWorkingSampleCatalog(createSeedCommerce(), {
    sampleId: template.id,
    sampleName: template.name.en,
    items,
    capturedAt: CAPTURED_AT,
  })
  assert.ok(installed, `${templateId}: the Shop template catalog installs`)
  assert.equal(commerceWorkingSampleCatalogId(installed), templateId)
  return installed
}

// ---- a bakery Shop gets the bakery Plant template -----------------------------------------
{
  const store = fakeStore({
    [COMMERCE_KEY]: JSON.stringify(storeWithShopTemplate('bakery')),
    [PRODUCTION_KEY]: JSON.stringify(createSeedProduction()),
  })
  installGlobals(store)

  check(readLocalShopBusinessTemplateId() === 'bakery', 'sanity: this device really does detect a bakery Shop with no storage argument')

  // industryPackId/workflowTemplateId are the generic-pack arguments the onboarding screen
  // always passes; a bakery Shop must override them, proving the bakery branch -- not the
  // caller's choice of generic pack -- decides what installs.
  const disposition = await provisionLocalPlantWorkingSample('general-manufacturing', 'production-control', 'Thiri Bakery Owner')
  check(disposition === 'installed', 'first bakery provisioning run installs')

  const state = validateProductionState(JSON.parse(store.getItem(PRODUCTION_KEY)))
  check(productionWorkingSamplePackId(state) === 'bakery', 'the installed sample is identified as bakery, not a generic pack')
  check(
    JSON.stringify(state.jobs.map((job) => job.product).sort())
    === JSON.stringify(bakery.jobs.map((job) => job.product).sort()),
    'the installed jobs are the bakery jobs (bakery product names on a bakery floor)',
  )
  check(
    JSON.stringify(state.machines) === JSON.stringify(bakery.machines.map((machine) => ({ ...machine }))),
    'the installed floor is the bakery machines, not Mixer 01 / Press 02 / Finishing 01',
  )
  const openIssue = state.issues.find((issue) => issue.status === 'open')
  check(openIssue?.area === bakery.openingIssue.area && openIssue?.summary === bakery.openingIssue.summary, 'the opening issue is the bakery one')
  check(state.jobs.every((job) => job.owner === 'Thiri Bakery Owner'), 'jobs carry the setup owner')

  // The whole point of staying out of BOM/plan territory in v1: the workspace must still be a
  // pure guided sample after the jobs install.
  check(isGuidedSampleProduction(state), 'isGuidedSampleProduction still returns true after installing the bakery jobs')

  // Second run: report what actually happens rather than assume replay is a no-op -- the plan's
  // equivalent Shop-side assumption turned out wrong for the same reason found here. capturedAt
  // is `new Date().toISOString()` at millisecond precision, taken fresh on every call, and
  // dueAt is materialized as capturedAt + dueInDays -- so two real calls, even moments apart,
  // almost never share a capturedAt and therefore never produce byte-identical jobs. That is
  // NOT the same shape as the generic pack path directly below, whose {{dueDate14}}/{{dueDate21}}
  // placeholders resolve against a Yangon CALENDAR DATE (clientImportPlanningDate), stable across
  // an entire day -- so two generic-pack runs on the same day DO replay as a byte-identical
  // no-op, while two bakery runs, even on the same day, do not. installProductionWorkingSampleJobs
  // still accepts the second bakery run as a legitimate working-sample transition (jobs simply
  // get fresh due dates relative to whenever setup runs); it is a real content change and reports
  // 'installed' again, not a rejection and not a no-op.
  const firstDueAts = state.jobs.map((job) => job.dueAt).sort()
  // A real deployment separates two provisioning attempts by at least seconds of human action;
  // this sleep just keeps the millisecond-precision capturedAt from coincidentally landing on
  // the exact same value twice in a tight test loop.
  await new Promise((resolve) => setTimeout(resolve, 5))
  const secondDisposition = await provisionLocalPlantWorkingSample('general-manufacturing', 'production-control', 'Thiri Bakery Owner')
  check(secondDisposition === 'installed', 'a second bakery provisioning run installs again -- it is not a byte-identical replay, and this is expected')
  const stateAfterSecondRun = validateProductionState(JSON.parse(store.getItem(PRODUCTION_KEY)))
  check(productionWorkingSamplePackId(stateAfterSecondRun) === 'bakery', 'the second run is still the bakery sample')
  check(isGuidedSampleProduction(stateAfterSecondRun), 'the second run is still a pure guided sample')
  check(
    JSON.stringify(stateAfterSecondRun.jobs.map((job) => job.product).sort()) === JSON.stringify(bakery.jobs.map((job) => job.product).sort()),
    'the second run still installs the same bakery products',
  )
  check(
    JSON.stringify(stateAfterSecondRun.jobs.map((job) => job.dueAt).sort()) !== JSON.stringify(firstDueAts),
    'the second run\'s due dates shifted forward relative to its own later capturedAt, confirming this genuinely re-ran rather than silently reusing the first result',
  )
}

// ---- a non-bakery Shop falls back to the unchanged generic pack path -----------------------
{
  const store = fakeStore({
    [COMMERCE_KEY]: JSON.stringify(storeWithShopTemplate('pharmacy')),
    [PRODUCTION_KEY]: JSON.stringify(createSeedProduction()),
  })
  installGlobals(store)
  check(readLocalShopBusinessTemplateId() === 'pharmacy', 'sanity: this device detects a pharmacy Shop')

  const pack = plantIndustryPack('general-manufacturing')
  const disposition = await provisionLocalPlantWorkingSample('general-manufacturing', '', 'Owner')
  check(disposition === 'installed', 'the generic pack path still installs for a Shop trade with no Plant template')

  const state = validateProductionState(JSON.parse(store.getItem(PRODUCTION_KEY)))
  check(productionWorkingSamplePackId(state) === pack.id, 'a non-bakery Shop gets the generic pack, not bakery')
  check(state.jobs.some((job) => job.product === 'Finished product A'), 'a non-bakery Shop gets today\'s exact generic sample content, unchanged')
  check(
    JSON.stringify(state.machines) === JSON.stringify(createSeedProduction().machines),
    'a non-bakery Shop keeps the generic seed floor -- unchanged behaviour',
  )
  check(isGuidedSampleProduction(state), 'the generic-pack path also stays a pure guided sample')
}

// ---- no Shop data at all also falls back to the unchanged generic pack path ----------------
{
  const store = fakeStore({ [PRODUCTION_KEY]: JSON.stringify(createSeedProduction()) })
  installGlobals(store)
  check(readLocalShopBusinessTemplateId() === null, 'sanity: a device with no Shop data detects no trade')

  const pack = plantIndustryPack('general-manufacturing')
  const disposition = await provisionLocalPlantWorkingSample('general-manufacturing', '', 'Owner')
  check(disposition === 'installed', 'the generic pack path installs when there is no Shop trade to pair with')
  const state = validateProductionState(JSON.parse(store.getItem(PRODUCTION_KEY)))
  check(productionWorkingSamplePackId(state) === pack.id, 'no Shop data -> the generic pack installs, never bakery')
}

console.log(`plant business template contract: ${checks} checks passed`)
