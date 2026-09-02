// Explicit .ts extensions throughout this block: local-merchandising-import.ts now imports
// readLocalShopBusinessTemplateId from this module, and verify_app_build.mjs imports THAT module
// directly under node for its runtime checks, where an extensionless specifier does not resolve.
// Vite tolerates either, so the omission only shows in CI -- see the identical note atop
// local-merchandising-import.ts.
import {
  clientDemoPresets,
  clientImportTemplate,
  createClientImportPreview,
} from './client-onboarding.ts'
import {
  installCommerceWorkingSampleActivity,
  installCommerceWorkingSampleCatalog,
  commerceWorkingSampleCatalogId,
  loadCommerceWorkspace,
  mutateCommerceWorkspace,
  type CommerceItem,
} from './commerce-workspace.ts'
import { plantImportDueAt } from './managed-trial.ts'
import { withShopServiceMyanmarNames } from './shop-service-scheduling.ts'
import {
  appendGuidedSampleProductionActivity,
  GUIDED_SAMPLE_PRODUCTION_ACTOR,
  installProductionWorkingSampleJobs,
  mutateProductionWorkingSample,
  mutateProductionWorkspace,
  validateProductionState,
  type ProductionJob,
  type ProductionState,
} from './production-workspace.ts'
import {
  productionOrderExecutionForJob,
  upsertProductionOrderExecution,
} from './production-order-portfolio.ts'
import {
  applyPlantOrderPlan,
  buildPlantOrderControlledPlan,
  checkPlantOrderAvailability,
  createEmptyPlantOrderState,
  plantOrderEvidenceDigest,
  projectPlantOrder,
  recordPlantOrderCalibration,
  releasePlantOrder,
  validatePlantOrderState,
  type PlantOrderProof,
  type PlantOrderState,
  type PlantOrderTransitionResult,
} from './plant-order-foundation.ts'
import {
  SHOP_SERVICE_SCHEDULE_STORAGE_KEY,
  createShopServiceSchedule,
  createShopServiceScheduleDemo,
  isGuidedSampleShopSchedule,
  provisionEmptyShopServiceSchedule,
  readShopServiceSchedule,
  shopIndustryPack,
  type ShopIndustryPackId,
} from './shop-service-scheduling.ts'
import { plantIndustryPack, type PlantIndustryPackId } from './plant-industry-packs.ts'
import { SETUP_KEY, normalizeSetup, type SetupState } from './product-setup.ts'
import {
  rebaseWorkingSampleActivity,
  shopBusinessTemplate,
  shopBusinessTemplateCatalogCsv,
  shopBusinessTemplates,
  type ShopBusinessTemplateId,
} from '../products/shop/business-templates.ts'
import {
  plantBusinessTemplateForShopTemplateId,
  plantBusinessTemplateJobs,
  type PlantBusinessTemplate,
} from '../products/plant/business-templates.ts'

export function readLocalShopIndustryPackId() {
  if (typeof window === 'undefined') return clientDemoPresets[0].shopIndustryPackId
  try {
    const stored = window.localStorage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)
    return stored ? readShopServiceSchedule(stored).industryPackId : clientDemoPresets[0].shopIndustryPackId
  } catch {
    return clientDemoPresets[0].shopIndustryPackId
  }
}

// Structurally the same shape loadCommerceWorkspace takes. Declared here so the detection
// below can be driven by a fake store in tools/test_website_trade_detection.mjs -- the
// contract that matters is what it does with ODD data, which a browser cannot be made to
// produce on demand.
type OnboardingReadableStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/**
 * The trade this device's Shop was set up as, or null if it cannot be determined.
 *
 * Onboarding installs a business template's catalog and stamps every baseline with an action
 * id derived from the template, so the trade is already recorded -- there is no need to ask
 * the owner a second time on another product's setup screen.
 *
 * Returns null rather than a default whenever the answer is not certain: no Shop data yet, a
 * catalog imported from the owner's own CSV, or a mix of samples. A wrong guess here would
 * silently rewrite a website's wording for the wrong kind of business, which is worse than
 * asking.
 */
export function readLocalShopBusinessTemplateId(
  storage?: OnboardingReadableStorage,
): ShopBusinessTemplateId | null {
  if (!storage && typeof window === 'undefined') return null
  try {
    const snapshot = loadCommerceWorkspace(storage)
    if (snapshot.error) return null
    const installed = commerceWorkingSampleCatalogId(snapshot.state)
    if (!installed) return null
    const match = shopBusinessTemplates.find((template) => template.id === installed)
    return match ? match.id : null
  } catch {
    return null
  }
}

/**
 * The business name the owner typed during onboarding, or null if they have not given one.
 *
 * Same reasoning as readLocalShopBusinessTemplateId: they already answered this, so another
 * product's setup screen should not open showing a sample business called something else.
 * Seeing a stranger's shop name on your own setup screen is the clearest possible signal
 * that nothing you did was remembered.
 *
 * Returned verbatim, NOT repaired. If a stored name is too long for a website brief the
 * owner is shown that error rather than a silently shortened name.
 */
export function readLocalSetupBusinessName(storage?: OnboardingReadableStorage): string | null {
  if (!storage && typeof window === 'undefined') return null
  try {
    const store = storage ?? window.localStorage
    const raw = store.getItem(SETUP_KEY)
    if (!raw) return null
    const name = normalizeSetup(JSON.parse(raw) as SetupState).workspace
    return name.trim().length > 0 ? name : null
  } catch {
    return null
  }
}

// ==============================================================================================
// What a SIGNED-IN (managed) owner is told when she sets up Shop or Plant.
//
// Every guided provisioner in this module writes through loadCommerceWorkspace /
// mutateCommerceWorkspace and mutateProductionWorkingSample, which are window.localStorage. A
// managed workspace does not read that store at all -- it reads server-authoritative state,
// written only through saveManagedCommerceCommand / saveManagedProductionCommand ->
// /api/trial/v1/commands. Measured end to end in hq/research/MANAGED-TEMPLATE-PROVISIONING.md
// for Shop, and re-measured the same way for Plant when this guard was added: for a managed
// account BOTH provisioners reported `installed` with ZERO network calls and only browser-local
// keys written, so the company workspace stayed at version 0 and the product rendered
// 'managed-unprovisioned' -- while onboarding told the owner her catalog, or her jobs and floor,
// were ready. A false success, uniform across all ten Shop trades and all five Plant packs.
//
// Named Shop business templates now route to CoreApp's reviewed managed-catalog initializer. It
// copies only catalog items and accountable baselines after the owner confirms the values and
// evidence; sample sales, customers, appointments, and local history remain excluded. Generic
// Shop packs and every Plant pack still use the honest one-record managed setup below because
// they do not yet have that reviewed server activation path.
//
// The copy lives here, beside the reason, so it cannot drift back into a promise.
// ==============================================================================================

/**
 * Shown after a signed-in owner submits Shop setup. It has three jobs, in this order: keep the
 * trade she just chose (dropping it silently would be its own small lie), say plainly that nothing
 * was added, and name the one next step so being routed onward reads as the next move rather than
 * an error.
 *
 * It deliberately makes NO claim that her trade was SAVED, because for a company account it is
 * not. Both writes that would have kept it are browser-local and both are now guarded:
 * provisionLocalShopIndustryPack (the pack id) and provisionLocalShopBusinessTemplateSample (the
 * commerce stamp readLocalShopBusinessTemplateId reads back). What survives is only the derived
 * workflow template on the setup record, and that does not distinguish her trade -- measured, six
 * of the ten trades persist identically as 'retail-wholesale'. On her next visit
 * readLocalShopIndustryPackId returns the 'retail' default and readLocalShopBusinessTemplateId
 * returns null, so the picker shows "Standard sample", not her trade.
 *
 * An earlier draft opened with "<trade> is saved as your business type". That is the kind of
 * technically-not-false sentence this whole module exists to remove: it invites her to believe a
 * spa catalog is on file and waiting. Contrast managedPlantOnboardingNotice, which DOES say
 * "saved" -- because Plant's pack id genuinely round-trips.
 */
export function managedShopOnboardingNotice(businessTypeName: string): string {
  return `You chose ${businessTypeName}, but company accounts do not get sample records, `
    + 'so nothing was added to this workspace. Open Shop and add your first real item. The prices and stock '
    + 'you enter there are the ones your team sells from.'
}

/**
 * The hint under the submit button, so the honest version is read BEFORE the tap, not only after
 * it. The browser-local wording it replaces is "Creates local sample records, then opens the first
 * task."
 */
export const MANAGED_SHOP_ONBOARDING_HINT =
  'Opens Shop so you can add your first real item. Nothing is copied into a company account.'

/**
 * Replaces the panel's "We will add realistic sample records now" intro, which is the same false
 * promise one step earlier in the flow.
 */
export const MANAGED_SHOP_ONBOARDING_INTRO =
  'Your company account holds real records only. Name this workspace, then add your own items in Shop.'

/**
 * Replaces the commerce entry in onboardingJourneys for a company account. The browser-local
 * wording it stands in for -- "Complete a sample sale" / "A realistic catalog and stock are ready.
 * Tap an item, choose payment, then create the order." / "Create Shop and start selling" -- is the
 * loudest promise on the page and it is made BEFORE the owner taps anything. None of it is true
 * for her: there is no catalog to tap and no sample sale to complete. She does still get a first
 * useful result, it is just a different one, so it is named rather than removed.
 *
 * firstTaskPath is deliberately not overridden. Shop returns its "Create the real catalog"
 * boundary for a managed account whatever tab is asked for, so the existing path lands her exactly
 * on the step this copy promises.
 */
export const MANAGED_SHOP_ONBOARDING_JOURNEY = {
  outcome: 'Add your first real item',
  detail: 'Shop opens on your company catalog setup. Enter one item with its price and opening count, and you can sell it straight away.',
  actionLabel: 'Create Shop and add your first item',
}

/**
 * Plant's twin of managedShopOnboardingNotice. Same three jobs, but it names what a managed Plant
 * ACTUALLY asks for next, which is not what Shop asks for: CoreApp's "Create the real operating
 * plan" boundary reviews one suggested real job AND the machine that runs it, not a single priced item. Copy
 * that mirrored Shop's "add your first real item" would be a second, smaller lie about the very
 * screen it is sending her to.
 *
 * "is saved as your plant type" is literally true here, and deliberately so:
 * savePlantIndustryPackId is kept OUTSIDE the managed guard in ProductOnboardingPage, because the
 * picker's choice is a device preference that readPlantIndustryPackId reads back on her next
 * visit -- not workspace data a managed account would need the server to hold. Verified as an
 * EXACT round-trip for all five packs: what she picks is what readPlantIndustryPackId returns
 * and what the picker shows her again. Shop cannot say the same, which is why its notice
 * claims nothing about saving -- see managedShopOnboardingNotice above.
 */
export function managedPlantOnboardingNotice(plantTypeName: string): string {
  return `${plantTypeName} is saved as your plant type. Company accounts do not get sample records, `
    + 'so no jobs, machines or output were added to this workspace. Open Plant and review the suggested first real job. '
    + 'Only the job and machine you confirm there are written to the company account.'
}

/**
 * Plant's twin of MANAGED_SHOP_ONBOARDING_HINT. The browser-local wording it replaces is the same
 * shared "Creates local sample records, then opens the first task."
 */
export const MANAGED_PLANT_ONBOARDING_HINT =
  'Opens Plant to review an editable first real job and machine. Nothing is written until you confirm real values.'

/**
 * Plant's twin of MANAGED_SHOP_ONBOARDING_INTRO, replacing the same shared "We will add realistic
 * sample records now" sentence -- one sentence, shared between the two products, false for both.
 */
export const MANAGED_PLANT_ONBOARDING_INTRO =
  'Your company account holds real records only. Name this workspace, then enter your own jobs in Plant.'

/**
 * Replaces the production entry in onboardingJourneys for a company account. The browser-local
 * wording -- "Run a sample production job" / "A scheduled job, materials, and line are ready.
 * Review the job, then record output." / "Create Plant and open the job" -- is if anything a more
 * specific promise than Shop's: it names a scheduled job, materials AND a line, none of which
 * exist in a managed workspace. There is no job to open and no output to record.
 *
 * firstTaskPath is deliberately not overridden, for the same reason as Shop: ProductionPage
 * returns its 'managed-unprovisioned' boundary before it ever reads the requested tab, so
 * /plant/?tab=production already lands her on the step this copy promises.
 */
export const MANAGED_PLANT_ONBOARDING_JOURNEY = {
  outcome: 'Create your first real job',
  detail: 'Plant opens on your company plan setup. Enter one real job and the machine that runs it, and your floor is live.',
  actionLabel: 'Create Plant and add your first job',
}

export const MANAGED_WEBSITE_ONBOARDING_HINT =
  'Opens the company Website starter for review. No browser sample is copied into the company account.'

export const MANAGED_WEBSITE_ONBOARDING_INTRO =
  'Your company Website is server-backed. Name this workspace, then replace the starter text with approved business content.'

export const MANAGED_WEBSITE_ONBOARDING_JOURNEY = {
  outcome: 'Draft your real homepage',
  detail: 'Website opens on the company starter. Replace its example text, preview mobile and desktop, then save the reviewed content.',
  actionLabel: 'Open Website and edit the homepage',
}

export const MANAGED_ECOMMERCE_ONBOARDING_HINT =
  'Opens Ecommerce to review the company storefront. No sample orders are created.'

export const MANAGED_ECOMMERCE_ONBOARDING_INTRO =
  'Your company account holds real order records only. Name this workspace, then review the storefront before taking orders.'

export const MANAGED_ECOMMERCE_ONBOARDING_JOURNEY = {
  outcome: 'Review your online store',
  detail: 'Ecommerce opens on company storefront setup. Review catalog source, fulfilment, payment, and Shop handoff before taking orders.',
  actionLabel: 'Open Ecommerce and review the store',
}

export function managedOnboardingAccountCheckPending(
  runtimeStatus: 'checking' | 'enterprise' | 'demo',
  managedIdentitySettled: boolean,
): boolean {
  return runtimeStatus === 'checking'
    || (runtimeStatus === 'enterprise' && !managedIdentitySettled)
}

/**
 * Install the industry pack's appointment book, PRESERVING any appointment already taken.
 *
 * provisionEmptyShopServiceSchedule refuses to overwrite a schedule that has bookings, and that
 * refusal is correct -- it is protecting a real customer's appointment. What was wrong is that
 * this function let the exception escape into ProductOnboardingPage's provisioning run, which
 * aborts BEFORE the catalog installs. So the sequence a spa would naturally follow -- take a
 * booking, then finish setting up -- left the shop with no catalog at all.
 *
 * It now returns the schedule that is actually in force -- the new one when installed, the
 * EXISTING one when an appointment made it unsafe to replace -- instead of throwing. The return
 * type is deliberately unchanged so callers that read .industryPackId keep working, and when a
 * schedule is preserved that pack id is the correct answer anyway. The invariant stays where it
 * belongs, in provisionEmptyShopServiceSchedule.
 *
 * What is installed is the pack's guided sample day, not a blank book. A spa whose first screen
 * is an empty diary has been handed a filing cabinet; three bookings partway through their day
 * is the product working. The sample is replaceable by construction --
 * isGuidedSampleShopSchedule holds for it -- and it books nothing a real customer would be
 * charged for.
 */
export function provisionLocalShopIndustryPack(
  industryPackId: ShopIndustryPackId,
  planningDay = new Date().toISOString().slice(0, 10),
) {
  const stored = window.localStorage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)
  if (!stored) {
    const created = createShopServiceScheduleDemo(industryPackId, planningDay)
    window.localStorage.setItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY, JSON.stringify(created))
    return created
  }
  const current = readShopServiceSchedule(stored)
  try {
    // The invariant still lives in provisionEmptyShopServiceSchedule and is still asked. What
    // changed is WHAT is handed to it. A schedule carrying only guided-sample events is this
    // function's own previous output, so it is reduced to the blank book it grew from before the
    // question is put -- otherwise re-running setup on a seeded device could never move pack
    // again. A schedule carrying a single event a human authored fails isGuidedSampleShopSchedule
    // and is handed over INTACT, so the refusal fires and the appointment survives.
    const replaceable = isGuidedSampleShopSchedule(current)
      ? createShopServiceSchedule(current.industryPackId)
      : current
    const next = provisionEmptyShopServiceSchedule(replaceable, industryPackId)
    const seeded = createShopServiceScheduleDemo(next.industryPackId, planningDay)
    window.localStorage.setItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  } catch {
    // An appointment already exists. Keep it, keep its pack, and let onboarding continue so the
    // catalog still installs.
    return current
  }
}

export async function provisionLocalShopWorkingSample(industryPackId: ShopIndustryPackId, workflowTemplateId: string) {
  const pack = shopIndustryPack(industryPackId)
  const preview = await createClientImportPreview(
    clientImportTemplate('commerce', workflowTemplateId, { shopIndustryPackId: industryPackId }),
    'commerce',
    undefined,
    `sample-${industryPackId}.csv`,
    workflowTemplateId,
  )
  if (!preview.readyForStaging || preview.rows.some((row) => row.status !== 'ready')) {
    throw new Error(`The ${pack.name} working sample did not pass its local data checks.`)
  }
  // The CSV has no Burmese column and must not grow one -- an owner's own import would then be
  // expected to supply Myanmar copy. The pack in scope a few lines above already carries the
  // translations the appointment book displays, so they are carried onto the treatment rows here
  // instead of being dropped, which is what left the counter in English.
  const items: CommerceItem[] = withShopServiceMyanmarNames(preview.rows.map((row) => ({
    sku: row.values.sku,
    name: row.values.name,
    onHand: Number(row.values.onHand),
    reorderAt: Number(row.values.reorderAt),
    price: Number(row.values.price),
  })), pack.id)
  const commerceWorkspace = loadCommerceWorkspace()
  if (commerceWorkspace.error) throw new Error(commerceWorkspace.error)
  let disposition: 'installed' | 'current' | 'preserved' = 'preserved'
  const result = await mutateCommerceWorkspace((current) => {
    const next = installCommerceWorkingSampleCatalog(current, {
      sampleId: pack.id,
      sampleName: pack.name,
      items,
      capturedAt: new Date().toISOString(),
    })
    if (!next) return current
    disposition = next === current ? 'current' : 'installed'
    return next
  })
  if (!result.ok) throw new Error(result.error)
  clearInstalledSampleCounterDraft(disposition)
  return disposition
}

export async function provisionLocalShopBusinessTemplateSample(
  businessTemplateId: ShopBusinessTemplateId,
): Promise<'installed' | 'current' | 'preserved'> {
  // A trade link is allowed to replace an untouched guided sample, never a sale the operator
  // is already ringing up. The cart is stored separately from the Commerce workspace, so the
  // catalog guard cannot see it; check it before staging any replacement and fail closed.
  if (localShopCounterDraftHasLines()) return 'preserved'
  const template = shopBusinessTemplate(businessTemplateId)
  const preview = await createClientImportPreview(
    shopBusinessTemplateCatalogCsv(template.id),
    'commerce',
    undefined,
    `sample-${template.id}.csv`,
    template.workflowTemplateId,
  )
  if (!preview.readyForStaging || preview.rows.some((row) => row.status !== 'ready')) {
    throw new Error(`The ${template.name.en} business template did not pass its local data checks.`)
  }
  // Same reasoning as the pack route above; a trade template installs its pack's service rows.
  const items: CommerceItem[] = withShopServiceMyanmarNames(preview.rows.map((row) => ({
    sku: row.values.sku,
    name: row.values.name,
    onHand: Number(row.values.onHand),
    reorderAt: Number(row.values.reorderAt),
    price: Number(row.values.price),
  })), template.industryPackId)
  const commerceWorkspace = loadCommerceWorkspace()
  if (commerceWorkspace.error) throw new Error(commerceWorkspace.error)
  const provisionedAt = new Date().toISOString()
  // Authored once per provisioning run, not once per attempt, so the sales and the promise are
  // shifted against the same instant the catalog is stamped with.
  const activity = rebaseWorkingSampleActivity(template, provisionedAt)
  let disposition: 'installed' | 'current' | 'preserved' = 'preserved'
  const result = await mutateCommerceWorkspace((current) => {
    const next = installCommerceWorkingSampleCatalog(current, {
      sampleId: template.id,
      sampleName: template.name.en,
      items,
      capturedAt: provisionedAt,
    })
    if (!next) return current
    // The catalog alone is a price list, not a business: no takings, no order waiting. The sales
    // and the pending order go in inside the SAME transition so the workspace is never written in
    // the half-state a client would read as "it did not work".
    //
    // installCommerceWorkingSampleActivity fails closed and returns null. Treated exactly like the
    // catalog result above -- return `current`, leave the disposition at 'preserved' -- so a
    // failure abandons the whole transition instead of persisting a catalog the caller was told
    // carried activity. 'preserved' is what ProductOnboardingPage turns into "nothing was
    // overwritten", which is precisely true when the transition is abandoned.
    const withActivity = installCommerceWorkingSampleActivity(next, {
      sampleId: template.id,
      sampleName: template.name.en,
      counterSales: activity.counterSales,
      pendingOrder: activity.pendingOrder,
    })
    if (!withActivity) return current
    disposition = withActivity === current ? 'current' : 'installed'
    return withActivity
  })
  if (!result.ok) throw new Error(result.error)
  clearInstalledSampleCounterDraft(disposition)
  return disposition
}

const SHOP_COUNTER_DRAFT_STORAGE_KEY = 'supermega.shop.counter_draft.v1'

function localShopCounterDraftHasLines() {
  const raw = window.localStorage.getItem(SHOP_COUNTER_DRAFT_STORAGE_KEY)
  if (!raw) return false
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return true
    const cart = (parsed as { cart?: unknown }).cart
    if (!cart || typeof cart !== 'object' || Array.isArray(cart)) return true
    return Object.entries(cart).some(([sku, quantity]) => Boolean(sku)
      && Number.isSafeInteger(quantity)
      && (quantity as number) > 0)
  } catch {
    // Unknown draft data may still be the only copy of a sale. Keep it for explicit recovery.
    return true
  }
}

function clearInstalledSampleCounterDraft(disposition: 'installed' | 'current' | 'preserved') {
  // A newly installed catalog is a new till context. Keeping the previous draft can mix an
  // unrelated trade's items into the first sale (for example, grocery goods in a Spa setup).
  // Existing and preserved workspaces keep their in-progress sale; only a successful replacement
  // clears the stale browser-local draft.
  if (disposition === 'installed') window.localStorage.removeItem(SHOP_COUNTER_DRAFT_STORAGE_KEY)
}

/**
 * Builds and releases the reviewed BOM/routing order for a Plant business template's jobs[0]
 * (TEMPLATE-EXPANSION.md queue item 8), entirely under guided-sample-prefixed proofs so
 * isGuidedSampleProduction (production-workspace.ts, widened by queue item 7) keeps reading this
 * workspace as a replaceable guided sample. Only called when businessTemplate.plan is set --
 * unset for every template that has not shipped a plan yet, which must reach no code here at all.
 *
 * Applies import_plan -> availability_check -> one record_calibration per distinct work centre in
 * the routing -> release_order, each as its OWN mutateProductionWorkspace('order-execution')
 * call: that write boundary (productionOrderExecutionAppendIsExact) allows exactly one appended
 * command per call, so the chain cannot be batched into a single transition.
 *
 * Every id and proof.capturedAt is derived deterministically from the job's own current record
 * and the workspace's latest operating event -- never Date.now() or similar -- so a second
 * provisioning run reproduces byte-identical command payloads and every step replays as a true
 * no-op via applyPlantOrderPlan/etc.'s own idempotent-command-id handling; no special-casing
 * needed here.
 *
 * job.targetQuantity on the built plan is target - output - (scrap ?? 0), read fresh from the
 * CURRENT ProductionJob record inside the import_plan transition -- not the template's literal
 * target. By the time this runs, appendGuidedSampleProductionActivity has already recorded output
 * and scrap against that same job (see provisionLocalPlantWorkingSample below), and
 * productionOrderExecutionAppendIsExact requires the plan's targetQuantity to equal exactly that
 * remaining figure or the write is refused.
 */
async function provisionPlantBusinessTemplateOrder(businessTemplate: PlantBusinessTemplate) {
  const plan = businessTemplate.plan
  if (!plan) return
  const templateJob = businessTemplate.jobs[0]
  const jobId = templateJob.jobCode
  const templateTag = businessTemplate.id.toUpperCase()
  const outputBatchId = `${plantIndustryPack(businessTemplate.industryPackId).setup.outputPrefix}-${plan.outputBatchSuffix}`
  // PlantOrderRoutingDraft carries workCentreName for the manual-entry form's display only --
  // PlantOrderRoutingStep (what buildPlantOrderControlledPlan's routing actually validates
  // against) does not have that field, and its exact-fields check rejects an extra one, so it
  // is rebuilt field by field rather than spread.
  const routing = plan.routing.map((step, index) => ({
    operationId: step.operationId,
    sequence: index + 1,
    name: step.name,
    workCentreId: step.workCentreId,
    minutesPerUnitMilli: step.minutesPerUnitMilli,
    ...(step.standardCostPerMinuteMmk === undefined ? {} : { standardCostPerMinuteMmk: step.standardCostPerMinuteMmk }),
  }))
  const workCentreIds = plan.workCentres.map((centre) => centre.workCentreId)
  const planId = `PLN-${templateTag}-001`
  // Shared between the reviewed plan and the availability check that reviews it -- both
  // represent "what source data was this built from", so plant-order-foundation.ts requires the
  // same digest string on each. Built from fixed template content, never runtime state, so a
  // second provisioning run reproduces it exactly.
  const sourceDigest = plantOrderEvidenceDigest({
    schema: 'supermega.plant.template-order-source.v1',
    templateId: businessTemplate.id,
    jobId,
    materials: plan.materials,
    workCentres: plan.workCentres,
    routing,
  })

  let step = 0
  function nextProof(current: ProductionState, reason: string): PlantOrderProof {
    step += 1
    const base = Date.parse(current.events[0]?.createdAt ?? '')
    return {
      actionId: `ACT-GUIDED-SAMPLE-ORDER-${String(step).padStart(3, '0')}`,
      capturedAt: new Date((Number.isFinite(base) ? base : Date.now()) + step * 60_000).toISOString(),
      actor: GUIDED_SAMPLE_PRODUCTION_ACTOR,
      reason,
      evidenceReference: 'ORDER-REVIEW-001',
    }
  }

  async function applyStep(
    build: (currentExecution: PlantOrderState, current: ProductionState) => PlantOrderTransitionResult | null,
  ) {
    const result = await mutateProductionWorkspace((current) => {
      const currentExecution = validatePlantOrderState(
        productionOrderExecutionForJob(current, jobId) ?? createEmptyPlantOrderState(),
      )
      const applied = build(currentExecution, current)
      if (!applied || applied.replayed) return current
      return validateProductionState(upsertProductionOrderExecution(current, applied.state))
    }, undefined, undefined, 'order-execution')
    if (!result.ok) throw new Error(result.error)
  }

  // 1. Import the reviewed plan, with job.targetQuantity pinned to the job's current remaining
  // quantity (see the function doc above).
  await applyStep((currentExecution, current) => {
    const productionJob = current.jobs.find((candidate) => candidate.id === jobId)
    if (!productionJob || productionJob.closure || productionJob.qualityHold) return null
    const remaining = productionJob.target - productionJob.output - (productionJob.scrap ?? 0)
    if (remaining < 1) return null
    const reviewedPlan = buildPlantOrderControlledPlan({
      planId,
      sourceDigest,
      job: { jobId, product: productionJob.product, targetQuantity: remaining, outputBatchId },
      materials: plan.materials.map((material) => ({ ...material })),
      workCentres: plan.workCentres.map((centre) => ({ ...centre })),
      routing,
    })
    return applyPlantOrderPlan(
      currentExecution,
      reviewedPlan,
      nextProof(current, 'Reviewed BOM and routing imported for the starter production order.'),
      currentExecution.headDigest,
    )
  })

  // 2. Confirm material and work-centre capacity availability, generously above the reviewed
  // requirement -- this is a guided sample walkthrough, not a real supply constraint.
  await applyStep((currentExecution, current) => {
    const reviewedPlan = projectPlantOrder(currentExecution).plan
    if (!reviewedPlan) return null
    const materials = reviewedPlan.materials.map((material) => ({
      materialId: material.materialId,
      inputLotId: `LOT-${material.materialId.slice('MAT-'.length)}-001`,
      availableQuantityMilli: reviewedPlan.job.targetQuantity * material.quantityPerUnitMilli + 1_000,
    }))
    const requiredMinutesByCentre = new Map<string, number>()
    for (const operation of reviewedPlan.routing) {
      const required = reviewedPlan.job.targetQuantity * operation.minutesPerUnitMilli
      requiredMinutesByCentre.set(operation.workCentreId, (requiredMinutesByCentre.get(operation.workCentreId) ?? 0) + required)
    }
    const workCentres = reviewedPlan.workCentres.map((centre) => ({
      workCentreId: centre.workCentreId,
      availableMinutes: Math.ceil((requiredMinutesByCentre.get(centre.workCentreId) ?? 0) / 1_000) + 500,
    }))
    return checkPlantOrderAvailability(currentExecution, {
      checkId: `CHK-${templateTag}-001`,
      sourceDigest,
      materials,
      workCentres,
      proof: nextProof(current, 'Availability confirmed for materials and routed work-centre capacity.'),
      expectedHeadDigest: currentExecution.headDigest,
    })
  })

  // 3. One calibration per distinct routed work centre -- releasePlantOrder requires current
  // calibration for every work centre in the routing before it will release a controlled plan.
  for (const workCentreId of workCentreIds) {
    const segment = workCentreId.slice('WC-'.length)
    await applyStep((currentExecution, current) => {
      const capturedProof = nextProof(current, `Work-centre calibration confirmed for ${workCentreId}.`)
      const capturedAtMillis = Date.parse(capturedProof.capturedAt)
      return recordPlantOrderCalibration(currentExecution, {
        calibrationId: `CAL-${templateTag}-${segment}-001`,
        workCentreId,
        certificateId: `CERT-${templateTag}-${segment}-001`,
        calibratedAt: new Date(capturedAtMillis - 24 * 60 * 60 * 1000).toISOString(),
        validUntil: new Date(capturedAtMillis + 30 * 24 * 60 * 60 * 1000).toISOString(),
        standardReference: `${businessTemplate.name.en} equipment calibration standard`,
        proof: capturedProof,
        expectedHeadDigest: currentExecution.headDigest,
      })
    })
  }

  // 4. Release the order to the floor. This releases the ORDER (the plan/BOM/routing approved
  // for production) -- never inspectPlantOrderOutput or releasePlantOrderBatch, which release a
  // finished-goods BATCH and are Plant's proof counter. Per CLAUDE.md, a guided Plant sample
  // never earns that counter.
  await applyStep((currentExecution, current) => {
    const availability = projectPlantOrder(currentExecution).latestAvailability
    if (!availability) return null
    return releasePlantOrder(currentExecution, {
      releaseId: `REL-${templateTag}-001`,
      availabilityCheckId: availability.checkId,
      proof: nextProof(current, 'Order released to the floor after calibration and availability confirmation.'),
      expectedHeadDigest: currentExecution.headDigest,
    })
  })
}

export async function provisionLocalPlantWorkingSample(industryPackId: PlantIndustryPackId, workflowTemplateId: string, owner: string) {
  // A device whose Shop was set up on a trade that has a matching Plant business template (only
  // bakery today -- see products/plant/business-templates.ts and TEMPLATE-EXPANSION.md section
  // (d)) gets that trade's own jobs, floor, and opening issue instead of the generic pack CSV
  // below. readLocalShopBusinessTemplateId returns null for a device with no Shop yet, a
  // hand-imported catalog, or a trade with no Plant template, and null always falls through to
  // the unchanged generic path -- this must never change behavior for those devices.
  const businessTemplate = plantBusinessTemplateForShopTemplateId(readLocalShopBusinessTemplateId())
  if (businessTemplate) {
    const capturedAt = new Date().toISOString()
    const jobs = plantBusinessTemplateJobs(businessTemplate, capturedAt, owner)
    let disposition: 'installed' | 'current' | 'preserved' = 'preserved'
    const result = await mutateProductionWorkingSample((current) => {
      const next = installProductionWorkingSampleJobs(current, {
        sampleId: businessTemplate.id,
        sampleName: businessTemplate.name.en,
        jobs,
        capturedAt,
        machines: [...businessTemplate.machines],
        issue: businessTemplate.openingIssue,
      })
      if (!next) return current
      disposition = next === current ? 'current' : 'installed'
      return next
    })
    if (!result.ok) throw new Error(result.error)
    // Guided shift activity (good output, a little scrap, one material issue on up to 2 active
    // jobs) goes in as its own locked transition, not chained into the mutateProductionWorkingSample
    // call above: that call's write boundary (productionWorkingSampleTransitionIsExact) requires
    // the candidate to carry exactly one event per job -- the jobs/floor seed events -- so appending
    // the several extra events appendGuidedSampleProductionActivity writes would fail that check.
    // appendGuidedSampleProductionActivity is itself a safe no-op (returns the unchanged input) once
    // hasGuidedSampleProductionActivity is already true, so calling it on every provisioning run,
    // not just the first, is correct.
    const activityResult = await mutateProductionWorkspace((current) => appendGuidedSampleProductionActivity(current, {
      planningDay: capturedAt.slice(0, 10),
      materialRef: businessTemplate.primaryMaterial.ref,
      materialUnit: businessTemplate.primaryMaterial.unit,
    }))
    if (!activityResult.ok) throw new Error(activityResult.error)
    // Queue item 8: the reviewed BOM/routing/release order for this template's jobs[0], only
    // when the template ships one (still just bakery -- see business-templates.ts). Its own
    // locked order-execution transitions, for the same reason the activity call above is its
    // own transition: this write boundary's invariant allows exactly one appended command per
    // call. provisionPlantBusinessTemplateOrder is itself a safe no-op once every command has
    // already been applied, so calling it on every provisioning run is correct.
    await provisionPlantBusinessTemplateOrder(businessTemplate)
    return disposition
  }

  const pack = plantIndustryPack(industryPackId)
  const preview = await createClientImportPreview(
    clientImportTemplate('production', workflowTemplateId, { plantIndustryPackId: industryPackId }),
    'production',
    undefined,
    `sample-${industryPackId}.csv`,
    workflowTemplateId,
  )
  if (!preview.readyForStaging || preview.rows.some((row) => row.status !== 'ready')) {
    throw new Error(`The ${pack.name} working sample did not pass its local data checks.`)
  }
  const jobs: ProductionJob[] = preview.rows.map((row) => ({
    id: row.values.jobCode,
    line: row.values.line,
    product: row.values.productName,
    target: Number(row.values.targetQuantity),
    output: 0,
    owner: owner.trim(),
    priority: 'normal',
    dueAt: plantImportDueAt(row.values.dueDate),
  }))
  let disposition: 'installed' | 'current' | 'preserved' = 'preserved'
  const result = await mutateProductionWorkingSample((current) => {
    const next = installProductionWorkingSampleJobs(current, {
      sampleId: pack.id,
      sampleName: pack.name,
      jobs,
      capturedAt: new Date().toISOString(),
    })
    if (!next) return current
    disposition = next === current ? 'current' : 'installed'
    return next
  })
  if (!result.ok) throw new Error(result.error)
  return disposition
}
