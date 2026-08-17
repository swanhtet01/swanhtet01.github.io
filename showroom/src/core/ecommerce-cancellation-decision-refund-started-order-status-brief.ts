import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionRefundStartedOrderStatusBrief = {
  totalDecisions: number
  refundStartedConfirmedCount: number
  refundStartedPreparingCount: number
  refundStartedReadyCount: number
  noRefundConfirmedCount: number
  noRefundPreparingCount: number
  noRefundReadyCount: number
}

export function projectEcommerceCancellationDecisionRefundStartedOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionRefundStartedOrderStatusBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      refundStartedConfirmedCount: 0,
      refundStartedPreparingCount: 0,
      refundStartedReadyCount: 0,
      noRefundConfirmedCount: 0,
      noRefundPreparingCount: 0,
      noRefundReadyCount: 0,
    }
  }

  let refundStartedConfirmedCount = 0
  let refundStartedPreparingCount = 0
  let refundStartedReadyCount = 0
  let noRefundConfirmedCount = 0
  let noRefundPreparingCount = 0
  let noRefundReadyCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.refundStarted) {
      if (decision.orderStatus === 'confirmed') refundStartedConfirmedCount++
      else if (decision.orderStatus === 'preparing') refundStartedPreparingCount++
      else refundStartedReadyCount++
    } else {
      if (decision.orderStatus === 'confirmed') noRefundConfirmedCount++
      else if (decision.orderStatus === 'preparing') noRefundPreparingCount++
      else noRefundReadyCount++
    }
  }

  return {
    totalDecisions: total,
    refundStartedConfirmedCount,
    refundStartedPreparingCount,
    refundStartedReadyCount,
    noRefundConfirmedCount,
    noRefundPreparingCount,
    noRefundReadyCount,
  }
}
