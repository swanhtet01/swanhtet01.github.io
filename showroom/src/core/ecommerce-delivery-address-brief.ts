import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceDeliveryTownshipEntry = {
  township: string
  requestCount: number
  totalValueMmk: number
}

export type EcommerceDeliveryAddressBrief = {
  totalRequests: number
  requestsWithDeliveryAddress: number
  requestsWithoutDeliveryAddress: number
  uniqueTownships: number
  topTownships: EcommerceDeliveryTownshipEntry[]
  topTownshipByValue: string | null
}

export function projectEcommerceDeliveryAddressBrief(buying: EcommerceBuyingState): EcommerceDeliveryAddressBrief {
  const townshipMap = new Map<string, { requestCount: number; totalValueMmk: number }>()
  let requestsWithoutDeliveryAddress = 0

  for (const req of buying.requests) {
    if (req.deliveryAddress == null) {
      requestsWithoutDeliveryAddress++
      continue
    }
    const township = req.deliveryAddress.township
    const entry = townshipMap.get(township)
    if (entry) {
      entry.requestCount++
      entry.totalValueMmk += req.totalMmk
    } else {
      townshipMap.set(township, { requestCount: 1, totalValueMmk: req.totalMmk })
    }
  }

  const topTownships: EcommerceDeliveryTownshipEntry[] = Array.from(townshipMap.entries())
    .map(([township, data]) => ({ township, ...data }))
    .sort((a, b) => b.requestCount - a.requestCount || b.totalValueMmk - a.totalValueMmk)
    .slice(0, 5)

  const topTownshipByValue = townshipMap.size > 0
    ? Array.from(townshipMap.entries())
        .sort((a, b) => b[1].totalValueMmk - a[1].totalValueMmk)[0][0]
    : null

  return {
    totalRequests: buying.requests.length,
    requestsWithDeliveryAddress: buying.requests.length - requestsWithoutDeliveryAddress,
    requestsWithoutDeliveryAddress,
    uniqueTownships: townshipMap.size,
    topTownships,
    topTownshipByValue,
  }
}
