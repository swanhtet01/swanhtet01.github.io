import type { CommerceState } from './commerce-workspace.ts'

export type ShopItemNameVariantBrief = {
  totalItems: number
  uniqueNames: number
  itemsWithVariant: number
  itemsWithoutVariant: number
  variantRate: number
  uniqueVariants: number
  topVariantsByCount: Array<{ variant: string; count: number }>
}

export function projectShopItemNameVariantBrief(commerce: CommerceState): ShopItemNameVariantBrief {
  let totalItems = 0
  let itemsWithVariant = 0
  let itemsWithoutVariant = 0
  const nameSet = new Set<string>()
  const variantMap = new Map<string, number>()

  for (const item of commerce.items) {
    totalItems++
    nameSet.add(item.name)
    if (item.variant !== undefined) {
      itemsWithVariant++
      variantMap.set(item.variant, (variantMap.get(item.variant) ?? 0) + 1)
    } else {
      itemsWithoutVariant++
    }
  }

  const topVariantsByCount = Array.from(variantMap.entries())
    .map(([variant, count]) => ({ variant, count }))
    .sort((a, b) => b.count - a.count || a.variant.localeCompare(b.variant))
    .slice(0, 5)

  return {
    totalItems,
    uniqueNames: nameSet.size,
    itemsWithVariant,
    itemsWithoutVariant,
    variantRate: totalItems > 0 ? Math.round((itemsWithVariant / totalItems) * 100) : 0,
    uniqueVariants: variantMap.size,
    topVariantsByCount,
  }
}
