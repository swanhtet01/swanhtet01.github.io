import type { CommerceState } from './commerce-workspace.ts'

export type ShopStorefrontCustomerProfileBrief = {
  totalRequests: number
  v1Requests: number
  v2Requests: number
  requestsWithProfile: number
  requestsWithoutProfile: number
  profileCoverage: number
  uniqueProfileIds: number
}

export function projectShopStorefrontCustomerProfileBrief(commerce: CommerceState): ShopStorefrontCustomerProfileBrief {
  const requests = commerce.storefrontRequests ?? []

  let v1Requests = 0
  let v2Requests = 0
  let requestsWithProfile = 0
  const profileIdSet = new Set<string>()

  for (const req of requests) {
    if (req.schema === 'supermega.ecommerce.order_request.v1') {
      v1Requests++
    } else {
      v2Requests++
      if (req.customerProfile !== undefined) {
        requestsWithProfile++
        profileIdSet.add(req.customerProfile.id)
      }
    }
  }

  return {
    totalRequests: requests.length,
    v1Requests,
    v2Requests,
    requestsWithProfile,
    requestsWithoutProfile: v2Requests - requestsWithProfile,
    profileCoverage: v2Requests > 0 ? Math.round((requestsWithProfile / v2Requests) * 100) : 0,
    uniqueProfileIds: profileIdSet.size,
  }
}
