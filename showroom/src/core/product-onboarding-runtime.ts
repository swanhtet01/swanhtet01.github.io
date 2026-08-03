import {
  clientDemoPresets,
  clientImportTemplate,
  createClientImportPreview,
} from './client-onboarding'
import {
  installCommerceWorkingSampleCatalog,
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
