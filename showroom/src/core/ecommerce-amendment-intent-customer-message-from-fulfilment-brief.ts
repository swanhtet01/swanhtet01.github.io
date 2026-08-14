import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentCustomerMessageFromFulfilmentBrief = {
  totalIntents: number
  messageSentDeliveryCount: number
  messageSentPickupCount: number
  noMessageDeliveryCount: number
  noMessagePickupCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceAmendmentIntentCustomerMessageFromFulfilmentBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentCustomerMessageFromFulfilmentBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentDeliveryCount: 0,
      messageSentPickupCount: 0,
      noMessageDeliveryCount: 0,
      noMessagePickupCount: 0,
      messageSentCount: 0,
      noMessageCount: 0,
    }
  }

  let messageSentDeliveryCount = 0
  let messageSentPickupCount = 0
  let noMessageDeliveryCount = 0
  let noMessagePickupCount = 0

  for (const intent of buying.amendmentIntents) {
    const isDelivery = intent.fromFulfilment === 'delivery'
    if (intent.customerMessageSent) {
      if (isDelivery) messageSentDeliveryCount++
      else messageSentPickupCount++
    } else {
      if (isDelivery) noMessageDeliveryCount++
      else noMessagePickupCount++
    }
  }

  return {
    totalIntents: total,
    messageSentDeliveryCount,
    messageSentPickupCount,
    noMessageDeliveryCount,
    noMessagePickupCount,
    messageSentCount: messageSentDeliveryCount + messageSentPickupCount,
    noMessageCount: noMessageDeliveryCount + noMessagePickupCount,
  }
}
