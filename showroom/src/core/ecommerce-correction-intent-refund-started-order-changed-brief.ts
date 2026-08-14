import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentRefundStartedOrderChangedBrief = {
  totalIntents: number
  refundStartedOrderChangedCount: number
  refundStartedNoOrderChangeCount: number
  noRefundStartedOrderChangedCount: number
  noRefundStartedNoOrderChangeCount: number
  refundStartedCount: number
  noRefundStartedCount: number
}

export function projectEcommerceCorrectionIntentRefundStartedOrderChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentRefundStartedOrderChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      refundStartedOrderChangedCount: 0,
      refundStartedNoOrderChangeCount: 0,
      noRefundStartedOrderChangedCount: 0,
      noRefundStartedNoOrderChangeCount: 0,
      refundStartedCount: 0,
      noRefundStartedCount: 0,
    }
  }

  let refundStartedOrderChangedCount = 0
  let refundStartedNoOrderChangeCount = 0
  let noRefundStartedOrderChangedCount = 0
  let noRefundStartedNoOrderChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.refundStarted) {
      if (intent.orderChanged) refundStartedOrderChangedCount++
      else refundStartedNoOrderChangeCount++
    } else {
      if (intent.orderChanged) noRefundStartedOrderChangedCount++
      else noRefundStartedNoOrderChangeCount++
    }
  }

  return {
    totalIntents: total,
    refundStartedOrderChangedCount,
    refundStartedNoOrderChangeCount,
    noRefundStartedOrderChangedCount,
    noRefundStartedNoOrderChangeCount,
    refundStartedCount: refundStartedOrderChangedCount + refundStartedNoOrderChangeCount,
    noRefundStartedCount: noRefundStartedOrderChangedCount + noRefundStartedNoOrderChangeCount,
  }
}
