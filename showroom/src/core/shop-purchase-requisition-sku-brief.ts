import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseRequisitionSkuBrief = {
  totalRequisitions: number
  uniqueSkus: number
  topSkusByCount: Array<{ sku: string; count: number }>
}

export function projectShopPurchaseRequisitionSkuBrief(
  commerce: CommerceState,
): ShopPurchaseRequisitionSkuBrief {
  let totalRequisitions = 0
  const skuMap = new Map<string, number>()

  for (const req of commerce.purchaseRequisitions ?? []) {
    totalRequisitions++
    skuMap.set(req.sku, (skuMap.get(req.sku) ?? 0) + 1)
  }

  const topSkusByCount = Array.from(skuMap.entries())
    .map(([sku, count]) => ({ sku, count }))
    .sort((a, b) => b.count - a.count || a.sku.localeCompare(b.sku))
    .slice(0, 5)

  return {
    totalRequisitions,
    uniqueSkus: skuMap.size,
    topSkusByCount,
  }
}
