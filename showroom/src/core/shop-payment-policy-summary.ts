import type { CommerceState } from './commerce-workspace.ts'

export type ShopPaymentPolicySummary = {
  totalPolicies: number
  activePolicies: number
  inactivePolicies: number
  byAdapter: { pay_on_pickup: number; cash_on_delivery: number; kbzpay_manual: number }
  policiesAllowingPickup: number
  policiesAllowingDelivery: number
  policiesWithNoExpiry: number
}

export function projectShopPaymentPolicySummary(commerce: CommerceState): ShopPaymentPolicySummary {
  const policies = commerce.paymentPolicies ?? []
  const byAdapter = { pay_on_pickup: 0, cash_on_delivery: 0, kbzpay_manual: 0 }

  let activePolicies = 0
  let inactivePolicies = 0
  let policiesAllowingPickup = 0
  let policiesAllowingDelivery = 0
  let policiesWithNoExpiry = 0

  for (const policy of policies) {
    if (policy.status === 'active') activePolicies++
    else inactivePolicies++

    byAdapter[policy.adapter]++

    if (policy.allowedFulfilments.includes('pickup')) policiesAllowingPickup++
    if (policy.allowedFulfilments.includes('delivery')) policiesAllowingDelivery++

    if (policy.effectiveUntil === null) policiesWithNoExpiry++
  }

  return {
    totalPolicies: policies.length,
    activePolicies,
    inactivePolicies,
    byAdapter,
    policiesAllowingPickup,
    policiesAllowingDelivery,
    policiesWithNoExpiry,
  }
}
