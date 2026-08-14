import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentCustomerMessageRefundStatusBrief = {
  totalIntents: number
  messageSentNoneCount: number
  messageSentDueCount: number
  messageSentSettledCount: number
  noMessageNoneCount: number
  noMessageDueCount: number
  noMessageSettledCount: number
}

export function projectEcommerceCancellationIntentCustomerMessageRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentCustomerMessageRefundStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentNoneCount: 0,
      messageSentDueCount: 0,
      messageSentSettledCount: 0,
      noMessageNoneCount: 0,
      noMessageDueCount: 0,
      noMessageSettledCount: 0,
    }
  }

  let messageSentNoneCount = 0
  let messageSentDueCount = 0
  let messageSentSettledCount = 0
  let noMessageNoneCount = 0
  let noMessageDueCount = 0
  let noMessageSettledCount = 0

  for (const intent of buying.cancellationIntents) {
    if (intent.customerMessageSent) {
      if (intent.refundStatus === 'none') messageSentNoneCount++
      else if (intent.refundStatus === 'due') messageSentDueCount++
      else messageSentSettledCount++
    } else {
      if (intent.refundStatus === 'none') noMessageNoneCount++
      else if (intent.refundStatus === 'due') noMessageDueCount++
      else noMessageSettledCount++
    }
  }

  return {
    totalIntents: total,
    messageSentNoneCount,
    messageSentDueCount,
    messageSentSettledCount,
    noMessageNoneCount,
    noMessageDueCount,
    noMessageSettledCount,
  }
}
