import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentTaxFiledCustomerMessageBrief = {
  totalIntents: number
  taxFiledMessageSentCount: number
  taxFiledNoMessageCount: number
  noTaxFiledMessageSentCount: number
  noTaxFiledNoMessageCount: number
  taxFiledCount: number
  noTaxFiledCount: number
}

export function projectEcommerceCorrectionIntentTaxFiledCustomerMessageBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentTaxFiledCustomerMessageBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      taxFiledMessageSentCount: 0,
      taxFiledNoMessageCount: 0,
      noTaxFiledMessageSentCount: 0,
      noTaxFiledNoMessageCount: 0,
      taxFiledCount: 0,
      noTaxFiledCount: 0,
    }
  }

  let taxFiledMessageSentCount = 0
  let taxFiledNoMessageCount = 0
  let noTaxFiledMessageSentCount = 0
  let noTaxFiledNoMessageCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.taxFiled) {
      if (intent.customerMessageSent) taxFiledMessageSentCount++
      else taxFiledNoMessageCount++
    } else {
      if (intent.customerMessageSent) noTaxFiledMessageSentCount++
      else noTaxFiledNoMessageCount++
    }
  }

  return {
    totalIntents: total,
    taxFiledMessageSentCount,
    taxFiledNoMessageCount,
    noTaxFiledMessageSentCount,
    noTaxFiledNoMessageCount,
    taxFiledCount: taxFiledMessageSentCount + taxFiledNoMessageCount,
    noTaxFiledCount: noTaxFiledMessageSentCount + noTaxFiledNoMessageCount,
  }
}
