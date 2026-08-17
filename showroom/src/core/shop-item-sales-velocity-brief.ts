import type { CommerceState } from './commerce-workspace.ts'

export type ShopItemSalesEntry = {
  item: string
  totalQuantitySold: number
  totalRevenueMmk: number
}

export type ShopItemSalesVelocityBrief = {
  totalItemsInCatalog: number
  itemsWithSales: number
  itemsWithZeroSales: number
  topItemsByQuantity: ShopItemSalesEntry[]
  topItemsByRevenue: ShopItemSalesEntry[]
  totalUnitsSold: number
  totalSalesRevenueMmk: number
}

export function projectShopItemSalesVelocityBrief(commerce: CommerceState): ShopItemSalesVelocityBrief {
  const byItem = new Map<string, { totalQuantitySold: number; totalRevenueMmk: number }>()

  for (const order of commerce.orders) {
    if (order.status === 'cancelled') continue
    const entry = byItem.get(order.item)
    if (entry) {
      entry.totalQuantitySold += order.quantity
      entry.totalRevenueMmk += order.total
    } else {
      byItem.set(order.item, { totalQuantitySold: order.quantity, totalRevenueMmk: order.total })
    }
  }

  const catalogSkus = new Set(commerce.items.map((i) => i.sku))
  let itemsWithSales = 0
  let totalUnitsSold = 0
  let totalSalesRevenueMmk = 0

  for (const [, entry] of byItem) {
    itemsWithSales++
    totalUnitsSold += entry.totalQuantitySold
    totalSalesRevenueMmk += entry.totalRevenueMmk
  }

  const salesEntries: ShopItemSalesEntry[] = Array.from(byItem.entries()).map(([item, entry]) => ({
    item,
    totalQuantitySold: entry.totalQuantitySold,
    totalRevenueMmk: entry.totalRevenueMmk,
  }))

  const topItemsByQuantity = salesEntries
    .slice()
    .sort((a, b) => b.totalQuantitySold - a.totalQuantitySold)
    .slice(0, 5)

  const topItemsByRevenue = salesEntries
    .slice()
    .sort((a, b) => b.totalRevenueMmk - a.totalRevenueMmk)
    .slice(0, 5)

  const totalItemsInCatalog = catalogSkus.size
  const itemsWithZeroSales = totalItemsInCatalog - [...byItem.keys()].filter((k) => catalogSkus.has(k)).length

  return {
    totalItemsInCatalog,
    itemsWithSales,
    itemsWithZeroSales,
    topItemsByQuantity,
    topItemsByRevenue,
    totalUnitsSold,
    totalSalesRevenueMmk,
  }
}
