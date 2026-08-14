import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentTaxFiledPaymentChangedBrief = {
  totalIntents: number
  taxFiledPaymentChangedCount: number
  taxFiledNoPaymentChangeCount: number
  noTaxFiledPaymentChangedCount: number
  noTaxFiledNoPaymentChangeCount: number
  taxFiledCount: number
  noTaxFiledCount: number
}

export function projectEcommerceCorrectionIntentTaxFiledPaymentChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentTaxFiledPaymentChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      taxFiledPaymentChangedCount: 0,
      taxFiledNoPaymentChangeCount: 0,
      noTaxFiledPaymentChangedCount: 0,
      noTaxFiledNoPaymentChangeCount: 0,
      taxFiledCount: 0,
      noTaxFiledCount: 0,
    }
  }

  let taxFiledPaymentChangedCount = 0
  let taxFiledNoPaymentChangeCount = 0
  let noTaxFiledPaymentChangedCount = 0
  let noTaxFiledNoPaymentChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.taxFiled) {
      if (intent.paymentChanged) taxFiledPaymentChangedCount++
      else taxFiledNoPaymentChangeCount++
    } else {
      if (intent.paymentChanged) noTaxFiledPaymentChangedCount++
      else noTaxFiledNoPaymentChangeCount++
    }
  }

  return {
    totalIntents: total,
    taxFiledPaymentChangedCount,
    taxFiledNoPaymentChangeCount,
    noTaxFiledPaymentChangedCount,
    noTaxFiledNoPaymentChangeCount,
    taxFiledCount: taxFiledPaymentChangedCount + taxFiledNoPaymentChangeCount,
    noTaxFiledCount: noTaxFiledPaymentChangedCount + noTaxFiledNoPaymentChangeCount,
  }
}
