import type { CommerceState } from './commerce-workspace.ts'

export type CatalogChangedSkuRecord = {
  sku: string
  changeCount: number
  latestPreviousPrice: number
  latestNextPrice: number
}

export type ShopCatalogChangeSummary = {
  totalChanges: number
  uniqueSkus: number
  priceIncreases: number
  priceDecreases: number
  priceUnchanged: number
  topChangedSkus: CatalogChangedSkuRecord[]
}

export function projectShopCatalogChangeSummary(commerce: CommerceState): ShopCatalogChangeSummary {
  const changes = commerce.catalogChanges ?? []
  const skuMap = new Map<string, { changeCount: number; latestPreviousPrice: number; latestNextPrice: number }>()

  let priceIncreases = 0
  let priceDecreases = 0
  let priceUnchanged = 0

  for (const change of changes) {
    if (change.nextPrice > change.previousPrice) priceIncreases++
    else if (change.nextPrice < change.previousPrice) priceDecreases++
    else priceUnchanged++

    const entry = skuMap.get(change.sku) ?? { changeCount: 0, latestPreviousPrice: change.previousPrice, latestNextPrice: change.nextPrice }
    entry.changeCount++
    entry.latestPreviousPrice = change.previousPrice
    entry.latestNextPrice = change.nextPrice
    skuMap.set(change.sku, entry)
  }

  const topChangedSkus: CatalogChangedSkuRecord[] = Array.from(skuMap.entries())
    .map(([sku, { changeCount, latestPreviousPrice, latestNextPrice }]) => ({ sku, changeCount, latestPreviousPrice, latestNextPrice }))
    .sort((a, b) => b.changeCount - a.changeCount || a.sku.localeCompare(b.sku))
    .slice(0, 5)

  return {
    totalChanges: changes.length,
    uniqueSkus: skuMap.size,
    priceIncreases,
    priceDecreases,
    priceUnchanged,
    topChangedSkus,
  }
}
