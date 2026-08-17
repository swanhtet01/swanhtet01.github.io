import type { CommerceState } from './commerce-workspace.ts'

export type ShopSupplierReturnClaimDateActorBrief = {
  totalClaims: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
  uniqueAuthorizationActors: number
  topAuthorizationActorsByCount: Array<{ actor: string; count: number }>
}

export function projectShopSupplierReturnClaimDateActorBrief(
  commerce: CommerceState,
): ShopSupplierReturnClaimDateActorBrief {
  let totalClaims = 0
  let earliestCreatedAt: string | null = null
  let latestCreatedAt: string | null = null
  const actorMap = new Map<string, number>()

  for (const po of commerce.purchaseOrders ?? []) {
    for (const claim of po.supplierReturns ?? []) {
      totalClaims++
      const created = claim.createdAt
      if (earliestCreatedAt === null || created < earliestCreatedAt) earliestCreatedAt = created
      if (latestCreatedAt === null || created > latestCreatedAt) latestCreatedAt = created
      const actor = claim.authorization.actor
      actorMap.set(actor, (actorMap.get(actor) ?? 0) + 1)
    }
  }

  const topAuthorizationActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return {
    totalClaims,
    earliestCreatedAt,
    latestCreatedAt,
    uniqueAuthorizationActors: actorMap.size,
    topAuthorizationActorsByCount,
  }
}
