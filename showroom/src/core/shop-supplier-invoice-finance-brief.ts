import type { CommerceState } from './commerce-workspace.ts'

export type ShopSupplierInvoiceFinanceBrief = {
  totalInvoices: number
  uniqueSupplierReferences: number
  topSupplierReferencesByCount: Array<{ reference: string; count: number }>
  earliestIssuedAt: string | null
  latestIssuedAt: string | null
  totalQuantityInvoiced: number
  averageQuantityInvoiced: number
  minUnitCostMmk: number | null
  maxUnitCostMmk: number | null
  averageUnitCostMmk: number
}

export function projectShopSupplierInvoiceFinanceBrief(
  commerce: CommerceState,
): ShopSupplierInvoiceFinanceBrief {
  let totalInvoices = 0
  let totalQuantityInvoiced = 0
  let totalUnitCostMmk = 0
  let earliestIssuedAt: string | null = null
  let latestIssuedAt: string | null = null
  let minUnitCostMmk: number | null = null
  let maxUnitCostMmk: number | null = null
  const refMap = new Map<string, number>()

  for (const po of commerce.purchaseOrders ?? []) {
    const inv = po.supplierInvoice
    if (inv === undefined) continue
    totalInvoices++
    totalQuantityInvoiced += inv.quantityInvoiced
    totalUnitCostMmk += inv.unitCostMmk
    refMap.set(inv.supplierReference, (refMap.get(inv.supplierReference) ?? 0) + 1)
    const issued = inv.issuedAt
    if (earliestIssuedAt === null || issued < earliestIssuedAt) earliestIssuedAt = issued
    if (latestIssuedAt === null || issued > latestIssuedAt) latestIssuedAt = issued
    if (minUnitCostMmk === null || inv.unitCostMmk < minUnitCostMmk) minUnitCostMmk = inv.unitCostMmk
    if (maxUnitCostMmk === null || inv.unitCostMmk > maxUnitCostMmk) maxUnitCostMmk = inv.unitCostMmk
  }

  const topSupplierReferencesByCount = Array.from(refMap.entries())
    .map(([reference, count]) => ({ reference, count }))
    .sort((a, b) => b.count - a.count || a.reference.localeCompare(b.reference))
    .slice(0, 5)

  return {
    totalInvoices,
    uniqueSupplierReferences: refMap.size,
    topSupplierReferencesByCount,
    earliestIssuedAt,
    latestIssuedAt,
    totalQuantityInvoiced,
    averageQuantityInvoiced: totalInvoices > 0 ? Math.round(totalQuantityInvoiced / totalInvoices) : 0,
    minUnitCostMmk,
    maxUnitCostMmk,
    averageUnitCostMmk: totalInvoices > 0 ? Math.round(totalUnitCostMmk / totalInvoices) : 0,
  }
}
