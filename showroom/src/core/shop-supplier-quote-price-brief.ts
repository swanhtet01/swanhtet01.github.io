import type { CommerceState } from './commerce-workspace.ts'

export type ShopSupplierQuotePriceBrief = {
  totalSourcingDecisions: number
  totalQuotes: number
  averageQuotesPerDecision: number
  totalQuotedUnitCostMmk: number
  averageUnitCostMmk: number
  minUnitCostMmk: number | null
  maxUnitCostMmk: number | null
}

export function projectShopSupplierQuotePriceBrief(commerce: CommerceState): ShopSupplierQuotePriceBrief {
  const decisions = commerce.supplierSourcingDecisions ?? []
  let totalSourcingDecisions = 0
  let totalQuotes = 0
  let totalQuotedUnitCostMmk = 0
  let minUnitCostMmk: number | null = null
  let maxUnitCostMmk: number | null = null

  for (const decision of decisions) {
    totalSourcingDecisions++
    for (const quote of decision.quotes) {
      totalQuotes++
      totalQuotedUnitCostMmk += quote.unitCostMmk
      if (minUnitCostMmk === null || quote.unitCostMmk < minUnitCostMmk) minUnitCostMmk = quote.unitCostMmk
      if (maxUnitCostMmk === null || quote.unitCostMmk > maxUnitCostMmk) maxUnitCostMmk = quote.unitCostMmk
    }
  }

  return {
    totalSourcingDecisions,
    totalQuotes,
    averageQuotesPerDecision:
      totalSourcingDecisions > 0 ? Math.round(totalQuotes / totalSourcingDecisions) : 0,
    totalQuotedUnitCostMmk,
    averageUnitCostMmk: totalQuotes > 0 ? Math.round(totalQuotedUnitCostMmk / totalQuotes) : 0,
    minUnitCostMmk,
    maxUnitCostMmk,
  }
}
