import type { CommerceState } from './commerce-workspace.ts'

export type ShopStorefrontMerchandisingBrief = {
  totalItems: number
  featuredCount: number
  featuredRate: number
  uniqueCollections: number
  itemsWithNote: number
  noteRate: number
  topCollectionsByItems: Array<{ collection: string; count: number }>
}

export function projectShopStorefrontMerchandisingBrief(
  commerce: CommerceState,
): ShopStorefrontMerchandisingBrief {
  const items = commerce.storefrontConfiguration?.merchandising ?? []
  let totalItems = 0
  let featuredCount = 0
  let itemsWithNote = 0
  const collectionMap = new Map<string, number>()

  for (const item of items) {
    totalItems++
    if (item.featured) featuredCount++
    if (item.note.length > 0) itemsWithNote++
    collectionMap.set(item.collection, (collectionMap.get(item.collection) ?? 0) + 1)
  }

  const topCollectionsByItems = Array.from(collectionMap.entries())
    .map(([collection, count]) => ({ collection, count }))
    .sort((a, b) => b.count - a.count || a.collection.localeCompare(b.collection))
    .slice(0, 5)

  return {
    totalItems,
    featuredCount,
    featuredRate: totalItems > 0 ? Math.round((featuredCount / totalItems) * 100) : 0,
    uniqueCollections: collectionMap.size,
    itemsWithNote,
    noteRate: totalItems > 0 ? Math.round((itemsWithNote / totalItems) * 100) : 0,
    topCollectionsByItems,
  }
}
