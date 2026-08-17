import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceQuoteLineUnitPriceBrief = {
  totalLines: number
  minUnitPriceMmk: number | null
  maxUnitPriceMmk: number | null
  averageUnitPriceMmk: number
}

export function projectEcommerceQuoteLineUnitPriceBrief(
  buying: EcommerceBuyingState,
): EcommerceQuoteLineUnitPriceBrief {
  let totalLines = 0
  let totalUnitPrice = 0
  let minUnitPriceMmk: number | null = null
  let maxUnitPriceMmk: number | null = null

  for (const req of buying.requests) {
    for (const line of req.lines) {
      totalLines++
      totalUnitPrice += line.unitPriceMmk
      if (minUnitPriceMmk === null || line.unitPriceMmk < minUnitPriceMmk)
        minUnitPriceMmk = line.unitPriceMmk
      if (maxUnitPriceMmk === null || line.unitPriceMmk > maxUnitPriceMmk)
        maxUnitPriceMmk = line.unitPriceMmk
    }
  }

  return {
    totalLines,
    minUnitPriceMmk,
    maxUnitPriceMmk,
    averageUnitPriceMmk: totalLines > 0 ? Math.round(totalUnitPrice / totalLines) : 0,
  }
}
