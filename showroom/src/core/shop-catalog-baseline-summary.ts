import type { CommerceState } from './commerce-workspace.ts'

export type ShopCatalogBaselineSummary = {
  totalBaselines: number
  uniqueSkus: number
  averagePriceMmk: number
  highestPriceMmk: number
  lowestPriceMmk: number
  averageReorderAt: number
}

export function projectShopCatalogBaselineSummary(commerce: CommerceState): ShopCatalogBaselineSummary {
  const baselines = commerce.catalogBaselines ?? []
  const skuSet = new Set<string>()
  let totalPriceMmk = 0
  let highestPriceMmk = 0
  let lowestPriceMmk = 0
  let totalReorderAt = 0
  let initialized = false

  for (const baseline of baselines) {
    skuSet.add(baseline.sku)
    totalPriceMmk += baseline.price
    totalReorderAt += baseline.reorderAt

    if (!initialized || baseline.price > highestPriceMmk) highestPriceMmk = baseline.price
    if (!initialized || baseline.price < lowestPriceMmk) lowestPriceMmk = baseline.price
    initialized = true
  }

  return {
    totalBaselines: baselines.length,
    uniqueSkus: skuSet.size,
    averagePriceMmk: baselines.length > 0 ? Math.round(totalPriceMmk / baselines.length) : 0,
    highestPriceMmk,
    lowestPriceMmk,
    averageReorderAt: baselines.length > 0 ? Math.round(totalReorderAt / baselines.length) : 0,
  }
}
