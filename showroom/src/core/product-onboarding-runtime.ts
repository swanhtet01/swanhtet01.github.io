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

export function provisionLocalShopIndustryPack(industryPackId: ShopIndustryPackId) {
  const stored = window.localStorage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)
  const next = stored
    ? provisionEmptyShopServiceSchedule(readShopServiceSchedule(stored), industryPackId)
    : createShopServiceSchedule(industryPackId)
  window.localStorage.setItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY, JSON.stringify(next))
  return next
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
