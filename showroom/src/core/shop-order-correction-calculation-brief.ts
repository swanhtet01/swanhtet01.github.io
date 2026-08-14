import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderCorrectionCalculationBrief = {
  totalCorrections: number
  taxModeNotConfiguredCount: number
  taxModeExclusiveCount: number
  taxModeInclusiveCount: number
  taxModeNotConfiguredRate: number
  taxModeExclusiveRate: number
  taxModeInclusiveRate: number
  totalListedAmountMmk: number
  totalSubtotalMmk: number
  totalTaxMmk: number
  totalTotalMmk: number
  averageCorrectiveTotalMmk: number
}

export function projectShopOrderCorrectionCalculationBrief(
  commerce: CommerceState,
): ShopOrderCorrectionCalculationBrief {
  let totalCorrections = 0
  let taxModeNotConfiguredCount = 0
  let taxModeExclusiveCount = 0
  let taxModeInclusiveCount = 0
  let totalListedAmountMmk = 0
  let totalSubtotalMmk = 0
  let totalTaxMmk = 0
  let totalTotalMmk = 0

  for (const order of commerce.orders) {
    for (const correction of order.corrections ?? []) {
      totalCorrections++
      const { taxMode, listedAmountMmk, subtotalMmk, taxMmk, totalMmk } = correction.calculation
      if (taxMode === 'not_configured') taxModeNotConfiguredCount++
      else if (taxMode === 'exclusive') taxModeExclusiveCount++
      else taxModeInclusiveCount++
      totalListedAmountMmk += listedAmountMmk
      totalSubtotalMmk += subtotalMmk
      totalTaxMmk += taxMmk
      totalTotalMmk += totalMmk
    }
  }

  return {
    totalCorrections,
    taxModeNotConfiguredCount,
    taxModeExclusiveCount,
    taxModeInclusiveCount,
    taxModeNotConfiguredRate: totalCorrections > 0 ? Math.round((taxModeNotConfiguredCount / totalCorrections) * 100) : 0,
    taxModeExclusiveRate: totalCorrections > 0 ? Math.round((taxModeExclusiveCount / totalCorrections) * 100) : 0,
    taxModeInclusiveRate: totalCorrections > 0 ? Math.round((taxModeInclusiveCount / totalCorrections) * 100) : 0,
    totalListedAmountMmk,
    totalSubtotalMmk,
    totalTaxMmk,
    totalTotalMmk,
    averageCorrectiveTotalMmk: totalCorrections > 0 ? Math.round(totalTotalMmk / totalCorrections) : 0,
  }
}
