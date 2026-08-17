import type { CommerceState } from './commerce-workspace.ts'

export type ShopItemCatalogSummary = {
  totalItems: number
  uniqueSkus: number
  totalOnHand: number
  itemsBelowReorder: number
  averagePriceMmk: number
  highestPriceMmk: number
}

export function projectShopItemCatalogSummary(commerce: CommerceState): ShopItemCatalogSummary {
  const items = commerce.items
  const skuSet = new Set<string>()
  let totalOnHand = 0
  let itemsBelowReorder = 0
  let totalPrice = 0
  let highestPriceMmk = 0

  for (const item of items) {
    skuSet.add(item.sku)
    totalOnHand += item.onHand
    if (item.onHand < item.reorderAt) itemsBelowReorder++
    totalPrice += item.price
    if (item.price > highestPriceMmk) highestPriceMmk = item.price
  }

  return {
    totalItems: items.length,
    uniqueSkus: skuSet.size,
    totalOnHand,
    itemsBelowReorder,
    averagePriceMmk: items.length > 0 ? Math.round(totalPrice / items.length) : 0,
    highestPriceMmk,
  }
}
