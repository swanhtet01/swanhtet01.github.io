import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentRefundStartedPaymentChangedBrief = {
  totalIntents: number
  refundStartedPaymentChangedCount: number
  refundStartedNoPaymentChangeCount: number
  noRefundStartedPaymentChangedCount: number
  noRefundStartedNoPaymentChangeCount: number
  refundStartedCount: number
  noRefundStartedCount: number
}

export function projectEcommerceCorrectionIntentRefundStartedPaymentChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentRefundStartedPaymentChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      refundStartedPaymentChangedCount: 0,
      refundStartedNoPaymentChangeCount: 0,
      noRefundStartedPaymentChangedCount: 0,
      noRefundStartedNoPaymentChangeCount: 0,
      refundStartedCount: 0,
      noRefundStartedCount: 0,
    }
  }

  let refundStartedPaymentChangedCount = 0
  let refundStartedNoPaymentChangeCount = 0
  let noRefundStartedPaymentChangedCount = 0
  let noRefundStartedNoPaymentChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.refundStarted) {
      if (intent.paymentChanged) refundStartedPaymentChangedCount++
      else refundStartedNoPaymentChangeCount++
    } else {
      if (intent.paymentChanged) noRefundStartedPaymentChangedCount++
      else noRefundStartedNoPaymentChangeCount++
    }
  }

  return {
    totalIntents: total,
    refundStartedPaymentChangedCount,
    refundStartedNoPaymentChangeCount,
    noRefundStartedPaymentChangedCount,
    noRefundStartedNoPaymentChangeCount,
    refundStartedCount: refundStartedPaymentChangedCount + refundStartedNoPaymentChangeCount,
    noRefundStartedCount: noRefundStartedPaymentChangedCount + noRefundStartedNoPaymentChangeCount,
  }
}
