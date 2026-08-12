import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentCreatedAtBrief = {
  totalIntents: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
  spannedDays: number
}

export function projectEcommerceCancellationIntentCreatedAtBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentCreatedAtBrief {
  const total = buying.cancellationIntents.length
  if (total === 0)
    return { totalIntents: 0, earliestCreatedAt: null, latestCreatedAt: null, spannedDays: 0 }
  let earliest = buying.cancellationIntents[0].createdAt
  let latest = buying.cancellationIntents[0].createdAt
  for (const intent of buying.cancellationIntents) {
    if (intent.createdAt < earliest) earliest = intent.createdAt
    if (intent.createdAt > latest) latest = intent.createdAt
  }
  const spannedDays =
    total >= 2
      ? Math.round((Date.parse(latest) - Date.parse(earliest)) / (1000 * 60 * 60 * 24))
      : 0
  return { totalIntents: total, earliestCreatedAt: earliest, latestCreatedAt: latest, spannedDays }
}
