import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentTaxFiledRefundStatusBrief = {
  totalIntents: number
  taxFiledNoRefundCount: number
  taxFiledDueCount: number
  taxFiledSettledCount: number
  noTaxFiledNoRefundCount: number
  noTaxFiledDueCount: number
  noTaxFiledSettledCount: number
}

export function projectEcommerceCorrectionIntentTaxFiledRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentTaxFiledRefundStatusBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      taxFiledNoRefundCount: 0,
      taxFiledDueCount: 0,
      taxFiledSettledCount: 0,
      noTaxFiledNoRefundCount: 0,
      noTaxFiledDueCount: 0,
      noTaxFiledSettledCount: 0,
    }
  }

  let taxFiledNoRefundCount = 0
  let taxFiledDueCount = 0
  let taxFiledSettledCount = 0
  let noTaxFiledNoRefundCount = 0
  let noTaxFiledDueCount = 0
  let noTaxFiledSettledCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.taxFiled) {
      if (intent.refundStatus === 'none') taxFiledNoRefundCount++
      else if (intent.refundStatus === 'due') taxFiledDueCount++
      else taxFiledSettledCount++
    } else {
      if (intent.refundStatus === 'none') noTaxFiledNoRefundCount++
      else if (intent.refundStatus === 'due') noTaxFiledDueCount++
      else noTaxFiledSettledCount++
    }
  }

  return {
    totalIntents: total,
    taxFiledNoRefundCount,
    taxFiledDueCount,
    taxFiledSettledCount,
    noTaxFiledNoRefundCount,
    noTaxFiledDueCount,
    noTaxFiledSettledCount,
  }
}
