import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceRescheduleIntentProviderCalledRatesBrief = {
  totalIntents: number
  providerCalledCount: number
  providerCalledRate: number
  notProviderCalledCount: number
  notProviderCalledRate: number
}

export function projectEcommerceRescheduleIntentProviderCalledRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceRescheduleIntentProviderCalledRatesBrief {
  const total = buying.rescheduleIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      providerCalledCount: 0,
      providerCalledRate: 0,
      notProviderCalledCount: 0,
      notProviderCalledRate: 0,
    }
  }

  let providerCalledCount = 0

  for (const intent of buying.rescheduleIntents) {
    if (intent.providerCalled) providerCalledCount++
  }

  const notProviderCalledCount = total - providerCalledCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    providerCalledCount,
    providerCalledRate: rate(providerCalledCount),
    notProviderCalledCount,
    notProviderCalledRate: rate(notProviderCalledCount),
  }
}
