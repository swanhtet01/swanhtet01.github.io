import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentOrderStatusPaymentStatusBrief = {
  totalIntents: number
  confirmedPendingCount: number
  confirmedReconciledCount: number
  preparingPendingCount: number
  preparingReconciledCount: number
  readyPendingCount: number
  readyReconciledCount: number
}

export function projectEcommerceCancellationIntentOrderStatusPaymentStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentOrderStatusPaymentStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      confirmedPendingCount: 0,
      confirmedReconciledCount: 0,
      preparingPendingCount: 0,
      preparingReconciledCount: 0,
      readyPendingCount: 0,
      readyReconciledCount: 0,
    }
  }

  let confirmedPendingCount = 0
  let confirmedReconciledCount = 0
  let preparingPendingCount = 0
  let preparingReconciledCount = 0
  let readyPendingCount = 0
  let readyReconciledCount = 0

  for (const intent of buying.cancellationIntents) {
    const isPending = intent.paymentStatus === 'pending'
    if (intent.orderStatus === 'confirmed') {
      if (isPending) confirmedPendingCount++
      else confirmedReconciledCount++
    } else if (intent.orderStatus === 'preparing') {
      if (isPending) preparingPendingCount++
      else preparingReconciledCount++
    } else {
      if (isPending) readyPendingCount++
      else readyReconciledCount++
    }
  }

  return {
    totalIntents: total,
    confirmedPendingCount,
    confirmedReconciledCount,
    preparingPendingCount,
    preparingReconciledCount,
    readyPendingCount,
    readyReconciledCount,
  }
}
