import type { CommerceState } from './commerce-workspace.ts'

export type ShopBudgetEnvelopeDateActorBrief = {
  totalEnvelopes: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
  uniqueApprovalActors: number
  topApprovalActorsByCount: Array<{ actor: string; count: number }>
}

export function projectShopBudgetEnvelopeDateActorBrief(
  commerce: CommerceState,
): ShopBudgetEnvelopeDateActorBrief {
  let totalEnvelopes = 0
  let earliestCreatedAt: string | null = null
  let latestCreatedAt: string | null = null
  const actorMap = new Map<string, number>()

  for (const env of commerce.purchaseBudgetEnvelopes ?? []) {
    totalEnvelopes++
    const created = env.createdAt
    if (earliestCreatedAt === null || created < earliestCreatedAt) earliestCreatedAt = created
    if (latestCreatedAt === null || created > latestCreatedAt) latestCreatedAt = created
    const actor = env.approval.actor
    actorMap.set(actor, (actorMap.get(actor) ?? 0) + 1)
  }

  const topApprovalActorsByCount = Array.from(actorMap.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)

  return {
    totalEnvelopes,
    earliestCreatedAt,
    latestCreatedAt,
    uniqueApprovalActors: actorMap.size,
    topApprovalActorsByCount,
  }
}
