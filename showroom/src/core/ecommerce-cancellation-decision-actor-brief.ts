import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'
export type EcommerceCancellationDecisionActorBrief = {
  totalDecisions: number; uniqueActors: number; topActor: string | null; topActorCount: number
}
export function projectEcommerceCancellationDecisionActorBrief(buying: EcommerceBuyingState) {
  const total = buying.cancellationDecisions.length
  if (total === 0) return { totalDecisions: 0, uniqueActors: 0, topActor: null, topActorCount: 0 }
  const counts = new Map<string, number>()
  for (const decision of buying.cancellationDecisions) {
    counts.set(decision.actor, (counts.get(decision.actor) ?? 0) + 1)
  }
  let topActor: string | null = null; let topActorCount = 0
  for (const [key, count] of counts) { if (count > topActorCount) { topActorCount = count; topActor = key } }
  return { totalDecisions: total, uniqueActors: counts.size, topActor, topActorCount }
}
