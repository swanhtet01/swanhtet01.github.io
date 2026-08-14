import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentOrderChangedPaymentChangedBrief = {
  totalIntents: number
  orderChangedPaymentChangedCount: number
  orderChangedNoPaymentChangeCount: number
  noOrderChangePaymentChangedCount: number
  noOrderChangeNoPaymentChangeCount: number
  orderChangedCount: number
  noOrderChangeCount: number
}

export function projectEcommerceCorrectionIntentOrderChangedPaymentChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentOrderChangedPaymentChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      orderChangedPaymentChangedCount: 0,
      orderChangedNoPaymentChangeCount: 0,
      noOrderChangePaymentChangedCount: 0,
      noOrderChangeNoPaymentChangeCount: 0,
      orderChangedCount: 0,
      noOrderChangeCount: 0,
    }
  }

  let orderChangedPaymentChangedCount = 0
  let orderChangedNoPaymentChangeCount = 0
  let noOrderChangePaymentChangedCount = 0
  let noOrderChangeNoPaymentChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.orderChanged) {
      if (intent.paymentChanged) orderChangedPaymentChangedCount++
      else orderChangedNoPaymentChangeCount++
    } else {
      if (intent.paymentChanged) noOrderChangePaymentChangedCount++
      else noOrderChangeNoPaymentChangeCount++
    }
  }

  return {
    totalIntents: total,
    orderChangedPaymentChangedCount,
    orderChangedNoPaymentChangeCount,
    noOrderChangePaymentChangedCount,
    noOrderChangeNoPaymentChangeCount,
    orderChangedCount: orderChangedPaymentChangedCount + orderChangedNoPaymentChangeCount,
    noOrderChangeCount: noOrderChangePaymentChangedCount + noOrderChangeNoPaymentChangeCount,
  }
}
