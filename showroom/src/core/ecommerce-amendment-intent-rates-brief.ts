import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceAmendmentIntentRatesBrief = {
  totalIntents: number
  fulfilmentSwitchCount: number
  fulfilmentSwitchRate: number
  customerNotificationCount: number
  customerNotificationRate: number
  multiLineCount: number
  multiLineRate: number
}

export function projectEcommerceAmendmentIntentRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceAmendmentIntentRatesBrief {
  const total = buying.amendmentIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      fulfilmentSwitchCount: 0,
      fulfilmentSwitchRate: 0,
      customerNotificationCount: 0,
      customerNotificationRate: 0,
      multiLineCount: 0,
      multiLineRate: 0,
    }
  }

  let fulfilmentSwitchCount = 0
  let customerNotificationCount = 0
  let multiLineCount = 0

  for (const intent of buying.amendmentIntents) {
    if (intent.fromFulfilment !== intent.toFulfilment) fulfilmentSwitchCount++
    if (intent.customerMessageSent) customerNotificationCount++
    if (intent.lineChanges.length > 1) multiLineCount++
  }

  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    fulfilmentSwitchCount,
    fulfilmentSwitchRate: rate(fulfilmentSwitchCount),
    customerNotificationCount,
    customerNotificationRate: rate(customerNotificationCount),
    multiLineCount,
    multiLineRate: rate(multiLineCount),
  }
}
