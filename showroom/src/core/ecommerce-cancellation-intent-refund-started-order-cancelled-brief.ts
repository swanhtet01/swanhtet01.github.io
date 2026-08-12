import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentRefundStartedOrderCancelledBrief = {
  totalIntents: number
  refundStartedCancelledCount: number
  refundStartedNotCancelledCount: number
  noRefundCancelledCount: number
  noRefundNotCancelledCount: number
  refundStartedCount: number
  noRefundCount: number
}

export function projectEcommerceCancellationIntentRefundStartedOrderCancelledBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentRefundStartedOrderCancelledBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      refundStartedCancelledCount: 0,
      refundStartedNotCancelledCount: 0,
      noRefundCancelledCount: 0,
      noRefundNotCancelledCount: 0,
      refundStartedCount: 0,
      noRefundCount: 0,
    }
  }

  let refundStartedCancelledCount = 0
  let refundStartedNotCancelledCount = 0
  let noRefundCancelledCount = 0
  let noRefundNotCancelledCount = 0

  for (const intent of buying.cancellationIntents) {
    if (intent.refundStarted) {
      if (intent.orderCancelled) refundStartedCancelledCount++
      else refundStartedNotCancelledCount++
    } else {
      if (intent.orderCancelled) noRefundCancelledCount++
      else noRefundNotCancelledCount++
    }
  }

  return {
    totalIntents: total,
    refundStartedCancelledCount,
    refundStartedNotCancelledCount,
    noRefundCancelledCount,
    noRefundNotCancelledCount,
    refundStartedCount: refundStartedCancelledCount + refundStartedNotCancelledCount,
    noRefundCount: noRefundCancelledCount + noRefundNotCancelledCount,
  }
}
