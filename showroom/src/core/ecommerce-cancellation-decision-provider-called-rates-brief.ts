import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionProviderCalledRatesBrief = {
  totalDecisions: number
  providerCalledCount: number
  providerCalledRate: number
  notProviderCalledCount: number
  notProviderCalledRate: number
}

export function projectEcommerceCancellationDecisionProviderCalledRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionProviderCalledRatesBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      providerCalledCount: 0,
      providerCalledRate: 0,
      notProviderCalledCount: 0,
      notProviderCalledRate: 0,
    }
  }

  let providerCalledCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.providerCalled) providerCalledCount++
  }

  const notProviderCalledCount = total - providerCalledCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalDecisions: total,
    providerCalledCount,
    providerCalledRate: rate(providerCalledCount),
    notProviderCalledCount,
    notProviderCalledRate: rate(notProviderCalledCount),
  }
}
