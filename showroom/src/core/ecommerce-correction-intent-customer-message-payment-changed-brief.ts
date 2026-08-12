import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentCustomerMessagePaymentChangedBrief = {
  totalIntents: number
  messageSentPaymentChangedCount: number
  messageSentNoPaymentChangeCount: number
  noMessagePaymentChangedCount: number
  noMessageNoPaymentChangeCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceCorrectionIntentCustomerMessagePaymentChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentCustomerMessagePaymentChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentPaymentChangedCount: 0,
      messageSentNoPaymentChangeCount: 0,
      noMessagePaymentChangedCount: 0,
      noMessageNoPaymentChangeCount: 0,
      messageSentCount: 0,
      noMessageCount: 0,
    }
  }

  let messageSentPaymentChangedCount = 0
  let messageSentNoPaymentChangeCount = 0
  let noMessagePaymentChangedCount = 0
  let noMessageNoPaymentChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.customerMessageSent) {
      if (intent.paymentChanged) messageSentPaymentChangedCount++
      else messageSentNoPaymentChangeCount++
    } else {
      if (intent.paymentChanged) noMessagePaymentChangedCount++
      else noMessageNoPaymentChangeCount++
    }
  }

  return {
    totalIntents: total,
    messageSentPaymentChangedCount,
    messageSentNoPaymentChangeCount,
    noMessagePaymentChangedCount,
    noMessageNoPaymentChangeCount,
    messageSentCount: messageSentPaymentChangedCount + messageSentNoPaymentChangeCount,
    noMessageCount: noMessagePaymentChangedCount + noMessageNoPaymentChangeCount,
  }
}
