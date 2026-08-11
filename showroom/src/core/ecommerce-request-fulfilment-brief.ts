import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestFulfilmentBrief = {
  totalRequests: number
  pickupCount: number
  deliveryCount: number
  pickupRate: number
  deliveryRate: number
}

export function projectEcommerceRequestFulfilmentBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestFulfilmentBrief {
  let pickupCount = 0
  let deliveryCount = 0

  for (const req of buying.requests) {
    if (req.fulfilment === 'pickup') pickupCount++
    else deliveryCount++
  }

  const totalRequests = pickupCount + deliveryCount

  return {
    totalRequests,
    pickupCount,
    deliveryCount,
    pickupRate: totalRequests > 0 ? Math.round((pickupCount / totalRequests) * 100) : 0,
    deliveryRate: totalRequests > 0 ? Math.round((deliveryCount / totalRequests) * 100) : 0,
  }
}
