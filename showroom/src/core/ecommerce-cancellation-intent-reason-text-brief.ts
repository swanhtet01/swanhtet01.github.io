import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentReasonTextBrief = {
  totalIntents: number
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

export function projectEcommerceCancellationIntentReasonTextBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentReasonTextBrief {
  let shortCount = 0
  let mediumCount = 0
  let longCount = 0
  let totalLength = 0
  let minReasonLength: number | null = null
  let maxReasonLength: number | null = null

  for (const intent of buying.cancellationIntents) {
    const len = intent.reason.length
    totalLength += len
    if (minReasonLength === null || len < minReasonLength) minReasonLength = len
    if (maxReasonLength === null || len > maxReasonLength) maxReasonLength = len
    if (len <= 40) shortCount++
    else if (len <= 120) mediumCount++
    else longCount++
  }

  const totalIntents = buying.cancellationIntents.length

  return {
    totalIntents,
    shortCount,
    mediumCount,
    longCount,
    shortRate: totalIntents > 0 ? Math.round((shortCount / totalIntents) * 100) : 0,
    mediumRate: totalIntents > 0 ? Math.round((mediumCount / totalIntents) * 100) : 0,
    longRate: totalIntents > 0 ? Math.round((longCount / totalIntents) * 100) : 0,
    minReasonLength,
    maxReasonLength,
    averageReasonLength: totalIntents > 0 ? Math.round(totalLength / totalIntents) : 0,
  }
}
