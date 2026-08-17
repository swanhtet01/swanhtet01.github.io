import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentToFulfilmentRatesBrief = {
  totalIntents: number
  deliveryCount: number
  deliveryRate: number
  pickupCount: number
  pickupRate: number
}

export function projectEcommerceAmendmentIntentToFulfilmentRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentToFulfilmentRatesBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      deliveryCount: 0,
      deliveryRate: 0,
      pickupCount: 0,
      pickupRate: 0,
    }
  }

  let deliveryCount = 0

  for (const intent of buying.amendmentIntents) {
    if (intent.toFulfilment === 'delivery') deliveryCount++
  }

  const pickupCount = total - deliveryCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    deliveryCount,
    deliveryRate: rate(deliveryCount),
    pickupCount,
    pickupRate: rate(pickupCount),
  }
}
