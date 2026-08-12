import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentCustomerMessageRefundStatusBrief = {
  totalIntents: number
  messageSentNoRefundCount: number
  messageSentPartialRefundCount: number
  messageSentFullRefundCount: number
  noMessageNoRefundCount: number
  noMessagePartialRefundCount: number
  noMessageFullRefundCount: number
}

export function projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentCustomerMessageRefundStatusBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentNoRefundCount: 0,
      messageSentPartialRefundCount: 0,
      messageSentFullRefundCount: 0,
      noMessageNoRefundCount: 0,
      noMessagePartialRefundCount: 0,
      noMessageFullRefundCount: 0,
    }
  }

  let messageSentNoRefundCount = 0
  let messageSentPartialRefundCount = 0
  let messageSentFullRefundCount = 0
  let noMessageNoRefundCount = 0
  let noMessagePartialRefundCount = 0
  let noMessageFullRefundCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.customerMessageSent) {
      if (intent.refundStatus === 'none') messageSentNoRefundCount++
      else if (intent.refundStatus === 'partial') messageSentPartialRefundCount++
      else messageSentFullRefundCount++
    } else {
      if (intent.refundStatus === 'none') noMessageNoRefundCount++
      else if (intent.refundStatus === 'partial') noMessagePartialRefundCount++
      else noMessageFullRefundCount++
    }
  }

  return {
    totalIntents: total,
    messageSentNoRefundCount,
    messageSentPartialRefundCount,
    messageSentFullRefundCount,
    noMessageNoRefundCount,
    noMessagePartialRefundCount,
    noMessageFullRefundCount,
  }
}
