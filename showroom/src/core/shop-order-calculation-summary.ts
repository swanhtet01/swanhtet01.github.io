import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderCalculationSummary = {
  ordersWithCalculation: number
  byTaxMode: { not_configured: number; exclusive: number; inclusive: number }
  totalTaxFromCalculation: number
}

export function projectShopOrderCalculationSummary(commerce: CommerceState): ShopOrderCalculationSummary {
  const byTaxMode = { not_configured: 0, exclusive: 0, inclusive: 0 }
  let ordersWithCalculation = 0
  let totalTaxFromCalculation = 0

  for (const order of commerce.orders) {
    if (order.calculation === undefined) continue
    ordersWithCalculation++
    byTaxMode[order.calculation.taxMode]++
    totalTaxFromCalculation += order.calculation.taxMmk
  }

  return { ordersWithCalculation, byTaxMode, totalTaxFromCalculation }
}
