import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestStorefrontProfileBrief = {
  totalRequests: number
  requestsWithStorefrontSource: number
  storefrontSourceRate: number
  minStorefrontRevision: number | null
  maxStorefrontRevision: number | null
  requestsWithCustomerProfile: number
  customerProfileRate: number
  uniqueCustomerProfileNames: number
  topCustomerProfileNamesByCount: Array<{ name: string; count: number }>
}

export function projectEcommerceRequestStorefrontProfileBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestStorefrontProfileBrief {
  let totalRequests = 0
  let requestsWithStorefrontSource = 0
  let minStorefrontRevision: number | null = null
  let maxStorefrontRevision: number | null = null
  let requestsWithCustomerProfile = 0
  const nameMap = new Map<string, number>()

  for (const req of buying.requests) {
    totalRequests++

    if (req.sourceStorefrontRevision !== null) {
      requestsWithStorefrontSource++
      const rev = req.sourceStorefrontRevision
      if (minStorefrontRevision === null || rev < minStorefrontRevision) minStorefrontRevision = rev
      if (maxStorefrontRevision === null || rev > maxStorefrontRevision) maxStorefrontRevision = rev
    }

    if (req.customerProfile !== undefined) {
      requestsWithCustomerProfile++
      const name = req.customerProfile.name
      nameMap.set(name, (nameMap.get(name) ?? 0) + 1)
    }
  }

  const topCustomerProfileNamesByCount = Array.from(nameMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5)

  return {
    totalRequests,
    requestsWithStorefrontSource,
    storefrontSourceRate:
      totalRequests > 0 ? Math.round((requestsWithStorefrontSource / totalRequests) * 100) : 0,
    minStorefrontRevision,
    maxStorefrontRevision,
    requestsWithCustomerProfile,
    customerProfileRate:
      totalRequests > 0 ? Math.round((requestsWithCustomerProfile / totalRequests) * 100) : 0,
    uniqueCustomerProfileNames: nameMap.size,
    topCustomerProfileNamesByCount,
  }
}
