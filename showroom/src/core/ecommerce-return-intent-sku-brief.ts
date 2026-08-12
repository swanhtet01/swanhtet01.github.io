import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceReturnIntentSkuBrief = {
  totalIntents: number
  uniqueSkus: number
  topSku: string | null
  topSkuCount: number
}

export function projectEcommerceReturnIntentSkuBrief(
  buying: EcommerceBuyingState,
): EcommerceReturnIntentSkuBrief {
  const total = buying.returnIntents.length
  if (total === 0) return { totalIntents: 0, uniqueSkus: 0, topSku: null, topSkuCount: 0 }
  const counts = new Map<string, number>()
  for (const intent of buying.returnIntents) {
    counts.set(intent.sku, (counts.get(intent.sku) ?? 0) + 1)
  }
  let topSku: string | null = null
  let topSkuCount = 0
  for (const [key, count] of counts) {
    if (count > topSkuCount) {
      topSkuCount = count
      topSku = key
    }
  }
  return { totalIntents: total, uniqueSkus: counts.size, topSku, topSkuCount }
}
