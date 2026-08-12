import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionRefundStartedProviderCalledBrief = {
  totalDecisions: number
  refundStartedProviderCalledCount: number
  refundStartedNoProviderCount: number
  noRefundProviderCalledCount: number
  noRefundNoProviderCount: number
  refundStartedCount: number
  noRefundCount: number
}

export function projectEcommerceCancellationDecisionRefundStartedProviderCalledBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionRefundStartedProviderCalledBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      refundStartedProviderCalledCount: 0,
      refundStartedNoProviderCount: 0,
      noRefundProviderCalledCount: 0,
      noRefundNoProviderCount: 0,
      refundStartedCount: 0,
      noRefundCount: 0,
    }
  }

  let refundStartedProviderCalledCount = 0
  let refundStartedNoProviderCount = 0
  let noRefundProviderCalledCount = 0
  let noRefundNoProviderCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.refundStarted) {
      if (decision.providerCalled) refundStartedProviderCalledCount++
      else refundStartedNoProviderCount++
    } else {
      if (decision.providerCalled) noRefundProviderCalledCount++
      else noRefundNoProviderCount++
    }
  }

  return {
    totalDecisions: total,
    refundStartedProviderCalledCount,
    refundStartedNoProviderCount,
    noRefundProviderCalledCount,
    noRefundNoProviderCount,
    refundStartedCount: refundStartedProviderCalledCount + refundStartedNoProviderCount,
    noRefundCount: noRefundProviderCalledCount + noRefundNoProviderCount,
  }
}
