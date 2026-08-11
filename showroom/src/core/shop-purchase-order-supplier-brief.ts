import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseOrderSupplierBrief = {
  totalPurchaseOrders: number
  uniqueSuppliers: number
  topSuppliersByCount: Array<{ supplier: string; count: number }>
}

export function projectShopPurchaseOrderSupplierBrief(
  commerce: CommerceState,
): ShopPurchaseOrderSupplierBrief {
  let totalPurchaseOrders = 0
  const supplierMap = new Map<string, number>()

  for (const po of commerce.purchaseOrders ?? []) {
    totalPurchaseOrders++
    supplierMap.set(po.supplier, (supplierMap.get(po.supplier) ?? 0) + 1)
  }

  const topSuppliersByCount = Array.from(supplierMap.entries())
    .map(([supplier, count]) => ({ supplier, count }))
    .sort((a, b) => b.count - a.count || a.supplier.localeCompare(b.supplier))
    .slice(0, 5)

  return {
    totalPurchaseOrders,
    uniqueSuppliers: supplierMap.size,
    topSuppliersByCount,
  }
}
