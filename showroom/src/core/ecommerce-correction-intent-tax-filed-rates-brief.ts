import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentTaxFiledRatesBrief = {
  totalIntents: number
  taxFiledCount: number
  taxFiledRate: number
  notTaxFiledCount: number
  notTaxFiledRate: number
}

export function projectEcommerceCorrectionIntentTaxFiledRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentTaxFiledRatesBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      taxFiledCount: 0,
      taxFiledRate: 0,
      notTaxFiledCount: 0,
      notTaxFiledRate: 0,
    }
  }

  let taxFiledCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.taxFiled) taxFiledCount++
  }

  const notTaxFiledCount = total - taxFiledCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    taxFiledCount,
    taxFiledRate: rate(taxFiledCount),
    notTaxFiledCount,
    notTaxFiledRate: rate(notTaxFiledCount),
  }
}
