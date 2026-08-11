import {
  clientDemoPresets,
  clientImportTemplate,
  createClientImportPreview,
} from './client-onboarding'
import {
  installCommerceWorkingSampleActivity,
  installCommerceWorkingSampleCatalog,
  loadCommerceWorkspace,
  mutateCommerceWorkspace,
  type CommerceItem,
} from './commerce-workspace'
import { plantImportDueAt } from './managed-trial'
import {
  PRODUCTION_KEY,
  appendGuidedSampleProductionActivity,
  createSeedProduction,
  hasGuidedSampleProductionActivity,
  installProductionWorkingSampleJobs,
  isGuidedSampleProduction,
  mutateProductionWorkspace,
  mutateProductionWorkingSample,
  validateProductionState,
  type ProductionJob,
} from './production-workspace'
import {
  SHOP_SERVICE_SCHEDULE_STORAGE_KEY,
  createShopServiceScheduleDemo,
  isGuidedSampleShopSchedule,
  provisionEmptyShopServiceSchedule,
  readShopServiceSchedule,
  shopIndustryPack,
  type ShopIndustryPackId,
} from './shop-service-scheduling'
import { plantIndustryPack, type PlantIndustryPackId } from './plant-industry-packs'
import {
  shopBusinessTemplate,
  shopBusinessTemplateCatalogCsv,
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

export function provisionLocalShopIndustryPack(industryPackId: ShopIndustryPackId) {
  const stored = window.localStorage.getItem(SHOP_SERVICE_SCHEDULE_STORAGE_KEY)
  if (stored) {
    const current = readShopServiceSchedule(stored)
    // Guided-sample evidence may be replaced; real appointment evidence keeps the strict guard.
    if (!isGuidedSampleShopSchedule(current)) provisionEmptyShopServiceSchedule(current, industryPackId)
  }
  // The projection reads "today" in the browser's local day, and Myanmar is UTC+6:30,
  // so seeding by UTC day would show an empty schedule for part of every day.
  const planningDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date())
  const next = createShopServiceScheduleDemo(industryPackId, planningDay)
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
    const withCatalog = installCommerceWorkingSampleCatalog(current, {
      sampleId: template.id,
      sampleName: template.name.en,
      items,
      capturedAt: new Date().toISOString(),
    })
    if (!withCatalog) return current
    const next = installCommerceWorkingSampleActivity(withCatalog, {
      sampleId: template.id,
      sampleName: template.name.en,
      counterSales: template.counterSales,
      pendingOrder: template.pendingOrder,
    }) ?? withCatalog
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
  // A pure guided-sample workspace may be replaced when switching packs; real
  // operator evidence keeps the existing preservation behavior.
  try {
    const stored = window.localStorage.getItem(PRODUCTION_KEY)
    if (stored) {
      const current = validateProductionState(JSON.parse(stored))
      if (isGuidedSampleProduction(current) && hasGuidedSampleProductionActivity(current)) {
        window.localStorage.setItem(PRODUCTION_KEY, JSON.stringify(createSeedProduction()))
      }
    }
  } catch {
    // Unreadable production data keeps its existing recovery path.
  }
  // Install an hour back so the guided shift evidence that follows lands in the past;
  // future-dated evidence silently blocks short close and shift close.
  const sampleInstalledAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const outcome: { disposition: 'installed' | 'current' | 'preserved' } = { disposition: 'preserved' }
  const result = await mutateProductionWorkingSample((current) => {
    const next = installProductionWorkingSampleJobs(current, {
      sampleId: pack.id,
      sampleName: pack.name,
      jobs,
      capturedAt: sampleInstalledAt,
      // Otherwise an apparel floor opens on a mixer and a press reporting
      // temperature drift, which is visibly not the client's factory.
      machines: pack.setup.machines.map((machine) => ({ ...machine })),
      issue: { ...pack.setup.issue },
    })
    if (!next) return current
    outcome.disposition = next === current ? 'current' : 'installed'
    return next
  })
  if (!result.ok) throw new Error(result.error)
  if (outcome.disposition === 'installed') {
    const planningDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yangon' }).format(new Date())
    const seeded = await mutateProductionWorkspace((current) => appendGuidedSampleProductionActivity(current, {
      planningDay,
      materialRef: pack.setup.materialId,
      materialUnit: pack.setup.materialUnit,
    }))
    if (!seeded.ok) throw new Error(seeded.error)
  }
  return outcome.disposition
}
