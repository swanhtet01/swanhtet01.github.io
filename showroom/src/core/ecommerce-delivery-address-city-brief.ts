import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceDeliveryAddressCityBrief = {
  totalRequests: number
  requestsWithDeliveryAddress: number
  uniqueCities: number
  topCitiesByCount: Array<{ city: string; count: number }>
}

export function projectEcommerceDeliveryAddressCityBrief(
  buying: EcommerceBuyingState,
): EcommerceDeliveryAddressCityBrief {
  let requestsWithDeliveryAddress = 0
  const cityMap = new Map<string, number>()

  for (const req of buying.requests) {
    const addr = req.deliveryAddress
    if (addr == null) continue
    requestsWithDeliveryAddress++
    cityMap.set(addr.city, (cityMap.get(addr.city) ?? 0) + 1)
  }

  const topCitiesByCount = Array.from(cityMap.entries())
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))
    .slice(0, 5)

  return {
    totalRequests: buying.requests.length,
    requestsWithDeliveryAddress,
    uniqueCities: cityMap.size,
    topCitiesByCount,
  }
}
