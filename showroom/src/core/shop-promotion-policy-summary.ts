import type { CommerceState } from './commerce-workspace.ts'

export type ShopPromotionPolicySummary = {
  totalPolicies: number
  activePolicies: number
  inactivePolicies: number
  uniqueCodes: number
  highestDiscountBasisPoints: number
  policiesWithNoExpiry: number
  topCode: string | null
}

export function projectShopPromotionPolicySummary(commerce: CommerceState): ShopPromotionPolicySummary {
  const policies = commerce.promotionPolicies ?? []
  const codeMap = new Map<string, number>()

  let activePolicies = 0
  let inactivePolicies = 0
  let highestDiscountBasisPoints = 0
  let policiesWithNoExpiry = 0

  for (const policy of policies) {
    if (policy.status === 'active') activePolicies++
    else inactivePolicies++

    if (policy.discountBasisPoints > highestDiscountBasisPoints) {
      highestDiscountBasisPoints = policy.discountBasisPoints
    }

    if (policy.effectiveUntil === null) policiesWithNoExpiry++

    codeMap.set(policy.code, (codeMap.get(policy.code) ?? 0) + 1)
  }

  let topCode: string | null = null
  for (const [code, count] of codeMap.entries()) {
    const best = topCode !== null ? (codeMap.get(topCode) ?? 0) : -1
    if (topCode === null || count > best || (count === best && code < topCode)) {
      topCode = code
    }
  }

  return {
    totalPolicies: policies.length,
    activePolicies,
    inactivePolicies,
    uniqueCodes: codeMap.size,
    highestDiscountBasisPoints,
    policiesWithNoExpiry,
    topCode,
  }
}
