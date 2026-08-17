import type { ShopSalesVelocity } from './shop-sales-velocity.ts'
import type { PlantOutputVelocity } from './plant-output-velocity.ts'
import type { EcommerceRequestAgeSummary } from './ecommerce-request-age-summary.ts'
import type { PlantIssueRateSummary } from './plant-issue-rate-summary.ts'

export type EcommerceBackpressure = 'high' | 'moderate' | 'low'
export type PlantHealthStatus = 'critical' | 'attention' | 'healthy'
export type OverallPulse = 'accelerating' | 'steady' | 'decelerating' | 'troubled'

export type CrossProductPulseBrief = {
  shopTrend: ShopSalesVelocity['velocityTrend']
  plantTrend: PlantOutputVelocity['velocityTrend']
  ecommerceBackpressure: EcommerceBackpressure
  plantHealthStatus: PlantHealthStatus
  overallPulse: OverallPulse
  summary: {
    shopOrdersLast7: number
    shopRevenueLast7Mmk: number
    plantOutputLast7: number
    ecommercePendingRequests: number
    ecommerceStaleRequests: number
    plantOpenIssues: number
    plantCriticalOpenIssues: number
  }
}

export function projectCrossProductPulseBrief(
  shop: ShopSalesVelocity,
  plant: PlantOutputVelocity,
  ecommerce: EcommerceRequestAgeSummary,
  issues: PlantIssueRateSummary,
): CrossProductPulseBrief {
  const ecommerceBackpressure: EcommerceBackpressure =
    ecommerce.byAge.stale.count > 0
      ? 'high'
      : ecommerce.byAge.aging.count > 0
        ? 'moderate'
        : 'low'

  const plantHealthStatus: PlantHealthStatus =
    issues.criticalOpenCount > 0
      ? 'critical'
      : issues.openCount > 0 && issues.openRate > 20
        ? 'attention'
        : 'healthy'

  let overallPulse: OverallPulse
  if (issues.criticalOpenCount > 0 || ecommerceBackpressure === 'high') {
    overallPulse = 'troubled'
  } else if (shop.velocityTrend === 'accelerating' && plant.velocityTrend === 'accelerating') {
    overallPulse = 'accelerating'
  } else if (shop.velocityTrend === 'decelerating' || plant.velocityTrend === 'decelerating') {
    overallPulse = 'decelerating'
  } else {
    overallPulse = 'steady'
  }

  return {
    shopTrend: shop.velocityTrend,
    plantTrend: plant.velocityTrend,
    ecommerceBackpressure,
    plantHealthStatus,
    overallPulse,
    summary: {
      shopOrdersLast7: shop.last7Days.orderCount,
      shopRevenueLast7Mmk: shop.last7Days.revenueMmk,
      plantOutputLast7: plant.last7Days.totalOutput,
      ecommercePendingRequests: ecommerce.totalPending,
      ecommerceStaleRequests: ecommerce.byAge.stale.count,
      plantOpenIssues: issues.openCount,
      plantCriticalOpenIssues: issues.criticalOpenCount,
    },
  }
}
