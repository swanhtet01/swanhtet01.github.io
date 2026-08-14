import type { EcommerceBuyingState } from '../products/ecommerce/ecommerce-buying-lifecycle.ts'

export type EcommerceCancellationDecisionSummary = {
  totalDecisions: number
  uniqueOrders: number
  totalOrderValueMmk: number
  byOrderStatus: { confirmed: number; preparing: number; ready: number }
  byPaymentStatus: { pending: number; reconciled: number }
  uniqueActors: number
}

export function projectEcommerceCancellationDecisionSummary(buying: EcommerceBuyingState): EcommerceCancellationDecisionSummary {
  const orderSet = new Set<string>()
  const actorSet = new Set<string>()
  let totalOrderValueMmk = 0
  const byOrderStatus = { confirmed: 0, preparing: 0, ready: 0 }
  const byPaymentStatus = { pending: 0, reconciled: 0 }

  for (const decision of buying.cancellationDecisions) {
    orderSet.add(decision.orderId)
    actorSet.add(decision.actor)
    totalOrderValueMmk += decision.totalMmk
    byOrderStatus[decision.orderStatus]++
    byPaymentStatus[decision.paymentStatus]++
  }

  return {
    totalDecisions: buying.cancellationDecisions.length,
    uniqueOrders: orderSet.size,
    totalOrderValueMmk,
    byOrderStatus,
    byPaymentStatus,
    uniqueActors: actorSet.size,
  }
}
