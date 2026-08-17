import type { CommerceState } from './commerce-workspace.ts'

export type ShopDailyCloseSummary = {
  totalCloses: number
  totalRevenueMmk: number
  totalOrdersClosed: number
  averageRevenuePerClose: number
  highestCloseMmk: number
  closesWithSettlement: number
  closesWithVariance: number
  totalSettlementVarianceMmk: number
}

export function projectShopDailyCloseSummary(commerce: CommerceState): ShopDailyCloseSummary {
  let totalRevenueMmk = 0
  let totalOrdersClosed = 0
  let highestCloseMmk = 0
  let closesWithSettlement = 0
  let closesWithVariance = 0
  let totalSettlementVarianceMmk = 0

  for (const close of commerce.closes) {
    totalRevenueMmk += close.total
    totalOrdersClosed += close.orders
    if (close.total > highestCloseMmk) highestCloseMmk = close.total
    if (close.settlement) {
      closesWithSettlement++
      totalSettlementVarianceMmk += close.settlement.totalVarianceMmk
      if (close.settlement.status === 'variance_review') closesWithVariance++
    }
  }

  const totalCloses = commerce.closes.length

  return {
    totalCloses,
    totalRevenueMmk,
    totalOrdersClosed,
    averageRevenuePerClose: totalCloses > 0 ? Math.round(totalRevenueMmk / totalCloses) : 0,
    highestCloseMmk,
    closesWithSettlement,
    closesWithVariance,
    totalSettlementVarianceMmk,
  }
}
