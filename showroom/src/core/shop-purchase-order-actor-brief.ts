import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseOrderActorBrief = {
  totalPurchaseOrders: number
  uniqueCreationActors: number
  topCreationActorsByCount: Array<{ actor: string; count: number }>
  cancelledOrders: number
  uniqueCancellationActors: number
  topCancellationActorsByCount: Array<{ actor: string; count: number }>
}

export function projectShopPurchaseOrderActorBrief(
  commerce: CommerceState,
): ShopPurchaseOrderActorBrief {
  let totalPurchaseOrders = 0
  let cancelledOrders = 0
  const creationActorMap = new Map<string, number>()
  const cancellationActorMap = new Map<string, number>()

  for (const po of commerce.purchaseOrders ?? []) {
    totalPurchaseOrders++
    const creationActor = po.creation.actor
    creationActorMap.set(creationActor, (creationActorMap.get(creationActor) ?? 0) + 1)
    if (po.cancellation !== undefined) {
      cancelledOrders++
      const cancellationActor = po.cancellation.actor
      cancellationActorMap.set(
        cancellationActor,
        (cancellationActorMap.get(cancellationActor) ?? 0) + 1,
      )
    }
  }

  const topCreationActorsByCount = Array.from(creationActorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  const topCancellationActorsByCount = Array.from(cancellationActorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return {
    totalPurchaseOrders,
    uniqueCreationActors: creationActorMap.size,
    topCreationActorsByCount,
    cancelledOrders,
    uniqueCancellationActors: cancellationActorMap.size,
    topCancellationActorsByCount,
  }
}
