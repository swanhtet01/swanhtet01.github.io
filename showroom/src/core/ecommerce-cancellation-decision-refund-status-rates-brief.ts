import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionRefundStatusRatesBrief = {
  totalDecisions: number
  noneCount: number
  noneRate: number
  dueCount: number
  dueRate: number
  settledCount: number
  settledRate: number
}

export function projectEcommerceCancellationDecisionRefundStatusRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionRefundStatusRatesBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
      noneCount: 0,
      noneRate: 0,
      dueCount: 0,
      dueRate: 0,
      settledCount: 0,
      settledRate: 0,
    }
  }

  let noneCount = 0
  let dueCount = 0
  let settledCount = 0

  for (const decision of buying.cancellationDecisions) {
    if (decision.refundStatus === 'none') noneCount++
    else if (decision.refundStatus === 'due') dueCount++
    else if (decision.refundStatus === 'settled') settledCount++
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalDecisions: total,
    noneCount,
    noneRate: rate(noneCount),
    dueCount,
    dueRate: rate(dueCount),
    settledCount,
    settledRate: rate(settledCount),
  }
}
