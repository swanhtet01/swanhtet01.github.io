import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseOrderLifecycleBrief = {
  totalPurchaseOrders: number
  ordersLinkedToRequisition: number
  requisitionLinkRate: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
  ordersWithExpectedAt: number
  expectedAtRate: number
  earliestExpectedAt: string | null
  latestExpectedAt: string | null
  cancelledOrders: number
  cancellationRate: number
}

export function projectShopPurchaseOrderLifecycleBrief(
  commerce: CommerceState,
): ShopPurchaseOrderLifecycleBrief {
  let totalPurchaseOrders = 0
  let ordersLinkedToRequisition = 0
  let earliestCreatedAt: string | null = null
  let latestCreatedAt: string | null = null
  let ordersWithExpectedAt = 0
  let earliestExpectedAt: string | null = null
  let latestExpectedAt: string | null = null
  let cancelledOrders = 0

  for (const po of commerce.purchaseOrders ?? []) {
    totalPurchaseOrders++
    if (po.requisitionId !== undefined) ordersLinkedToRequisition++

    const created = po.createdAt
    if (earliestCreatedAt === null || created < earliestCreatedAt) earliestCreatedAt = created
    if (latestCreatedAt === null || created > latestCreatedAt) latestCreatedAt = created

    if (po.expectedAt !== undefined) {
      ordersWithExpectedAt++
      const expected = po.expectedAt
      if (earliestExpectedAt === null || expected < earliestExpectedAt) earliestExpectedAt = expected
      if (latestExpectedAt === null || expected > latestExpectedAt) latestExpectedAt = expected
    }

    if (po.cancellation !== undefined) cancelledOrders++
  }

  return {
    totalPurchaseOrders,
    ordersLinkedToRequisition,
    requisitionLinkRate:
      totalPurchaseOrders > 0
        ? Math.round((ordersLinkedToRequisition / totalPurchaseOrders) * 100)
        : 0,
    earliestCreatedAt,
    latestCreatedAt,
    ordersWithExpectedAt,
    expectedAtRate:
      totalPurchaseOrders > 0
        ? Math.round((ordersWithExpectedAt / totalPurchaseOrders) * 100)
        : 0,
    earliestExpectedAt,
    latestExpectedAt,
    cancelledOrders,
    cancellationRate:
      totalPurchaseOrders > 0
        ? Math.round((cancelledOrders / totalPurchaseOrders) * 100)
        : 0,
  }
}
