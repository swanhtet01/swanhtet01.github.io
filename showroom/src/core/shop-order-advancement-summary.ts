import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderAdvancementSummary = {
  ordersWithAdvancements: number
  totalAdvancementActions: number
  averageAdvancementDepth: number
  maxAdvancementDepth: number
}

export function projectShopOrderAdvancementSummary(commerce: CommerceState): ShopOrderAdvancementSummary {
  let ordersWithAdvancements = 0
  let totalAdvancementActions = 0
  let maxAdvancementDepth = 0

  for (const order of commerce.orders) {
    if (!order.advancementActionIds || order.advancementActionIds.length === 0) continue
    ordersWithAdvancements++
    const depth = order.advancementActionIds.length
    totalAdvancementActions += depth
    if (depth > maxAdvancementDepth) maxAdvancementDepth = depth
  }

  return {
    ordersWithAdvancements,
    totalAdvancementActions,
    averageAdvancementDepth:
      ordersWithAdvancements > 0
        ? Math.round(totalAdvancementActions / ordersWithAdvancements)
        : 0,
    maxAdvancementDepth,
  }
}
