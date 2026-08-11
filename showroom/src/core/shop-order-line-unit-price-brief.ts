import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderLineUnitPriceBrief = {
  totalLines: number
  totalUnitPriceMmk: number
  averageUnitPriceMmk: number
  minUnitPriceMmk: number | null
  maxUnitPriceMmk: number | null
}

export function projectShopOrderLineUnitPriceBrief(
  commerce: CommerceState,
): ShopOrderLineUnitPriceBrief {
  let totalLines = 0
  let totalUnitPriceMmk = 0
  let minUnitPriceMmk: number | null = null
  let maxUnitPriceMmk: number | null = null

  for (const order of commerce.orders) {
    for (const line of order.lines ?? []) {
      totalLines++
      totalUnitPriceMmk += line.unitPriceMmk
      if (minUnitPriceMmk === null || line.unitPriceMmk < minUnitPriceMmk) {
        minUnitPriceMmk = line.unitPriceMmk
      }
      if (maxUnitPriceMmk === null || line.unitPriceMmk > maxUnitPriceMmk) {
        maxUnitPriceMmk = line.unitPriceMmk
      }
    }
  }

  return {
    totalLines,
    totalUnitPriceMmk,
    averageUnitPriceMmk: totalLines > 0 ? Math.round(totalUnitPriceMmk / totalLines) : 0,
    minUnitPriceMmk,
    maxUnitPriceMmk,
  }
}
