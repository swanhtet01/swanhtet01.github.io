import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentProviderCalledRefundStatusBrief = {
  totalIntents: number
  providerCalledNoRefundCount: number
  providerCalledDueCount: number
  providerCalledSettledCount: number
  noProviderNoRefundCount: number
  noProviderDueCount: number
  noProviderSettledCount: number
}

export function projectEcommerceCorrectionIntentProviderCalledRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentProviderCalledRefundStatusBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      providerCalledNoRefundCount: 0,
      providerCalledDueCount: 0,
      providerCalledSettledCount: 0,
      noProviderNoRefundCount: 0,
      noProviderDueCount: 0,
      noProviderSettledCount: 0,
    }
  }

  let providerCalledNoRefundCount = 0
  let providerCalledDueCount = 0
  let providerCalledSettledCount = 0
  let noProviderNoRefundCount = 0
  let noProviderDueCount = 0
  let noProviderSettledCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.providerCalled) {
      if (intent.refundStatus === 'none') providerCalledNoRefundCount++
      else if (intent.refundStatus === 'due') providerCalledDueCount++
      else providerCalledSettledCount++
    } else {
      if (intent.refundStatus === 'none') noProviderNoRefundCount++
      else if (intent.refundStatus === 'due') noProviderDueCount++
      else noProviderSettledCount++
    }
  }

  return {
    totalIntents: total,
    providerCalledNoRefundCount,
    providerCalledDueCount,
    providerCalledSettledCount,
    noProviderNoRefundCount,
    noProviderDueCount,
    noProviderSettledCount,
  }
}
