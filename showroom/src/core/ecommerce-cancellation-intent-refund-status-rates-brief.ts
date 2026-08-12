import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentRefundStatusRatesBrief = {
  totalIntents: number
  noneCount: number
  noneRate: number
  dueCount: number
  dueRate: number
  settledCount: number
  settledRate: number
}

export function projectEcommerceCancellationIntentRefundStatusRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentRefundStatusRatesBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
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

  for (const intent of buying.cancellationIntents) {
    if (intent.refundStatus === 'none') noneCount++
    else if (intent.refundStatus === 'due') dueCount++
    else if (intent.refundStatus === 'settled') settledCount++
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    noneCount,
    noneRate: rate(noneCount),
    dueCount,
    dueRate: rate(dueCount),
    settledCount,
    settledRate: rate(settledCount),
  }
}
