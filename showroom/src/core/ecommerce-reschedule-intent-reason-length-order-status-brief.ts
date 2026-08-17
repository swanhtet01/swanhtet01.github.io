import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentReasonLengthOrderStatusBrief = {
  totalIntents: number
  shortConfirmedCount: number
  shortPreparingCount: number
  shortReadyCount: number
  detailedConfirmedCount: number
  detailedPreparingCount: number
  detailedReadyCount: number
}

export function projectEcommerceRescheduleIntentReasonLengthOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentReasonLengthOrderStatusBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      shortConfirmedCount: 0,
      shortPreparingCount: 0,
      shortReadyCount: 0,
      detailedConfirmedCount: 0,
      detailedPreparingCount: 0,
      detailedReadyCount: 0,
    }
  }

  let shortConfirmedCount = 0
  let shortPreparingCount = 0
  let shortReadyCount = 0
  let detailedConfirmedCount = 0
  let detailedPreparingCount = 0
  let detailedReadyCount = 0

  for (const intent of buying.rescheduleIntents) {
    const isShort = intent.reason.length <= 40
    if (isShort) {
      if (intent.orderStatus === 'confirmed') shortConfirmedCount++
      else if (intent.orderStatus === 'preparing') shortPreparingCount++
      else shortReadyCount++
    } else {
      if (intent.orderStatus === 'confirmed') detailedConfirmedCount++
      else if (intent.orderStatus === 'preparing') detailedPreparingCount++
      else detailedReadyCount++
    }
  }

  return {
    totalIntents: total,
    shortConfirmedCount,
    shortPreparingCount,
    shortReadyCount,
    detailedConfirmedCount,
    detailedPreparingCount,
    detailedReadyCount,
  }
}
