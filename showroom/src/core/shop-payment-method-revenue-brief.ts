import type { CommerceState } from './commerce-workspace.ts'

export type ShopPaymentMethodEntry = {
  paymentMethod: string
  orderCount: number
  totalRevenueMmk: number
  cancelledCount: number
}

export type ShopPaymentMethodRevenueBrief = {
  totalOrders: number
  uniquePaymentMethods: number
  byPaymentMethod: ShopPaymentMethodEntry[]
  topMethodByRevenue: string | null
  topMethodByVolume: string | null
}

export function projectShopPaymentMethodRevenueBrief(commerce: CommerceState): ShopPaymentMethodRevenueBrief {
  const methodMap = new Map<string, { orderCount: number; totalRevenueMmk: number; cancelledCount: number }>()

  for (const order of commerce.orders) {
    const entry = methodMap.get(order.payment)
    if (entry) {
      entry.orderCount++
      if (order.status !== 'cancelled') entry.totalRevenueMmk += order.total
      else entry.cancelledCount++
    } else {
      methodMap.set(order.payment, {
        orderCount: 1,
        totalRevenueMmk: order.status !== 'cancelled' ? order.total : 0,
        cancelledCount: order.status === 'cancelled' ? 1 : 0,
      })
    }
  }

  const byPaymentMethod: ShopPaymentMethodEntry[] = Array.from(methodMap.entries())
    .map(([paymentMethod, data]) => ({ paymentMethod, ...data }))
    .sort((a, b) => b.totalRevenueMmk - a.totalRevenueMmk)

  const topMethodByRevenue = byPaymentMethod.length > 0 ? byPaymentMethod[0].paymentMethod : null
  const topMethodByVolume = byPaymentMethod.length > 0
    ? byPaymentMethod.slice().sort((a, b) => b.orderCount - a.orderCount)[0].paymentMethod
    : null

  return {
    totalOrders: commerce.orders.length,
    uniquePaymentMethods: methodMap.size,
    byPaymentMethod,
    topMethodByRevenue,
    topMethodByVolume,
  }
}
