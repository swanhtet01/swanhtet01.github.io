import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentPaymentChangedRefundStatusBrief = {
  totalIntents: number
  paymentChangedNoRefundCount: number
  paymentChangedDueCount: number
  paymentChangedSettledCount: number
  noPaymentChangeNoRefundCount: number
  noPaymentChangeDueCount: number
  noPaymentChangeSettledCount: number
}

export function projectEcommerceCorrectionIntentPaymentChangedRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentPaymentChangedRefundStatusBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      paymentChangedNoRefundCount: 0,
      paymentChangedDueCount: 0,
      paymentChangedSettledCount: 0,
      noPaymentChangeNoRefundCount: 0,
      noPaymentChangeDueCount: 0,
      noPaymentChangeSettledCount: 0,
    }
  }

  let paymentChangedNoRefundCount = 0
  let paymentChangedDueCount = 0
  let paymentChangedSettledCount = 0
  let noPaymentChangeNoRefundCount = 0
  let noPaymentChangeDueCount = 0
  let noPaymentChangeSettledCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.paymentChanged) {
      if (intent.refundStatus === 'none') paymentChangedNoRefundCount++
      else if (intent.refundStatus === 'due') paymentChangedDueCount++
      else paymentChangedSettledCount++
    } else {
      if (intent.refundStatus === 'none') noPaymentChangeNoRefundCount++
      else if (intent.refundStatus === 'due') noPaymentChangeDueCount++
      else noPaymentChangeSettledCount++
    }
  }

  return {
    totalIntents: total,
    paymentChangedNoRefundCount,
    paymentChangedDueCount,
    paymentChangedSettledCount,
    noPaymentChangeNoRefundCount,
    noPaymentChangeDueCount,
    noPaymentChangeSettledCount,
  }
}
