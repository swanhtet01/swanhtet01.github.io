import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderReturnSummary = {
  ordersWithReturns: number
  totalReturns: number
  totalQuantityReturned: number
  byDisposition: {
    restock: number
    not_restocked: number
  }
  uniqueSkusReturned: number
}

export function projectShopOrderReturnSummary(commerce: CommerceState): ShopOrderReturnSummary {
  const byDisposition = { restock: 0, not_restocked: 0 }
  const skuSet = new Set<string>()
  let ordersWithReturns = 0
  let totalReturns = 0
  let totalQuantityReturned = 0

  for (const order of commerce.orders) {
    if (!order.returns || order.returns.length === 0) continue
    ordersWithReturns++
    for (const ret of order.returns) {
      totalReturns++
      totalQuantityReturned += ret.quantity
      byDisposition[ret.disposition]++
      skuSet.add(ret.sku)
    }
  }

  return {
    ordersWithReturns,
    totalReturns,
    totalQuantityReturned,
    byDisposition,
    uniqueSkusReturned: skuSet.size,
  }
}
