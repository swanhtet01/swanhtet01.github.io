import type { CommerceState } from './commerce-workspace.ts'

export type PurchaseOrderSupplierRecord = {
  supplier: string
  activePoCount: number
  totalQuantityOrdered: number
}

export type ShopPurchaseOrderSummary = {
  totalPurchaseOrders: number
  activePurchaseOrders: number
  cancelledPurchaseOrders: number
  invoicedPurchaseOrders: number
  totalQuantityOrdered: number
  totalCommittedCostMmk: number
  totalInvoicedMmk: number
  bySupplier: PurchaseOrderSupplierRecord[]
}

export function projectShopPurchaseOrderSummary(commerce: CommerceState): ShopPurchaseOrderSummary {
  const purchaseOrders = commerce.purchaseOrders ?? []
  const supplierMap = new Map<string, { activePoCount: number; totalQuantity: number }>()

  let activePurchaseOrders = 0
  let cancelledPurchaseOrders = 0
  let invoicedPurchaseOrders = 0
  let totalQuantityOrdered = 0
  let totalCommittedCostMmk = 0
  let totalInvoicedMmk = 0

  for (const po of purchaseOrders) {
    if (po.cancellation) {
      cancelledPurchaseOrders++
    } else {
      activePurchaseOrders++
      totalQuantityOrdered += po.quantityOrdered
      if (po.unitCostMmk !== undefined) {
        totalCommittedCostMmk += po.quantityOrdered * po.unitCostMmk
      }
      const entry = supplierMap.get(po.supplier) ?? { activePoCount: 0, totalQuantity: 0 }
      entry.activePoCount++
      entry.totalQuantity += po.quantityOrdered
      supplierMap.set(po.supplier, entry)
    }
    if (po.supplierInvoice) {
      invoicedPurchaseOrders++
      totalInvoicedMmk += po.supplierInvoice.totalMmk
    }
  }

  const bySupplier: PurchaseOrderSupplierRecord[] = Array.from(supplierMap.entries())
    .map(([supplier, { activePoCount, totalQuantity }]) => ({
      supplier,
      activePoCount,
      totalQuantityOrdered: totalQuantity,
    }))
    .sort((a, b) => b.activePoCount - a.activePoCount || a.supplier.localeCompare(b.supplier))

  return {
    totalPurchaseOrders: purchaseOrders.length,
    activePurchaseOrders,
    cancelledPurchaseOrders,
    invoicedPurchaseOrders,
    totalQuantityOrdered,
    totalCommittedCostMmk,
    totalInvoicedMmk,
    bySupplier,
  }
}
