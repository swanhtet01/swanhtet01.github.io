import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentLineChangesBrief = {
  totalAmendmentIntents: number
  totalLineChanges: number
  intentsWithLineChanges: number
  uniqueAlteredSkus: number
  topAlteredSkusByCount: Array<{ sku: string; count: number }>
  quantityIncreasedLines: number
  quantityDecreasedLines: number
  quantityUnchangedLines: number
}

export function projectEcommerceAmendmentIntentLineChangesBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentLineChangesBrief {
  let totalLineChanges = 0
  let intentsWithLineChanges = 0
  let quantityIncreasedLines = 0
  let quantityDecreasedLines = 0
  let quantityUnchangedLines = 0
  const skuMap = new Map<string, number>()

  for (const intent of buying.amendmentIntents) {
    if (intent.lineChanges.length > 0) intentsWithLineChanges++
    for (const change of intent.lineChanges) {
      totalLineChanges++
      skuMap.set(change.sku, (skuMap.get(change.sku) ?? 0) + 1)
      if (change.toQuantity > change.fromQuantity) quantityIncreasedLines++
      else if (change.toQuantity < change.fromQuantity) quantityDecreasedLines++
      else quantityUnchangedLines++
    }
  }

  const topAlteredSkusByCount = Array.from(skuMap.entries())
    .map(([sku, count]) => ({ sku, count }))
    .sort((a, b) => b.count - a.count || a.sku.localeCompare(b.sku))
    .slice(0, 5)

  return {
    totalAmendmentIntents: buying.amendmentIntents.length,
    totalLineChanges,
    intentsWithLineChanges,
    uniqueAlteredSkus: skuMap.size,
    topAlteredSkusByCount,
    quantityIncreasedLines,
    quantityDecreasedLines,
    quantityUnchangedLines,
  }
}
