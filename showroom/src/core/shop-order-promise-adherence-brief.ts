import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderPromiseAdherenceBrief = {
  totalOrders: number
  ordersWithPromise: number
  ordersWithoutPromise: number
  onTimeDeliveries: number
  lateDeliveries: number
  cancelledWithPromise: number
  activeOverdue: number
  activePending: number
  onTimeRate: number
}

export function projectShopOrderPromiseAdherenceBrief(
  commerce: CommerceState,
  asOf: string,
): ShopOrderPromiseAdherenceBrief {
  let ordersWithPromise = 0
  let ordersWithoutPromise = 0
  let onTimeDeliveries = 0
  let lateDeliveries = 0
  let cancelledWithPromise = 0
  let activeOverdue = 0
  let activePending = 0

  for (const order of commerce.orders) {
    if (order.promisedAt === undefined) {
      ordersWithoutPromise++
      continue
    }
    ordersWithPromise++

    if (order.status === 'completed' && order.completion !== undefined) {
      if (order.completion.capturedAt <= order.promisedAt) onTimeDeliveries++
      else lateDeliveries++
    } else if (order.status === 'cancelled') {
      cancelledWithPromise++
    } else {
      if (asOf > order.promisedAt) activeOverdue++
      else activePending++
    }
  }

  const resolved = onTimeDeliveries + lateDeliveries
  return {
    totalOrders: commerce.orders.length,
    ordersWithPromise,
    ordersWithoutPromise,
    onTimeDeliveries,
    lateDeliveries,
    cancelledWithPromise,
    activeOverdue,
    activePending,
    onTimeRate: resolved > 0 ? Math.round((onTimeDeliveries / resolved) * 100) : 0,
  }
}
