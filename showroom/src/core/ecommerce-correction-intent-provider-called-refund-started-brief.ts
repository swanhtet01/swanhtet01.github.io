import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentProviderCalledRefundStartedBrief = {
  totalIntents: number
  providerCalledRefundStartedCount: number
  providerCalledNoRefundCount: number
  noProviderRefundStartedCount: number
  noProviderNoRefundCount: number
  providerCalledCount: number
  noProviderCount: number
}

export function projectEcommerceCorrectionIntentProviderCalledRefundStartedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentProviderCalledRefundStartedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      providerCalledRefundStartedCount: 0,
      providerCalledNoRefundCount: 0,
      noProviderRefundStartedCount: 0,
      noProviderNoRefundCount: 0,
      providerCalledCount: 0,
      noProviderCount: 0,
    }
  }

  let providerCalledRefundStartedCount = 0
  let providerCalledNoRefundCount = 0
  let noProviderRefundStartedCount = 0
  let noProviderNoRefundCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.providerCalled) {
      if (intent.refundStarted) providerCalledRefundStartedCount++
      else providerCalledNoRefundCount++
    } else {
      if (intent.refundStarted) noProviderRefundStartedCount++
      else noProviderNoRefundCount++
    }
  }

  return {
    totalIntents: total,
    providerCalledRefundStartedCount,
    providerCalledNoRefundCount,
    noProviderRefundStartedCount,
    noProviderNoRefundCount,
    providerCalledCount: providerCalledRefundStartedCount + providerCalledNoRefundCount,
    noProviderCount: noProviderRefundStartedCount + noProviderNoRefundCount,
  }
}
