import type { CommerceState } from './commerce-workspace.ts'

export type ShopShippingPolicySummary = {
  totalPolicies: number
  activePolicies: number
  inactivePolicies: number
  uniqueZones: number
  totalTownshipsConfigured: number
  lowestFeeMmk: number
  averagePromiseMinutes: number
}

export function projectShopShippingPolicySummary(commerce: CommerceState): ShopShippingPolicySummary {
  const policies = commerce.shippingPolicies ?? []
  const zoneSet = new Set<string>()

  let activePolicies = 0
  let inactivePolicies = 0
  let totalTownshipsConfigured = 0
  let lowestFeeMmk = 0
  let totalPromiseMinutes = 0
  let initialized = false

  for (const policy of policies) {
    if (policy.status === 'active') activePolicies++
    else inactivePolicies++

    zoneSet.add(policy.zoneCode)
    totalTownshipsConfigured += policy.townships.length
    totalPromiseMinutes += policy.promiseMinutes

    if (!initialized || policy.feeMmk < lowestFeeMmk) {
      lowestFeeMmk = policy.feeMmk
      initialized = true
    }
  }

  return {
    totalPolicies: policies.length,
    activePolicies,
    inactivePolicies,
    uniqueZones: zoneSet.size,
    totalTownshipsConfigured,
    lowestFeeMmk,
    averagePromiseMinutes: policies.length > 0 ? Math.round(totalPromiseMinutes / policies.length) : 0,
  }
}
