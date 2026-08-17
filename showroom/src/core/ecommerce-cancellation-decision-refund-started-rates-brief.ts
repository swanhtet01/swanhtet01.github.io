import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionRefundStartedRatesBrief = {
  totalDecisions: number
  refundStartedCount: number
  refundStartedRate: number
  notRefundStartedCount: number
  notRefundStartedRate: number
}

export function projectEcommerceCancellationDecisionRefundStartedRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionRefundStartedRatesBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      refundStartedCount: 0,
      refundStartedRate: 0,
      notRefundStartedCount: 0,
      notRefundStartedRate: 0,
    }
  }

  let refundStartedCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.refundStarted) refundStartedCount++
  }

  const notRefundStartedCount = total - refundStartedCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalDecisions: total,
    refundStartedCount,
    refundStartedRate: rate(refundStartedCount),
    notRefundStartedCount,
    notRefundStartedRate: rate(notRefundStartedCount),
  }
}
