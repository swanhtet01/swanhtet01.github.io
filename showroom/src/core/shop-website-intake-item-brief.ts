import type { CommerceState } from './commerce-workspace.ts'

export type ShopWebsiteIntakeItemBrief = {
  totalIntakes: number
  uniqueItemNames: number
  topItemNamesByCount: Array<{ itemName: string; count: number }>
  intakesWithVariant: number
  intakesWithoutVariant: number
  variantRate: number
  uniqueItemVariants: number
  topItemVariantsByCount: Array<{ itemVariant: string; count: number }>
}

export function projectShopWebsiteIntakeItemBrief(
  commerce: CommerceState,
): ShopWebsiteIntakeItemBrief {
  let totalIntakes = 0
  let intakesWithVariant = 0
  let intakesWithoutVariant = 0
  const nameMap = new Map<string, number>()
  const variantMap = new Map<string, number>()

  for (const intake of commerce.websiteIntakes ?? []) {
    totalIntakes++
    nameMap.set(intake.itemName, (nameMap.get(intake.itemName) ?? 0) + 1)
    if (intake.itemVariant !== undefined) {
      intakesWithVariant++
      variantMap.set(intake.itemVariant, (variantMap.get(intake.itemVariant) ?? 0) + 1)
    } else {
      intakesWithoutVariant++
    }
  }

  const topItemNamesByCount = Array.from(nameMap.entries())
    .map(([itemName, count]) => ({ itemName, count }))
    .sort((a, b) => b.count - a.count || a.itemName.localeCompare(b.itemName))
    .slice(0, 5)

  const topItemVariantsByCount = Array.from(variantMap.entries())
    .map(([itemVariant, count]) => ({ itemVariant, count }))
    .sort((a, b) => b.count - a.count || a.itemVariant.localeCompare(b.itemVariant))
    .slice(0, 5)

  return {
    totalIntakes,
    uniqueItemNames: nameMap.size,
    topItemNamesByCount,
    intakesWithVariant,
    intakesWithoutVariant,
    variantRate: totalIntakes > 0 ? Math.round((intakesWithVariant / totalIntakes) * 100) : 0,
    uniqueItemVariants: variantMap.size,
    topItemVariantsByCount,
  }
}
