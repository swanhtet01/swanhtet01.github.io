import type { CommerceState } from './commerce-workspace.ts'

export type ShopPaymentPolicyOrderCapBrief = {
  totalPolicies: number
  policiesWithOrderCap: number
  orderCapRate: number
  totalMaximumOrderMmk: number
  averageMaximumOrderMmk: number
  minMaximumOrderMmk: number | null
  maxMaximumOrderMmk: number | null
}

export function projectShopPaymentPolicyOrderCapBrief(
  commerce: CommerceState,
): ShopPaymentPolicyOrderCapBrief {
  const policies = commerce.paymentPolicies ?? []
  let totalPolicies = 0
  let policiesWithOrderCap = 0
  let totalMaximumOrderMmk = 0
  let minMaximumOrderMmk: number | null = null
  let maxMaximumOrderMmk: number | null = null

  for (const policy of policies) {
    totalPolicies++
    const cap = policy.maximumOrderMmk
    if (cap !== null) {
      policiesWithOrderCap++
      totalMaximumOrderMmk += cap
      if (minMaximumOrderMmk === null || cap < minMaximumOrderMmk) minMaximumOrderMmk = cap
      if (maxMaximumOrderMmk === null || cap > maxMaximumOrderMmk) maxMaximumOrderMmk = cap
    }
  }

  return {
    totalPolicies,
    policiesWithOrderCap,
    orderCapRate: totalPolicies > 0 ? Math.round((policiesWithOrderCap / totalPolicies) * 100) : 0,
    totalMaximumOrderMmk,
    averageMaximumOrderMmk:
      policiesWithOrderCap > 0 ? Math.round(totalMaximumOrderMmk / policiesWithOrderCap) : 0,
    minMaximumOrderMmk,
    maxMaximumOrderMmk,
  }
}
