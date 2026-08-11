import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceSkuDemandEntry = {
  sku: string
  totalQuantityRequested: number
  requestCount: number
  totalRevenueMmk: number
}

export type EcommerceSkuDemandSummary = {
  totalRequests: number
  totalRequestLines: number
  uniqueSkus: number
  averageLinesPerRequest: number
  topSkusByQuantity: EcommerceSkuDemandEntry[]
  topSkusByRequestCount: EcommerceSkuDemandEntry[]
}

export function projectEcommerceSkuDemandSummary(buying: EcommerceBuyingState): EcommerceSkuDemandSummary {
  const skuMap = new Map<string, { totalQuantityRequested: number; requestCount: number; totalRevenueMmk: number }>()
  let totalRequestLines = 0

  for (const request of buying.requests) {
    for (const line of request.lines) {
      totalRequestLines++
      const entry = skuMap.get(line.sku)
      if (entry) {
        entry.totalQuantityRequested += line.quantity
        entry.requestCount++
        entry.totalRevenueMmk += line.lineTotalMmk
      } else {
        skuMap.set(line.sku, {
          totalQuantityRequested: line.quantity,
          requestCount: 1,
          totalRevenueMmk: line.lineTotalMmk,
        })
      }
    }
  }

  const totalRequests = buying.requests.length

  const allEntries: EcommerceSkuDemandEntry[] = Array.from(skuMap.entries()).map(([sku, data]) => ({
    sku,
    totalQuantityRequested: data.totalQuantityRequested,
    requestCount: data.requestCount,
    totalRevenueMmk: data.totalRevenueMmk,
  }))

  const topSkusByQuantity = allEntries
    .slice()
    .sort((a, b) => b.totalQuantityRequested - a.totalQuantityRequested)
    .slice(0, 5)

  const topSkusByRequestCount = allEntries
    .slice()
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, 5)

  return {
    totalRequests,
    totalRequestLines,
    uniqueSkus: skuMap.size,
    averageLinesPerRequest: totalRequests > 0 ? Math.round(totalRequestLines / totalRequests) : 0,
    topSkusByQuantity,
    topSkusByRequestCount,
  }
}
