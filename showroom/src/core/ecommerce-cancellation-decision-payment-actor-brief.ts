import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionPaymentActorBrief = {
  totalDecisions: number
  pendingCount: number
  reconciledCount: number
  pendingTopActor: string | null
  pendingTopActorCount: number
  reconciledTopActor: string | null
  reconciledTopActorCount: number
}

export function projectEcommerceCancellationDecisionPaymentActorBrief(
  buying: EcommerceBuyingState,
): EcommerceCancellationDecisionPaymentActorBrief {
  const total = buying.cancellationDecisions.length
  if (total === 0)
    return { totalDecisions: 0, pendingCount: 0, reconciledCount: 0, pendingTopActor: null, pendingTopActorCount: 0, reconciledTopActor: null, reconciledTopActorCount: 0 }
  let pendingCount = 0; let reconciledCount = 0
  const pendingActors = new Map<string, number>()
  const reconciledActors = new Map<string, number>()
  for (const decision of buying.cancellationDecisions) {
    if (decision.paymentStatus === 'pending') {
      pendingCount++
      pendingActors.set(decision.actor, (pendingActors.get(decision.actor) ?? 0) + 1)
    } else {
      reconciledCount++
      reconciledActors.set(decision.actor, (reconciledActors.get(decision.actor) ?? 0) + 1)
    }
  }
  let pendingTopActor: string | null = null; let pendingTopActorCount = 0
  for (const [actor, count] of pendingActors) {
    if (count > pendingTopActorCount) { pendingTopActorCount = count; pendingTopActor = actor }
  }
  let reconciledTopActor: string | null = null; let reconciledTopActorCount = 0
  for (const [actor, count] of reconciledActors) {
    if (count > reconciledTopActorCount) { reconciledTopActorCount = count; reconciledTopActor = actor }
  }
  return { totalDecisions: total, pendingCount, reconciledCount, pendingTopActor, pendingTopActorCount, reconciledTopActor, reconciledTopActorCount }
}
