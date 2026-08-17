import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentOriginalPromisedAtBrief = {
  totalIntents: number
  earliestOriginalPromisedAt: string | null
  latestOriginalPromisedAt: string | null
  spannedDays: number
}

export function projectEcommerceRescheduleIntentOriginalPromisedAtBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentOriginalPromisedAtBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0)
    return {
      totalIntents: 0,
      earliestOriginalPromisedAt: null,
      latestOriginalPromisedAt: null,
      spannedDays: 0,
    }
  let earliest = buying.rescheduleIntents[0].originalPromisedAt
  let latest = buying.rescheduleIntents[0].originalPromisedAt
  for (const intent of buying.rescheduleIntents) {
    if (intent.originalPromisedAt < earliest) earliest = intent.originalPromisedAt
    if (intent.originalPromisedAt > latest) latest = intent.originalPromisedAt
  }
  const spannedDays =
    total >= 2
      ? Math.round((Date.parse(latest) - Date.parse(earliest)) / (1000 * 60 * 60 * 24))
      : 0
  return {
    totalIntents: total,
    earliestOriginalPromisedAt: earliest,
    latestOriginalPromisedAt: latest,
    spannedDays,
  }
}
