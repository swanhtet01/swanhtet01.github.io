import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderCorrectionTaxEffectiveFromBrief = {
  totalCorrections: number
  correctionsWithTaxEffectiveFrom: number
  taxEffectiveFromPresenceRate: number
  earliestTaxEffectiveFrom: string | null
  latestTaxEffectiveFrom: string | null
  uniqueTaxEffectiveFromDates: number
  topTaxEffectiveFromDatesByCount: Array<{ date: string; count: number }>
}

export function projectShopOrderCorrectionTaxEffectiveFromBrief(
  commerce: CommerceState,
): ShopOrderCorrectionTaxEffectiveFromBrief {
  let totalCorrections = 0
  let correctionsWithTaxEffectiveFrom = 0
  let earliestTaxEffectiveFrom: string | null = null
  let latestTaxEffectiveFrom: string | null = null
  const dateMap = new Map<string, number>()

  for (const order of commerce.orders) {
    if (order.corrections === undefined) continue
    for (const correction of order.corrections) {
      totalCorrections++
      const d = correction.calculation.taxEffectiveFrom
      if (d != null) {
        correctionsWithTaxEffectiveFrom++
        dateMap.set(d, (dateMap.get(d) ?? 0) + 1)
        if (earliestTaxEffectiveFrom === null || d < earliestTaxEffectiveFrom)
          earliestTaxEffectiveFrom = d
        if (latestTaxEffectiveFrom === null || d > latestTaxEffectiveFrom)
          latestTaxEffectiveFrom = d
      }
    }
  }

  const topTaxEffectiveFromDatesByCount = Array.from(dateMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))
    .slice(0, 5)

  return {
    totalCorrections,
    correctionsWithTaxEffectiveFrom,
    taxEffectiveFromPresenceRate:
      totalCorrections > 0
        ? Math.round((correctionsWithTaxEffectiveFrom / totalCorrections) * 100)
        : 0,
    earliestTaxEffectiveFrom,
    latestTaxEffectiveFrom,
    uniqueTaxEffectiveFromDates: dateMap.size,
    topTaxEffectiveFromDatesByCount,
  }
}
