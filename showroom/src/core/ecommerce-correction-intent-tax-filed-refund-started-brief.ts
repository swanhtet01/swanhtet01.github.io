import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentTaxFiledRefundStartedBrief = {
  totalIntents: number
  taxFiledRefundStartedCount: number
  taxFiledNoRefundCount: number
  noTaxFiledRefundStartedCount: number
  noTaxFiledNoRefundCount: number
  taxFiledCount: number
  noTaxFiledCount: number
}

export function projectEcommerceCorrectionIntentTaxFiledRefundStartedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentTaxFiledRefundStartedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      taxFiledRefundStartedCount: 0,
      taxFiledNoRefundCount: 0,
      noTaxFiledRefundStartedCount: 0,
      noTaxFiledNoRefundCount: 0,
      taxFiledCount: 0,
      noTaxFiledCount: 0,
    }
  }

  let taxFiledRefundStartedCount = 0
  let taxFiledNoRefundCount = 0
  let noTaxFiledRefundStartedCount = 0
  let noTaxFiledNoRefundCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.taxFiled) {
      if (intent.refundStarted) taxFiledRefundStartedCount++
      else taxFiledNoRefundCount++
    } else {
      if (intent.refundStarted) noTaxFiledRefundStartedCount++
      else noTaxFiledNoRefundCount++
    }
  }

  return {
    totalIntents: total,
    taxFiledRefundStartedCount,
    taxFiledNoRefundCount,
    noTaxFiledRefundStartedCount,
    noTaxFiledNoRefundCount,
    taxFiledCount: taxFiledRefundStartedCount + taxFiledNoRefundCount,
    noTaxFiledCount: noTaxFiledRefundStartedCount + noTaxFiledNoRefundCount,
  }
}
