import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentRequestedKindPaymentChangedBrief = {
  totalIntents: number
  creditPaymentChangedCount: number
  creditNoPaymentChangeCount: number
  debitPaymentChangedCount: number
  debitNoPaymentChangeCount: number
  creditCount: number
  debitCount: number
}

export function projectEcommerceCorrectionIntentRequestedKindPaymentChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentRequestedKindPaymentChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      creditPaymentChangedCount: 0,
      creditNoPaymentChangeCount: 0,
      debitPaymentChangedCount: 0,
      debitNoPaymentChangeCount: 0,
      creditCount: 0,
      debitCount: 0,
    }
  }

  let creditPaymentChangedCount = 0
  let creditNoPaymentChangeCount = 0
  let debitPaymentChangedCount = 0
  let debitNoPaymentChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.requestedKind === 'credit') {
      if (intent.paymentChanged) creditPaymentChangedCount++
      else creditNoPaymentChangeCount++
    } else {
      if (intent.paymentChanged) debitPaymentChangedCount++
      else debitNoPaymentChangeCount++
    }
  }

  return {
    totalIntents: total,
    creditPaymentChangedCount,
    creditNoPaymentChangeCount,
    debitPaymentChangedCount,
    debitNoPaymentChangeCount,
    creditCount: creditPaymentChangedCount + creditNoPaymentChangeCount,
    debitCount: debitPaymentChangedCount + debitNoPaymentChangeCount,
  }
}
