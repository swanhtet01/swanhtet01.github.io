import type { CommerceState } from './commerce-workspace.ts'

export type StockMovementKindBreakdown = {
  opening: number
  reserve: number
  release: number
  receipt: number
  count: number
  return: number
  production_issue: number
  production_return: number
  production_receipt: number
}

export type SkuMovementRecord = {
  sku: string
  netQuantityDelta: number
  totalMovements: number
}

export type ShopInventoryMovementSummary = {
  totalMovements: number
  byKind: StockMovementKindBreakdown
  totalQuantityIn: number
  totalQuantityOut: number
  topMoversbyActivity: SkuMovementRecord[]
}

export function projectShopInventoryMovementSummary(
  commerce: CommerceState,
): ShopInventoryMovementSummary {
  const byKind: StockMovementKindBreakdown = {
    opening: 0, reserve: 0, release: 0, receipt: 0, count: 0,
    return: 0, production_issue: 0, production_return: 0, production_receipt: 0,
  }
  const skuMap = new Map<string, { netDelta: number; count: number }>()
  let totalQuantityIn = 0
  let totalQuantityOut = 0

  for (const movement of commerce.movements) {
    byKind[movement.kind as keyof StockMovementKindBreakdown] += 1

    const delta = movement.quantityDelta
    if (delta > 0) totalQuantityIn += delta
    else if (delta < 0) totalQuantityOut += Math.abs(delta)

    const entry = skuMap.get(movement.sku) ?? { netDelta: 0, count: 0 }
    entry.netDelta += delta
    entry.count++
    skuMap.set(movement.sku, entry)
  }

  const topMoversbyActivity: SkuMovementRecord[] = Array.from(skuMap.entries())
    .map(([sku, { netDelta, count }]) => ({ sku, netQuantityDelta: netDelta, totalMovements: count }))
    .sort((a, b) => b.totalMovements - a.totalMovements || a.sku.localeCompare(b.sku))
    .slice(0, 5)

  return {
    totalMovements: commerce.movements.length,
    byKind,
    totalQuantityIn,
    totalQuantityOut,
    topMoversbyActivity,
  }
}
