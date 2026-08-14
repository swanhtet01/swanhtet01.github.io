import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionReasonTextBrief = {
  totalDecisions: number
  shortCount: number
  mediumCount: number
  longCount: number
  shortRate: number
  mediumRate: number
  longRate: number
  minReasonLength: number | null
  maxReasonLength: number | null
  averageReasonLength: number
}

export function projectEcommerceCancellationDecisionReasonTextBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionReasonTextBrief {
  let shortCount = 0
  let mediumCount = 0
  let longCount = 0
  let totalLength = 0
  let minReasonLength: number | null = null
  let maxReasonLength: number | null = null

  for (const decision of buying.cancellationDecisions) {
    const len = decision.reason.length
    totalLength += len
    if (minReasonLength === null || len < minReasonLength) minReasonLength = len
    if (maxReasonLength === null || len > maxReasonLength) maxReasonLength = len
    if (len <= 40) shortCount++
    else if (len <= 120) mediumCount++
    else longCount++
  }

  const totalDecisions = buying.cancellationDecisions.length

  return {
    totalDecisions,
    shortCount,
    mediumCount,
    longCount,
    shortRate: totalDecisions > 0 ? Math.round((shortCount / totalDecisions) * 100) : 0,
    mediumRate: totalDecisions > 0 ? Math.round((mediumCount / totalDecisions) * 100) : 0,
    longRate: totalDecisions > 0 ? Math.round((longCount / totalDecisions) * 100) : 0,
    minReasonLength,
    maxReasonLength,
    averageReasonLength: totalDecisions > 0 ? Math.round(totalLength / totalDecisions) : 0,
  }
}
