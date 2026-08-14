import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceReturnIntentDispositionSkuBrief = {
  totalIntents: number
  restockCount: number
  notRestockedCount: number
  restockRate: number
  notRestockedRate: number
  uniqueSkus: number
  topSkusByCount: Array<{ sku: string; count: number }>
  totalQuantity: number
  averageQuantity: number
}

export function projectEcommerceReturnIntentDispositionSkuBrief(
  buying: EcommerceBuyingState,
): EcommerceReturnIntentDispositionSkuBrief {
  const intents = buying.returnIntents
  const total = intents.length
  let restockCount = 0
  let notRestockedCount = 0
  let totalQuantity = 0
  const skuMap = new Map<string, number>()

  for (const intent of intents) {
    if (intent.disposition === 'restock') restockCount++
    else notRestockedCount++

    totalQuantity += intent.quantity
    skuMap.set(intent.sku, (skuMap.get(intent.sku) ?? 0) + 1)
  }

  const topSkusByCount = [...skuMap.entries()]
    .map(([sku, count]) => ({ sku, count }))
    .sort((a, b) => b.count - a.count || a.sku.localeCompare(b.sku))
    .slice(0, 5)

  return {
    totalIntents: total,
    restockCount,
    notRestockedCount,
    restockRate: total > 0 ? Math.round((restockCount / total) * 100) : 0,
    notRestockedRate: total > 0 ? Math.round((notRestockedCount / total) * 100) : 0,
    uniqueSkus: skuMap.size,
    topSkusByCount,
    totalQuantity,
    averageQuantity: total > 0 ? Math.round(totalQuantity / total) : 0,
  }
}
