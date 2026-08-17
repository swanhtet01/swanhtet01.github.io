import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionCreatedAtBrief = {
  totalDecisions: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
  spannedDays: number
}

export function projectEcommerceCancellationDecisionCreatedAtBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionCreatedAtBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0)
    return {
      totalDecisions: 0,
      earliestCreatedAt: null,
      latestCreatedAt: null,
      spannedDays: 0,
    }
  let earliest = buying.cancellationDecisions[0].createdAt
  let latest = buying.cancellationDecisions[0].createdAt
  for (const decision of buying.cancellationDecisions) {
    if (decision.createdAt < earliest) earliest = decision.createdAt
    if (decision.createdAt > latest) latest = decision.createdAt
  }
  const spannedDays =
    total >= 2
      ? Math.round((Date.parse(latest) - Date.parse(earliest)) / (1000 * 60 * 60 * 24))
      : 0
  return {
    totalDecisions: total,
    earliestCreatedAt: earliest,
    latestCreatedAt: latest,
    spannedDays,
  }
}
