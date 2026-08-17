import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderLineNameVariantBrief = {
  totalLines: number
  uniqueLineNames: number
  topLineNamesByCount: Array<{ name: string; count: number }>
  linesWithVariant: number
  linesWithoutVariant: number
  variantRate: number
  uniqueVariants: number
  topVariantsByCount: Array<{ variant: string; count: number }>
}

export function projectShopOrderLineNameVariantBrief(
  commerce: CommerceState,
): ShopOrderLineNameVariantBrief {
  let totalLines = 0
  let linesWithVariant = 0
  let linesWithoutVariant = 0
  const nameMap = new Map<string, number>()
  const variantMap = new Map<string, number>()

  for (const order of commerce.orders) {
    for (const line of order.lines ?? []) {
      totalLines++
      nameMap.set(line.name, (nameMap.get(line.name) ?? 0) + 1)
      if (line.variant !== undefined) {
        linesWithVariant++
        variantMap.set(line.variant, (variantMap.get(line.variant) ?? 0) + 1)
      } else {
        linesWithoutVariant++
      }
    }
  }

  const topLineNamesByCount = Array.from(nameMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5)

  const topVariantsByCount = Array.from(variantMap.entries())
    .map(([variant, count]) => ({ variant, count }))
    .sort((a, b) => b.count - a.count || a.variant.localeCompare(b.variant))
    .slice(0, 5)

  return {
    totalLines,
    uniqueLineNames: nameMap.size,
    topLineNamesByCount,
    linesWithVariant,
    linesWithoutVariant,
    variantRate: totalLines > 0 ? Math.round((linesWithVariant / totalLines) * 100) : 0,
    uniqueVariants: variantMap.size,
    topVariantsByCount,
  }
}
