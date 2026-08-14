import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentCustomerMessageProviderCalledBrief = {
  totalIntents: number
  messageSentProviderCalledCount: number
  messageSentNoProviderCount: number
  noMessageProviderCalledCount: number
  noMessageNoProviderCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceCorrectionIntentCustomerMessageProviderCalledBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentCustomerMessageProviderCalledBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      messageSentProviderCalledCount: 0,
      messageSentNoProviderCount: 0,
      noMessageProviderCalledCount: 0,
      noMessageNoProviderCount: 0,
      messageSentCount: 0,
      noMessageCount: 0,
    }
  }

  let messageSentProviderCalledCount = 0
  let messageSentNoProviderCount = 0
  let noMessageProviderCalledCount = 0
  let noMessageNoProviderCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.customerMessageSent) {
      if (intent.providerCalled) messageSentProviderCalledCount++
      else messageSentNoProviderCount++
    } else {
      if (intent.providerCalled) noMessageProviderCalledCount++
      else noMessageNoProviderCount++
    }
  }

  return {
    totalIntents: total,
    messageSentProviderCalledCount,
    messageSentNoProviderCount,
    noMessageProviderCalledCount,
    noMessageNoProviderCount,
    messageSentCount: messageSentProviderCalledCount + messageSentNoProviderCount,
    noMessageCount: noMessageProviderCalledCount + noMessageNoProviderCount,
  }
}
