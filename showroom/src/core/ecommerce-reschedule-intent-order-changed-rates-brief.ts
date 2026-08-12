import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentOrderChangedRatesBrief = {
  totalIntents: number
  orderChangedCount: number
  orderChangedRate: number
  notOrderChangedCount: number
  notOrderChangedRate: number
}

export function projectEcommerceRescheduleIntentOrderChangedRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentOrderChangedRatesBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      orderChangedCount: 0,
      orderChangedRate: 0,
      notOrderChangedCount: 0,
      notOrderChangedRate: 0,
    }
  }

  let orderChangedCount = 0

  for (const intent of buying.rescheduleIntents) {
    if (intent.orderChanged) orderChangedCount++
  }

  const notOrderChangedCount = total - orderChangedCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    orderChangedCount,
    orderChangedRate: rate(orderChangedCount),
    notOrderChangedCount,
    notOrderChangedRate: rate(notOrderChangedCount),
  }
}
