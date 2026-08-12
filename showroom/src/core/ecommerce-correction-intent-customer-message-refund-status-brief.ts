import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentCustomerMessageRefundStatusBrief = {
  totalIntents: number
  messageSentNoRefundCount: number
  messageSentDueCount: number
  messageSentSettledCount: number
  noMessageNoRefundCount: number
  noMessageDueCount: number
  noMessageSettledCount: number
}

export function projectEcommerceCorrectionIntentCustomerMessageRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentCustomerMessageRefundStatusBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentNoRefundCount: 0,
      messageSentDueCount: 0,
      messageSentSettledCount: 0,
      noMessageNoRefundCount: 0,
      noMessageDueCount: 0,
      noMessageSettledCount: 0,
    }
  }

  let messageSentNoRefundCount = 0
  let messageSentDueCount = 0
  let messageSentSettledCount = 0
  let noMessageNoRefundCount = 0
  let noMessageDueCount = 0
  let noMessageSettledCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.customerMessageSent) {
      if (intent.refundStatus === 'none') messageSentNoRefundCount++
      else if (intent.refundStatus === 'due') messageSentDueCount++
      else messageSentSettledCount++
    } else {
      if (intent.refundStatus === 'none') noMessageNoRefundCount++
      else if (intent.refundStatus === 'due') noMessageDueCount++
      else noMessageSettledCount++
    }
  }

  return {
    totalIntents: total,
    messageSentNoRefundCount,
    messageSentDueCount,
    messageSentSettledCount,
    noMessageNoRefundCount,
    noMessageDueCount,
    noMessageSettledCount,
  }
}
