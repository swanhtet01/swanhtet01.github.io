import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentCustomerMessageSentRatesBrief = {
  totalIntents: number
  customerMessageSentCount: number
  customerMessageSentRate: number
  notCustomerMessageSentCount: number
  notCustomerMessageSentRate: number
}

export function projectEcommerceCorrectionIntentCustomerMessageSentRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentCustomerMessageSentRatesBrief {
  const total = buying.correctionIntents.length
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

  for (const intent of buying.correctionIntents) {
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
