import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentRequestedPromisedAtBrief = {
  totalIntents: number
  earliestRequestedPromisedAt: string | null
  latestRequestedPromisedAt: string | null
  spannedDays: number
}

export function projectEcommerceRescheduleIntentRequestedPromisedAtBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentRequestedPromisedAtBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0)
    return {
      totalIntents: 0,
      earliestRequestedPromisedAt: null,
      latestRequestedPromisedAt: null,
      spannedDays: 0,
    }
  let earliest = buying.rescheduleIntents[0].requestedPromisedAt
  let latest = buying.rescheduleIntents[0].requestedPromisedAt
  for (const intent of buying.rescheduleIntents) {
    if (intent.requestedPromisedAt < earliest) earliest = intent.requestedPromisedAt
    if (intent.requestedPromisedAt > latest) latest = intent.requestedPromisedAt
  }
  const spannedDays =
    total >= 2
      ? Math.round((Date.parse(latest) - Date.parse(earliest)) / (1000 * 60 * 60 * 24))
      : 0
  return {
    totalIntents: total,
    earliestRequestedPromisedAt: earliest,
    latestRequestedPromisedAt: latest,
    spannedDays,
  }
}
