import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestPromotionCodeBrief = {
  totalRequests: number
  requestsWithPromoCode: number
  promoCodePresenceRate: number
  uniquePromoCodes: number
  topPromoCodesByCount: Array<{ code: string; count: number }>
}

export function projectEcommerceRequestPromotionCodeBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestPromotionCodeBrief {
  let requestsWithPromoCode = 0
  const codeMap = new Map<string, number>()

  for (const req of buying.requests) {
    const code = req.quote.promotion.code
    if (code !== null) {
      requestsWithPromoCode++
      codeMap.set(code, (codeMap.get(code) ?? 0) + 1)
    }
  }

  const totalRequests = buying.requests.length

  const topPromoCodesByCount = Array.from(codeMap.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 5)

  return {
    totalRequests,
    requestsWithPromoCode,
    promoCodePresenceRate:
      totalRequests > 0 ? Math.round((requestsWithPromoCode / totalRequests) * 100) : 0,
    uniquePromoCodes: codeMap.size,
    topPromoCodesByCount,
  }
}
