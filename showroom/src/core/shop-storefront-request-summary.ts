import type { CommerceState } from './commerce-workspace.ts'

export type ShopStorefrontRequestSummary = {
  totalRequests: number
  bySchema: { v1: number; v2: number }
  byFulfilment: { pickup: number; delivery: number }
  totalValueMmk: number
  uniqueCustomers: number
  averageValueMmk: number
}

export function projectShopStorefrontRequestSummary(commerce: CommerceState): ShopStorefrontRequestSummary {
  const requests = commerce.storefrontRequests ?? []
  const customerSet = new Set<string>()
  const bySchema = { v1: 0, v2: 0 }
  const byFulfilment = { pickup: 0, delivery: 0 }
  let totalValueMmk = 0

  for (const req of requests) {
    if (req.schema === 'supermega.ecommerce.order_request.v1') bySchema.v1++
    else bySchema.v2++

    byFulfilment[req.fulfilment]++
    customerSet.add(req.customerReference)
    totalValueMmk += req.totalMmk
  }

  return {
    totalRequests: requests.length,
    bySchema,
    byFulfilment,
    totalValueMmk,
    uniqueCustomers: customerSet.size,
    averageValueMmk: requests.length > 0 ? Math.round(totalValueMmk / requests.length) : 0,
  }
}
