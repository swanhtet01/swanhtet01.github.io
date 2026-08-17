import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceAmendmentIntentFromFulfilmentBrief = {
  totalIntents: number; pickupCount: number; deliveryCount: number
}
export function projectEcommerceAmendmentIntentFromFulfilmentBrief(buying: EcommerceBuyingState): EcommerceAmendmentIntentFromFulfilmentBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) return { totalIntents: 0, pickupCount: 0, deliveryCount: 0 }
  let pickupCount = 0; let deliveryCount = 0
  for (const intent of buying.amendmentIntents) {
    if (intent.fromFulfilment === 'pickup') pickupCount++
    else deliveryCount++
  }
  return { totalIntents: total, pickupCount, deliveryCount }
}
