import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderSupportServiceEventOwnerBrief = {
  totalServiceEvents: number
  uniqueOwners: number
  topOwnersByCount: Array<{ owner: string; count: number }>
}

export function projectShopOrderSupportServiceEventOwnerBrief(
  commerce: CommerceState,
): ShopOrderSupportServiceEventOwnerBrief {
  let totalServiceEvents = 0
  const ownerMap = new Map<string, number>()

  for (const order of commerce.orders) {
    for (const supportCase of order.supportCases ?? []) {
      for (const event of [
        ...(supportCase.serviceEvents ?? []),
        ...(supportCase.followUpServiceEvents ?? []),
      ]) {
        totalServiceEvents++
        ownerMap.set(event.owner, (ownerMap.get(event.owner) ?? 0) + 1)
      }
    }
  }

  const topOwnersByCount = Array.from(ownerMap.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
    .slice(0, 5)

  return {
    totalServiceEvents,
    uniqueOwners: ownerMap.size,
    topOwnersByCount,
  }
}
