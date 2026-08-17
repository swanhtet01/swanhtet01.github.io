import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestLineCountPromotionBrief = {
  totalRequests: number
  singleWithPromoCount: number
  singleWithoutPromoCount: number
  multiWithPromoCount: number
  multiWithoutPromoCount: number
  singleCount: number
  multiCount: number
}

export function projectEcommerceRequestLineCountPromotionBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestLineCountPromotionBrief {
  const total = buying.requests.length
  if (total === 0) {
    return {
      totalRequests: 0,
      singleWithPromoCount: 0,
      singleWithoutPromoCount: 0,
      multiWithPromoCount: 0,
      multiWithoutPromoCount: 0,
      singleCount: 0,
      multiCount: 0,
    }
  }

  let singleWithPromoCount = 0
  let singleWithoutPromoCount = 0
  let multiWithPromoCount = 0
  let multiWithoutPromoCount = 0

  for (const request of buying.requests) {
    const isSingle = request.lines.length === 1
    const hasPromo = request.quote.promotion.code !== null
    if (isSingle) {
      if (hasPromo) singleWithPromoCount++
      else singleWithoutPromoCount++
    } else {
      if (hasPromo) multiWithPromoCount++
      else multiWithoutPromoCount++
    }
  }

  return {
    totalRequests: total,
    singleWithPromoCount,
    singleWithoutPromoCount,
    multiWithPromoCount,
    multiWithoutPromoCount,
    singleCount: singleWithPromoCount + singleWithoutPromoCount,
    multiCount: multiWithPromoCount + multiWithoutPromoCount,
  }
}
