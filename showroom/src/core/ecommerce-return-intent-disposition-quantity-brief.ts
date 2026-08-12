import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceReturnIntentDispositionQuantityBrief = {
  totalIntents: number
  restockSingleCount: number
  restockMultiCount: number
  notRestockedSingleCount: number
  notRestockedMultiCount: number
}

export function projectEcommerceReturnIntentDispositionQuantityBrief(
  buying: EcommerceBuyingState,
): EcommerceReturnIntentDispositionQuantityBrief {
  const total = buying.returnIntents.length
  if (total === 0)
    return { totalIntents: 0, restockSingleCount: 0, restockMultiCount: 0, notRestockedSingleCount: 0, notRestockedMultiCount: 0 }
  let restockSingleCount = 0; let restockMultiCount = 0
  let notRestockedSingleCount = 0; let notRestockedMultiCount = 0
  for (const intent of buying.returnIntents) {
    const isSingle = intent.quantity === 1
    if (intent.disposition === 'restock') {
      if (isSingle) restockSingleCount++
      else restockMultiCount++
    } else {
      if (isSingle) notRestockedSingleCount++
      else notRestockedMultiCount++
    }
  }
  return { totalIntents: total, restockSingleCount, restockMultiCount, notRestockedSingleCount, notRestockedMultiCount }
}
