import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentLedgerPostedCustomerMessageBrief = {
  totalIntents: number
  ledgerPostedMessageSentCount: number
  ledgerPostedNoMessageCount: number
  noLedgerMessageSentCount: number
  noLedgerNoMessageCount: number
  ledgerPostedCount: number
  noLedgerCount: number
}

export function projectEcommerceCorrectionIntentLedgerPostedCustomerMessageBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentLedgerPostedCustomerMessageBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      ledgerPostedMessageSentCount: 0,
      ledgerPostedNoMessageCount: 0,
      noLedgerMessageSentCount: 0,
      noLedgerNoMessageCount: 0,
      ledgerPostedCount: 0,
      noLedgerCount: 0,
    }
  }

  let ledgerPostedMessageSentCount = 0
  let ledgerPostedNoMessageCount = 0
  let noLedgerMessageSentCount = 0
  let noLedgerNoMessageCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.ledgerPosted) {
      if (intent.customerMessageSent) ledgerPostedMessageSentCount++
      else ledgerPostedNoMessageCount++
    } else {
      if (intent.customerMessageSent) noLedgerMessageSentCount++
      else noLedgerNoMessageCount++
    }
  }

  return {
    totalIntents: total,
    ledgerPostedMessageSentCount,
    ledgerPostedNoMessageCount,
    noLedgerMessageSentCount,
    noLedgerNoMessageCount,
    ledgerPostedCount: ledgerPostedMessageSentCount + ledgerPostedNoMessageCount,
    noLedgerCount: noLedgerMessageSentCount + noLedgerNoMessageCount,
  }
}
