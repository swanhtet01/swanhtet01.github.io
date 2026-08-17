import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderCollectionActionSummary = {
  ordersWithCollectionActions: number
  totalActions: number
  uniqueActors: number
  byKind: { customer_contact: number }
}

export function projectShopOrderCollectionActionSummary(commerce: CommerceState): ShopOrderCollectionActionSummary {
  const byKind = { customer_contact: 0 }
  const actorSet = new Set<string>()
  let ordersWithCollectionActions = 0
  let totalActions = 0

  for (const order of commerce.orders) {
    if (!order.collectionActions || order.collectionActions.length === 0) continue
    ordersWithCollectionActions++
    for (const action of order.collectionActions) {
      totalActions++
      byKind[action.kind]++
      actorSet.add(action.proof.actor)
    }
  }

  return { ordersWithCollectionActions, totalActions, uniqueActors: actorSet.size, byKind }
}
