import type { CommerceState } from './commerce-workspace.ts'

export type ShopRevenueSummary = {
  totalRevenue: number
  completedRevenue: number
  orderCount: number
  completedCount: number
  cancelledCount: number
  averageOrderValue: number
  byChannel: Record<string, { revenue: number; count: number }>
  topSkus: Array<{ sku: string; revenue: number; count: number }>
  closeSummary: Array<{ businessDate: string; total: number; orders: number }>
}

export function projectShopRevenueSummary(
  commerce: CommerceState,
  date?: string,
): ShopRevenueSummary {
  const filter = date ? (ts: string) => ts.startsWith(date) : () => true

  let totalRevenue = 0
  let completedRevenue = 0
  let orderCount = 0
  let completedCount = 0
  let cancelledCount = 0
  const byChannel: Record<string, { revenue: number; count: number }> = {}
  const bySku = new Map<string, { revenue: number; count: number }>()

  for (const order of commerce.orders) {
    if (!filter(order.createdAt)) continue
    if (order.status === 'cancelled') { cancelledCount += 1; continue }
    totalRevenue += order.total
    orderCount += 1
    if (order.status === 'completed') { completedRevenue += order.total; completedCount += 1 }
    const ch = byChannel[order.channel] ?? { revenue: 0, count: 0 }
    ch.revenue += order.total; ch.count += 1; byChannel[order.channel] = ch
    if (order.itemSku) {
      const sk = bySku.get(order.itemSku) ?? { revenue: 0, count: 0 }
      sk.revenue += order.total; sk.count += 1; bySku.set(order.itemSku, sk)
    }
  }

  const topSkus = Array.from(bySku.entries())
    .map(([sku, v]) => ({ sku, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  const closeSummary = commerce.closes
    .filter((c) => !date || (c.businessDate ?? c.createdAt).startsWith(date))
    .map((c) => ({ businessDate: c.businessDate ?? c.createdAt.slice(0, 10), total: c.total, orders: c.orders }))

  return {
    totalRevenue,
    completedRevenue,
    orderCount,
    completedCount,
    cancelledCount,
    averageOrderValue: orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0,
    byChannel,
    topSkus,
    closeSummary,
  }
}
