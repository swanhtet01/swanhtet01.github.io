import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceReturnSkuEntry = {
  sku: string
  intentCount: number
  totalQuantity: number
}

export type EcommerceReturnIntentBrief = {
  totalReturnIntents: number
  totalQuantity: number
  uniqueSkus: number
  byDisposition: {
    restock: number
    notRestocked: number
  }
  restockRate: number
  topSkus: EcommerceReturnSkuEntry[]
}

export function projectEcommerceReturnIntentBrief(buying: EcommerceBuyingState): EcommerceReturnIntentBrief {
  if (buying.returnIntents.length === 0) {
    return {
      totalReturnIntents: 0,
      totalQuantity: 0,
      uniqueSkus: 0,
      byDisposition: { restock: 0, notRestocked: 0 },
      restockRate: 0,
      topSkus: [],
    }
  }

  const skuMap = new Map<string, { intentCount: number; totalQuantity: number }>()
  let restock = 0
  let notRestocked = 0
  let totalQuantity = 0

  for (const intent of buying.returnIntents) {
    totalQuantity += intent.quantity
    if (intent.disposition === 'restock') restock++
    else notRestocked++

    const entry = skuMap.get(intent.sku)
    if (entry) {
      entry.intentCount++
      entry.totalQuantity += intent.quantity
    } else {
      skuMap.set(intent.sku, { intentCount: 1, totalQuantity: intent.quantity })
    }
  }

  const topSkus: EcommerceReturnSkuEntry[] = Array.from(skuMap.entries())
    .map(([sku, data]) => ({ sku, ...data }))
    .sort((a, b) => b.intentCount - a.intentCount || b.totalQuantity - a.totalQuantity)
    .slice(0, 5)

  return {
    totalReturnIntents: buying.returnIntents.length,
    totalQuantity,
    uniqueSkus: skuMap.size,
    byDisposition: { restock, notRestocked },
    restockRate: Math.round((restock / buying.returnIntents.length) * 100),
    topSkus,
  }
}
