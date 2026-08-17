import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceReturnIntentDispositionBrief = {
  totalIntents: number; restockCount: number; notRestockedCount: number
}
export function projectEcommerceReturnIntentDispositionBrief(buying: EcommerceBuyingState): EcommerceReturnIntentDispositionBrief {
  const total = buying.returnIntents.length
  if (total === 0) return { totalIntents: 0, restockCount: 0, notRestockedCount: 0 }
  let restockCount = 0; let notRestockedCount = 0
  for (const intent of buying.returnIntents) {
    if (intent.disposition === 'restock') restockCount++
    else notRestockedCount++
  }
  return { totalIntents: total, restockCount, notRestockedCount }
}
