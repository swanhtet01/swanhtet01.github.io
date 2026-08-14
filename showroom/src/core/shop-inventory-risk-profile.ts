import type { CommerceState } from './commerce-workspace.ts'

export type ShopInventoryRiskProfile = {
  totalItems: number
  itemsAtZero: number
  itemsBelowReorder: number
  itemsHealthy: number
  reorderHealthRate: number
  topZeroStockSkus: string[]
}

export function projectShopInventoryRiskProfile(commerce: CommerceState): ShopInventoryRiskProfile {
  const zeroStockSkus: string[] = []
  let itemsAtZero = 0
  let itemsBelowReorder = 0
  let itemsHealthy = 0

  for (const item of commerce.items) {
    if (item.onHand === 0) {
      itemsAtZero++
      zeroStockSkus.push(item.sku)
    }
    if (item.onHand < item.reorderAt) {
      itemsBelowReorder++
    } else {
      itemsHealthy++
    }
  }

  const totalItems = commerce.items.length
  return {
    totalItems,
    itemsAtZero,
    itemsBelowReorder,
    itemsHealthy,
    reorderHealthRate: totalItems > 0 ? Math.round((itemsHealthy / totalItems) * 100) : 0,
    topZeroStockSkus: zeroStockSkus.slice(0, 5),
  }
}
