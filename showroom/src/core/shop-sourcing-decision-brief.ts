import type { CommerceState } from './commerce-workspace.ts'

export type ShopSourcingDecisionBrief = {
  totalDecisions: number
  uniqueSkus: number
  topSkusByCount: Array<{ sku: string; count: number }>
  totalQuantity: number
  averageQuantity: number
}

export function projectShopSourcingDecisionBrief(
  commerce: CommerceState,
): ShopSourcingDecisionBrief {
  let totalDecisions = 0
  let totalQuantity = 0
  const skuMap = new Map<string, number>()

  for (const decision of commerce.supplierSourcingDecisions ?? []) {
    totalDecisions++
    totalQuantity += decision.quantity
    skuMap.set(decision.sku, (skuMap.get(decision.sku) ?? 0) + 1)
  }

  const topSkusByCount = Array.from(skuMap.entries())
    .map(([sku, count]) => ({ sku, count }))
    .sort((a, b) => b.count - a.count || a.sku.localeCompare(b.sku))
    .slice(0, 5)

  return {
    totalDecisions,
    uniqueSkus: skuMap.size,
    topSkusByCount,
    totalQuantity,
    averageQuantity: totalDecisions > 0 ? Math.round(totalQuantity / totalDecisions) : 0,
  }
}
