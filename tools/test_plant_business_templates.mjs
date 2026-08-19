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
//
// TEMPLATE-EXPANSION.md queue item 4: immediately after the jobs/floor install above,
// provisionLocalPlantWorkingSample now also calls appendGuidedSampleProductionActivity (its own
// locked mutateProductionWorkspace transition -- chaining it into the working-sample transition
// above is not possible, because productionWorkingSampleTransitionIsExact requires the candidate
// to carry exactly one event per job, and the activity call appends several more). This file
// proves output and scrap land on the running shift, that isGuidedSampleProduction and
// hasGuidedSampleProductionActivity both read true afterward, and documents the SECOND
// provisioning run's real behaviour: once guided-sample activity events exist, they are not
// prefixed with the working-sample action prefix, so installProductionWorkingSampleJobs's own
// "is the current state consistent with having been built by me" recompute no longer matches on
// a second call -- the reinstall is refused (not an error; the transition returns the state
// unchanged) and provisionLocalPlantWorkingSample reports 'preserved'. This is a DIFFERENT
// mechanism than the "second run re-seeds with shifted due dates and still reports 'installed'"
// finding queue item 3 documented -- that finding described the behaviour of the jobs/floor
// install in isolation, before this item's activity call existed to block it. With the activity
// call now chained on every provisioning attempt, a second run is a genuine no-op: recorded
// shift progress is preserved rather than being silently reset by a fresh reinstall.
//
// TEMPLATE-EXPANSION.md queue item 8: after the activity call, provisionLocalPlantWorkingSample
// now also calls provisionPlantBusinessTemplateOrder for any template that ships a `plan` --
// today only bakery. It imports the reviewed BOM/routing, confirms availability, records one
// calibration per routed work centre, and releases the order, each as its own
// mutateProductionWorkspace('order-execution') transition, entirely under
// ACT-GUIDED-SAMPLE-ORDER- prefixed proofs. This file proves the released order carries exactly
// 5 materials and 4 costed operations, that no inspection or batch release command exists in the
// chain, that isGuidedSampleProduction still reads true (proving item 7's widened guard actually
// accepts this real plan), and that a second provisioning run replays the whole chain as a true
// no-op.
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
        hasGuidedSampleProductionActivity, productionShiftOutput,
        productionWorkingSamplePackId, PRODUCTION_KEY,
      } from './production-workspace.ts'
      export { plantIndustryPack } from './plant-industry-packs.ts'
      export { productionOrderExecutionForJob } from './production-order-portfolio.ts'
      export {
        projectPlantOrder, projectPlantOrderCostDrivers, projectPlantOrderFinancialCost,
      } from './plant-order-foundation.ts'
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
  hasGuidedSampleProductionActivity, productionShiftOutput,
  productionWorkingSamplePackId, PRODUCTION_KEY,
  plantIndustryPack,
  productionOrderExecutionForJob,
  projectPlantOrder, projectPlantOrderCostDrivers, projectPlantOrderFinancialCost,
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
check(plantBusinessTemplates.length === 2, 'v1 ships exactly two Plant business templates (queue item 9: bakery + fashion)')
check(plantBusinessTemplates[0].id === 'bakery', 'the first template is bakery')
check(plantBusinessTemplates[1].id === 'fashion', 'the second template is fashion')
check(plantBusinessTemplates.every((template) => template.schema === PLANT_BUSINESS_TEMPLATE_SCHEMA), 'every template carries the declared schema')
check(plantBusinessTemplate('bakery') === plantBusinessTemplates[0], 'plantBusinessTemplate looks up bakery by id')
check(plantBusinessTemplate('fashion') === plantBusinessTemplates[1], 'plantBusinessTemplate looks up fashion by id')
assert.throws(() => plantBusinessTemplate('hardware'), 'an id with no Plant template yet must throw, not guess')

const bakery = plantBusinessTemplate('bakery')
const shopBakery = shopBusinessTemplate('bakery')
const fashion = plantBusinessTemplate('fashion')
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

check(Boolean(bakery.plan), 'the bakery template ships a BOM/routing plan (queue item 8)')
check(bakery.plan.materials.length === 5, 'the plan carries exactly 5 BOM materials')
check(bakery.plan.routing.length === 4, 'the plan carries exactly 4 routing operations')
check(
  bakery.plan.materials.every((material) => Boolean(material.standardCostPerUnitMmk)),
  'every BOM material carries a standard MMK cost, or the financial-cost projection cannot report',
)
check(
  bakery.plan.routing.every((step) => Boolean(step.standardCostPerMinuteMmk)),
  'every routing step carries a standard MMK cost, or the financial-cost projection cannot report',
)
check(
  bakery.plan.materials.every((material) => !material.shopSupply),
  'no BOM material invents a Shop SKU the bakery catalog does not stock -- shopSupply stays unset',
)
check(
  new Set(bakery.plan.routing.map((step) => step.workCentreId)).size === bakery.plan.workCentres.length,
  'every declared work centre is actually used by a routing step',
)

check(Boolean(bakery.primaryMaterial?.ref?.trim()), 'the bakery template names a real primary material for the guided shift-activity seeder')
check(bakery.primaryMaterial.ref !== 'MAT-PRIMARY-001' && bakery.primaryMaterial.ref !== 'Primary material', 'the primary material replaces the generic pack placeholder, not just relabels it')
check(
  ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'bag', 'roll', 'sheet', 'm', 'cm'].includes(bakery.primaryMaterial.unit),
  'the primary material carries a valid ProductionMaterialUnit',
)

// ============================================================================================
// Queue item 9: the fashion Plant template -- same registry-shape assertions as bakery above,
// mirrored rather than looped over, so a future regression in either template fails by name.
// ============================================================================================

const shopFashion = shopBusinessTemplate('fashion')
check(fashion.shopTemplateId === 'fashion', 'the fashion Plant template declares which Shop trade it belongs to')
check(fashion.industryPackId === 'apparel', 'the fashion Plant template uses the apparel industry pack')

check(fashion.jobs.length === 2, 'the fashion kit is also exactly 2 starter jobs')
check(new Set(fashion.jobs.map((job) => job.line)).size === 2, 'the 2 fashion jobs run on 2 distinct lines')
for (const job of fashion.jobs) {
  const catalogItem = shopFashion.catalog.find((item) => item.sku === job.shopSku)
  check(Boolean(catalogItem), `${job.jobCode}: shopSku ${job.shopSku} is a real item in the fashion Shop catalog`)
  check(
    catalogItem?.name === job.product,
    `${job.jobCode}: product "${job.product}" must be byte-for-byte the Shop catalog name "${catalogItem?.name}"`,
  )
}
check(fashion.jobs.some((job) => job.shopSku.startsWith('TSHIRT-')), 'the fashion template pairs at least one TSHIRT- SKU (queue item 9 acceptance)')
check(fashion.jobs.some((job) => job.shopSku.startsWith('LONGYI-')), 'the fashion template pairs at least one LONGYI- SKU (queue item 9 acceptance)')

check(fashion.machines.length === 3, 'the fashion kit is also exactly 3 machines')
check(fashion.machines.filter((machine) => machine.state === 'attention').length === 1, 'exactly one fashion machine needs attention')
check(new Set(fashion.machines.map((machine) => machine.id)).size === 3, 'fashion machine ids are unique')
check(
  fashion.machines.every((machine) => !['Mixer 01', 'Press 02', 'Finishing 01'].includes(machine.name)),
  'the fashion floor replaces the generic mixer/press/finishing names, not just relabels them',
)
check(
  fashion.machines.every((machine) => !bakery.machines.some((bakeryMachine) => bakeryMachine.name === machine.name)),
  'the fashion floor is its own trade-specific equipment, not a relabel of the bakery floor',
)

check(Boolean(fashion.openingIssue.area.trim()) && Boolean(fashion.openingIssue.summary.trim()), 'the fashion opening issue has real text')
check(
  fashion.openingIssue.summary !== 'Temperature drift requires supervisor review',
  'the fashion opening issue replaces the generic seed placeholder',
)
check(fashion.openingIssue.summary !== bakery.openingIssue.summary, 'the fashion opening issue is its own trade-specific text, not the bakery one')

check(Boolean(fashion.plan), 'the fashion template ships a BOM/routing plan (queue item 9)')
check(fashion.plan.materials.length === 5, 'the fashion plan carries exactly 5 BOM materials')
check(fashion.plan.routing.length === 4, 'the fashion plan carries exactly 4 routing operations')
check(
  fashion.plan.materials.every((material) => Boolean(material.standardCostPerUnitMmk)),
  'every fashion BOM material carries a standard MMK cost',
)
check(
  fashion.plan.routing.every((step) => Boolean(step.standardCostPerMinuteMmk)),
  'every fashion routing step carries a standard MMK cost',
)
check(
  fashion.plan.materials.every((material) => !material.shopSupply),
  'no fashion BOM material invents a Shop SKU the fashion catalog does not stock -- shopSupply stays unset',
)
check(
  new Set(fashion.plan.routing.map((step) => step.workCentreId)).size === fashion.plan.workCentres.length,
  'every declared fashion work centre is actually used by a routing step',
)

check(Boolean(fashion.primaryMaterial?.ref?.trim()), 'the fashion template names a real primary material for the guided shift-activity seeder')
check(fashion.primaryMaterial.ref !== 'MAT-PRIMARY-001' && fashion.primaryMaterial.ref !== 'Primary material', 'the fashion primary material replaces the generic pack placeholder, not just relabels it')
check(
  ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'bag', 'roll', 'sheet', 'm', 'cm'].includes(fashion.primaryMaterial.unit),
  'the fashion primary material carries a valid ProductionMaterialUnit',
)

// ---- plantBusinessTemplateForShopTemplateId: selection, and refusal to guess -----------------
check(plantBusinessTemplateForShopTemplateId('bakery') === bakery, 'bakery Shop resolves to the bakery Plant template')
check(plantBusinessTemplateForShopTemplateId('fashion') === fashion, 'fashion Shop resolves to the fashion Plant template')
for (const template of shopBusinessTemplates) {
  if (template.id === 'bakery' || template.id === 'fashion') continue
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

  // ---- queue item 4: guided shift activity chained onto the same provisioning call ----------
  check(hasGuidedSampleProductionActivity(state), 'hasGuidedSampleProductionActivity is true after provisioning -- the shift-activity call actually ran')
  check(isGuidedSampleProduction(state), 'isGuidedSampleProduction is STILL true after the shift-activity call, not just after the jobs install')
  check(state.orderExecution === undefined, 'the legacy single-order field was never written -- the portfolio write boundary is the only path used')
  check(state.equipmentMaster === undefined, 'no equipmentMaster was written')
  check(
    state.events.every((event) => event.kind !== 'shift_closed'),
    'no shift was closed -- item 4 stays strictly below Plant\'s outcome-metric proof counter',
  )
  // Batch release and output inspection are plant-order-foundation.ts concepts recorded on
  // orderPortfolio/orderExecution, not on ProductionState.events -- already proven absent above.
  const guidedEvents = state.events.filter((event) => event.actionId.startsWith('ACT-GUIDED-SAMPLE-'))
  check(guidedEvents.length >= 1, 'at least one guided-sample activity event was recorded')
  const materialEvent = guidedEvents.find((event) => event.kind === 'material_consumed')
  check(materialEvent?.materialRef === bakery.primaryMaterial.ref, 'the material issue uses the template\'s primaryMaterial ref')
  check(materialEvent?.materialUnit === bakery.primaryMaterial.unit, 'the material issue uses the template\'s primaryMaterial unit')
  const primaryJob = state.jobs.find((job) => job.id === bakery.jobs[0].jobCode)
  check(Boolean(primaryJob) && primaryJob.output > 0, 'the running shift shows good output recorded on a bakery job')
  check(Boolean(primaryJob) && (primaryJob.scrap ?? 0) > 0, 'the running shift shows scrap recorded on a bakery job')
  const shiftRef = guidedEvents.find((event) => event.kind === 'output_recorded')?.shiftRef
  const shift = productionShiftOutput(state, shiftRef ?? '')
  check(shift.goodUnits > 0 && shift.scrapUnits > 0, 'productionShiftOutput reports both good output and scrap for the running shift')

  // ---- queue item 8: the released BOM/routing order chained onto the same provisioning call -
  check(Boolean(state.orderPortfolio), 'an orderPortfolio was written -- the reviewed plan was applied')
  const execution = productionOrderExecutionForJob(state, bakery.jobs[0].jobCode)
  check(Boolean(execution), 'the order execution is retrievable for the primary bakery job')
  const projection = projectPlantOrder(execution)
  check(projection.status === 'released', 'the order projects as released, not just planned or ready')
  check(Boolean(projection.orderRelease), 'a release_order command exists in the chain')
  check(projection.plan?.materials.length === 5, 'the released plan carries exactly 5 materials')
  check(projection.plan?.routing.length === 4, 'the released plan carries exactly 4 costed operations')
  check(
    projection.plan?.materials.every((material) => Boolean(material.standardCostPerUnitMmk)),
    'every released material is costed',
  )
  check(
    projection.plan?.routing.every((step) => Boolean(step.standardCostPerMinuteMmk)),
    'every released operation is costed',
  )
  check(
    Boolean(primaryJob) && projection.plan?.job.targetQuantity === primaryJob.target - primaryJob.output - (primaryJob.scrap ?? 0),
    'the released plan\'s targetQuantity equals target - output - scrap on the CURRENT job record, not the template\'s literal target',
  )
  check(
    execution.commands.every((command) => command.payload.proof.actionId.startsWith('ACT-GUIDED-SAMPLE-')),
    'every command in the released order carries a guided-sample-prefixed proof',
  )
  check(
    !execution.commands.some((command) => command.payload.kind === 'inspect_output' || command.payload.kind === 'release_batch'),
    'no inspect_output or release_batch command exists -- a released ORDER is not a released BATCH',
  )
  const calibrations = execution.commands.filter((command) => command.payload.kind === 'record_calibration')
  check(
    calibrations.length === new Set(projection.plan?.routing.map((step) => step.workCentreId)).size,
    'exactly one calibration command exists per distinct routed work centre',
  )
  const costDrivers = projectPlantOrderCostDrivers(projection)
  check(costDrivers.materials.length === 5 && costDrivers.operations.length === 4, 'the cost-driver projection returns non-empty materials and operations')
  const financialCost = projectPlantOrderFinancialCost(projection)
  check(financialCost.status !== 'setup_required' && financialCost.missingRates.length === 0, 'the financial-cost projection is available, not setup_required')
  check(financialCost.planned.totalMmk > 0, 'the financial-cost projection reports a nonzero planned total')
  check(isGuidedSampleProduction(state), 'isGuidedSampleProduction is STILL true after the released order -- proving item 7\'s widened guard accepts a real plan')

  // ---- second run: report what actually happens rather than assume replay is a no-op --------
  // Before this item, installProductionWorkingSampleJobs accepted a second bakery run as a
  // legitimate reinstall (fresh due dates each time, since capturedAt is millisecond-precision
  // and taken fresh on every call -- see queue item 3's finding). That is STILL true of
  // installProductionWorkingSampleJobs in isolation. But provisionLocalPlantWorkingSample no
  // longer calls only that: once the guided-sample activity call above has appended events that
  // do NOT carry the working-sample action prefix, installProductionWorkingSampleJobs's own
  // "is the current state exactly consistent with a prior sample install" recompute
  // (productionWorkingSampleTransitionIsExact's structural check) no longer matches on a second
  // call -- those extra events are the discrepancy. So the reinstall is refused (the transition
  // returns the input state unchanged, not an error), and disposition falls back to its
  // 'preserved' default. The net effect: with item 4 wired, a second provisioning run IS a
  // genuine no-op -- but via jobs-reinstall refusal, not via a byte-identical recompute, and it
  // preserves the recorded shift progress instead of silently resetting it.
  await new Promise((resolve) => setTimeout(resolve, 5))
  const secondDisposition = await provisionLocalPlantWorkingSample('general-manufacturing', 'production-control', 'Thiri Bakery Owner')
  check(secondDisposition === 'preserved', 'a second bakery provisioning run is refused as a reinstall and reports \'preserved\', now that guided-sample activity events are present')
  const stateAfterSecondRun = validateProductionState(JSON.parse(store.getItem(PRODUCTION_KEY)))
  check(JSON.stringify(stateAfterSecondRun) === JSON.stringify(state), 'the second run leaves the workspace byte-identical -- a genuine no-op, not just an unchanged disposition label')
  check(productionWorkingSamplePackId(stateAfterSecondRun) === 'bakery', 'the second run is still the bakery sample')
  check(isGuidedSampleProduction(stateAfterSecondRun), 'the second run is still a pure guided sample')
  check(hasGuidedSampleProductionActivity(stateAfterSecondRun), 'the second run still carries the guided-sample activity')
  // Queue item 8's own chain (import_plan -> availability_check -> N calibrations ->
  // release_order) is entirely idempotent on deterministic command ids, so the second run
  // replays every command rather than rejecting or duplicating any of them -- the byte-identical
  // check above already proves this for the whole workspace; this asserts it specifically for
  // the order execution, so a future change that breaks JUST the order chain fails here by name.
  const executionAfterSecondRun = productionOrderExecutionForJob(stateAfterSecondRun, bakery.jobs[0].jobCode)
  check(
    JSON.stringify(executionAfterSecondRun) === JSON.stringify(execution),
    'the second run\'s order execution command chain is byte-identical to the first run\'s',
  )
}

// ---- queue item 9: a fashion Shop gets the fashion Plant template, mirroring the bakery
// integration block above check-for-check, proving provisionPlantBusinessTemplateOrder and the
// rest of the write path needed ZERO code changes to work for a second template. ---------------
{
  const store = fakeStore({
    [COMMERCE_KEY]: JSON.stringify(storeWithShopTemplate('fashion')),
    [PRODUCTION_KEY]: JSON.stringify(createSeedProduction()),
  })
  installGlobals(store)

  check(readLocalShopBusinessTemplateId() === 'fashion', 'sanity: this device really does detect a fashion Shop with no storage argument')

  const disposition = await provisionLocalPlantWorkingSample('general-manufacturing', 'production-control', 'Thiri Fashion Owner')
  check(disposition === 'installed', 'first fashion provisioning run installs')

  const state = validateProductionState(JSON.parse(store.getItem(PRODUCTION_KEY)))
  check(productionWorkingSamplePackId(state) === 'fashion', 'the installed sample is identified as fashion, not a generic pack')
  check(
    JSON.stringify(state.jobs.map((job) => job.product).sort())
    === JSON.stringify(fashion.jobs.map((job) => job.product).sort()),
    'the installed jobs are the fashion jobs (fashion product names on a fashion floor)',
  )
  check(
    JSON.stringify(state.machines) === JSON.stringify(fashion.machines.map((machine) => ({ ...machine }))),
    'the installed floor is the fashion machines, not Mixer 01 / Press 02 / Finishing 01',
  )
  const fashionOpenIssue = state.issues.find((issue) => issue.status === 'open')
  check(fashionOpenIssue?.area === fashion.openingIssue.area && fashionOpenIssue?.summary === fashion.openingIssue.summary, 'the opening issue is the fashion one')
  check(state.jobs.every((job) => job.owner === 'Thiri Fashion Owner'), 'jobs carry the setup owner')

  check(isGuidedSampleProduction(state), 'isGuidedSampleProduction still returns true after installing the fashion jobs')

  // ---- guided shift activity chained onto the same provisioning call (item 4's generic path) --
  check(hasGuidedSampleProductionActivity(state), 'hasGuidedSampleProductionActivity is true after fashion provisioning -- the shift-activity call actually ran')
  check(isGuidedSampleProduction(state), 'isGuidedSampleProduction is STILL true after the shift-activity call, not just after the jobs install')
  check(state.orderExecution === undefined, 'the legacy single-order field was never written -- the portfolio write boundary is the only path used')
  check(state.equipmentMaster === undefined, 'no equipmentMaster was written')
  check(
    state.events.every((event) => event.kind !== 'shift_closed'),
    'no shift was closed for fashion either -- item 4 stays strictly below Plant\'s outcome-metric proof counter',
  )
  const fashionGuidedEvents = state.events.filter((event) => event.actionId.startsWith('ACT-GUIDED-SAMPLE-'))
  check(fashionGuidedEvents.length >= 1, 'at least one guided-sample activity event was recorded for fashion')
  const fashionMaterialEvent = fashionGuidedEvents.find((event) => event.kind === 'material_consumed')
  check(fashionMaterialEvent?.materialRef === fashion.primaryMaterial.ref, 'the material issue uses the fashion template\'s primaryMaterial ref')
  check(fashionMaterialEvent?.materialUnit === fashion.primaryMaterial.unit, 'the material issue uses the fashion template\'s primaryMaterial unit')
  const fashionPrimaryJob = state.jobs.find((job) => job.id === fashion.jobs[0].jobCode)
  check(Boolean(fashionPrimaryJob) && fashionPrimaryJob.output > 0, 'the running shift shows good output recorded on the fashion T-shirt job')
  check(Boolean(fashionPrimaryJob) && (fashionPrimaryJob.scrap ?? 0) > 0, 'the running shift shows scrap recorded on the fashion T-shirt job')
  const fashionShiftRef = fashionGuidedEvents.find((event) => event.kind === 'output_recorded')?.shiftRef
  const fashionShift = productionShiftOutput(state, fashionShiftRef ?? '')
  check(fashionShift.goodUnits > 0 && fashionShift.scrapUnits > 0, 'productionShiftOutput reports both good output and scrap for the fashion running shift')

  // ---- the released BOM/routing order chained onto the same provisioning call (item 8's generic
  // path, proving it needed zero fashion-specific code -- provisionPlantBusinessTemplateOrder
  // reads businessTemplate.plan/jobs[0]/industryPackId/id generically throughout) -------------
  check(Boolean(state.orderPortfolio), 'an orderPortfolio was written for fashion -- the reviewed plan was applied')
  const fashionExecution = productionOrderExecutionForJob(state, fashion.jobs[0].jobCode)
  check(Boolean(fashionExecution), 'the order execution is retrievable for the primary fashion job')
  const fashionProjection = projectPlantOrder(fashionExecution)
  check(fashionProjection.status === 'released', 'the fashion order projects as released, not just planned or ready')
  check(Boolean(fashionProjection.orderRelease), 'a release_order command exists in the fashion chain')
  check(fashionProjection.plan?.materials.length === 5, 'the released fashion plan carries exactly 5 materials')
  check(fashionProjection.plan?.routing.length === 4, 'the released fashion plan carries exactly 4 costed operations')
  check(
    fashionProjection.plan?.materials.every((material) => Boolean(material.standardCostPerUnitMmk)),
    'every released fashion material is costed',
  )
  check(
    fashionProjection.plan?.routing.every((step) => Boolean(step.standardCostPerMinuteMmk)),
    'every released fashion operation is costed',
  )
  check(
    Boolean(fashionPrimaryJob) && fashionProjection.plan?.job.targetQuantity === fashionPrimaryJob.target - fashionPrimaryJob.output - (fashionPrimaryJob.scrap ?? 0),
    'the released fashion plan\'s targetQuantity equals target - output - scrap on the CURRENT job record, not the template\'s literal target',
  )
  check(
    fashionExecution.commands.every((command) => command.payload.proof.actionId.startsWith('ACT-GUIDED-SAMPLE-')),
    'every command in the released fashion order carries a guided-sample-prefixed proof',
  )
  check(
    !fashionExecution.commands.some((command) => command.payload.kind === 'inspect_output' || command.payload.kind === 'release_batch'),
    'no inspect_output or release_batch command exists in the fashion chain -- a released ORDER is not a released BATCH',
  )
  const fashionCalibrations = fashionExecution.commands.filter((command) => command.payload.kind === 'record_calibration')
  check(
    fashionCalibrations.length === new Set(fashionProjection.plan?.routing.map((step) => step.workCentreId)).size,
    'exactly one calibration command exists per distinct routed fashion work centre',
  )
  const fashionCostDrivers = projectPlantOrderCostDrivers(fashionProjection)
  check(fashionCostDrivers.materials.length === 5 && fashionCostDrivers.operations.length === 4, 'the fashion cost-driver projection returns non-empty materials and operations')
  const fashionFinancialCost = projectPlantOrderFinancialCost(fashionProjection)
  check(fashionFinancialCost.status !== 'setup_required' && fashionFinancialCost.missingRates.length === 0, 'the fashion financial-cost projection is available, not setup_required')
  check(fashionFinancialCost.planned.totalMmk > 0, 'the fashion financial-cost projection reports a nonzero planned total')
  check(isGuidedSampleProduction(state), 'isGuidedSampleProduction is STILL true after the released fashion order -- proving item 7\'s widened guard accepts a second real plan')

  // ---- second run: same true-no-op replay item 8 established for bakery ----------------------
  await new Promise((resolve) => setTimeout(resolve, 5))
  const fashionSecondDisposition = await provisionLocalPlantWorkingSample('general-manufacturing', 'production-control', 'Thiri Fashion Owner')
  check(fashionSecondDisposition === 'preserved', 'a second fashion provisioning run is refused as a reinstall and reports \'preserved\', now that guided-sample activity events are present')
  const fashionStateAfterSecondRun = validateProductionState(JSON.parse(store.getItem(PRODUCTION_KEY)))
  check(JSON.stringify(fashionStateAfterSecondRun) === JSON.stringify(state), 'the second fashion run leaves the workspace byte-identical -- a genuine no-op, not just an unchanged disposition label')
  check(productionWorkingSamplePackId(fashionStateAfterSecondRun) === 'fashion', 'the second run is still the fashion sample')
  check(isGuidedSampleProduction(fashionStateAfterSecondRun), 'the second fashion run is still a pure guided sample')
  check(hasGuidedSampleProductionActivity(fashionStateAfterSecondRun), 'the second fashion run still carries the guided-sample activity')
  const fashionExecutionAfterSecondRun = productionOrderExecutionForJob(fashionStateAfterSecondRun, fashion.jobs[0].jobCode)
  check(
    JSON.stringify(fashionExecutionAfterSecondRun) === JSON.stringify(fashionExecution),
    'the second fashion run\'s order execution command chain is byte-identical to the first run\'s',
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

// ---- a mini-mart Shop (a reseller, per TEMPLATE-EXPANSION.md section (d) -- no Plant template
// and none intended) also falls back to the unchanged generic pack path, unaffected by fashion
// now being a second registered template ----------------------------------------------------
{
  const store = fakeStore({
    [COMMERCE_KEY]: JSON.stringify(storeWithShopTemplate('mini-mart')),
    [PRODUCTION_KEY]: JSON.stringify(createSeedProduction()),
  })
  installGlobals(store)
  check(readLocalShopBusinessTemplateId() === 'mini-mart', 'sanity: this device detects a mini-mart Shop')
  check(plantBusinessTemplateForShopTemplateId('mini-mart') === null, 'mini-mart has no Plant template')

  const pack = plantIndustryPack('general-manufacturing')
  const disposition = await provisionLocalPlantWorkingSample('general-manufacturing', '', 'Owner')
  check(disposition === 'installed', 'the generic pack path still installs for the mini-mart reseller trade')

  const state = validateProductionState(JSON.parse(store.getItem(PRODUCTION_KEY)))
  check(productionWorkingSamplePackId(state) === pack.id, 'a mini-mart Shop gets the generic pack, not bakery or fashion')
  check(state.jobs.some((job) => job.product === 'Finished product A'), 'a mini-mart Shop gets today\'s exact generic sample content, unchanged')
  check(
    JSON.stringify(state.machines) === JSON.stringify(createSeedProduction().machines),
    'a mini-mart Shop keeps the generic seed floor -- unchanged behaviour',
  )
  check(isGuidedSampleProduction(state), 'the generic-pack path also stays a pure guided sample for mini-mart')
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
