import type { CommerceState } from './commerce-workspace.ts'

export type ShopStockMovementReasonBrief = {
  totalMovements: number
  uniqueReasons: number
  topReasonsByCount: Array<{ reason: string; count: number }>
}

export function projectShopStockMovementReasonBrief(
  commerce: CommerceState,
): ShopStockMovementReasonBrief {
  let totalMovements = 0
  const reasonMap = new Map<string, number>()

  for (const movement of commerce.movements ?? []) {
    totalMovements++
    reasonMap.set(movement.reason, (reasonMap.get(movement.reason) ?? 0) + 1)
  }

  const topReasonsByCount = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5)

  return { totalMovements, uniqueReasons: reasonMap.size, topReasonsByCount }
}
