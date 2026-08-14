import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceReturnIntentRatesBrief = {
  totalIntents: number
  restockCount: number
  restockRate: number
  notRestockedCount: number
  notRestockedRate: number
}

export function projectEcommerceReturnIntentRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceReturnIntentRatesBrief {
  const total = buying.returnIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      restockCount: 0,
      restockRate: 0,
      notRestockedCount: 0,
      notRestockedRate: 0,
    }
  }

  let restockCount = 0

  for (const intent of buying.returnIntents) {
    if (intent.disposition === 'restock') restockCount++
  }

  const notRestockedCount = total - restockCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    restockCount,
    restockRate: rate(restockCount),
    notRestockedCount,
    notRestockedRate: rate(notRestockedCount),
  }
}
