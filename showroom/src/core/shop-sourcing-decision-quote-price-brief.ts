import type { CommerceState } from './commerce-workspace.ts'

export type ShopSourcingDecisionQuotePriceBrief = {
  totalDecisions: number
  totalQuotes: number
  averageQuotesPerDecision: number
  totalQuoteValueMmk: number
  averageQuoteUnitCostMmk: number
  minQuoteUnitCostMmk: number | null
  maxQuoteUnitCostMmk: number | null
}

export function projectShopSourcingDecisionQuotePriceBrief(
  commerce: CommerceState,
): ShopSourcingDecisionQuotePriceBrief {
  let totalDecisions = 0
  let totalQuotes = 0
  let totalQuoteValueMmk = 0
  let minQuoteUnitCostMmk: number | null = null
  let maxQuoteUnitCostMmk: number | null = null

  for (const decision of commerce.supplierSourcingDecisions ?? []) {
    totalDecisions++
    for (const quote of decision.quotes) {
      totalQuotes++
      totalQuoteValueMmk += quote.unitCostMmk
      if (minQuoteUnitCostMmk === null || quote.unitCostMmk < minQuoteUnitCostMmk)
        minQuoteUnitCostMmk = quote.unitCostMmk
      if (maxQuoteUnitCostMmk === null || quote.unitCostMmk > maxQuoteUnitCostMmk)
        maxQuoteUnitCostMmk = quote.unitCostMmk
    }
  }

  return {
    totalDecisions,
    totalQuotes,
    averageQuotesPerDecision:
      totalDecisions > 0 ? Math.round(totalQuotes / totalDecisions) : 0,
    totalQuoteValueMmk,
    averageQuoteUnitCostMmk:
      totalQuotes > 0 ? Math.round(totalQuoteValueMmk / totalQuotes) : 0,
    minQuoteUnitCostMmk,
    maxQuoteUnitCostMmk,
  }
}
