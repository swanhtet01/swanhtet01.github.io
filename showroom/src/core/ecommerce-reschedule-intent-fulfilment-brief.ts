import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceRescheduleIntentFulfilmentBrief = {
  totalIntents: number; pickupCount: number; deliveryCount: number
}
export function projectEcommerceRescheduleIntentFulfilmentBrief(buying: EcommerceBuyingState): EcommerceRescheduleIntentFulfilmentBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) return { totalIntents: 0, pickupCount: 0, deliveryCount: 0 }
  let pickupCount = 0; let deliveryCount = 0
  for (const intent of buying.rescheduleIntents) {
    if (intent.fulfilment === 'pickup') pickupCount++
    else deliveryCount++
  }
  return { totalIntents: total, pickupCount, deliveryCount }
}
