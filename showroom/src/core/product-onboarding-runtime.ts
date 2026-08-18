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
import {
  appendGuidedSampleProductionActivity,
  installProductionWorkingSampleJobs,
  mutateProductionWorkingSample,
  mutateProductionWorkspace,
  type ProductionJob,
} from './production-workspace.ts'
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
  const items: CommerceItem[] = preview.rows.map((row) => ({
    sku: row.values.sku,
    name: row.values.name,
    onHand: Number(row.values.onHand),
    reorderAt: Number(row.values.reorderAt),
    price: Number(row.values.price),
  }))
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
  return disposition
}

export async function provisionLocalShopBusinessTemplateSample(businessTemplateId: ShopBusinessTemplateId) {
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
  const items: CommerceItem[] = preview.rows.map((row) => ({
    sku: row.values.sku,
    name: row.values.name,
    onHand: Number(row.values.onHand),
    reorderAt: Number(row.values.reorderAt),
    price: Number(row.values.price),
  }))
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
  return disposition
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
