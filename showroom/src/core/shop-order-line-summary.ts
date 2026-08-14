import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderLineSummary = {
  ordersWithLines: number
  totalLineItems: number
  totalQuantityFromLines: number
  uniqueSkusFromLines: number
  topSkuByQuantity: string | null
}

export function projectShopOrderLineSummary(commerce: CommerceState): ShopOrderLineSummary {
  const skuQuantityMap = new Map<string, number>()
  let ordersWithLines = 0
  let totalLineItems = 0
  let totalQuantityFromLines = 0

  for (const order of commerce.orders) {
    if (!order.lines || order.lines.length === 0) continue
    ordersWithLines++
    for (const line of order.lines) {
      totalLineItems++
      totalQuantityFromLines += line.quantity
      skuQuantityMap.set(line.sku, (skuQuantityMap.get(line.sku) ?? 0) + line.quantity)
    }
  }

  let topSkuByQuantity: string | null = null
  for (const [sku, qty] of skuQuantityMap.entries()) {
    const best = topSkuByQuantity !== null ? (skuQuantityMap.get(topSkuByQuantity) ?? 0) : -1
    if (topSkuByQuantity === null || qty > best || (qty === best && sku < topSkuByQuantity)) {
      topSkuByQuantity = sku
    }
  }

  return {
    ordersWithLines,
    totalLineItems,
    totalQuantityFromLines,
    uniqueSkusFromLines: skuQuantityMap.size,
    topSkuByQuantity,
  }
}
