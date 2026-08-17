import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentPaymentChangedRatesBrief = {
  totalIntents: number
  paymentChangedCount: number
  paymentChangedRate: number
  notPaymentChangedCount: number
  notPaymentChangedRate: number
}

export function projectEcommerceRescheduleIntentPaymentChangedRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentPaymentChangedRatesBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      paymentChangedCount: 0,
      paymentChangedRate: 0,
      notPaymentChangedCount: 0,
      notPaymentChangedRate: 0,
    }
  }

  let paymentChangedCount = 0

  for (const intent of buying.rescheduleIntents) {
    if (intent.paymentChanged) paymentChangedCount++
  }

  const notPaymentChangedCount = total - paymentChangedCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    paymentChangedCount,
    paymentChangedRate: rate(paymentChangedCount),
    notPaymentChangedCount,
    notPaymentChangedRate: rate(notPaymentChangedCount),
  }
}
