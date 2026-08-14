import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderCorrectionBalanceBrief = {
  totalCorrections: number
  correctionsToZeroBalance: number
  correctionsToPositiveBalance: number
  zeroBalanceRate: number
  totalPostCorrectionBalanceMmk: number
  averagePostCorrectionBalanceMmk: number
}

export function projectShopOrderCorrectionBalanceBrief(commerce: CommerceState): ShopOrderCorrectionBalanceBrief {
  let totalCorrections = 0
  let correctionsToZeroBalance = 0
  let totalPostCorrectionBalanceMmk = 0

  for (const order of commerce.orders) {
    for (const correction of order.corrections ?? []) {
      totalCorrections++
      totalPostCorrectionBalanceMmk += correction.balanceAfterMmk
      if (correction.balanceAfterMmk === 0) {
        correctionsToZeroBalance++
      }
    }
  }

  return {
    totalCorrections,
    correctionsToZeroBalance,
    correctionsToPositiveBalance: totalCorrections - correctionsToZeroBalance,
    zeroBalanceRate: totalCorrections > 0 ? Math.round((correctionsToZeroBalance / totalCorrections) * 100) : 0,
    totalPostCorrectionBalanceMmk,
    averagePostCorrectionBalanceMmk: totalCorrections > 0 ? Math.round(totalPostCorrectionBalanceMmk / totalCorrections) : 0,
  }
}
