import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionTotalMmkBrief = {
  totalDecisions: number
  minTotalMmk: number | null
  maxTotalMmk: number | null
  sumTotalMmk: number
}

export function projectEcommerceCancellationDecisionTotalMmkBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionTotalMmkBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0)
    return { totalDecisions: 0, minTotalMmk: null, maxTotalMmk: null, sumTotalMmk: 0 }
  let min = buying.cancellationDecisions[0].totalMmk
  let max = buying.cancellationDecisions[0].totalMmk
  let sum = 0
  for (const decision of buying.cancellationDecisions) {
    if (decision.totalMmk < min) min = decision.totalMmk
    if (decision.totalMmk > max) max = decision.totalMmk
    sum += decision.totalMmk
  }
  return { totalDecisions: total, minTotalMmk: min, maxTotalMmk: max, sumTotalMmk: sum }
}
