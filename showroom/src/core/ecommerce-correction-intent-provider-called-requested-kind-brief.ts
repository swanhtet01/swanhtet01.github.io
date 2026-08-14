import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentProviderCalledRequestedKindBrief = {
  totalIntents: number
  providerCalledCreditCount: number
  providerCalledDebitCount: number
  noProviderCreditCount: number
  noProviderDebitCount: number
  providerCalledCount: number
  noProviderCount: number
}

export function projectEcommerceCorrectionIntentProviderCalledRequestedKindBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentProviderCalledRequestedKindBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      providerCalledCreditCount: 0,
      providerCalledDebitCount: 0,
      noProviderCreditCount: 0,
      noProviderDebitCount: 0,
      providerCalledCount: 0,
      noProviderCount: 0,
    }
  }

  let providerCalledCreditCount = 0
  let providerCalledDebitCount = 0
  let noProviderCreditCount = 0
  let noProviderDebitCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.providerCalled) {
      if (intent.requestedKind === 'credit') providerCalledCreditCount++
      else providerCalledDebitCount++
    } else {
      if (intent.requestedKind === 'credit') noProviderCreditCount++
      else noProviderDebitCount++
    }
  }

  return {
    totalIntents: total,
    providerCalledCreditCount,
    providerCalledDebitCount,
    noProviderCreditCount,
    noProviderDebitCount,
    providerCalledCount: providerCalledCreditCount + providerCalledDebitCount,
    noProviderCount: noProviderCreditCount + noProviderDebitCount,
  }
}
