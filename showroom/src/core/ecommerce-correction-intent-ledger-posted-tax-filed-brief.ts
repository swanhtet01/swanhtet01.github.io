import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentLedgerPostedTaxFiledBrief = {
  totalIntents: number
  ledgerPostedTaxFiledCount: number
  ledgerPostedNoTaxCount: number
  noLedgerTaxFiledCount: number
  noLedgerNoTaxCount: number
  ledgerPostedCount: number
  noLedgerCount: number
}

export function projectEcommerceCorrectionIntentLedgerPostedTaxFiledBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentLedgerPostedTaxFiledBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      ledgerPostedTaxFiledCount: 0,
      ledgerPostedNoTaxCount: 0,
      noLedgerTaxFiledCount: 0,
      noLedgerNoTaxCount: 0,
      ledgerPostedCount: 0,
      noLedgerCount: 0,
    }
  }

  let ledgerPostedTaxFiledCount = 0
  let ledgerPostedNoTaxCount = 0
  let noLedgerTaxFiledCount = 0
  let noLedgerNoTaxCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.ledgerPosted) {
      if (intent.taxFiled) ledgerPostedTaxFiledCount++
      else ledgerPostedNoTaxCount++
    } else {
      if (intent.taxFiled) noLedgerTaxFiledCount++
      else noLedgerNoTaxCount++
    }
  }

  return {
    totalIntents: total,
    ledgerPostedTaxFiledCount,
    ledgerPostedNoTaxCount,
    noLedgerTaxFiledCount,
    noLedgerNoTaxCount,
    ledgerPostedCount: ledgerPostedTaxFiledCount + ledgerPostedNoTaxCount,
    noLedgerCount: noLedgerTaxFiledCount + noLedgerNoTaxCount,
  }
}
