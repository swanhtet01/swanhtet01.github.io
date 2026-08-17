import type { CommerceState } from './commerce-workspace.ts'

export type ShopSourcingDecisionDateActorBrief = {
  totalDecisions: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
  uniqueApprovalActors: number
  topApprovalActorsByCount: Array<{ actor: string; count: number }>
}

export function projectShopSourcingDecisionDateActorBrief(
  commerce: CommerceState,
): ShopSourcingDecisionDateActorBrief {
  let totalDecisions = 0
  let earliestCreatedAt: string | null = null
  let latestCreatedAt: string | null = null
  const actorMap = new Map<string, number>()

  for (const decision of commerce.supplierSourcingDecisions ?? []) {
    totalDecisions++
    const created = decision.createdAt
    if (earliestCreatedAt === null || created < earliestCreatedAt) earliestCreatedAt = created
    if (latestCreatedAt === null || created > latestCreatedAt) latestCreatedAt = created
    const actor = decision.approval.actor
    actorMap.set(actor, (actorMap.get(actor) ?? 0) + 1)
  }

  const topApprovalActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return {
    totalDecisions,
    earliestCreatedAt,
    latestCreatedAt,
    uniqueApprovalActors: actorMap.size,
    topApprovalActorsByCount,
  }
}
