import { validateCommerceState, type CommerceOrder, type CommerceState } from './commerce-workspace.ts'
import { plantOrderEvidenceDigest } from './plant-order-foundation.ts'
import type { ProductionJob } from './production-workspace.ts'

export const SHOP_PRODUCTION_DEMAND_SCHEMA = 'supermega.shop_production_demand.v1' as const

export type ShopProductionDemandSourceSnapshot = {
  schema: typeof SHOP_PRODUCTION_DEMAND_SCHEMA
  operatingUnitLocationId: 'LOC-MAIN'
  sku: string
  productName: string
  sourceOrderIds: string[]
  activeDemandUnits: number
  uncoveredDemandUnits: number
  availableToPromiseUnits: number
  reorderAtUnits: number
  replenishmentGapUnits: number
  recommendedBatchUnits: number
}

export type ShopProductionDemandSignal = {
  schema: typeof SHOP_PRODUCTION_DEMAND_SCHEMA
  operatingContext: {
    operatingUnitLocationId: 'LOC-MAIN'
    sourceAuthority: 'commerce'
    targetAuthority: 'production'
    recordType: 'production_demand'
    writePolicy: 'human_review_required'
  }
  sku: string
  productName: string
  sourceOrderIds: string[]
  activeDemandUnits: number
  uncoveredDemandUnits: number
  availableToPromiseUnits: number
  reorderAtUnits: number
  replenishmentGapUnits: number
  recommendedBatchUnits: number
  existingJobIds: string[]
  existingActiveJobIds: string[]
  sourceSnapshot: ShopProductionDemandSourceSnapshot
  sourceDigest: string
  evidenceReference: string
  suggestedJobId: string
}

function orderLines(order: CommerceOrder) {
  if (order.lines?.length) return order.lines.map((line) => ({ sku: line.sku, quantity: line.quantity }))
  return order.itemSku ? [{ sku: order.itemSku, quantity: order.quantity }] : []
}

function canonicalSnapshot(value: unknown) {
  return JSON.stringify(value)
}

function activeJob(job: ProductionJob) {
  return !job.closure && !job.qualityHold && job.output + (job.scrap ?? 0) < job.target
}

function jobMatchesProduct(job: ProductionJob, sku: string, name: string) {
  return job.product.trim().toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US')
    || job.product.trim().toLocaleUpperCase('en-US') === sku.toLocaleUpperCase('en-US')
}

export async function projectShopProductionDemand(
  commerceValue: CommerceState,
  jobsValue: readonly ProductionJob[],
): Promise<ShopProductionDemandSignal[]> {
  const commerce = validateCommerceState(commerceValue)
  const jobs = [...jobsValue]
  const activeJobs = jobs.filter(activeJob)
  const activeOrders = commerce.orders
    .filter((order) => order.status === 'confirmed' || order.status === 'preparing' || order.status === 'ready')
    .sort((left, right) => left.id.localeCompare(right.id))
  const demandBySku = new Map<string, { quantity: number; orderIds: string[] }>()
  activeOrders.forEach((order) => orderLines(order).forEach((line) => {
    const current = demandBySku.get(line.sku) ?? { quantity: 0, orderIds: [] }
    current.quantity += line.quantity
    if (!current.orderIds.includes(order.id)) current.orderIds.push(order.id)
    demandBySku.set(line.sku, current)
  }))

  const signals = await Promise.all([...commerce.items]
    .sort((left, right) => left.sku.localeCompare(right.sku))
    .map(async (item) => {
      const demand = demandBySku.get(item.sku) ?? { quantity: 0, orderIds: [] }
      const replenishmentGapUnits = Math.max(0, item.reorderAt - item.onHand)
      const uncoveredDemandUnits = Math.max(0, demand.quantity - item.onHand)
      if (!uncoveredDemandUnits && !replenishmentGapUnits) return null
      const recommendedBatchUnits = Math.max(1, replenishmentGapUnits, uncoveredDemandUnits)
      const matchingJobs = jobs.filter((job) => jobMatchesProduct(job, item.sku, item.name))
      const existingJobIds = matchingJobs
        .map((job) => job.id)
        .sort((left, right) => left.localeCompare(right))
      const existingActiveJobIds = activeJobs
        .filter((job) => jobMatchesProduct(job, item.sku, item.name))
        .map((job) => job.id)
        .sort((left, right) => left.localeCompare(right))
      const sourceSnapshot: ShopProductionDemandSourceSnapshot = {
        schema: SHOP_PRODUCTION_DEMAND_SCHEMA,
        operatingUnitLocationId: 'LOC-MAIN',
        sku: item.sku,
        productName: item.name,
        sourceOrderIds: [...demand.orderIds].sort((left, right) => left.localeCompare(right)),
        activeDemandUnits: demand.quantity,
        uncoveredDemandUnits,
        availableToPromiseUnits: item.onHand,
        reorderAtUnits: item.reorderAt,
        replenishmentGapUnits,
        recommendedBatchUnits,
      }
      const sourceDigest = plantOrderEvidenceDigest(sourceSnapshot)
      const canonicalSku = item.sku.toLocaleUpperCase('en-US').replace(/[^A-Z0-9_-]/g, '-').slice(0, 40)
      const jobIdBase = `JOB-SHOP-${canonicalSku}-${sourceDigest.slice(7, 15).toLocaleUpperCase('en-US')}`
      let suggestedJobId = jobIdBase
      let jobSequence = 2
      while (jobs.some((job) => job.id === suggestedJobId)) {
        suggestedJobId = `${jobIdBase}-${String(jobSequence).padStart(2, '0')}`
        jobSequence += 1
      }
      return {
        schema: SHOP_PRODUCTION_DEMAND_SCHEMA,
        operatingContext: {
          operatingUnitLocationId: 'LOC-MAIN',
          sourceAuthority: 'commerce',
          targetAuthority: 'production',
          recordType: 'production_demand',
          writePolicy: 'human_review_required',
        },
        sku: item.sku,
        productName: item.name,
        sourceOrderIds: demand.orderIds,
        activeDemandUnits: demand.quantity,
        uncoveredDemandUnits,
        availableToPromiseUnits: item.onHand,
        reorderAtUnits: item.reorderAt,
        replenishmentGapUnits,
        recommendedBatchUnits,
        existingJobIds,
        existingActiveJobIds,
        sourceSnapshot,
        sourceDigest,
        evidenceReference: `SHOP-DEMAND:${sourceDigest}:LOC-MAIN`,
        suggestedJobId,
      } satisfies ShopProductionDemandSignal
    }))
  return signals.filter((signal): signal is ShopProductionDemandSignal => signal !== null)
}

export async function shopProductionDemandIsCurrent(
  signal: ShopProductionDemandSignal,
  commerce: CommerceState,
  jobs: readonly ProductionJob[],
) {
  const current = await projectShopProductionDemand(commerce, jobs)
  const match = current.find((candidate) => candidate.sourceDigest === signal.sourceDigest)
  return Boolean(match
    && canonicalSnapshot(match) === canonicalSnapshot(signal)
    && match.operatingContext.operatingUnitLocationId === 'LOC-MAIN'
    && match.operatingContext.writePolicy === 'human_review_required')
}
