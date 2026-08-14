import type { ProductionState } from './production-workspace.ts'

export type PlantShopDemandCoverageBrief = {
  totalJobs: number
  jobsWithShopDemand: number
  jobsWithoutShopDemand: number
  shopDemandCoverage: number
  totalRecommendedBatchUnits: number
  totalUncoveredDemandUnits: number
  uniqueSkusInDemand: number
  totalSourceOrders: number
}

export function projectPlantShopDemandCoverageBrief(production: ProductionState): PlantShopDemandCoverageBrief {
  let jobsWithShopDemand = 0
  let jobsWithoutShopDemand = 0
  let totalRecommendedBatchUnits = 0
  let totalUncoveredDemandUnits = 0
  const uniqueSkus = new Set<string>()
  const uniqueOrders = new Set<string>()

  for (const job of production.jobs) {
    if (job.shopDemandSource) {
      jobsWithShopDemand++
      const snap = job.shopDemandSource.snapshot
      totalRecommendedBatchUnits += snap.recommendedBatchUnits
      totalUncoveredDemandUnits += snap.uncoveredDemandUnits
      uniqueSkus.add(snap.sku)
      for (const orderId of snap.sourceOrderIds) {
        uniqueOrders.add(orderId)
      }
    } else {
      jobsWithoutShopDemand++
    }
  }

  const totalJobs = production.jobs.length
  return {
    totalJobs,
    jobsWithShopDemand,
    jobsWithoutShopDemand,
    shopDemandCoverage: totalJobs > 0 ? Math.round((jobsWithShopDemand / totalJobs) * 100) : 0,
    totalRecommendedBatchUnits,
    totalUncoveredDemandUnits,
    uniqueSkusInDemand: uniqueSkus.size,
    totalSourceOrders: uniqueOrders.size,
  }
}
