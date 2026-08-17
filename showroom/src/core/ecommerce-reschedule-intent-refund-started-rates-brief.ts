import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentRefundStartedRatesBrief = {
  totalIntents: number
  refundStartedCount: number
  refundStartedRate: number
  notRefundStartedCount: number
  notRefundStartedRate: number
}

export function projectEcommerceRescheduleIntentRefundStartedRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentRefundStartedRatesBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      refundStartedCount: 0,
      refundStartedRate: 0,
      notRefundStartedCount: 0,
      notRefundStartedRate: 0,
    }
  }

  let refundStartedCount = 0

  for (const intent of buying.rescheduleIntents) {
    if (intent.refundStarted) refundStartedCount++
  }

  const notRefundStartedCount = total - refundStartedCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    refundStartedCount,
    refundStartedRate: rate(refundStartedCount),
    notRefundStartedCount,
    notRefundStartedRate: rate(notRefundStartedCount),
  }
}
