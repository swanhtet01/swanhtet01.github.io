import type { CommerceState } from './commerce-workspace.ts'

export type ShopFulfilmentMethodEntry = {
  fulfilmentMethod: string
  orderCount: number
  totalRevenueMmk: number
  cancelledCount: number
}

export type ShopFulfilmentMethodBrief = {
  totalOrders: number
  ordersWithFulfilment: number
  ordersWithoutFulfilment: number
  uniqueMethods: number
  byMethod: ShopFulfilmentMethodEntry[]
  topMethodByRevenue: string | null
  topMethodByVolume: string | null
}

export function projectShopFulfilmentMethodBrief(commerce: CommerceState): ShopFulfilmentMethodBrief {
  const methodMap = new Map<string, { orderCount: number; totalRevenueMmk: number; cancelledCount: number }>()
  let ordersWithoutFulfilment = 0

  for (const order of commerce.orders) {
    if (order.fulfilment === undefined) {
      ordersWithoutFulfilment++
      continue
    }
    const entry = methodMap.get(order.fulfilment)
    if (entry) {
      entry.orderCount++
      if (order.status !== 'cancelled') entry.totalRevenueMmk += order.total
      else entry.cancelledCount++
    } else {
      methodMap.set(order.fulfilment, {
        orderCount: 1,
        totalRevenueMmk: order.status !== 'cancelled' ? order.total : 0,
        cancelledCount: order.status === 'cancelled' ? 1 : 0,
      })
    }
  }

  const byMethod: ShopFulfilmentMethodEntry[] = Array.from(methodMap.entries())
    .map(([fulfilmentMethod, data]) => ({ fulfilmentMethod, ...data }))
    .sort((a, b) => b.totalRevenueMmk - a.totalRevenueMmk)

  const topMethodByRevenue = byMethod.length > 0 ? byMethod[0].fulfilmentMethod : null
  const topMethodByVolume = byMethod.length > 0
    ? byMethod.slice().sort((a, b) => b.orderCount - a.orderCount)[0].fulfilmentMethod
    : null

  return {
    totalOrders: commerce.orders.length,
    ordersWithFulfilment: commerce.orders.length - ordersWithoutFulfilment,
    ordersWithoutFulfilment,
    uniqueMethods: methodMap.size,
    byMethod,
    topMethodByRevenue,
    topMethodByVolume,
  }
}
