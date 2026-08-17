import type { CommerceState } from './commerce-workspace.ts'

export type ShopOrderMetadataSummary = {
  ordersWithOwner: number
  uniqueOwners: number
  ordersWithFulfilment: number
  uniqueFulfilmentMethods: number
  ordersLinkedToEcommerce: number
}

export function projectShopOrderMetadataSummary(commerce: CommerceState): ShopOrderMetadataSummary {
  const ownerSet = new Set<string>()
  const fulfilmentSet = new Set<string>()
  let ordersWithOwner = 0
  let ordersWithFulfilment = 0
  let ordersLinkedToEcommerce = 0

  for (const order of commerce.orders) {
    if (order.owner !== undefined) {
      ordersWithOwner++
      ownerSet.add(order.owner)
    }
    if (order.fulfilment !== undefined) {
      ordersWithFulfilment++
      fulfilmentSet.add(order.fulfilment)
    }
    if (order.sourceRecordId !== undefined) {
      ordersLinkedToEcommerce++
    }
  }

  return {
    ordersWithOwner,
    uniqueOwners: ownerSet.size,
    ordersWithFulfilment,
    uniqueFulfilmentMethods: fulfilmentSet.size,
    ordersLinkedToEcommerce,
  }
}
