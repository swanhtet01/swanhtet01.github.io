import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentOrderCancelledOrderStatusBrief = {
  totalIntents: number
  cancelledConfirmedCount: number
  cancelledPreparingCount: number
  cancelledReadyCount: number
  notCancelledConfirmedCount: number
  notCancelledPreparingCount: number
  notCancelledReadyCount: number
}

export function projectEcommerceCancellationIntentOrderCancelledOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentOrderCancelledOrderStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
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

  for (const intent of buying.cancellationIntents) {
    if (intent.orderCancelled) {
      if (intent.orderStatus === 'confirmed') cancelledConfirmedCount++
      else if (intent.orderStatus === 'preparing') cancelledPreparingCount++
      else cancelledReadyCount++
    } else {
      if (intent.orderStatus === 'confirmed') notCancelledConfirmedCount++
      else if (intent.orderStatus === 'preparing') notCancelledPreparingCount++
      else notCancelledReadyCount++
    }
  }

  return {
    totalIntents: total,
    cancelledConfirmedCount,
    cancelledPreparingCount,
    cancelledReadyCount,
    notCancelledConfirmedCount,
    notCancelledPreparingCount,
    notCancelledReadyCount,
  }
}
