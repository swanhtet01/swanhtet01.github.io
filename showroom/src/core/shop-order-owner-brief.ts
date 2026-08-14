import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderOwnerEntry = {
  owner: string
  orderCount: number
  totalRevenueMmk: number
  cancelledCount: number
}

export type ShopOrderOwnerBrief = {
  totalOrders: number
  ordersWithOwner: number
  ordersWithoutOwner: number
  uniqueOwners: number
  topOwners: ShopOrderOwnerEntry[]
  topOwnerByVolume: string | null
}

export function projectShopOrderOwnerBrief(commerce: CommerceState): ShopOrderOwnerBrief {
  const ownerMap = new Map<string, { orderCount: number; totalRevenueMmk: number; cancelledCount: number }>()
  let ordersWithoutOwner = 0

  for (const order of commerce.orders) {
    if (order.owner === undefined) {
      ordersWithoutOwner++
      continue
    }
    const entry = ownerMap.get(order.owner)
    if (entry) {
      entry.orderCount++
      if (order.status !== 'cancelled') entry.totalRevenueMmk += order.total
      else entry.cancelledCount++
    } else {
      ownerMap.set(order.owner, {
        orderCount: 1,
        totalRevenueMmk: order.status !== 'cancelled' ? order.total : 0,
        cancelledCount: order.status === 'cancelled' ? 1 : 0,
      })
    }
  }

  const topOwners: ShopOrderOwnerEntry[] = Array.from(ownerMap.entries())
    .map(([owner, data]) => ({ owner, ...data }))
    .sort((a, b) => b.totalRevenueMmk - a.totalRevenueMmk)
    .slice(0, 5)

  const topOwnerByVolume = ownerMap.size > 0
    ? Array.from(ownerMap.entries())
        .sort((a, b) => b[1].orderCount - a[1].orderCount)[0][0]
    : null

  return {
    totalOrders: commerce.orders.length,
    ordersWithOwner: commerce.orders.length - ordersWithoutOwner,
    ordersWithoutOwner,
    uniqueOwners: ownerMap.size,
    topOwners,
    topOwnerByVolume,
  }
}
