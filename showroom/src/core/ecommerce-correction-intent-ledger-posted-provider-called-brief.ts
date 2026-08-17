import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentLedgerPostedProviderCalledBrief = {
  totalIntents: number
  ledgerPostedProviderCalledCount: number
  ledgerPostedNoProviderCount: number
  noLedgerProviderCalledCount: number
  noLedgerNoProviderCount: number
  ledgerPostedCount: number
  noLedgerCount: number
}

export function projectEcommerceCorrectionIntentLedgerPostedProviderCalledBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentLedgerPostedProviderCalledBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      ledgerPostedProviderCalledCount: 0,
      ledgerPostedNoProviderCount: 0,
      noLedgerProviderCalledCount: 0,
      noLedgerNoProviderCount: 0,
      ledgerPostedCount: 0,
      noLedgerCount: 0,
    }
  }

  let ledgerPostedProviderCalledCount = 0
  let ledgerPostedNoProviderCount = 0
  let noLedgerProviderCalledCount = 0
  let noLedgerNoProviderCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.ledgerPosted) {
      if (intent.providerCalled) ledgerPostedProviderCalledCount++
      else ledgerPostedNoProviderCount++
    } else {
      if (intent.providerCalled) noLedgerProviderCalledCount++
      else noLedgerNoProviderCount++
    }
  }

  return {
    totalIntents: total,
    ledgerPostedProviderCalledCount,
    ledgerPostedNoProviderCount,
    noLedgerProviderCalledCount,
    noLedgerNoProviderCount,
    ledgerPostedCount: ledgerPostedProviderCalledCount + ledgerPostedNoProviderCount,
    noLedgerCount: noLedgerProviderCalledCount + noLedgerNoProviderCount,
  }
}
