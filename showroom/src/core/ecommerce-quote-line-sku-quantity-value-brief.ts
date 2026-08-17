import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceQuoteLineSkuQuantityValueBrief = {
  totalLines: number
  uniqueSkus: number
  topSkusByCount: Array<{ sku: string; count: number }>
  singleUnitLines: number
  smallBatchLines: number
  bulkLines: number
  singleUnitRate: number
  totalLineTotalMmk: number
  minLineTotalMmk: number | null
  maxLineTotalMmk: number | null
  averageLineTotalMmk: number
}

export function projectEcommerceQuoteLineSkuQuantityValueBrief(
  buying: EcommerceBuyingState,
): EcommerceQuoteLineSkuQuantityValueBrief {
  let totalLines = 0
  let singleUnitLines = 0
  let smallBatchLines = 0
  let bulkLines = 0
  let totalLineTotalMmk = 0
  let minLineTotalMmk: number | null = null
  let maxLineTotalMmk: number | null = null
  const skuMap = new Map<string, number>()

  for (const req of buying.requests) {
    for (const line of req.lines) {
      totalLines++
      skuMap.set(line.sku, (skuMap.get(line.sku) ?? 0) + 1)
      if (line.quantity === 1) singleUnitLines++
      else if (line.quantity <= 5) smallBatchLines++
      else bulkLines++
      totalLineTotalMmk += line.lineTotalMmk
      if (minLineTotalMmk === null || line.lineTotalMmk < minLineTotalMmk) minLineTotalMmk = line.lineTotalMmk
      if (maxLineTotalMmk === null || line.lineTotalMmk > maxLineTotalMmk) maxLineTotalMmk = line.lineTotalMmk
    }
  }

  const topSkusByCount = Array.from(skuMap.entries())
    .map(([sku, count]) => ({ sku, count }))
    .sort((a, b) => b.count - a.count || a.sku.localeCompare(b.sku))
    .slice(0, 5)

  return {
    totalLines,
    uniqueSkus: skuMap.size,
    topSkusByCount,
    singleUnitLines,
    smallBatchLines,
    bulkLines,
    singleUnitRate: totalLines > 0 ? Math.round((singleUnitLines / totalLines) * 100) : 0,
    totalLineTotalMmk,
    minLineTotalMmk,
    maxLineTotalMmk,
    averageLineTotalMmk: totalLines > 0 ? Math.round(totalLineTotalMmk / totalLines) : 0,
  }
}
