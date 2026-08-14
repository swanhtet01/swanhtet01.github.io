import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderCorrectionSummary = {
  ordersWithCorrections: number
  totalCorrections: number
  byKind: {
    credit: number
    debit: number
  }
  byReasonCode: {
    pricing_error: number
    service_recovery: number
    fee_adjustment: number
    other: number
  }
}

export function projectShopOrderCorrectionSummary(commerce: CommerceState): ShopOrderCorrectionSummary {
  const byKind = { credit: 0, debit: 0 }
  const byReasonCode = { pricing_error: 0, service_recovery: 0, fee_adjustment: 0, other: 0 }
  let ordersWithCorrections = 0
  let totalCorrections = 0

  for (const order of commerce.orders) {
    if (!order.corrections || order.corrections.length === 0) continue
    ordersWithCorrections++
    for (const correction of order.corrections) {
      totalCorrections++
      byKind[correction.kind]++
      byReasonCode[correction.reasonCode]++
    }
  }

  return { ordersWithCorrections, totalCorrections, byKind, byReasonCode }
}
