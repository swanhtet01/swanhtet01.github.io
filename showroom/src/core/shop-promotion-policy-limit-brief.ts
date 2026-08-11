import type { CommerceState } from './commerce-workspace.ts'

export type ShopPromotionPolicyLimitBrief = {
  totalPolicies: number
  policiesWithMinimumSubtotal: number
  minimumSubtotalRate: number
  totalMinimumSubtotalMmk: number
  averageMinimumSubtotalMmk: number
  policiesWithMaximumDiscount: number
  maximumDiscountRate: number
  totalMaximumDiscountMmk: number
  averageMaximumDiscountMmk: number
}

export function projectShopPromotionPolicyLimitBrief(
  commerce: CommerceState,
): ShopPromotionPolicyLimitBrief {
  const policies = commerce.promotionPolicies ?? []
  let totalPolicies = 0
  let policiesWithMinimumSubtotal = 0
  let totalMinimumSubtotalMmk = 0
  let policiesWithMaximumDiscount = 0
  let totalMaximumDiscountMmk = 0

  for (const policy of policies) {
    totalPolicies++
    totalMinimumSubtotalMmk += policy.minimumSubtotalMmk
    totalMaximumDiscountMmk += policy.maximumDiscountMmk
    if (policy.minimumSubtotalMmk > 0) policiesWithMinimumSubtotal++
    if (policy.maximumDiscountMmk > 0) policiesWithMaximumDiscount++
  }

  return {
    totalPolicies,
    policiesWithMinimumSubtotal,
    minimumSubtotalRate:
      totalPolicies > 0 ? Math.round((policiesWithMinimumSubtotal / totalPolicies) * 100) : 0,
    totalMinimumSubtotalMmk,
    averageMinimumSubtotalMmk:
      totalPolicies > 0 ? Math.round(totalMinimumSubtotalMmk / totalPolicies) : 0,
    policiesWithMaximumDiscount,
    maximumDiscountRate:
      totalPolicies > 0 ? Math.round((policiesWithMaximumDiscount / totalPolicies) * 100) : 0,
    totalMaximumDiscountMmk,
    averageMaximumDiscountMmk:
      totalPolicies > 0 ? Math.round(totalMaximumDiscountMmk / totalPolicies) : 0,
  }
}
