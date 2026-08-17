import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionCustomerMessageProviderCalledBrief = {
  totalDecisions: number
  messageSentProviderCalledCount: number
  messageSentNoProviderCount: number
  noMessageProviderCalledCount: number
  noMessageNoProviderCount: number
  messageSentCount: number
  noMessageCount: number
}

export function projectEcommerceCancellationDecisionCustomerMessageProviderCalledBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionCustomerMessageProviderCalledBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0) {
    return {
      totalDecisions: 0,
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

  for (const decision of buying.cancellationDecisions) {
    if (decision.customerMessageSent) {
      if (decision.providerCalled) messageSentProviderCalledCount++
      else messageSentNoProviderCount++
    } else {
      if (decision.providerCalled) noMessageProviderCalledCount++
      else noMessageNoProviderCount++
    }
  }

  return {
    totalDecisions: total,
    messageSentProviderCalledCount,
    messageSentNoProviderCount,
    noMessageProviderCalledCount,
    noMessageNoProviderCount,
    messageSentCount: messageSentProviderCalledCount + messageSentNoProviderCount,
    noMessageCount: noMessageProviderCalledCount + noMessageNoProviderCount,
  }
}
