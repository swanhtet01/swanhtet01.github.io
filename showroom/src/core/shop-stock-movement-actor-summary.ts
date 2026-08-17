import type { CommerceState } from './commerce-workspace.ts'

export type ShopMovementActorEntry = {
  actor: string
  movementCount: number
}

export type ShopStockMovementActorSummary = {
  totalMovements: number
  uniqueActors: number
  topActors: ShopMovementActorEntry[]
  orderLinked: number
  purchaseOrderLinked: number
  productionLinked: number
  unlinked: number
}

export function projectShopStockMovementActorSummary(commerce: CommerceState): ShopStockMovementActorSummary {
  const actorMap = new Map<string, number>()
  let orderLinked = 0
  let purchaseOrderLinked = 0
  let productionLinked = 0
  let unlinked = 0

  for (const movement of commerce.movements) {
    const count = actorMap.get(movement.actor) ?? 0
    actorMap.set(movement.actor, count + 1)

    const hasOrderLink = movement.orderId !== undefined
    const hasPOLink = movement.purchaseOrderId !== undefined
    const hasProdLink = movement.productionJobId !== undefined

    if (hasOrderLink) orderLinked++
    if (hasPOLink) purchaseOrderLinked++
    if (hasProdLink) productionLinked++
    if (!hasOrderLink && !hasPOLink && !hasProdLink) unlinked++
  }

  const topActors: ShopMovementActorEntry[] = Array.from(actorMap.entries())
    .map(([actor, movementCount]) => ({ actor, movementCount }))
    .sort((a, b) => b.movementCount - a.movementCount)
    .slice(0, 5)

  return {
    totalMovements: commerce.movements.length,
    uniqueActors: actorMap.size,
    topActors,
    orderLinked,
    purchaseOrderLinked,
    productionLinked,
    unlinked,
  }
}
