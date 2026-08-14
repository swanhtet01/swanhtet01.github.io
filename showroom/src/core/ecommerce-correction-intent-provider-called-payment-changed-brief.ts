import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentProviderCalledPaymentChangedBrief = {
  totalIntents: number
  providerCalledPaymentChangedCount: number
  providerCalledNoPaymentChangeCount: number
  noProviderPaymentChangedCount: number
  noProviderNoPaymentChangeCount: number
  providerCalledCount: number
  noProviderCount: number
}

export function projectEcommerceCorrectionIntentProviderCalledPaymentChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentProviderCalledPaymentChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      providerCalledPaymentChangedCount: 0,
      providerCalledNoPaymentChangeCount: 0,
      noProviderPaymentChangedCount: 0,
      noProviderNoPaymentChangeCount: 0,
      providerCalledCount: 0,
      noProviderCount: 0,
    }
  }

  let providerCalledPaymentChangedCount = 0
  let providerCalledNoPaymentChangeCount = 0
  let noProviderPaymentChangedCount = 0
  let noProviderNoPaymentChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.providerCalled) {
      if (intent.paymentChanged) providerCalledPaymentChangedCount++
      else providerCalledNoPaymentChangeCount++
    } else {
      if (intent.paymentChanged) noProviderPaymentChangedCount++
      else noProviderNoPaymentChangeCount++
    }
  }

  return {
    totalIntents: total,
    providerCalledPaymentChangedCount,
    providerCalledNoPaymentChangeCount,
    noProviderPaymentChangedCount,
    noProviderNoPaymentChangeCount,
    providerCalledCount: providerCalledPaymentChangedCount + providerCalledNoPaymentChangeCount,
    noProviderCount: noProviderPaymentChangedCount + noProviderNoPaymentChangeCount,
  }
}
