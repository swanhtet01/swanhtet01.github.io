import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderCorrectionTaxBrief = {
  totalCorrections: number
  correctionsWithJurisdiction: number
  correctionsWithoutJurisdiction: number
  jurisdictionCoverage: number
  uniqueJurisdictions: number
}

export function projectShopOrderCorrectionTaxBrief(commerce: CommerceState): ShopOrderCorrectionTaxBrief {
  let totalCorrections = 0
  let correctionsWithJurisdiction = 0
  const jurisdictions = new Set<string>()

  for (const order of commerce.orders) {
    for (const correction of order.corrections ?? []) {
      totalCorrections++
      const code = correction.calculation.taxJurisdictionCode
      if (code != null) {
        correctionsWithJurisdiction++
        jurisdictions.add(code)
      }
    }
  }

  return {
    totalCorrections,
    correctionsWithJurisdiction,
    correctionsWithoutJurisdiction: totalCorrections - correctionsWithJurisdiction,
    jurisdictionCoverage: totalCorrections > 0 ? Math.round((correctionsWithJurisdiction / totalCorrections) * 100) : 0,
    uniqueJurisdictions: jurisdictions.size,
  }
}
