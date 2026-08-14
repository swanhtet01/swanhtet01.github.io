import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationIntentCustomerMessageSentRatesBrief = {
  totalIntents: number
  customerMessageSentCount: number
  customerMessageSentRate: number
  notCustomerMessageSentCount: number
  notCustomerMessageSentRate: number
}

export function projectEcommerceCancellationIntentCustomerMessageSentRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationIntentCustomerMessageSentRatesBrief {
  const total = buying.cancellationIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      customerMessageSentCount: 0,
      customerMessageSentRate: 0,
      notCustomerMessageSentCount: 0,
      notCustomerMessageSentRate: 0,
    }
  }

  let customerMessageSentCount = 0

  for (const intent of buying.cancellationIntents) {
    if (intent.customerMessageSent) customerMessageSentCount++
  }

  const notCustomerMessageSentCount = total - customerMessageSentCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    customerMessageSentCount,
    customerMessageSentRate: rate(customerMessageSentCount),
    notCustomerMessageSentCount,
    notCustomerMessageSentRate: rate(notCustomerMessageSentCount),
  }
}
