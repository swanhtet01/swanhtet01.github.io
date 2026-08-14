import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentRefundStartedRequestedKindBrief = {
  totalIntents: number
  refundStartedCreditCount: number
  refundStartedDebitCount: number
  noRefundCreditCount: number
  noRefundDebitCount: number
  refundStartedCount: number
  noRefundCount: number
}

export function projectEcommerceCorrectionIntentRefundStartedRequestedKindBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentRefundStartedRequestedKindBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      refundStartedCreditCount: 0,
      refundStartedDebitCount: 0,
      noRefundCreditCount: 0,
      noRefundDebitCount: 0,
      refundStartedCount: 0,
      noRefundCount: 0,
    }
  }

  let refundStartedCreditCount = 0
  let refundStartedDebitCount = 0
  let noRefundCreditCount = 0
  let noRefundDebitCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.refundStarted) {
      if (intent.requestedKind === 'credit') refundStartedCreditCount++
      else refundStartedDebitCount++
    } else {
      if (intent.requestedKind === 'credit') noRefundCreditCount++
      else noRefundDebitCount++
    }
  }

  return {
    totalIntents: total,
    refundStartedCreditCount,
    refundStartedDebitCount,
    noRefundCreditCount,
    noRefundDebitCount,
    refundStartedCount: refundStartedCreditCount + refundStartedDebitCount,
    noRefundCount: noRefundCreditCount + noRefundDebitCount,
  }
}
