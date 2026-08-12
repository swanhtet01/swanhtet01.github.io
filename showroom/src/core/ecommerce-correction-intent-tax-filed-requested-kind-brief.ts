import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentTaxFiledRequestedKindBrief = {
  totalIntents: number
  taxFiledCreditCount: number
  taxFiledDebitCount: number
  noTaxFiledCreditCount: number
  noTaxFiledDebitCount: number
  taxFiledCount: number
  noTaxFiledCount: number
}

export function projectEcommerceCorrectionIntentTaxFiledRequestedKindBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentTaxFiledRequestedKindBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      taxFiledCreditCount: 0,
      taxFiledDebitCount: 0,
      noTaxFiledCreditCount: 0,
      noTaxFiledDebitCount: 0,
      taxFiledCount: 0,
      noTaxFiledCount: 0,
    }
  }

  let taxFiledCreditCount = 0
  let taxFiledDebitCount = 0
  let noTaxFiledCreditCount = 0
  let noTaxFiledDebitCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.taxFiled) {
      if (intent.requestedKind === 'credit') taxFiledCreditCount++
      else taxFiledDebitCount++
    } else {
      if (intent.requestedKind === 'credit') noTaxFiledCreditCount++
      else noTaxFiledDebitCount++
    }
  }

  return {
    totalIntents: total,
    taxFiledCreditCount,
    taxFiledDebitCount,
    noTaxFiledCreditCount,
    noTaxFiledDebitCount,
    taxFiledCount: taxFiledCreditCount + taxFiledDebitCount,
    noTaxFiledCount: noTaxFiledCreditCount + noTaxFiledDebitCount,
  }
}
