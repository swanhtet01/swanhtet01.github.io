import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceReturnIntentReasonLengthBrief = {
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

export function projectEcommerceReturnIntentReasonLengthBrief(
  buying: EcommerceBuyingState,
): EcommerceReturnIntentReasonLengthBrief {
  const intents = buying.returnIntents
  const total = intents.length
  let shortCount = 0
  let mediumCount = 0
  let longCount = 0
  let minReasonLength: number | null = null
  let maxReasonLength: number | null = null
  let totalLength = 0

  for (const intent of intents) {
    const len = intent.reason.length
    totalLength += len

    if (len <= 40) shortCount++
    else if (len <= 120) mediumCount++
    else longCount++

    if (minReasonLength === null || len < minReasonLength) minReasonLength = len
    if (maxReasonLength === null || len > maxReasonLength) maxReasonLength = len
  }

  return {
    totalIntents: total,
    shortCount,
    mediumCount,
    longCount,
    shortRate: total > 0 ? Math.round((shortCount / total) * 100) : 0,
    mediumRate: total > 0 ? Math.round((mediumCount / total) * 100) : 0,
    longRate: total > 0 ? Math.round((longCount / total) * 100) : 0,
    minReasonLength,
    maxReasonLength,
    averageReasonLength: total > 0 ? Math.round(totalLength / total) : 0,
  }
}
