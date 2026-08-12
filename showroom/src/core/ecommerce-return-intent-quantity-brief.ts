import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceReturnIntentQuantityBrief = {
  totalIntents: number
  minQuantity: number | null
  maxQuantity: number | null
  sumQuantity: number
}

export function projectEcommerceReturnIntentQuantityBrief(
  buying: EcommerceBuyingState,
): EcommerceReturnIntentQuantityBrief {
  const total = buying.returnIntents.length
  if (total === 0) return { totalIntents: 0, minQuantity: null, maxQuantity: null, sumQuantity: 0 }
  let min = buying.returnIntents[0].quantity
  let max = buying.returnIntents[0].quantity
  let sum = 0
  for (const intent of buying.returnIntents) {
    if (intent.quantity < min) min = intent.quantity
    if (intent.quantity > max) max = intent.quantity
    sum += intent.quantity
  }
  return { totalIntents: total, minQuantity: min, maxQuantity: max, sumQuantity: sum }
}
