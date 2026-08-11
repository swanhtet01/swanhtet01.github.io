import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseOrderSkuBrief = {
  totalPurchaseOrders: number
  uniqueSkus: number
  topSkusByCount: Array<{ sku: string; count: number }>
}

export function projectShopPurchaseOrderSkuBrief(
  commerce: CommerceState,
): ShopPurchaseOrderSkuBrief {
  let totalPurchaseOrders = 0
  const skuMap = new Map<string, number>()

  for (const po of commerce.purchaseOrders ?? []) {
    totalPurchaseOrders++
    skuMap.set(po.sku, (skuMap.get(po.sku) ?? 0) + 1)
  }

  const topSkusByCount = Array.from(skuMap.entries())
    .map(([sku, count]) => ({ sku, count }))
    .sort((a, b) => b.count - a.count || a.sku.localeCompare(b.sku))
    .slice(0, 5)

  return {
    totalPurchaseOrders,
    uniqueSkus: skuMap.size,
    topSkusByCount,
  }
}
