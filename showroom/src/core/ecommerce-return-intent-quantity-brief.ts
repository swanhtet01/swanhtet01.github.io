import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceReturnIntentQuantityBrief = {
  totalIntents: number; singleItemCount: number; multiItemCount: number
}
export function projectEcommerceReturnIntentQuantityBrief(buying: EcommerceBuyingState): EcommerceReturnIntentQuantityBrief {
  const total = buying.returnIntents.length
  if (total === 0) return { totalIntents: 0, singleItemCount: 0, multiItemCount: 0 }
  let singleItemCount = 0; let multiItemCount = 0
  for (const intent of buying.returnIntents) {
    if (intent.quantity === 1) singleItemCount++
    else multiItemCount++
  }
  return { totalIntents: total, singleItemCount, multiItemCount }
}
