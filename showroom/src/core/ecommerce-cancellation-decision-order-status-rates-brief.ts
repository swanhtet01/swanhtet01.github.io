import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionOrderStatusRatesBrief = {
  totalDecisions: number
  confirmedCount: number
  confirmedRate: number
  preparingCount: number
  preparingRate: number
  readyCount: number
  readyRate: number
}

export function projectEcommerceCancellationDecisionOrderStatusRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionOrderStatusRatesBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      confirmedCount: 0,
      confirmedRate: 0,
      preparingCount: 0,
      preparingRate: 0,
      readyCount: 0,
      readyRate: 0,
    }
  }

  let confirmedCount = 0
  let preparingCount = 0
  let readyCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.orderStatus === 'confirmed') confirmedCount++
    else if (decision.orderStatus === 'preparing') preparingCount++
    else if (decision.orderStatus === 'ready') readyCount++
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalDecisions: total,
    confirmedCount,
    confirmedRate: rate(confirmedCount),
    preparingCount,
    preparingRate: rate(preparingCount),
    readyCount,
    readyRate: rate(readyCount),
  }
}
