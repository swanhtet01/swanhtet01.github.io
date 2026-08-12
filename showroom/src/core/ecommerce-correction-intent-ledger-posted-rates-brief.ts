import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCorrectionIntentLedgerPostedRatesBrief = {
  totalIntents: number
  ledgerPostedCount: number
  ledgerPostedRate: number
  notLedgerPostedCount: number
  notLedgerPostedRate: number
}

export function projectEcommerceCorrectionIntentLedgerPostedRatesBrief(
  buying: EcommerceBuyingState,
): EcommerceCorrectionIntentLedgerPostedRatesBrief {
  const total = buying.correctionIntents.length
  if (total === 0) {
    return {
      totalIntents: 0,
      ledgerPostedCount: 0,
      ledgerPostedRate: 0,
      notLedgerPostedCount: 0,
      notLedgerPostedRate: 0,
    }
  }

  let ledgerPostedCount = 0

  for (const intent of buying.correctionIntents) {
    if (intent.ledgerPosted) ledgerPostedCount++
  }

  const notLedgerPostedCount = total - ledgerPostedCount
  const rate = (count: number) => Math.round((count / total) * 10000) / 10000

  return {
    totalIntents: total,
    ledgerPostedCount,
    ledgerPostedRate: rate(ledgerPostedCount),
    notLedgerPostedCount,
    notLedgerPostedRate: rate(notLedgerPostedCount),
  }
}
