import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseOrderDeliveryPromiseBrief = {
  totalOrders: number
  ordersWithDeliveryPromise: number
  ordersWithoutDeliveryPromise: number
  deliveryPromiseCoverage: number
  openOrdersWithDeliveryPromise: number
  openOrdersWithoutDeliveryPromise: number
}

export function projectShopPurchaseOrderDeliveryPromiseBrief(commerce: CommerceState): ShopPurchaseOrderDeliveryPromiseBrief {
  let totalOrders = 0
  let ordersWithDeliveryPromise = 0
  let openOrdersWithDeliveryPromise = 0
  let openOrdersWithoutDeliveryPromise = 0

  for (const po of commerce.purchaseOrders ?? []) {
    totalOrders++
    const hasPromise = po.expectedAt !== undefined
    const isOpen = po.cancellation === undefined && po.supplierInvoice === undefined

    if (hasPromise) {
      ordersWithDeliveryPromise++
      if (isOpen) openOrdersWithDeliveryPromise++
    } else {
      if (isOpen) openOrdersWithoutDeliveryPromise++
    }
  }

  return {
    totalOrders,
    ordersWithDeliveryPromise,
    ordersWithoutDeliveryPromise: totalOrders - ordersWithDeliveryPromise,
    deliveryPromiseCoverage: totalOrders > 0 ? Math.round((ordersWithDeliveryPromise / totalOrders) * 100) : 0,
    openOrdersWithDeliveryPromise,
    openOrdersWithoutDeliveryPromise,
  }
}
