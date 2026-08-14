import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentSummary = {
  totalIntents: number
  uniqueOrders: number
  totalOrderValueMmk: number
  byReasonCode: { changed_mind: number; duplicate_order: number; order_error: number; delivery_too_slow: number; other: number }
  byOrderStatus: { confirmed: number; preparing: number; ready: number }
  topReasonCode: 'changed_mind' | 'duplicate_order' | 'order_error' | 'delivery_too_slow' | 'other' | null
}

export function projectEcommerceCancellationIntentSummary(buying: EcommerceBuyingState): EcommerceCancellationIntentSummary {
  const orderSet = new Set<string>()
  let totalOrderValueMmk = 0
  const byReasonCode = { changed_mind: 0, duplicate_order: 0, order_error: 0, delivery_too_slow: 0, other: 0 }
  const byOrderStatus = { confirmed: 0, preparing: 0, ready: 0 }

  for (const intent of buying.cancellationIntents) {
    orderSet.add(intent.orderId)
    totalOrderValueMmk += intent.totalMmk
    byReasonCode[intent.reasonCode]++
    byOrderStatus[intent.orderStatus]++
  }

  let topReasonCode: 'changed_mind' | 'duplicate_order' | 'order_error' | 'delivery_too_slow' | 'other' | null = null
  if (buying.cancellationIntents.length > 0) {
    const codes = Object.keys(byReasonCode) as Array<keyof typeof byReasonCode>
    topReasonCode = codes.reduce((best, code) =>
      byReasonCode[code] > byReasonCode[best] || (byReasonCode[code] === byReasonCode[best] && code < best) ? code : best
    )
  }

  return {
    totalIntents: buying.cancellationIntents.length,
    uniqueOrders: orderSet.size,
    totalOrderValueMmk,
    byReasonCode,
    byOrderStatus,
    topReasonCode,
  }
}
