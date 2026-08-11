import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionValueBrief = {
  totalDecisions: number
  totalValueMmk: number
  minValueMmk: number | null
  maxValueMmk: number | null
  averageValueMmk: number
}

export function projectEcommerceCancellationDecisionValueBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionValueBrief {
  const decisions = buying.cancellationDecisions
  const total = decisions.length
  let totalValueMmk = 0
  let minValueMmk: number | null = null
  let maxValueMmk: number | null = null

  for (const decision of decisions) {
    const v = decision.totalMmk
    totalValueMmk += v
    if (minValueMmk === null || v < minValueMmk) minValueMmk = v
    if (maxValueMmk === null || v > maxValueMmk) maxValueMmk = v
  }

  return {
    totalDecisions: total,
    totalValueMmk,
    minValueMmk,
    maxValueMmk,
    averageValueMmk: total > 0 ? Math.round(totalValueMmk / total) : 0,
  }
}
