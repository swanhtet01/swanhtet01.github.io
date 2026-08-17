import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentCustomerMessageOrderStatusBrief = {
  totalIntents: number
  messageSentConfirmedCount: number
  messageSentPreparingCount: number
  messageSentReadyCount: number
  noMessageConfirmedCount: number
  noMessagePreparingCount: number
  noMessageReadyCount: number
}

export function projectEcommerceAmendmentIntentCustomerMessageOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentCustomerMessageOrderStatusBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentConfirmedCount: 0,
      messageSentPreparingCount: 0,
      messageSentReadyCount: 0,
      noMessageConfirmedCount: 0,
      noMessagePreparingCount: 0,
      noMessageReadyCount: 0,
    }
  }

  let messageSentConfirmedCount = 0
  let messageSentPreparingCount = 0
  let messageSentReadyCount = 0
  let noMessageConfirmedCount = 0
  let noMessagePreparingCount = 0
  let noMessageReadyCount = 0

  for (const intent of buying.amendmentIntents) {
    if (intent.customerMessageSent) {
      if (intent.orderStatus === 'confirmed') messageSentConfirmedCount++
      else if (intent.orderStatus === 'preparing') messageSentPreparingCount++
      else messageSentReadyCount++
    } else {
      if (intent.orderStatus === 'confirmed') noMessageConfirmedCount++
      else if (intent.orderStatus === 'preparing') noMessagePreparingCount++
      else noMessageReadyCount++
    }
  }

  return {
    totalIntents: total,
    messageSentConfirmedCount,
    messageSentPreparingCount,
    messageSentReadyCount,
    noMessageConfirmedCount,
    noMessagePreparingCount,
    noMessageReadyCount,
  }
}
