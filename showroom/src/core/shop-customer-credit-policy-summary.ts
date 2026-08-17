import type { CommerceState } from './commerce-workspace.ts'

export type ShopCustomerCreditPolicySummary = {
  totalPolicies: number
  uniqueCustomers: number
  byStatus: { active: number; hold: number }
  byPaymentTerms: { d0: number; d7: number; d30: number }
  totalCreditLimitMmk: number
  averageCreditLimitMmk: number
}

export function projectShopCustomerCreditPolicySummary(commerce: CommerceState): ShopCustomerCreditPolicySummary {
  const policies = commerce.customerCreditPolicies ?? []
  const customerSet = new Set<string>()
  const byStatus = { active: 0, hold: 0 }
  const byPaymentTerms = { d0: 0, d7: 0, d30: 0 }
  let totalCreditLimitMmk = 0

  for (const policy of policies) {
    customerSet.add(policy.customer)
    byStatus[policy.status]++
    if (policy.maxPaymentTermsDays === 0) byPaymentTerms.d0++
    else if (policy.maxPaymentTermsDays === 7) byPaymentTerms.d7++
    else byPaymentTerms.d30++
    totalCreditLimitMmk += policy.creditLimitMmk
  }

  return {
    totalPolicies: policies.length,
    uniqueCustomers: customerSet.size,
    byStatus,
    byPaymentTerms,
    totalCreditLimitMmk,
    averageCreditLimitMmk: policies.length > 0 ? Math.round(totalCreditLimitMmk / policies.length) : 0,
  }
}
