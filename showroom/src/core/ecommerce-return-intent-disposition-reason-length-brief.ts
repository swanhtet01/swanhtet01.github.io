import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceReturnIntentDispositionReasonLengthBrief = {
  totalIntents: number
  restockShortCount: number
  restockDetailedCount: number
  notRestockedShortCount: number
  notRestockedDetailedCount: number
  restockCount: number
  notRestockedCount: number
}

export function projectEcommerceReturnIntentDispositionReasonLengthBrief(
  buying: EcommerceBuyingState,
): EcommerceReturnIntentDispositionReasonLengthBrief {
  const total = buying.returnIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      restockShortCount: 0,
      restockDetailedCount: 0,
      notRestockedShortCount: 0,
      notRestockedDetailedCount: 0,
      restockCount: 0,
      notRestockedCount: 0,
    }
  }

  let restockShortCount = 0
  let restockDetailedCount = 0
  let notRestockedShortCount = 0
  let notRestockedDetailedCount = 0

  for (const intent of buying.returnIntents) {
    const isRestock = intent.disposition === 'restock'
    const isShort = intent.reason.length <= 40
    if (isRestock) {
      if (isShort) restockShortCount++
      else restockDetailedCount++
    } else {
      if (isShort) notRestockedShortCount++
      else notRestockedDetailedCount++
    }
  }

  return {
    totalIntents: total,
    restockShortCount,
    restockDetailedCount,
    notRestockedShortCount,
    notRestockedDetailedCount,
    restockCount: restockShortCount + restockDetailedCount,
    notRestockedCount: notRestockedShortCount + notRestockedDetailedCount,
  }
}
