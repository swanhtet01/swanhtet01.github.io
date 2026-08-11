import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentSummary = {
  totalCorrections: number
  uniqueOrders: number
  totalListedAmountMmk: number
  totalOriginalBalanceMmk: number
  byRefundStatus: { none: number; due: number; settled: number }
  byKind: { credit: number; debit: number }
  topReasonCode: 'pricing_error' | 'service_recovery' | 'fee_adjustment' | 'other' | null
}

export function projectEcommerceCorrectionIntentSummary(buying: EcommerceBuyingState): EcommerceCorrectionIntentSummary {
  const orderSet = new Set<string>()
  let totalListedAmountMmk = 0
  let totalOriginalBalanceMmk = 0
  const byRefundStatus = { none: 0, due: 0, settled: 0 }
  const byKind = { credit: 0, debit: 0 }
  const byReasonCode: Record<string, number> = {}

  for (const intent of buying.correctionIntents) {
    orderSet.add(intent.orderId)
    totalListedAmountMmk += intent.listedAmountMmk
    totalOriginalBalanceMmk += intent.originalBalanceMmk
    byRefundStatus[intent.refundStatus]++
    byKind[intent.requestedKind]++
    byReasonCode[intent.reasonCode] = (byReasonCode[intent.reasonCode] ?? 0) + 1
  }

  let topReasonCode: 'pricing_error' | 'service_recovery' | 'fee_adjustment' | 'other' | null = null
  for (const code of Object.keys(byReasonCode) as Array<'pricing_error' | 'service_recovery' | 'fee_adjustment' | 'other'>) {
    if (topReasonCode === null || byReasonCode[code] > byReasonCode[topReasonCode] || (byReasonCode[code] === byReasonCode[topReasonCode] && code < topReasonCode)) {
      topReasonCode = code
    }
  }

  return {
    totalCorrections: buying.correctionIntents.length,
    uniqueOrders: orderSet.size,
    totalListedAmountMmk,
    totalOriginalBalanceMmk,
    byRefundStatus,
    byKind,
    topReasonCode,
  }
}
