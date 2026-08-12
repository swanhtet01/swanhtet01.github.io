import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentCustomerMessagePaymentStatusBrief = {
  totalIntents: number
  messageSentPendingCount: number
  messageSentReconciledCount: number
  noMessagePendingCount: number
  noMessageReconciledCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceCancellationIntentCustomerMessagePaymentStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentCustomerMessagePaymentStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
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

  for (const intent of buying.cancellationIntents) {
    const isPending = intent.paymentStatus === 'pending'
    if (intent.customerMessageSent) {
      if (isPending) messageSentPendingCount++
      else messageSentReconciledCount++
    } else {
      if (isPending) noMessagePendingCount++
      else noMessageReconciledCount++
    }
  }

  return {
    totalIntents: total,
    messageSentPendingCount,
    messageSentReconciledCount,
    noMessagePendingCount,
    noMessageReconciledCount,
    messageSentCount: messageSentPendingCount + messageSentReconciledCount,
    noMessageCount: noMessagePendingCount + noMessageReconciledCount,
  }
}
