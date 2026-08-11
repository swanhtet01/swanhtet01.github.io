import type { CommerceState } from './commerce-workspace.ts'

export type ShopChannelMixEntry = {
  channel: string
  orderCount: number
  totalRevenueMmk: number
  cancelledCount: number
}

export type ShopOrderChannelMixSummary = {
  totalOrders: number
  uniqueChannels: number
  byChannel: ShopChannelMixEntry[]
  topChannelByRevenue: string | null
  topChannelByVolume: string | null
}

export function projectShopOrderChannelMixSummary(commerce: CommerceState): ShopOrderChannelMixSummary {
  const channelMap = new Map<string, { orderCount: number; totalRevenueMmk: number; cancelledCount: number }>()

  for (const order of commerce.orders) {
    const entry = channelMap.get(order.channel)
    if (entry) {
      entry.orderCount++
      if (order.status !== 'cancelled') entry.totalRevenueMmk += order.total
      if (order.status === 'cancelled') entry.cancelledCount++
    } else {
      channelMap.set(order.channel, {
        orderCount: 1,
        totalRevenueMmk: order.status !== 'cancelled' ? order.total : 0,
        cancelledCount: order.status === 'cancelled' ? 1 : 0,
      })
    }
  }

  const byChannel: ShopChannelMixEntry[] = Array.from(channelMap.entries())
    .map(([channel, data]) => ({ channel, ...data }))
    .sort((a, b) => b.totalRevenueMmk - a.totalRevenueMmk)

  const topChannelByRevenue = byChannel.length > 0 ? byChannel[0].channel : null

  const topChannelByVolume = byChannel.length > 0
    ? byChannel.slice().sort((a, b) => b.orderCount - a.orderCount)[0].channel
    : null

  return {
    totalOrders: commerce.orders.length,
    uniqueChannels: channelMap.size,
    byChannel,
    topChannelByRevenue,
    topChannelByVolume,
  }
}
