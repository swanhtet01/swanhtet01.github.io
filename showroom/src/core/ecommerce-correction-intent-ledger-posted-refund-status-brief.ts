import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentLedgerPostedRefundStatusBrief = {
  totalIntents: number
  ledgerPostedNoRefundCount: number
  ledgerPostedDueCount: number
  ledgerPostedSettledCount: number
  noLedgerNoRefundCount: number
  noLedgerDueCount: number
  noLedgerSettledCount: number
}

export function projectEcommerceCorrectionIntentLedgerPostedRefundStatusBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentLedgerPostedRefundStatusBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      ledgerPostedNoRefundCount: 0,
      ledgerPostedDueCount: 0,
      ledgerPostedSettledCount: 0,
      noLedgerNoRefundCount: 0,
      noLedgerDueCount: 0,
      noLedgerSettledCount: 0,
    }
  }

  let ledgerPostedNoRefundCount = 0
  let ledgerPostedDueCount = 0
  let ledgerPostedSettledCount = 0
  let noLedgerNoRefundCount = 0
  let noLedgerDueCount = 0
  let noLedgerSettledCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.ledgerPosted) {
      if (intent.refundStatus === 'none') ledgerPostedNoRefundCount++
      else if (intent.refundStatus === 'due') ledgerPostedDueCount++
      else ledgerPostedSettledCount++
    } else {
      if (intent.refundStatus === 'none') noLedgerNoRefundCount++
      else if (intent.refundStatus === 'due') noLedgerDueCount++
      else noLedgerSettledCount++
    }
  }

  return {
    totalIntents: total,
    ledgerPostedNoRefundCount,
    ledgerPostedDueCount,
    ledgerPostedSettledCount,
    noLedgerNoRefundCount,
    noLedgerDueCount,
    noLedgerSettledCount,
  }
}
