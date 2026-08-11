import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceValueBucket = {
  count: number
  totalMmk: number
}

export type EcommerceRequestValueDistribution = {
  totalPendingRequests: number
  totalPendingValueMmk: number
  averageRequestValueMmk: number
  highestRequestValueMmk: number
  byValueBucket: {
    small: EcommerceValueBucket
    medium: EcommerceValueBucket
    large: EcommerceValueBucket
  }
  byFulfilment: {
    delivery: EcommerceValueBucket
    pickup: EcommerceValueBucket
  }
}

const MEDIUM_THRESHOLD = 100_000
const LARGE_THRESHOLD = 1_000_000

export function projectEcommerceRequestValueDistribution(
  buying: EcommerceBuyingState,
): EcommerceRequestValueDistribution {
  const small: EcommerceValueBucket = { count: 0, totalMmk: 0 }
  const medium: EcommerceValueBucket = { count: 0, totalMmk: 0 }
  const large: EcommerceValueBucket = { count: 0, totalMmk: 0 }
  const delivery: EcommerceValueBucket = { count: 0, totalMmk: 0 }
  const pickup: EcommerceValueBucket = { count: 0, totalMmk: 0 }

  let totalPendingValueMmk = 0
  let highestRequestValueMmk = 0

  for (const req of buying.requests) {
    const v = req.totalMmk
    totalPendingValueMmk += v
    if (v > highestRequestValueMmk) highestRequestValueMmk = v

    if (v < MEDIUM_THRESHOLD) {
      small.count++
      small.totalMmk += v
    } else if (v < LARGE_THRESHOLD) {
      medium.count++
      medium.totalMmk += v
    } else {
      large.count++
      large.totalMmk += v
    }

    if (req.fulfilment === 'delivery') {
      delivery.count++
      delivery.totalMmk += v
    } else {
      pickup.count++
      pickup.totalMmk += v
    }
  }

  const totalPendingRequests = buying.requests.length

  return {
    totalPendingRequests,
    totalPendingValueMmk,
    averageRequestValueMmk:
      totalPendingRequests > 0 ? Math.round(totalPendingValueMmk / totalPendingRequests) : 0,
    highestRequestValueMmk,
    byValueBucket: { small, medium, large },
    byFulfilment: { delivery, pickup },
  }
}
