import type { CommerceState } from './commerce-workspace.ts'

export type SalesVelocityWindow = {
  orderCount: number
  revenueMmk: number
}

export type ShopSalesVelocity = {
  last7Days: SalesVelocityWindow
  last30Days: SalesVelocityWindow
  velocityTrend: 'accelerating' | 'steady' | 'decelerating' | null
  byDay: Array<{ date: string; orderCount: number; revenueMmk: number }>
}

function subtractDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export function projectShopSalesVelocity(
  commerce: CommerceState,
  asOf: string,
): ShopSalesVelocity {
  const today = asOf.slice(0, 10)
  const start7 = subtractDays(today, 6)
  const start30 = subtractDays(today, 29)

  const dayMap = new Map<string, { orderCount: number; revenueMmk: number }>()
  const last7: SalesVelocityWindow = { orderCount: 0, revenueMmk: 0 }
  const last30: SalesVelocityWindow = { orderCount: 0, revenueMmk: 0 }

  for (const order of commerce.orders) {
    if (order.status === 'cancelled') continue
    const date = order.createdAt.slice(0, 10)
    if (date < start30 || date > today) continue
    last30.orderCount += 1
    last30.revenueMmk += order.total
    const entry = dayMap.get(date) ?? { orderCount: 0, revenueMmk: 0 }
    entry.orderCount += 1
    entry.revenueMmk += order.total
    dayMap.set(date, entry)
    if (date >= start7) {
      last7.orderCount += 1
      last7.revenueMmk += order.total
    }
  }

  let velocityTrend: ShopSalesVelocity['velocityTrend'] = null
  if (last30.orderCount > 0) {
    const rate7 = last7.revenueMmk / 7
    const rate30 = last30.revenueMmk / 30
    if (rate30 === 0) {
      velocityTrend = last7.revenueMmk > 0 ? 'accelerating' : 'steady'
    } else if (rate7 > rate30 * 1.1) {
      velocityTrend = 'accelerating'
    } else if (rate7 < rate30 * 0.9) {
      velocityTrend = 'decelerating'
    } else {
      velocityTrend = 'steady'
    }
  }

  const byDay = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { last7Days: last7, last30Days: last30, velocityTrend, byDay }
}
