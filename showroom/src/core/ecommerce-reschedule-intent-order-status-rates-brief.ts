import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentOrderStatusRatesBrief = {
  totalIntents: number
  confirmedCount: number
  confirmedRate: number
  preparingCount: number
  preparingRate: number
  readyCount: number
  readyRate: number
}

export function projectEcommerceRescheduleIntentOrderStatusRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentOrderStatusRatesBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
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

  for (const intent of buying.rescheduleIntents) {
    if (intent.orderStatus === 'confirmed') confirmedCount++
    else if (intent.orderStatus === 'preparing') preparingCount++
    else if (intent.orderStatus === 'ready') readyCount++
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    confirmedCount,
    confirmedRate: rate(confirmedCount),
    preparingCount,
    preparingRate: rate(preparingCount),
    readyCount,
    readyRate: rate(readyCount),
  }
}
