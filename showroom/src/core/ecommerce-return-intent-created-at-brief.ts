import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceReturnIntentCreatedAtBrief = {
  totalIntents: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
  spannedDays: number
}

export function projectEcommerceReturnIntentCreatedAtBrief(
  buying: EcommerceBuyingState,
): EcommerceReturnIntentCreatedAtBrief {
  const total = buying.returnIntents.length
  if (total === 0)
    return { totalIntents: 0, earliestCreatedAt: null, latestCreatedAt: null, spannedDays: 0 }
  let earliest = buying.returnIntents[0].createdAt
  let latest = buying.returnIntents[0].createdAt
  for (const intent of buying.returnIntents) {
    if (intent.createdAt < earliest) earliest = intent.createdAt
    if (intent.createdAt > latest) latest = intent.createdAt
  }
  const spannedDays =
    total >= 2
      ? Math.round((Date.parse(latest) - Date.parse(earliest)) / (1000 * 60 * 60 * 24))
      : 0
  return { totalIntents: total, earliestCreatedAt: earliest, latestCreatedAt: latest, spannedDays }
}
