import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentRiderBookedRatesBrief = {
  totalIntents: number
  riderBookedCount: number
  riderBookedRate: number
  notRiderBookedCount: number
  notRiderBookedRate: number
}

export function projectEcommerceRescheduleIntentRiderBookedRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentRiderBookedRatesBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      riderBookedCount: 0,
      riderBookedRate: 0,
      notRiderBookedCount: 0,
      notRiderBookedRate: 0,
    }
  }

  let riderBookedCount = 0

  for (const intent of buying.rescheduleIntents) {
    if (intent.riderBooked) riderBookedCount++
  }

  const notRiderBookedCount = total - riderBookedCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    riderBookedCount,
    riderBookedRate: rate(riderBookedCount),
    notRiderBookedCount,
    notRiderBookedRate: rate(notRiderBookedCount),
  }
}
