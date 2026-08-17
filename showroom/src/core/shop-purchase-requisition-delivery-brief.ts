import type { CommerceState } from './commerce-workspace.ts'

export type ShopPurchaseRequisitionDeliveryBrief = {
  totalRequisitions: number
  earliestExpectedAt: string | null
  latestExpectedAt: string | null
  uniqueSuppliers: number
  topSuppliersByCount: Array<{ supplier: string; count: number }>
}

export function projectShopPurchaseRequisitionDeliveryBrief(
  commerce: CommerceState,
): ShopPurchaseRequisitionDeliveryBrief {
  const requisitions = commerce.purchaseRequisitions ?? []
  let totalRequisitions = 0
  let earliestExpectedAt: string | null = null
  let latestExpectedAt: string | null = null
  const supplierMap = new Map<string, number>()

  for (const req of requisitions) {
    totalRequisitions++
    const date = req.expectedAt
    if (earliestExpectedAt === null || date < earliestExpectedAt) earliestExpectedAt = date
    if (latestExpectedAt === null || date > latestExpectedAt) latestExpectedAt = date
    supplierMap.set(req.supplier, (supplierMap.get(req.supplier) ?? 0) + 1)
  }

  const topSuppliersByCount = Array.from(supplierMap.entries())
    .map(([supplier, count]) => ({ supplier, count }))
    .sort((a, b) => b.count - a.count || a.supplier.localeCompare(b.supplier))
    .slice(0, 5)

  return {
    totalRequisitions,
    earliestExpectedAt,
    latestExpectedAt,
    uniqueSuppliers: supplierMap.size,
    topSuppliersByCount,
  }
}
