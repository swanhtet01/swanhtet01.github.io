import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentFulfilmentSwitchRatesBrief = {
  totalIntents: number
  switchedCount: number
  switchedRate: number
  notSwitchedCount: number
  notSwitchedRate: number
}

export function projectEcommerceAmendmentIntentFulfilmentSwitchRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentFulfilmentSwitchRatesBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      switchedCount: 0,
      switchedRate: 0,
      notSwitchedCount: 0,
      notSwitchedRate: 0,
    }
  }

  let switchedCount = 0

  for (const intent of buying.amendmentIntents) {
    if (intent.fromFulfilment !== intent.toFulfilment) switchedCount++
  }

  const notSwitchedCount = total - switchedCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    switchedCount,
    switchedRate: rate(switchedCount),
    notSwitchedCount,
    notSwitchedRate: rate(notSwitchedCount),
  }
}
