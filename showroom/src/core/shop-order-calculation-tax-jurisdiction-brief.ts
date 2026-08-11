import { COMMERCE_ORDER_CALCULATION_V2_SCHEMA } from './commerce-workspace.ts'
import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderCalculationTaxJurisdictionBrief = {
  totalOrders: number
  ordersWithCalculation: number
  ordersWithJurisdictionCode: number
  jurisdictionCodePresenceRate: number
  uniqueJurisdictionCodes: number
  topJurisdictionCodesByCount: Array<{ code: string; count: number }>
  ordersWithTaxEffectiveFrom: number
  taxEffectiveFromPresenceRate: number
  earliestTaxEffectiveFrom: string | null
  latestTaxEffectiveFrom: string | null
}

export function projectShopOrderCalculationTaxJurisdictionBrief(
  commerce: CommerceState,
): ShopOrderCalculationTaxJurisdictionBrief {
  let totalOrders = 0
  let ordersWithCalculation = 0
  let ordersWithJurisdictionCode = 0
  let ordersWithTaxEffectiveFrom = 0
  let earliestTaxEffectiveFrom: string | null = null
  let latestTaxEffectiveFrom: string | null = null
  const codeMap = new Map<string, number>()

  for (const order of commerce.orders) {
    totalOrders++
    const calc = order.calculation
    if (calc === undefined) continue
    ordersWithCalculation++

    if (calc.schema !== COMMERCE_ORDER_CALCULATION_V2_SCHEMA) continue
    const v2 = calc

    if (v2.taxJurisdictionCode !== undefined) {
      ordersWithJurisdictionCode++
      codeMap.set(v2.taxJurisdictionCode, (codeMap.get(v2.taxJurisdictionCode) ?? 0) + 1)
    }

    if (v2.taxEffectiveFrom !== undefined) {
      ordersWithTaxEffectiveFrom++
      if (earliestTaxEffectiveFrom === null || v2.taxEffectiveFrom < earliestTaxEffectiveFrom)
        earliestTaxEffectiveFrom = v2.taxEffectiveFrom
      if (latestTaxEffectiveFrom === null || v2.taxEffectiveFrom > latestTaxEffectiveFrom)
        latestTaxEffectiveFrom = v2.taxEffectiveFrom
    }
  }

  const topJurisdictionCodesByCount = Array.from(codeMap.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 5)

  return {
    totalOrders,
    ordersWithCalculation,
    ordersWithJurisdictionCode,
    jurisdictionCodePresenceRate:
      ordersWithCalculation > 0
        ? Math.round((ordersWithJurisdictionCode / ordersWithCalculation) * 100)
        : 0,
    uniqueJurisdictionCodes: codeMap.size,
    topJurisdictionCodesByCount,
    ordersWithTaxEffectiveFrom,
    taxEffectiveFromPresenceRate:
      ordersWithCalculation > 0
        ? Math.round((ordersWithTaxEffectiveFrom / ordersWithCalculation) * 100)
        : 0,
    earliestTaxEffectiveFrom,
    latestTaxEffectiveFrom,
  }
}
