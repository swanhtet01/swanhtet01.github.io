import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentProviderCalledOrderChangedBrief = {
  totalIntents: number
  providerCalledOrderChangedCount: number
  providerCalledNoOrderChangeCount: number
  noProviderOrderChangedCount: number
  noProviderNoOrderChangeCount: number
  providerCalledCount: number
  noProviderCount: number
}

export function projectEcommerceCorrectionIntentProviderCalledOrderChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentProviderCalledOrderChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      providerCalledOrderChangedCount: 0,
      providerCalledNoOrderChangeCount: 0,
      noProviderOrderChangedCount: 0,
      noProviderNoOrderChangeCount: 0,
      providerCalledCount: 0,
      noProviderCount: 0,
    }
  }

  let providerCalledOrderChangedCount = 0
  let providerCalledNoOrderChangeCount = 0
  let noProviderOrderChangedCount = 0
  let noProviderNoOrderChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.providerCalled) {
      if (intent.orderChanged) providerCalledOrderChangedCount++
      else providerCalledNoOrderChangeCount++
    } else {
      if (intent.orderChanged) noProviderOrderChangedCount++
      else noProviderNoOrderChangeCount++
    }
  }

  return {
    totalIntents: total,
    providerCalledOrderChangedCount,
    providerCalledNoOrderChangeCount,
    noProviderOrderChangedCount,
    noProviderNoOrderChangeCount,
    providerCalledCount: providerCalledOrderChangedCount + providerCalledNoOrderChangeCount,
    noProviderCount: noProviderOrderChangedCount + noProviderNoOrderChangeCount,
  }
}
