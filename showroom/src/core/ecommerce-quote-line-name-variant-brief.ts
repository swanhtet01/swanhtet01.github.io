import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceQuoteLineNameVariantBrief = {
  totalLines: number
  linesWithVariant: number
  variantPresenceRate: number
  uniqueProductNames: number
  topProductNamesByCount: Array<{ name: string; count: number }>
  uniqueVariants: number
  topVariantsByCount: Array<{ variant: string; count: number }>
}

export function projectEcommerceQuoteLineNameVariantBrief(
  buying: EcommerceBuyingState,
): EcommerceQuoteLineNameVariantBrief {
  let totalLines = 0
  let linesWithVariant = 0
  const nameMap = new Map<string, number>()
  const variantMap = new Map<string, number>()

  for (const req of buying.requests) {
    for (const line of req.lines) {
      totalLines++
      nameMap.set(line.name, (nameMap.get(line.name) ?? 0) + 1)
      if (line.variant !== null) {
        linesWithVariant++
        variantMap.set(line.variant, (variantMap.get(line.variant) ?? 0) + 1)
      }
    }
  }

  const topProductNamesByCount = Array.from(nameMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5)

  const topVariantsByCount = Array.from(variantMap.entries())
    .map(([variant, count]) => ({ variant, count }))
    .sort((a, b) => b.count - a.count || a.variant.localeCompare(b.variant))
    .slice(0, 5)

  return {
    totalLines,
    linesWithVariant,
    variantPresenceRate: totalLines > 0 ? Math.round((linesWithVariant / totalLines) * 100) : 0,
    uniqueProductNames: nameMap.size,
    topProductNamesByCount,
    uniqueVariants: variantMap.size,
    topVariantsByCount,
  }
}
