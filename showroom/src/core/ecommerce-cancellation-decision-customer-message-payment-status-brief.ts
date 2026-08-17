import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionCustomerMessagePaymentStatusBrief = {
  totalDecisions: number
  messageSentPendingCount: number
  messageSentReconciledCount: number
  noMessagePendingCount: number
  noMessageReconciledCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceCancellationDecisionCustomerMessagePaymentStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionCustomerMessagePaymentStatusBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      messageSentPendingCount: 0,
      messageSentReconciledCount: 0,
      noMessagePendingCount: 0,
      noMessageReconciledCount: 0,
      messageSentCount: 0,
      noMessageCount: 0,
    }
  }

  let messageSentPendingCount = 0
  let messageSentReconciledCount = 0
  let noMessagePendingCount = 0
  let noMessageReconciledCount = 0

  for (const decision of buying.cancellationDecisions) {
    const isPending = decision.paymentStatus === 'pending'
    if (decision.customerMessageSent) {
      if (isPending) messageSentPendingCount++
      else messageSentReconciledCount++
    } else {
      if (isPending) noMessagePendingCount++
      else noMessageReconciledCount++
    }
  }

  return {
    totalDecisions: total,
    messageSentPendingCount,
    messageSentReconciledCount,
    noMessagePendingCount,
    noMessageReconciledCount,
    messageSentCount: messageSentPendingCount + messageSentReconciledCount,
    noMessageCount: noMessagePendingCount + noMessageReconciledCount,
  }
}
