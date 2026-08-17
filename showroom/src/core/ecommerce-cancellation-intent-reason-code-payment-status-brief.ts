import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentReasonCodePaymentStatusBrief = {
  totalIntents: number
  changedMindPendingCount: number
  changedMindReconciledCount: number
  deliveryTooSlowPendingCount: number
  deliveryTooSlowReconciledCount: number
  duplicateOrderPendingCount: number
  duplicateOrderReconciledCount: number
  orderErrorPendingCount: number
  orderErrorReconciledCount: number
  otherPendingCount: number
  otherReconciledCount: number
}

export function projectEcommerceCancellationIntentReasonCodePaymentStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentReasonCodePaymentStatusBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      changedMindPendingCount: 0,
      changedMindReconciledCount: 0,
      deliveryTooSlowPendingCount: 0,
      deliveryTooSlowReconciledCount: 0,
      duplicateOrderPendingCount: 0,
      duplicateOrderReconciledCount: 0,
      orderErrorPendingCount: 0,
      orderErrorReconciledCount: 0,
      otherPendingCount: 0,
      otherReconciledCount: 0,
    }
  }

  let changedMindPendingCount = 0
  let changedMindReconciledCount = 0
  let deliveryTooSlowPendingCount = 0
  let deliveryTooSlowReconciledCount = 0
  let duplicateOrderPendingCount = 0
  let duplicateOrderReconciledCount = 0
  let orderErrorPendingCount = 0
  let orderErrorReconciledCount = 0
  let otherPendingCount = 0
  let otherReconciledCount = 0

  for (const intent of buying.cancellationIntents) {
    const isPending = intent.paymentStatus === 'pending'
    if (intent.reasonCode === 'changed_mind') {
      if (isPending) changedMindPendingCount++; else changedMindReconciledCount++
    } else if (intent.reasonCode === 'delivery_too_slow') {
      if (isPending) deliveryTooSlowPendingCount++; else deliveryTooSlowReconciledCount++
    } else if (intent.reasonCode === 'duplicate_order') {
      if (isPending) duplicateOrderPendingCount++; else duplicateOrderReconciledCount++
    } else if (intent.reasonCode === 'order_error') {
      if (isPending) orderErrorPendingCount++; else orderErrorReconciledCount++
    } else {
      if (isPending) otherPendingCount++; else otherReconciledCount++
    }
  }

  return {
    totalIntents: total,
    changedMindPendingCount,
    changedMindReconciledCount,
    deliveryTooSlowPendingCount,
    deliveryTooSlowReconciledCount,
    duplicateOrderPendingCount,
    duplicateOrderReconciledCount,
    orderErrorPendingCount,
    orderErrorReconciledCount,
    otherPendingCount,
    otherReconciledCount,
  }
}
