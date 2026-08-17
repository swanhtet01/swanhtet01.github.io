import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentOrderChangedRefundStatusBrief = {
  totalIntents: number
  orderChangedNoRefundCount: number
  orderChangedDueCount: number
  orderChangedSettledCount: number
  noOrderChangeNoRefundCount: number
  noOrderChangeDueCount: number
  noOrderChangeSettledCount: number
}

export function projectEcommerceCorrectionIntentOrderChangedRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentOrderChangedRefundStatusBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      orderChangedNoRefundCount: 0,
      orderChangedDueCount: 0,
      orderChangedSettledCount: 0,
      noOrderChangeNoRefundCount: 0,
      noOrderChangeDueCount: 0,
      noOrderChangeSettledCount: 0,
    }
  }

  let orderChangedNoRefundCount = 0
  let orderChangedDueCount = 0
  let orderChangedSettledCount = 0
  let noOrderChangeNoRefundCount = 0
  let noOrderChangeDueCount = 0
  let noOrderChangeSettledCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.orderChanged) {
      if (intent.refundStatus === 'none') orderChangedNoRefundCount++
      else if (intent.refundStatus === 'due') orderChangedDueCount++
      else orderChangedSettledCount++
    } else {
      if (intent.refundStatus === 'none') noOrderChangeNoRefundCount++
      else if (intent.refundStatus === 'due') noOrderChangeDueCount++
      else noOrderChangeSettledCount++
    }
  }

  return {
    totalIntents: total,
    orderChangedNoRefundCount,
    orderChangedDueCount,
    orderChangedSettledCount,
    noOrderChangeNoRefundCount,
    noOrderChangeDueCount,
    noOrderChangeSettledCount,
  }
}
