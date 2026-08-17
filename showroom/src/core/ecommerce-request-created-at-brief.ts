import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRequestCreatedAtBrief = {
  totalRequests: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
  spannedDays: number
}

export function projectEcommerceRequestCreatedAtBrief(
  buying: EcommerceBuyingState,
): EcommerceRequestCreatedAtBrief {
  const total = buying.requests.length
  if (total === 0)
    return { totalRequests: 0, earliestCreatedAt: null, latestCreatedAt: null, spannedDays: 0 }
  let earliest = buying.requests[0].createdAt
  let latest = buying.requests[0].createdAt
  for (const req of buying.requests) {
    if (req.createdAt < earliest) earliest = req.createdAt
    if (req.createdAt > latest) latest = req.createdAt
  }
  const spannedDays =
    total >= 2
      ? Math.round((Date.parse(latest) - Date.parse(earliest)) / (1000 * 60 * 60 * 24))
      : 0
  return { totalRequests: total, earliestCreatedAt: earliest, latestCreatedAt: latest, spannedDays }
}
