import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseRequisitionActorBrief = {
  totalRequisitions: number
  uniqueApprovalActors: number
  topApprovalActorsByCount: Array<{ actor: string; count: number }>
}

export function projectShopPurchaseRequisitionActorBrief(
  commerce: CommerceState,
): ShopPurchaseRequisitionActorBrief {
  let totalRequisitions = 0
  const actorMap = new Map<string, number>()

  for (const req of commerce.purchaseRequisitions ?? []) {
    totalRequisitions++
    const actor = req.approval.actor
    actorMap.set(actor, (actorMap.get(actor) ?? 0) + 1)
  }

  const topApprovalActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return {
    totalRequisitions,
    uniqueApprovalActors: actorMap.size,
    topApprovalActorsByCount,
  }
}
