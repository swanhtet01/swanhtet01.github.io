import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentTaxFiledProviderCalledBrief = {
  totalIntents: number
  taxFiledProviderCalledCount: number
  taxFiledNoProviderCount: number
  noTaxFiledProviderCalledCount: number
  noTaxFiledNoProviderCount: number
  taxFiledCount: number
  noTaxFiledCount: number
}

export function projectEcommerceCorrectionIntentTaxFiledProviderCalledBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentTaxFiledProviderCalledBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      taxFiledProviderCalledCount: 0,
      taxFiledNoProviderCount: 0,
      noTaxFiledProviderCalledCount: 0,
      noTaxFiledNoProviderCount: 0,
      taxFiledCount: 0,
      noTaxFiledCount: 0,
    }
  }

  let taxFiledProviderCalledCount = 0
  let taxFiledNoProviderCount = 0
  let noTaxFiledProviderCalledCount = 0
  let noTaxFiledNoProviderCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.taxFiled) {
      if (intent.providerCalled) taxFiledProviderCalledCount++
      else taxFiledNoProviderCount++
    } else {
      if (intent.providerCalled) noTaxFiledProviderCalledCount++
      else noTaxFiledNoProviderCount++
    }
  }

  return {
    totalIntents: total,
    taxFiledProviderCalledCount,
    taxFiledNoProviderCount,
    noTaxFiledProviderCalledCount,
    noTaxFiledNoProviderCount,
    taxFiledCount: taxFiledProviderCalledCount + taxFiledNoProviderCount,
    noTaxFiledCount: noTaxFiledProviderCalledCount + noTaxFiledNoProviderCount,
  }
}
