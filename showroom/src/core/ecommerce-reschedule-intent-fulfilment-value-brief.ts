import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentFulfilmentValueBrief = {
  totalIntents: number
  pickupCount: number
  deliveryCount: number
  pickupRate: number
  deliveryRate: number
  totalOriginalValueMmk: number
  minOriginalValueMmk: number | null
  maxOriginalValueMmk: number | null
  averageOriginalValueMmk: number
}

export function projectEcommerceRescheduleIntentFulfilmentValueBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentFulfilmentValueBrief {
  let pickupCount = 0
  let deliveryCount = 0
  let totalOriginalValueMmk = 0
  let minOriginalValueMmk: number | null = null
  let maxOriginalValueMmk: number | null = null

  for (const intent of buying.rescheduleIntents) {
    if (intent.fulfilment === 'pickup') pickupCount++
    else deliveryCount++
    totalOriginalValueMmk += intent.originalTotalMmk
    if (minOriginalValueMmk === null || intent.originalTotalMmk < minOriginalValueMmk)
      minOriginalValueMmk = intent.originalTotalMmk
    if (maxOriginalValueMmk === null || intent.originalTotalMmk > maxOriginalValueMmk)
      maxOriginalValueMmk = intent.originalTotalMmk
  }

  const totalIntents = buying.rescheduleIntents.length

  return {
    totalIntents,
    pickupCount,
    deliveryCount,
    pickupRate: totalIntents > 0 ? Math.round((pickupCount / totalIntents) * 100) : 0,
    deliveryRate: totalIntents > 0 ? Math.round((deliveryCount / totalIntents) * 100) : 0,
    totalOriginalValueMmk,
    minOriginalValueMmk,
    maxOriginalValueMmk,
    averageOriginalValueMmk: totalIntents > 0 ? Math.round(totalOriginalValueMmk / totalIntents) : 0,
  }
}
