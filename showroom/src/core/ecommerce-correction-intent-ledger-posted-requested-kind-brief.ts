import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentLedgerPostedRequestedKindBrief = {
  totalIntents: number
  ledgerPostedCreditCount: number
  ledgerPostedDebitCount: number
  noLedgerCreditCount: number
  noLedgerDebitCount: number
  ledgerPostedCount: number
  noLedgerCount: number
}

export function projectEcommerceCorrectionIntentLedgerPostedRequestedKindBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentLedgerPostedRequestedKindBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      ledgerPostedCreditCount: 0,
      ledgerPostedDebitCount: 0,
      noLedgerCreditCount: 0,
      noLedgerDebitCount: 0,
      ledgerPostedCount: 0,
      noLedgerCount: 0,
    }
  }

  let ledgerPostedCreditCount = 0
  let ledgerPostedDebitCount = 0
  let noLedgerCreditCount = 0
  let noLedgerDebitCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.ledgerPosted) {
      if (intent.requestedKind === 'credit') ledgerPostedCreditCount++
      else ledgerPostedDebitCount++
    } else {
      if (intent.requestedKind === 'credit') noLedgerCreditCount++
      else noLedgerDebitCount++
    }
  }

  return {
    totalIntents: total,
    ledgerPostedCreditCount,
    ledgerPostedDebitCount,
    noLedgerCreditCount,
    noLedgerDebitCount,
    ledgerPostedCount: ledgerPostedCreditCount + ledgerPostedDebitCount,
    noLedgerCount: noLedgerCreditCount + noLedgerDebitCount,
  }
}
