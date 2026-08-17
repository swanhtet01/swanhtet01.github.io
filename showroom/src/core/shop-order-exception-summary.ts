import type { CommerceState } from './commerce-workspace.ts'

export type ChannelExceptionRecord = {
  channel: string
  totalOrders: number
  cancelledCount: number
  cancellationRate: number
}

export type ShopOrderExceptionSummary = {
  totalOrders: number
  cancelledCount: number
  ordersWithReturns: number
  cancellationRate: number
  returnRate: number
  combinedExceptionRate: number
  cancelledValueLost: number
  byChannel: ChannelExceptionRecord[]
}

export function projectShopOrderExceptionSummary(
  commerce: CommerceState,
  date?: string,
): ShopOrderExceptionSummary {
  const filter = date ? (ts: string) => ts.startsWith(date) : () => true

  const channelMap = new Map<string, { totalOrders: number; cancelledCount: number }>()

  let totalOrders = 0
  let cancelledCount = 0
  let ordersWithReturns = 0
  let cancelledValueLost = 0

  for (const order of commerce.orders) {
    if (!filter(order.createdAt)) continue
    totalOrders++
    const ch = channelMap.get(order.channel) ?? { totalOrders: 0, cancelledCount: 0 }
    ch.totalOrders++
    channelMap.set(order.channel, ch)
    if (order.status === 'cancelled') {
      cancelledCount++
      cancelledValueLost += order.total
      ch.cancelledCount++
    } else if (order.returns && order.returns.length > 0) {
      ordersWithReturns++
    }
  }

  const cancellationRate = totalOrders > 0 ? Math.round((cancelledCount / totalOrders) * 100) : 0
  const returnRate = totalOrders > 0 ? Math.round((ordersWithReturns / totalOrders) * 100) : 0
  const combinedExceptionRate =
    totalOrders > 0 ? Math.round(((cancelledCount + ordersWithReturns) / totalOrders) * 100) : 0

  const byChannel = Array.from(channelMap.entries())
    .map(([channel, v]) => ({
      channel,
      totalOrders: v.totalOrders,
      cancelledCount: v.cancelledCount,
      cancellationRate: v.totalOrders > 0 ? Math.round((v.cancelledCount / v.totalOrders) * 100) : 0,
    }))
    .sort((a, b) => b.totalOrders - a.totalOrders)

  return {
    totalOrders,
    cancelledCount,
    ordersWithReturns,
    cancellationRate,
    returnRate,
    combinedExceptionRate,
    cancelledValueLost,
    byChannel,
  }
}
