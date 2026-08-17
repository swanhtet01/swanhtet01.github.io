import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentLedgerPostedRefundStartedBrief = {
  totalIntents: number
  ledgerPostedRefundStartedCount: number
  ledgerPostedNoRefundCount: number
  noLedgerRefundStartedCount: number
  noLedgerNoRefundCount: number
  ledgerPostedCount: number
  noLedgerCount: number
}

export function projectEcommerceCorrectionIntentLedgerPostedRefundStartedBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentLedgerPostedRefundStartedBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      ledgerPostedRefundStartedCount: 0,
      ledgerPostedNoRefundCount: 0,
      noLedgerRefundStartedCount: 0,
      noLedgerNoRefundCount: 0,
      ledgerPostedCount: 0,
      noLedgerCount: 0,
    }
  }

  let ledgerPostedRefundStartedCount = 0
  let ledgerPostedNoRefundCount = 0
  let noLedgerRefundStartedCount = 0
  let noLedgerNoRefundCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.ledgerPosted) {
      if (intent.refundStarted) ledgerPostedRefundStartedCount++
      else ledgerPostedNoRefundCount++
    } else {
      if (intent.refundStarted) noLedgerRefundStartedCount++
      else noLedgerNoRefundCount++
    }
  }

  return {
    totalIntents: total,
    ledgerPostedRefundStartedCount,
    ledgerPostedNoRefundCount,
    noLedgerRefundStartedCount,
    noLedgerNoRefundCount,
    ledgerPostedCount: ledgerPostedRefundStartedCount + ledgerPostedNoRefundCount,
    noLedgerCount: noLedgerRefundStartedCount + noLedgerNoRefundCount,
  }
}
