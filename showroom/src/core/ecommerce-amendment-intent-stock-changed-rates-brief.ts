import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentStockChangedRatesBrief = {
  totalIntents: number
  stockChangedCount: number
  stockChangedRate: number
  notStockChangedCount: number
  notStockChangedRate: number
}

export function projectEcommerceAmendmentIntentStockChangedRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentStockChangedRatesBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      stockChangedCount: 0,
      stockChangedRate: 0,
      notStockChangedCount: 0,
      notStockChangedRate: 0,
    }
  }

  let stockChangedCount = 0

  for (const intent of buying.amendmentIntents) {
    if (intent.stockChanged) stockChangedCount++
  }

  const notStockChangedCount = total - stockChangedCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    stockChangedCount,
    stockChangedRate: rate(stockChangedCount),
    notStockChangedCount,
    notStockChangedRate: rate(notStockChangedCount),
  }
}
