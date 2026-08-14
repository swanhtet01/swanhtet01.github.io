import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderReturnReasonBrief = {
  totalReturns: number
  uniqueReasons: number
  topReasonsByCount: Array<{ reason: string; count: number }>
  restockedCount: number
  notRestockedCount: number
  restockedRate: number
  notRestockedRate: number
}

export function projectShopOrderReturnReasonBrief(
  commerce: CommerceState,
): ShopOrderReturnReasonBrief {
  let totalReturns = 0
  let restockedCount = 0
  let notRestockedCount = 0
  const reasonMap = new Map<string, number>()

  for (const order of commerce.orders) {
    for (const ret of order.returns ?? []) {
      totalReturns++
      reasonMap.set(ret.reason, (reasonMap.get(ret.reason) ?? 0) + 1)
      if (ret.disposition === 'restock') restockedCount++
      else notRestockedCount++
    }
  }

  const topReasonsByCount = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)

  return {
    totalReturns,
    uniqueReasons: reasonMap.size,
    topReasonsByCount,
    restockedCount,
    notRestockedCount,
    restockedRate: totalReturns > 0 ? Math.round((restockedCount / totalReturns) * 100) : 0,
    notRestockedRate: totalReturns > 0 ? Math.round((notRestockedCount / totalReturns) * 100) : 0,
  }
}
