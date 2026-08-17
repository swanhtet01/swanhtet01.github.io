import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentLedgerPostedPaymentChangedBrief = {
  totalIntents: number
  ledgerPostedPaymentChangedCount: number
  ledgerPostedNoPaymentChangeCount: number
  noLedgerPaymentChangedCount: number
  noLedgerNoPaymentChangeCount: number
  ledgerPostedCount: number
  noLedgerCount: number
}

export function projectEcommerceCorrectionIntentLedgerPostedPaymentChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentLedgerPostedPaymentChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      ledgerPostedPaymentChangedCount: 0,
      ledgerPostedNoPaymentChangeCount: 0,
      noLedgerPaymentChangedCount: 0,
      noLedgerNoPaymentChangeCount: 0,
      ledgerPostedCount: 0,
      noLedgerCount: 0,
    }
  }

  let ledgerPostedPaymentChangedCount = 0
  let ledgerPostedNoPaymentChangeCount = 0
  let noLedgerPaymentChangedCount = 0
  let noLedgerNoPaymentChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.ledgerPosted) {
      if (intent.paymentChanged) ledgerPostedPaymentChangedCount++
      else ledgerPostedNoPaymentChangeCount++
    } else {
      if (intent.paymentChanged) noLedgerPaymentChangedCount++
      else noLedgerNoPaymentChangeCount++
    }
  }

  return {
    totalIntents: total,
    ledgerPostedPaymentChangedCount,
    ledgerPostedNoPaymentChangeCount,
    noLedgerPaymentChangedCount,
    noLedgerNoPaymentChangeCount,
    ledgerPostedCount: ledgerPostedPaymentChangedCount + ledgerPostedNoPaymentChangeCount,
    noLedgerCount: noLedgerPaymentChangedCount + noLedgerNoPaymentChangeCount,
  }
}
