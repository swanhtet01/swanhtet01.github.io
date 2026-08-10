import {
  clientDemoPresets,
  clientImportTemplate,
  createClientImportPreview,
} from './client-onboarding'
import {
  installCommerceWorkingSampleCatalog,
  commerceWorkingSampleCatalogId,
  loadCommerceWorkspace,
  mutateCommerceWorkspace,
  type CommerceItem,
} from './commerce-workspace'
import { plantImportDueAt } from './managed-trial'
import {
  installProductionWorkingSampleJobs,
  mutateProductionWorkingSample,
  type ProductionJob,
} from './production-workspace'
import {
  SHOP_SERVICE_SCHEDULE_STORAGE_KEY,
  createShopServiceSchedule,
  provisionEmptyShopServiceSchedule,
  readShopServiceSchedule,
  shopIndustryPack,
  type ShopIndustryPackId,
} from './shop-service-scheduling'
import { plantIndustryPack, type PlantIndustryPackId } from './plant-industry-packs'
import { SETUP_KEY, normalizeSetup, type SetupState } from './product-setup'
import {
  shopBusinessTemplate,
  shopBusinessTemplateCatalogCsv,
  shopBusinessTemplates,
  type ShopBusinessTemplateId,
} from '../products/shop/business-templates'

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
 * Install the industry pack's empty schedule, PRESERVING any appointment already taken.
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
 */
export function provisionLocalShopIndustryPack(industryPackId: ShopIndustryPackId) {
  const stored = window.localStorage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)
  if (!stored) {
    const created = createShopServiceSchedule(industryPackId)
    window.localStorage.setItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY, JSON.stringify(created))
    return created
  }
  const current = readShopServiceSchedule(stored)
  try {
    const next = provisionEmptyShopServiceSchedule(current, industryPackId)
    window.localStorage.setItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY, JSON.stringify(next))
    return next
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
  let disposition: 'installed' | 'current' | 'preserved' = 'preserved'
  const result = await mutateCommerceWorkspace((current) => {
    const next = installCommerceWorkingSampleCatalog(current, {
      sampleId: template.id,
      sampleName: template.name.en,
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

export async function provisionLocalPlantWorkingSample(industryPackId: PlantIndustryPackId, workflowTemplateId: string, owner: string) {
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
