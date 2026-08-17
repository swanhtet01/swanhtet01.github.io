import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSupportIntentRefundStartedDescriptionLengthBrief = {
  totalIntents: number
  refundStartedShortCount: number
  refundStartedDetailedCount: number
  noRefundShortCount: number
  noRefundDetailedCount: number
  refundStartedCount: number
  noRefundCount: number
}

export function projectEcommerceSupportIntentRefundStartedDescriptionLengthBrief(
  buying: EcommerceBuyingState,
): EcommerceSupportIntentRefundStartedDescriptionLengthBrief {
  const total = buying.supportIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      refundStartedShortCount: 0,
      refundStartedDetailedCount: 0,
      noRefundShortCount: 0,
      noRefundDetailedCount: 0,
      refundStartedCount: 0,
      noRefundCount: 0,
    }
  }

  let refundStartedShortCount = 0
  let refundStartedDetailedCount = 0
  let noRefundShortCount = 0
  let noRefundDetailedCount = 0

  for (const intent of buying.supportIntents) {
    const isShort = intent.description.length <= 40
    if (intent.refundStarted) {
      if (isShort) refundStartedShortCount++
      else refundStartedDetailedCount++
    } else {
      if (isShort) noRefundShortCount++
      else noRefundDetailedCount++
    }
  }

  return {
    totalIntents: total,
    refundStartedShortCount,
    refundStartedDetailedCount,
    noRefundShortCount,
    noRefundDetailedCount,
    refundStartedCount: refundStartedShortCount + refundStartedDetailedCount,
    noRefundCount: noRefundShortCount + noRefundDetailedCount,
  }
}
