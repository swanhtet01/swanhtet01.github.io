import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionCustomerMessageSentRatesBrief = {
  totalDecisions: number
  customerMessageSentCount: number
  customerMessageSentRate: number
  notCustomerMessageSentCount: number
  notCustomerMessageSentRate: number
}

export function projectEcommerceCancellationDecisionCustomerMessageSentRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionCustomerMessageSentRatesBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      customerMessageSentCount: 0,
      customerMessageSentRate: 0,
      notCustomerMessageSentCount: 0,
      notCustomerMessageSentRate: 0,
    }
  }

  let customerMessageSentCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.customerMessageSent) customerMessageSentCount++
  }

  const notCustomerMessageSentCount = total - customerMessageSentCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalDecisions: total,
    customerMessageSentCount,
    customerMessageSentRate: rate(customerMessageSentCount),
    notCustomerMessageSentCount,
    notCustomerMessageSentRate: rate(notCustomerMessageSentCount),
  }
}
