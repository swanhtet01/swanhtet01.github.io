import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestFulfilmentRatesBrief = {
  totalRequests: number
  deliveryCount: number
  deliveryRate: number
  pickupCount: number
  pickupRate: number
}

export function projectEcommerceRequestFulfilmentRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestFulfilmentRatesBrief {
  const total = buying.requests.length
  if (total === 0) {
    return {
      totalRequests: 0,
      deliveryCount: 0,
      deliveryRate: 0,
      pickupCount: 0,
      pickupRate: 0,
    }
  }

  let deliveryCount = 0

  for (const request of buying.requests) {
    if (request.fulfilment === 'delivery') deliveryCount++
  }

  const pickupCount = total - deliveryCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalRequests: total,
    deliveryCount,
    deliveryRate: rate(deliveryCount),
    pickupCount,
    pickupRate: rate(pickupCount),
  }
}
