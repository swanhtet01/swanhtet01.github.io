import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentValueBrief = {
  totalIntents: number
  totalValueMmk: number
  minValueMmk: number | null
  maxValueMmk: number | null
  averageValueMmk: number
  shortReasonCount: number
  mediumReasonCount: number
  longReasonCount: number
  averageReasonLength: number
}

export function projectEcommerceCancellationIntentValueBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentValueBrief {
  let totalValueMmk = 0
  let minValueMmk: number | null = null
  let maxValueMmk: number | null = null
  let totalReasonLength = 0
  let shortReasonCount = 0
  let mediumReasonCount = 0
  let longReasonCount = 0

  for (const intent of buying.cancellationIntents) {
    totalValueMmk += intent.totalMmk
    if (minValueMmk === null || intent.totalMmk < minValueMmk) minValueMmk = intent.totalMmk
    if (maxValueMmk === null || intent.totalMmk > maxValueMmk) maxValueMmk = intent.totalMmk
    const len = intent.reason.length
    totalReasonLength += len
    if (len <= 40) shortReasonCount++
    else if (len <= 120) mediumReasonCount++
    else longReasonCount++
  }

  const totalIntents = buying.cancellationIntents.length

  return {
    totalIntents,
    totalValueMmk,
    minValueMmk,
    maxValueMmk,
    averageValueMmk: totalIntents > 0 ? Math.round(totalValueMmk / totalIntents) : 0,
    shortReasonCount,
    mediumReasonCount,
    longReasonCount,
    averageReasonLength: totalIntents > 0 ? Math.round(totalReasonLength / totalIntents) : 0,
  }
}
