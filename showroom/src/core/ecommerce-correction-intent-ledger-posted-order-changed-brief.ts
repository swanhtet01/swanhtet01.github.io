import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentLedgerPostedOrderChangedBrief = {
  totalIntents: number
  ledgerPostedOrderChangedCount: number
  ledgerPostedNoOrderChangeCount: number
  noLedgerOrderChangedCount: number
  noLedgerNoOrderChangeCount: number
  ledgerPostedCount: number
  noLedgerCount: number
}

export function projectEcommerceCorrectionIntentLedgerPostedOrderChangedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentLedgerPostedOrderChangedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      ledgerPostedOrderChangedCount: 0,
      ledgerPostedNoOrderChangeCount: 0,
      noLedgerOrderChangedCount: 0,
      noLedgerNoOrderChangeCount: 0,
      ledgerPostedCount: 0,
      noLedgerCount: 0,
    }
  }

  let ledgerPostedOrderChangedCount = 0
  let ledgerPostedNoOrderChangeCount = 0
  let noLedgerOrderChangedCount = 0
  let noLedgerNoOrderChangeCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.ledgerPosted) {
      if (intent.orderChanged) ledgerPostedOrderChangedCount++
      else ledgerPostedNoOrderChangeCount++
    } else {
      if (intent.orderChanged) noLedgerOrderChangedCount++
      else noLedgerNoOrderChangeCount++
    }
  }

  return {
    totalIntents: total,
    ledgerPostedOrderChangedCount,
    ledgerPostedNoOrderChangeCount,
    noLedgerOrderChangedCount,
    noLedgerNoOrderChangeCount,
    ledgerPostedCount: ledgerPostedOrderChangedCount + ledgerPostedNoOrderChangeCount,
    noLedgerCount: noLedgerOrderChangedCount + noLedgerNoOrderChangeCount,
  }
}
