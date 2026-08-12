import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionOrderCancelledOrderStatusBrief = {
  totalDecisions: number
  cancelledConfirmedCount: number
  cancelledPreparingCount: number
  cancelledReadyCount: number
  notCancelledConfirmedCount: number
  notCancelledPreparingCount: number
  notCancelledReadyCount: number
}

export function projectEcommerceCancellationDecisionOrderCancelledOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionOrderCancelledOrderStatusBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      cancelledConfirmedCount: 0,
      cancelledPreparingCount: 0,
      cancelledReadyCount: 0,
      notCancelledConfirmedCount: 0,
      notCancelledPreparingCount: 0,
      notCancelledReadyCount: 0,
    }
  }

  let cancelledConfirmedCount = 0
  let cancelledPreparingCount = 0
  let cancelledReadyCount = 0
  let notCancelledConfirmedCount = 0
  let notCancelledPreparingCount = 0
  let notCancelledReadyCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.orderCancelled) {
      if (decision.orderStatus === 'confirmed') cancelledConfirmedCount++
      else if (decision.orderStatus === 'preparing') cancelledPreparingCount++
      else cancelledReadyCount++
    } else {
      if (decision.orderStatus === 'confirmed') notCancelledConfirmedCount++
      else if (decision.orderStatus === 'preparing') notCancelledPreparingCount++
      else notCancelledReadyCount++
    }
  }

  return {
    totalDecisions: total,
    cancelledConfirmedCount,
    cancelledPreparingCount,
    cancelledReadyCount,
    notCancelledConfirmedCount,
    notCancelledPreparingCount,
    notCancelledReadyCount,
  }
}
