import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentPromiseDateBrief = {
  totalIntents: number
  averageDeltaHours: number
  minDeltaHours: number | null
  maxDeltaHours: number | null
  earlierCount: number
  sameDayCount: number
  laterCount: number
  oneDayLaterCount: number
  twoThreeDaysLaterCount: number
  fourPlusDaysLaterCount: number
}

export function projectEcommerceRescheduleIntentPromiseDateBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentPromiseDateBrief {
  let totalDeltaHours = 0
  let minDeltaHours: number | null = null
  let maxDeltaHours: number | null = null
  let earlierCount = 0
  let sameDayCount = 0
  let laterCount = 0
  let oneDayLaterCount = 0
  let twoThreeDaysLaterCount = 0
  let fourPlusDaysLaterCount = 0

  for (const intent of buying.rescheduleIntents) {
    const deltaHours = Math.round(
      (Date.parse(intent.requestedPromisedAt) - Date.parse(intent.originalPromisedAt)) /
        (1000 * 60 * 60),
    )
    totalDeltaHours += deltaHours
    if (minDeltaHours === null || deltaHours < minDeltaHours) minDeltaHours = deltaHours
    if (maxDeltaHours === null || deltaHours > maxDeltaHours) maxDeltaHours = deltaHours
    if (deltaHours < 0) {
      earlierCount++
    } else if (deltaHours === 0) {
      sameDayCount++
    } else {
      laterCount++
      if (deltaHours <= 24) oneDayLaterCount++
      else if (deltaHours <= 72) twoThreeDaysLaterCount++
      else fourPlusDaysLaterCount++
    }
  }

  const totalIntents = buying.rescheduleIntents.length

  return {
    totalIntents,
    averageDeltaHours: totalIntents > 0 ? Math.round(totalDeltaHours / totalIntents) : 0,
    minDeltaHours,
    maxDeltaHours,
    earlierCount,
    sameDayCount,
    laterCount,
    oneDayLaterCount,
    twoThreeDaysLaterCount,
    fourPlusDaysLaterCount,
  }
}
