import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestPromotionRatesBrief = {
  totalRequests: number
  withPromotionCount: number
  withPromotionRate: number
  withoutPromotionCount: number
  withoutPromotionRate: number
}

export function projectEcommerceRequestPromotionRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestPromotionRatesBrief {
  const total = buying.requests.length
  if (total === 0) {
    return {
      totalRequests: 0,
      withPromotionCount: 0,
      withPromotionRate: 0,
      withoutPromotionCount: 0,
      withoutPromotionRate: 0,
    }
  }

  let withPromotionCount = 0

  for (const request of buying.requests) {
    if (request.quote.promotion.code !== null) withPromotionCount++
  }

  const withoutPromotionCount = total - withPromotionCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalRequests: total,
    withPromotionCount,
    withPromotionRate: rate(withPromotionCount),
    withoutPromotionCount,
    withoutPromotionRate: rate(withoutPromotionCount),
  }
}
