import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentRefundStartedOrderStatusBrief = {
  totalIntents: number
  refundStartedConfirmedCount: number
  refundStartedPreparingCount: number
  refundStartedReadyCount: number
  noRefundConfirmedCount: number
  noRefundPreparingCount: number
  noRefundReadyCount: number
}

export function projectEcommerceCancellationIntentRefundStartedOrderStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentRefundStartedOrderStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
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

  for (const intent of buying.cancellationIntents) {
    if (intent.refundStarted) {
      if (intent.orderStatus === 'confirmed') refundStartedConfirmedCount++
      else if (intent.orderStatus === 'preparing') refundStartedPreparingCount++
      else refundStartedReadyCount++
    } else {
      if (intent.orderStatus === 'confirmed') noRefundConfirmedCount++
      else if (intent.orderStatus === 'preparing') noRefundPreparingCount++
      else noRefundReadyCount++
    }
  }

  return {
    totalIntents: total,
    refundStartedConfirmedCount,
    refundStartedPreparingCount,
    refundStartedReadyCount,
    noRefundConfirmedCount,
    noRefundPreparingCount,
    noRefundReadyCount,
  }
}
