import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentSummary = {
  totalReschedules: number
  uniqueOrders: number
  totalOriginalValueMmk: number
  byFulfilment: { delivery: number; pickup: number }
  averageShiftDays: number
}

export function projectEcommerceRescheduleIntentSummary(buying: EcommerceBuyingState): EcommerceRescheduleIntentSummary {
  const orderSet = new Set<string>()
  const byFulfilment = { delivery: 0, pickup: 0 }

  let totalOriginalValueMmk = 0
  let totalShiftMs = 0

  for (const intent of buying.rescheduleIntents) {
    orderSet.add(intent.orderId)
    totalOriginalValueMmk += intent.originalTotalMmk
    byFulfilment[intent.fulfilment as keyof typeof byFulfilment] += 1
    totalShiftMs += Date.parse(intent.requestedPromisedAt) - Date.parse(intent.originalPromisedAt)
  }

  const count = buying.rescheduleIntents.length
  const averageShiftDays = count > 0 ? Math.round(totalShiftMs / count / (1000 * 60 * 60 * 24)) : 0

  return {
    totalReschedules: count,
    uniqueOrders: orderSet.size,
    totalOriginalValueMmk,
    byFulfilment,
    averageShiftDays,
  }
}
